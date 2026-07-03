from dataclasses import dataclass

from action import Action
from game_state import GameState


@dataclass(slots=True)
class ActionOutcome:

    action: Action

    probability: float

    state: GameState

    description: str = ""