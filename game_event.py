from dataclasses import dataclass

from enums import GameEventType, ItemType, ShellType, Turn


@dataclass(slots=True)
class GameEvent:
    actor: Turn
    event_type: GameEventType

    item: ItemType | None = None
    target_item: ItemType | None = None

    target: Turn | None = None
    shell: ShellType | None = None

    known_index: int | None = None
    hp_delta: int | None = None

    inventory: dict[ItemType, int] | None = None
