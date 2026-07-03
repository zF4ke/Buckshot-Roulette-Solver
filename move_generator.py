from actions import Actions
from evaluator import Evaluator
from move import Move
from state_utils import state_hash


class MoveGenerator:

    MAX_DEPTH = 6

    @staticmethod
    def generate_moves(state, progress=None):
        moves = []
        legal_actions = MoveGenerator._order_actions(state, Actions.get_legal_actions(state))

        if progress is not None:
            progress("start", legal_actions=legal_actions)

        for action in legal_actions:
            if progress is not None:
                progress("action_start", action=action)

            tree = MoveGenerator._expand(
                state=state,
                actions=[action],
                probability=1.0,
                depth=0,
                visited={state_hash(state)},
            )

            expected_value = MoveGenerator._expected_value(tree)
            best_sequence = MoveGenerator._best_sequence(tree, fallback=[action])

            if progress is not None:
                progress(
                    "action_done",
                    action=action,
                    leaves=len(tree),
                    expected_value=expected_value,
                    best_sequence=best_sequence,
                )

            moves.append(
                Move(
                    action_sequence=best_sequence,
                    expected_value=expected_value,
                )
            )

        sorted_moves = sorted(moves, key=lambda move: move.expected_value, reverse=True)

        if progress is not None:
            progress("done", moves=sorted_moves)

        return sorted_moves

    @staticmethod
    def _order_actions(state, actions):
        def action_score(action):
            if action.action_type.name.startswith("SHOOT"):
                return 100

            if action.action_type.name == "USE_ITEM":
                if action.item is None:
                    return 0

                if action.item.name in ["SAW", "ADRENALINE"]:
                    return 80

                if action.item.name in ["MAGNIFIER", "INVERTER"]:
                    return 70

                if action.item.name in ["HANDCUFFS", "PHONE"]:
                    return 55

                if action.item.name in ["BEER", "CIGARETTES"]:
                    return 45

                if action.item.name == "MEDICINE":
                    return 30

            return 10

        return sorted(actions, key=action_score, reverse=True)

    @staticmethod
    def _expand(state, actions, probability, depth, visited):
        if MoveGenerator._is_terminal_state(state) or depth >= MoveGenerator.MAX_DEPTH:
            return [(state, probability, actions)]

        last_action = actions[-1]
        outcomes = Actions.expand_action(state, last_action)

        if not outcomes:
            return [(state, probability, actions)]

        results = []

        for outcome in outcomes:
            new_state = outcome.state
            new_probability = probability * outcome.probability

            if new_probability < 0.005:
                continue

            if MoveGenerator._is_terminal_state(new_state):
                results.append((new_state, new_probability, actions))
                continue

            if MoveGenerator._action_ends_sequence(state, new_state, last_action):
                results.append((new_state, new_probability, actions))
                continue

            state_id = state_hash(new_state)
            if state_id in visited:
                results.append((new_state, new_probability, actions))
                continue

            next_actions = MoveGenerator._order_actions(
                new_state,
                Actions.get_legal_actions(new_state),
            )

            if not next_actions:
                results.append((new_state, new_probability, actions))
                continue

            next_visited = visited | {state_id}

            branch_options = []

            for next_action in next_actions:
                branch = MoveGenerator._expand(
                    state=new_state,
                    actions=actions + [next_action],
                    probability=new_probability,
                    depth=depth + 1,
                    visited=next_visited,
                )
                branch_options.append(branch)

            results.extend(MoveGenerator._choose_best_branch(new_state, branch_options))

        return results

    @staticmethod
    def _choose_best_branch(state, branch_options):
        if not branch_options:
            return []

        key = MoveGenerator._expected_value

        if state.turn.name == "PLAYER":
            return max(branch_options, key=key)

        return min(branch_options, key=key)

    @staticmethod
    def _is_terminal_state(state):
        return state.player_hp <= 0 or state.enemy_hp <= 0 or state.total_shells <= 0

    @staticmethod
    def _action_ends_sequence(old_state, new_state, action):
        if action.action_type.name == "SHOOT_ENEMY":
            return True

        if action.action_type.name == "SHOOT_SELF":
            return old_state.turn != new_state.turn

        return old_state.turn != new_state.turn

    @staticmethod
    def _expected_value(tree):
        total = 0.0
        total_probability = 0.0

        for state, probability, _actions in tree:
            total += Evaluator.evaluate(state) * probability
            total_probability += probability

        if total_probability <= 0:
            return float("-inf")

        return total / total_probability

    @staticmethod
    def _best_sequence(tree, fallback):
        if not tree:
            return fallback

        best_state, _probability, best_actions = max(
            tree,
            key=lambda result: Evaluator.evaluate(result[0]),
        )

        return best_actions or fallback
