from enums import ShellType


class ProbabilityEngine:

    # =====================================================
    # DISTRIBUIÇÃO BASE (estado atual da pool de balas)
    # =====================================================

    @staticmethod
    def distribution(state):
        """
        Retorna distribuição global das balas restantes
        baseadas no conhecimento atual do jogo.
        """

        known_live = 0
        known_blank = 0

        for shell in state.known_shells:

            if shell == ShellType.LIVE:
                known_live += 1

            elif shell == ShellType.BLANK:
                known_blank += 1

        remaining_live = state.live_shells - known_live
        remaining_blank = state.blank_shells - known_blank

        total_unknown = remaining_live + remaining_blank

        if total_unknown <= 0:
            return {
                ShellType.LIVE: 0.0,
                ShellType.BLANK: 0.0
            }

        return {
            ShellType.LIVE: remaining_live / total_unknown,
            ShellType.BLANK: remaining_blank / total_unknown
        }

    # =====================================================
    # PROBABILIDADE DA BALA ATUAL
    # =====================================================

    @staticmethod
    def current_shell(state):
        """
        Probabilidade da próxima bala a ser disparada.
        """

        shell = state.get_current_shell()

        # Caso já seja conhecida
        if shell == ShellType.LIVE:
            return {
                "live": 1.0,
                "blank": 0.0
            }

        if shell == ShellType.BLANK:
            return {
                "live": 0.0,
                "blank": 1.0
            }

        # Caso desconhecida → usar distribuição
        dist = ProbabilityEngine.distribution(state)

        return {
            "live": dist[ShellType.LIVE],
            "blank": dist[ShellType.BLANK]
        }

    # =====================================================
    # PROBABILIDADE NUMA POSIÇÃO ESPECÍFICA
    # (Telemóvel / efeitos futuros)
    # =====================================================

    @staticmethod
    def shell_at(state, index):
        """
        Probabilidade de uma posição específica da sequência.
        """

        if index < len(state.known_shells):

            known = state.known_shells[index]

            if known == ShellType.LIVE:
                return {"live": 1.0, "blank": 0.0}

            if known == ShellType.BLANK:
                return {"live": 0.0, "blank": 1.0}

        # fallback: usa distribuição global
        return ProbabilityEngine.distribution(state)

    # =====================================================
    # CONTAGEM ESPERADA
    # =====================================================

    @staticmethod
    def expected_remaining(state):
        """
        Retorna quantas balas ainda podem existir
        (útil para simulação e heurísticas)
        """

        dist = ProbabilityEngine.distribution(state)

        total = state.total_shells - len(state.known_shells)

        return {
            ShellType.LIVE: dist[ShellType.LIVE] * total,
            ShellType.BLANK: dist[ShellType.BLANK] * total
        }