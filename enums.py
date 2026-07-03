from enum import Enum, auto


class ShellType(Enum):
    LIVE = auto()
    BLANK = auto()


class Turn(Enum):
    PLAYER = auto()
    ENEMY = auto()


class ItemType(Enum):
    SAW = auto()
    MAGNIFIER = auto()
    INVERTER = auto()
    BEER = auto()
    PHONE = auto()
    ADRENALINE = auto()
    MEDICINE = auto()
    HANDCUFFS = auto()
    CIGARETTES = auto()


class ActionType(Enum):
    SHOOT_SELF = auto()
    SHOOT_ENEMY = auto()
    USE_ITEM = auto()
    END_TURN = auto()


class GameEventType(Enum):
    SHOOT = auto()
    USE_ITEM = auto()
    END_TURN = auto()
    UPDATE_INVENTORY = auto()
