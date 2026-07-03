from dataclasses import dataclass
from enums import ActionType, ItemType, ShellType


@dataclass(slots=True)
class Action:
    action_type: ActionType

    item: ItemType | None = None

    target_item: ItemType | None = None

    shell: ShellType | None = None

    index: int | None = None
