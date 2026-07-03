from search import Search, config_for_level


class Solver:

    @staticmethod
    def analyze(state, level=10):
        """Lista ordenada de movimentos (melhor primeiro) para o turno atual."""
        search = Search(config_for_level(level))
        return search.analyze(state)

    @staticmethod
    def best_move(state, level=10):
        moves = Solver.analyze(state, level=level)
        if not moves:
            return None
        return moves[0]
