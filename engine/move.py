from dataclasses import dataclass
from action import Action


@dataclass(slots=True)
class Move:

    # sequência de ações (ex: Lupa → Cerveja → Disparo)
    action_sequence: list[Action]

    # valor esperado REAL desta sequência
    expected_value: float