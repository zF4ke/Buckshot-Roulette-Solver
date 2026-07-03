"""
Compatibilidade: `MoveGenerator.generate_moves` continua a existir para o CLI,
mas agora e apenas um wrapper fino sobre o novo motor `Search`.
"""

from actions import Actions
from search import Search, config_for_level


class MoveGenerator:

    @staticmethod
    def generate_moves(state, progress=None, level=10):
        search = Search(config_for_level(level))

        if progress is not None:
            legal_actions = Actions.get_legal_actions(state)
            progress("start", legal_actions=legal_actions)

        moves = search.analyze(state)

        if progress is not None:
            progress("done", moves=moves, exact=search.exact, reached_depth=search.reached_depth)

        return moves
