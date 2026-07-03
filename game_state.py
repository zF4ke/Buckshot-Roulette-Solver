from copy import deepcopy
from enums import ShellType, Turn, ItemType


class GameState:

    def __init__(self):

        # VIDA
        self.player_hp = 0
        self.enemy_hp = 0
        self.player_max_hp = 0
        self.enemy_max_hp = 0

        # BALAS
        self.live_shells = 0
        self.blank_shells = 0

        # CONHECIMENTO
        self.known_shells: list[ShellType | None] = []

        # ITENS
        self.player_items = {item: 0 for item in ItemType}
        self.enemy_items = {item: 0 for item in ItemType}

        # TURNO
        self.turn = Turn.PLAYER

        # EFEITOS
        self.saw_active = False
        self.handcuffed = None

    # -----------------------------
    # UTIL
    # -----------------------------

    @property
    def total_shells(self):
        return self.live_shells + self.blank_shells

    @property
    def opponent_turn(self):
        return Turn.ENEMY if self.turn == Turn.PLAYER else Turn.PLAYER

    def clone(self):
        return deepcopy(self)

    def active_inventory(self):
        return self.player_items if self.turn == Turn.PLAYER else self.enemy_items

    def opponent_inventory(self):
        return self.enemy_items if self.turn == Turn.PLAYER else self.player_items

    def active_hp(self):
        return self.player_hp if self.turn == Turn.PLAYER else self.enemy_hp

    def active_max_hp(self):
        max_hp = self.player_max_hp if self.turn == Turn.PLAYER else self.enemy_max_hp
        return max_hp or self.active_hp()

    def set_active_hp(self, hp):
        if self.turn == Turn.PLAYER:
            self.player_hp = hp
        else:
            self.enemy_hp = hp

    def consume_item(self, item):
        inventory = self.active_inventory()
        if inventory[item] > 0:
            inventory[item] -= 1

    def consume_opponent_item(self, item):
        inventory = self.opponent_inventory()
        if inventory[item] > 0:
            inventory[item] -= 1

    def end_turn(self):
        next_turn = self.opponent_turn

        if self.handcuffed == next_turn:
            self.handcuffed = None
            return

        self.turn = next_turn

    # -----------------------------
    # BALAS
    # -----------------------------

    def remove_current_shell(self, shell_type=None):

        if shell_type == ShellType.LIVE and self.live_shells > 0:
            self.live_shells -= 1

        if shell_type == ShellType.BLANK and self.blank_shells > 0:
            self.blank_shells -= 1

        if self.known_shells:
            self.known_shells.pop(0)

    def set_known_shell(self, index, shell_type):

        while len(self.known_shells) <= index:
            self.known_shells.append(None)

        self.known_shells[index] = shell_type

    def get_current_shell(self):

        if not self.known_shells:
            return None

        return self.known_shells[0]

    def unknown_shells(self):
        known_live = sum(1 for shell in self.known_shells if shell == ShellType.LIVE)
        known_blank = sum(1 for shell in self.known_shells if shell == ShellType.BLANK)

        return {
            ShellType.LIVE: max(0, self.live_shells - known_live),
            ShellType.BLANK: max(0, self.blank_shells - known_blank),
        }
