"""
Servico JSON sobre stdio que a aplicacao Electron usa como motor.

Protocolo: uma mensagem JSON por linha (stdin -> stdout).

Pedidos (campo obrigatorio: "cmd"; opcional: "id" ecoado na resposta):
  {"cmd": "ping"}
  {"cmd": "set_state", "state": <StateDTO>}          reinicia a sessao
  {"cmd": "event", "event": <EventDTO>}              aplica um acontecimento
  {"cmd": "undo"}                                    desfaz o ultimo acontecimento
  {"cmd": "analyze", "level": 1..10}                 recomenda jogadas
  {"cmd": "state"}                                   estado atual + probabilidades

Resposta: {"ok": true, "id": ..., ...} ou {"ok": false, "id": ..., "error": "..."}
"""

import json
import sys
import time
import traceback

from enums import ActionType, GameEventType, ItemType, ShellType, Turn
from event_history import EventHistory
from game_engine import GameEngine
from game_event import GameEvent
from game_state import GameState
from probability import ProbabilityEngine
from search import Search, config_for_level


# ---------------------------------------------------------------------------
# Serializacao <-> DTO
# ---------------------------------------------------------------------------

ITEM_TO_STR = {item: item.name for item in ItemType}
STR_TO_ITEM = {item.name: item for item in ItemType}


def shell_to_str(shell):
    if shell == ShellType.LIVE:
        return "LIVE"
    if shell == ShellType.BLANK:
        return "BLANK"
    return None


def str_to_shell(value):
    if value == "LIVE":
        return ShellType.LIVE
    if value == "BLANK":
        return ShellType.BLANK
    return None


def str_to_turn(value):
    return Turn.PLAYER if value == "PLAYER" else Turn.ENEMY


def items_from_dto(dto):
    inv = {item: 0 for item in ItemType}
    if not dto:
        return inv
    for name, count in dto.items():
        item = STR_TO_ITEM.get(name)
        if item is not None:
            inv[item] = max(0, int(count))
    return inv


def items_to_dto(inventory):
    return {ITEM_TO_STR[item]: count for item, count in inventory.items()}


def state_from_dto(dto):
    state = GameState()
    state.player_hp = int(dto.get("player_hp", 0))
    state.enemy_hp = int(dto.get("enemy_hp", 0))
    state.player_max_hp = int(dto.get("player_max_hp", state.player_hp) or state.player_hp)
    state.enemy_max_hp = int(dto.get("enemy_max_hp", state.enemy_hp) or state.enemy_hp)
    state.live_shells = int(dto.get("live_shells", 0))
    state.blank_shells = int(dto.get("blank_shells", 0))
    # Nunca guardar mais balas conhecidas do que as que estao carregadas.
    total = state.live_shells + state.blank_shells
    state.known_shells = [str_to_shell(s) for s in dto.get("known_shells", [])][:total]
    state.player_items = items_from_dto(dto.get("player_items"))
    state.enemy_items = items_from_dto(dto.get("enemy_items"))
    state.turn = str_to_turn(dto.get("turn", "PLAYER"))
    state.saw_active = bool(dto.get("saw_active", False))
    handcuffed = dto.get("handcuffed")
    state.handcuffed = str_to_turn(handcuffed) if handcuffed else None
    return state


def state_to_dto(state):
    return {
        "player_hp": state.player_hp,
        "enemy_hp": state.enemy_hp,
        "player_max_hp": state.player_max_hp,
        "enemy_max_hp": state.enemy_max_hp,
        "live_shells": state.live_shells,
        "blank_shells": state.blank_shells,
        "known_shells": [shell_to_str(s) for s in state.known_shells],
        "player_items": items_to_dto(state.player_items),
        "enemy_items": items_to_dto(state.enemy_items),
        "turn": state.turn.name,
        "saw_active": state.saw_active,
        "handcuffed": state.handcuffed.name if state.handcuffed else None,
    }


def action_to_dto(action):
    return {
        "type": action.action_type.name,
        "item": ITEM_TO_STR.get(action.item) if action.item else None,
        "target_item": ITEM_TO_STR.get(action.target_item) if action.target_item else None,
    }


def event_from_dto(dto):
    return GameEvent(
        actor=str_to_turn(dto["actor"]),
        event_type=GameEventType[dto["event_type"]],
        item=STR_TO_ITEM.get(dto["item"]) if dto.get("item") else None,
        target_item=STR_TO_ITEM.get(dto["target_item"]) if dto.get("target_item") else None,
        target=str_to_turn(dto["target"]) if dto.get("target") else None,
        shell=str_to_shell(dto["shell"]) if dto.get("shell") else None,
        known_index=dto.get("known_index"),
        hp_delta=dto.get("hp_delta"),
        inventory=items_from_dto(dto["inventory"]) if dto.get("inventory") else None,
    )


# ---------------------------------------------------------------------------
# Descricao legivel de accoes / linhas
# ---------------------------------------------------------------------------

ITEM_LABELS = {
    ItemType.SAW: "Saw",
    ItemType.MAGNIFIER: "Magnifying Glass",
    ItemType.INVERTER: "Inverter",
    ItemType.BEER: "Beer",
    ItemType.PHONE: "Burner Phone",
    ItemType.ADRENALINE: "Adrenaline",
    ItemType.MEDICINE: "Expired Medicine",
    ItemType.HANDCUFFS: "Handcuffs",
    ItemType.CIGARETTES: "Cigarettes",
}


def action_label(action, actor):
    # Rotulos na perspetiva de quem joga (o jogador ou o dealer).
    player_acting = actor == Turn.PLAYER
    if action.action_type == ActionType.SHOOT_SELF:
        return "Shoot yourself" if player_acting else "Dealer shoots itself"
    if action.action_type == ActionType.SHOOT_ENEMY:
        return "Shoot the dealer" if player_acting else "Shoot you"
    if action.item == ItemType.ADRENALINE and action.target_item is not None:
        return f"Adrenaline → {ITEM_LABELS.get(action.target_item, action.target_item.name)}"
    if action.item is not None:
        return f"Use {ITEM_LABELS.get(action.item, action.item.name)}"
    return action.action_type.name


def line_label(action_sequence, actor):
    return " → ".join(action_label(a, actor) for a in action_sequence)


def move_to_dto(move, actor):
    return {
        "expected_value": round(move.expected_value, 2),
        "label": line_label(move.action_sequence, actor),
        "sequence": [action_to_dto(a) for a in move.action_sequence],
        "action": action_to_dto(move.action_sequence[0]),
    }


# ---------------------------------------------------------------------------
# Sessao
# ---------------------------------------------------------------------------

class Service:

    def __init__(self):
        self.state = GameState()
        self.history = EventHistory()
        self.engine = GameEngine(self.history)
        self._snapshots = []

    def probabilities(self, state):
        current = ProbabilityEngine.current_shell(state)
        distribution = ProbabilityEngine.distribution(state)
        return {
            "current_live": round(current["live"], 4),
            "current_blank": round(current["blank"], 4),
            "pool_live": round(distribution[ShellType.LIVE], 4),
            "pool_blank": round(distribution[ShellType.BLANK], 4),
        }

    def analyze(self, level):
        search = Search(config_for_level(level))
        started = time.perf_counter()
        moves = search.analyze(self.state)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        return {
            "moves": [move_to_dto(m, self.state.turn) for m in moves],
            "elapsed_ms": round(elapsed_ms, 1),
            "exact": search.exact,
            "reached_depth": search.reached_depth,
            "perspective": self.state.turn.name,
        }

    def history_dto(self):
        return [
            {"index": r.index, "summary": r.summary}
            for r in self.history.tail(20)
        ]

    def handle(self, message):
        cmd = message.get("cmd")

        if cmd == "ping":
            return {"pong": True}

        if cmd == "set_state":
            self.state = state_from_dto(message["state"])
            self.history = EventHistory()
            self.engine = GameEngine(self.history)
            self._snapshots = []
            return self._full_response()

        if cmd == "update_state":
            # Correcao manual do estado (HP, balas, itens, camara). Ao contrario
            # de set_state, mantem o historico e o undo da ronda intactos.
            self.state = state_from_dto(message["state"])
            return self._full_response()

        if cmd == "event":
            snapshot = self.state.clone()
            try:
                record = self.engine.apply_event(self.state, event_from_dto(message["event"]))
            except Exception:
                # Reverte a mutacao parcial que possa ter ocorrido.
                self.state.__dict__.update(self.state.clone().__dict__)
                self.state = snapshot
                raise
            self._snapshots.append(snapshot)
            response = self._full_response()
            response["summary"] = record.summary
            return response

        if cmd == "undo":
            if self._snapshots:
                self.state = self._snapshots.pop()
            return self._full_response()

        if cmd == "analyze":
            return self.analyze(int(message.get("level", 10)))

        if cmd == "state":
            return self._full_response()

        raise ValueError(f"Comando desconhecido: {cmd}")

    def _full_response(self):
        return {
            "state": state_to_dto(self.state),
            "probabilities": self.probabilities(self.state),
            "history": self.history_dto(),
        }


def main():
    service = Service()
    out = sys.stdout

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        try:
            message = json.loads(raw)
        except json.JSONDecodeError as error:
            out.write(json.dumps({"ok": False, "error": f"JSON invalido: {error}"}) + "\n")
            out.flush()
            continue

        request_id = message.get("id")
        try:
            payload = service.handle(message)
            payload["ok"] = True
            payload["id"] = request_id
            out.write(json.dumps(payload) + "\n")
        except Exception as error:  # noqa: BLE001 - reporta tudo ao cliente
            out.write(
                json.dumps(
                    {
                        "ok": False,
                        "id": request_id,
                        "error": str(error),
                        "trace": traceback.format_exc(),
                    }
                )
                + "\n"
            )
        out.flush()


if __name__ == "__main__":
    main()
