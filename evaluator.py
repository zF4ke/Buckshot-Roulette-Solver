from enums import ItemType, ShellType, Turn


class Evaluator:

    @staticmethod
    def evaluate(state):
        """
        Score positivo = bom para o jogador
        Score negativo = bom para o inimigo
        """

        # =========================
        # CONDIÇÕES DE FIM DE JOGO
        # =========================

        if state.player_hp <= 0:
            return -10000

        if state.enemy_hp <= 0:
            return 10000

        # =========================
        # HP DIFFERENCE (base)
        # =========================

        score = (state.player_hp - state.enemy_hp) * 100

        # =========================
        # CONTROLO DE TURNO
        # =========================

        if state.turn == Turn.PLAYER:
            score += 10
        else:
            score -= 10

        # =========================
        # RECURSOS (ITENS)
        # =========================

        score += Evaluator._item_score(state.player_items)
        score -= Evaluator._item_score(state.enemy_items)

        # =========================
        # BALAS (pressão imediata)
        # =========================

        score += (state.live_shells - state.blank_shells) * 3

        # =========================
        # EFEITOS ESPECIAIS
        # =========================

        if state.saw_active:
            score += 15  # vantagem forte

        if state.handcuffed == Turn.ENEMY:
            score += 20  # inimigo bloqueado

        if state.handcuffed == Turn.PLAYER:
            score -= 20

        # =========================
        # INFORMACAO
        # =========================

        score += Evaluator._information_score(state)

        return score

    @staticmethod
    def _item_score(inventory):
        values = {
            ItemType.SAW: 9,
            ItemType.MAGNIFIER: 13,
            ItemType.INVERTER: 10,
            ItemType.BEER: 8,
            ItemType.PHONE: 12,
            ItemType.ADRENALINE: 14,
            ItemType.MEDICINE: 7,
            ItemType.HANDCUFFS: 12,
            ItemType.CIGARETTES: 6,
        }

        return sum(values[item] * count for item, count in inventory.items())

    @staticmethod
    def _information_score(state):
        score = 0

        for index, shell in enumerate(state.known_shells):
            if shell is None:
                continue

            value = Evaluator._known_shell_value(state, index, shell)

            if state.turn == Turn.PLAYER:
                score += value
            else:
                score -= value

        return score

    @staticmethod
    def _known_shell_value(state, index, shell):
        if index == 0:
            value = 28
        else:
            value = max(4, 14 - (index * 2))

        if shell == ShellType.LIVE:
            value += 12

            if index == 0 and state.saw_active:
                value += 18

        if shell == ShellType.BLANK:
            value += 8

            # Saber que a bala atual e falsa costuma permitir disparar em si
            # para manter o turno e gastar uma bala sem perder vida.
            if index == 0:
                value += 14

        return value
