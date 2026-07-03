from event_history import EventHistory
from game_engine import GameEngine
from game_state import GameState
from probability import ProbabilityEngine
from solver import Solver


class GameSession:

    def __init__(self, initial_state: GameState | None = None):
        self.state = initial_state or GameState()
        self.history = EventHistory()
        self.engine = GameEngine(self.history)

    def process_event(self, event):
        snapshot = self.state.clone()

        try:
            return self.engine.apply_event(self.state, event)
        except Exception:
            self.state.__dict__.update(snapshot.__dict__)
            raise

    def best_move(self):
        return Solver.best_move(self.state)

    def current_shell_probability(self):
        return ProbabilityEngine.current_shell(self.state)

    def distribution(self):
        return ProbabilityEngine.distribution(self.state)
