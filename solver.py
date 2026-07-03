from move_generator import MoveGenerator


class Solver:

    @staticmethod
    def best_move(state):
        moves = MoveGenerator.generate_moves(state)

        if not moves:
            return None

        return max(moves, key=lambda move: move.expected_value)
