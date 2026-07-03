from dataclasses import dataclass


@dataclass(slots=True)
class ShellProbability:

    live_probability: float
    blank_probability: float

    live_remaining: int
    blank_remaining: int

    unknown_positions: int