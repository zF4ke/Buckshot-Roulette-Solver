"""
Motor de procura: expectimax com aprofundamento iterativo e limite de tempo.

Ideia central
-------------
Cada accao consome sempre um recurso (uma bala ou um item), portanto a soma
`balas + itens` (o "potencial") decresce estritamente a cada jogada. O jogo e
por isso finito e aciclico: com potencial P, uma procura de profundidade P e
exata ate ao fim da ronda.

Nos no's de decisao o jogador ativo escolhe a melhor accao (PLAYER maximiza,
ENEMY minimiza); nos no's de acaso fazemos a media ponderada pelas
probabilidades das balas. A avaliacao e sempre do ponto de vista do PLAYER.

Para garantir tempo de resposta razoavel em qualquer posicao, aprofundamos
iterativamente (profundidade 1, 2, 3, ...) ate:
  - alcancar a profundidade exata (>= potencial), ou
  - atingir o limite de profundidade do nivel, ou
  - esgotar o orcamento de tempo.
Devolve-se sempre o resultado da iteracao completa mais profunda.
"""

import time

from actions import Actions
from enums import Turn
from evaluator import Evaluator
from move import Move


class _Timeout(Exception):
    """Sinaliza que o orcamento de tempo terminou a meio de uma iteracao."""


class SearchConfig:
    """Parametros que a barra de dificuldade controla."""

    def __init__(self, depth=64, min_probability=0.0, time_budget_ms=1500):
        self.depth = depth                    # limite de profundidade (plies)
        self.min_probability = min_probability  # corta ramos improvaveis
        self.time_budget_ms = time_budget_ms    # tecto de tempo por analise


# Presets 1..10 para a barra "Inteligencia / Precisao".
# Nivel baixo = raso e instantaneo; nivel alto = fundo e exato (mas sempre
# dentro do orcamento de tempo).
DIFFICULTY_PRESETS = {
    1: SearchConfig(depth=2, min_probability=0.02, time_budget_ms=60),
    2: SearchConfig(depth=3, min_probability=0.02, time_budget_ms=90),
    3: SearchConfig(depth=4, min_probability=0.01, time_budget_ms=130),
    4: SearchConfig(depth=6, min_probability=0.01, time_budget_ms=200),
    5: SearchConfig(depth=8, min_probability=0.005, time_budget_ms=300),
    6: SearchConfig(depth=12, min_probability=0.004, time_budget_ms=450),
    7: SearchConfig(depth=18, min_probability=0.002, time_budget_ms=650),
    8: SearchConfig(depth=28, min_probability=0.001, time_budget_ms=900),
    9: SearchConfig(depth=44, min_probability=0.0005, time_budget_ms=1200),
    10: SearchConfig(depth=64, min_probability=0.0, time_budget_ms=1600),
}


def config_for_level(level):
    level = max(1, min(10, int(level)))
    return DIFFICULTY_PRESETS[level]


_DEADLINE_CHECK_EVERY = 2048


class Search:

    def __init__(self, config=None):
        self.config = config or SearchConfig()
        self._memo = {}
        self._nodes = 0
        self._deadline = None
        self._reached_depth = 0
        self._exact = False

    # ------------------------------------------------------------------
    # API publica
    # ------------------------------------------------------------------

    def analyze(self, state):
        """
        Movimentos legais do jogador atual, ordenados do melhor para o pior,
        cada um com valor esperado e linha principal (o plano do turno).
        """
        actions = Actions.get_legal_actions(state)
        if not actions:
            return []

        potential = self._potential(state)
        max_depth = min(self.config.depth, potential)
        self._deadline = time.perf_counter() + self.config.time_budget_ms / 1000.0
        self._reached_depth = 0
        self._exact = False

        best = None
        for depth in range(1, max_depth + 1):
            self._memo = {}
            self._nodes = 0
            try:
                best = self._analyze_at_depth(state, actions, depth)
                self._reached_depth = depth
            except _Timeout:
                # Iteracao incompleta: fica com a anterior (ja completa).
                break

            if depth >= potential:
                self._exact = True
                break
            if time.perf_counter() >= self._deadline:
                break

        if best is None:
            # Nem a profundidade 1 coube no tempo: avaliacao estatica rapida.
            best = self._analyze_static(state, actions)

        return best

    @property
    def reached_depth(self):
        return self._reached_depth

    @property
    def exact(self):
        return self._exact

    # ------------------------------------------------------------------
    # Uma iteracao a profundidade fixa
    # ------------------------------------------------------------------

    def _analyze_at_depth(self, state, actions, depth):
        scored = []
        for action in actions:
            ev = self._action_value(state, action, depth)
            if ev is None:
                continue
            line = self._principal_variation(state, action, depth)
            scored.append(Move(action_sequence=line or [action], expected_value=ev))

        maximizing = state.turn == Turn.PLAYER
        scored.sort(key=lambda move: move.expected_value, reverse=maximizing)
        return scored

    def _analyze_static(self, state, actions):
        scored = []
        for action in actions:
            outcomes = Actions.expand_action(state, action)
            if not outcomes:
                continue
            ev = sum(o.probability * Evaluator.evaluate(o.state) for o in outcomes)
            total_p = sum(o.probability for o in outcomes) or 1.0
            scored.append(Move(action_sequence=[action], expected_value=ev / total_p))
        maximizing = state.turn == Turn.PLAYER
        scored.sort(key=lambda move: move.expected_value, reverse=maximizing)
        return scored

    # ------------------------------------------------------------------
    # Nucleo expectimax
    # ------------------------------------------------------------------

    def _value(self, state, depth):
        if self._is_terminal(state):
            return Evaluator.evaluate(state)

        if depth <= 0:
            return Evaluator.evaluate(state)

        cache_key = (state.key(), depth)
        cached = self._memo.get(cache_key)
        if cached is not None:
            return cached

        actions = Actions.get_legal_actions(state)
        if not actions:
            value = Evaluator.evaluate(state)
            self._memo[cache_key] = value
            return value

        maximizing = state.turn == Turn.PLAYER
        best = None
        for action in actions:
            ev = self._action_value(state, action, depth)
            if ev is None:
                continue
            if best is None:
                best = ev
            elif maximizing:
                best = max(best, ev)
            else:
                best = min(best, ev)

        if best is None:
            best = Evaluator.evaluate(state)

        self._memo[cache_key] = best
        return best

    def _action_value(self, state, action, depth):
        """Valor esperado de aplicar `action` em `state` (media sobre o acaso)."""
        outcomes = Actions.expand_action(state, action)
        if not outcomes:
            return None

        self._nodes += 1
        if self._nodes % _DEADLINE_CHECK_EVERY == 0 and time.perf_counter() >= self._deadline:
            raise _Timeout()

        total = 0.0
        total_probability = 0.0
        for outcome in outcomes:
            if outcome.probability < self.config.min_probability:
                continue
            total += outcome.probability * self._value(outcome.state, depth - 1)
            total_probability += outcome.probability

        if total_probability <= 0:
            for outcome in outcomes:
                total += outcome.probability * self._value(outcome.state, depth - 1)
                total_probability += outcome.probability
            if total_probability <= 0:
                return None

        return total / total_probability

    # ------------------------------------------------------------------
    # Reconstrucao da linha principal (o "plano" a mostrar ao utilizador)
    # ------------------------------------------------------------------

    def _principal_variation(self, state, first_action, depth, max_len=8):
        """
        Segue as melhores decisoes dentro do turno atual. Nos no's de acaso
        segue o resultado mais provavel, produzindo um plano legivel do tipo
        "Serra -> Disparar no adversario".
        """
        line = [first_action]
        current_state = state
        action = first_action
        remaining = depth

        for _ in range(max_len):
            outcomes = Actions.expand_action(current_state, action)
            if not outcomes:
                break

            outcome = max(outcomes, key=lambda o: o.probability)
            next_state = outcome.state
            remaining -= 1

            if self._is_terminal(next_state) or remaining <= 0:
                break
            # O plano so cobre o turno atual do jogador.
            if next_state.turn != state.turn:
                break

            next_actions = Actions.get_legal_actions(next_state)
            if not next_actions:
                break

            maximizing = next_state.turn == Turn.PLAYER
            best_action = None
            best_ev = None
            for candidate in next_actions:
                try:
                    ev = self._action_value(next_state, candidate, remaining)
                except _Timeout:
                    ev = None
                if ev is None:
                    continue
                if best_ev is None or (ev > best_ev if maximizing else ev < best_ev):
                    best_ev = ev
                    best_action = candidate

            if best_action is None:
                break

            line.append(best_action)
            current_state = next_state
            action = best_action

        return line

    # ------------------------------------------------------------------
    # Auxiliares
    # ------------------------------------------------------------------

    @staticmethod
    def _is_terminal(state):
        return (
            state.player_hp <= 0
            or state.enemy_hp <= 0
            or state.total_shells <= 0
        )

    @staticmethod
    def _potential(state):
        # Limite superior de plies restantes: cada accao consome uma bala ou um
        # item, por isso a arvore nunca e mais profunda do que isto.
        return (
            state.total_shells
            + sum(state.player_items.values())
            + sum(state.enemy_items.values())
        )
