from enums import GameEventType, ItemType, ShellType, Turn
from event_history import EventHistory
from game_event import GameEvent


class GameEngine:

    def __init__(self, history: EventHistory):
        self.history = history

    def apply_event(self, state, event: GameEvent):
        if event.event_type != GameEventType.UPDATE_INVENTORY and event.actor != state.turn:
            raise ValueError("O actor do evento nao corresponde ao turno atual.")

        if event.event_type == GameEventType.SHOOT:
            summary = self._apply_shoot(state, event)
        elif event.event_type == GameEventType.USE_ITEM:
            summary = self._apply_item(state, event)
        elif event.event_type == GameEventType.END_TURN:
            state.end_turn()
            summary = self._actor_name(event.actor) + " terminou o turno"
        elif event.event_type == GameEventType.UPDATE_INVENTORY:
            summary = self._apply_inventory_update(state, event)
        else:
            raise ValueError("Evento nao suportado.")

        return self.history.add(event, summary)

    @staticmethod
    def _actor_name(actor: Turn):
        return "PLAYER" if actor == Turn.PLAYER else "ENEMY"

    @staticmethod
    def _target_name(target: Turn):
        return "PLAYER" if target == Turn.PLAYER else "ENEMY"

    @staticmethod
    def _inventory_for_actor(state, actor: Turn):
        return state.player_items if actor == Turn.PLAYER else state.enemy_items

    @staticmethod
    def _hp_for_actor(state, actor: Turn):
        return state.player_hp if actor == Turn.PLAYER else state.enemy_hp

    @staticmethod
    def _set_hp_for_actor(state, actor: Turn, hp: int):
        if actor == Turn.PLAYER:
            state.player_hp = hp
        else:
            state.enemy_hp = hp

    @staticmethod
    def _max_hp_for_actor(state, actor: Turn):
        return state.player_max_hp if actor == Turn.PLAYER else state.enemy_max_hp

    @staticmethod
    def _damage_actor(state, actor: Turn, amount: int):
        hp = GameEngine._hp_for_actor(state, actor)
        GameEngine._set_hp_for_actor(state, actor, hp - amount)

    @staticmethod
    def _heal_actor(state, actor: Turn, amount: int):
        hp = GameEngine._hp_for_actor(state, actor)
        max_hp = GameEngine._max_hp_for_actor(state, actor)
        GameEngine._set_hp_for_actor(state, actor, min(max_hp, hp + amount))

    def _apply_shoot(self, state, event: GameEvent):
        target = event.target or state.opponent_turn
        shell = event.shell

        if shell is None:
            raise ValueError("Disparo precisa indicar se a bala era verdadeira ou falsa.")

        damage = 0
        if shell == ShellType.LIVE:
            damage = 2 if state.saw_active else 1
            self._damage_actor(state, target, damage)

        state.saw_active = False
        state.remove_current_shell(shell)

        if target != event.actor or shell == ShellType.LIVE or state.total_shells == 0:
            state.end_turn()

        return (
            f"{self._actor_name(event.actor)} disparou em {self._target_name(target)} "
            f"com {shell.name} (dano {damage})"
        )

    def _apply_item(self, state, event: GameEvent):
        item = event.item
        if item is None:
            raise ValueError("Evento USE_ITEM precisa de item.")

        inventory = self._inventory_for_actor(state, event.actor)
        if inventory[item] <= 0:
            raise ValueError("O actor nao tem esse item no inventario.")

        inventory[item] -= 1

        if item == ItemType.SAW:
            state.saw_active = True
            return f"{self._actor_name(event.actor)} usou SAW"

        if item == ItemType.MAGNIFIER:
            if event.shell is None:
                raise ValueError("Magnifier precisa da bala observada.")
            state.set_known_shell(0, event.shell)
            return f"{self._actor_name(event.actor)} usou MAGNIFIER e viu {event.shell.name}"

        if item == ItemType.INVERTER:
            shell_before = event.shell or state.get_current_shell()
            if shell_before is None:
                raise ValueError("Inverter precisa da bala antes da inversao (se era desconhecida).")

            if shell_before == ShellType.LIVE:
                state.live_shells -= 1
                state.blank_shells += 1
                shell_after = ShellType.BLANK
            else:
                state.blank_shells -= 1
                state.live_shells += 1
                shell_after = ShellType.LIVE

            state.set_known_shell(0, shell_after)
            return (
                f"{self._actor_name(event.actor)} usou INVERTER: "
                f"{shell_before.name} -> {shell_after.name}"
            )

        if item == ItemType.BEER:
            if event.shell is None:
                raise ValueError("Beer precisa da bala removida.")
            state.remove_current_shell(event.shell)
            # Racking nao dispara: a serra continua ativa.
            return f"{self._actor_name(event.actor)} usou BEER e removeu {event.shell.name}"

        if item == ItemType.PHONE:
            if event.known_index is None or event.shell is None:
                raise ValueError("Phone precisa de posicao e bala revelada.")
            if event.known_index < 1:
                raise ValueError("Telemovel nunca revela a bala atual (posicao 1).")
            state.set_known_shell(event.known_index, event.shell)
            return (
                f"{self._actor_name(event.actor)} usou PHONE e revelou "
                f"posicao {event.known_index + 1}: {event.shell.name}"
            )

        if item == ItemType.MEDICINE:
            hp_delta = event.hp_delta
            if hp_delta is None:
                raise ValueError("Medicine precisa do delta real de HP (+2 ou -1).")

            if hp_delta >= 0:
                self._heal_actor(state, event.actor, hp_delta)
            else:
                self._damage_actor(state, event.actor, -hp_delta)

            return f"{self._actor_name(event.actor)} usou MEDICINE (delta HP {hp_delta})"

        if item == ItemType.CIGARETTES:
            self._heal_actor(state, event.actor, 1)
            return f"{self._actor_name(event.actor)} usou CIGARETTES"

        if item == ItemType.HANDCUFFS:
            state.handcuffed = state.opponent_turn
            return f"{self._actor_name(event.actor)} usou HANDCUFFS"

        if item == ItemType.ADRENALINE:
            target_item = event.target_item
            if target_item is None:
                raise ValueError("Adrenaline precisa indicar qual item foi roubado.")

            opponent = state.opponent_turn
            opponent_inventory = self._inventory_for_actor(state, opponent)
            if opponent_inventory[target_item] <= 0:
                raise ValueError("O alvo nao tem esse item para roubar.")

            opponent_inventory[target_item] -= 1

            stolen_event = GameEvent(
                actor=event.actor,
                event_type=GameEventType.USE_ITEM,
                item=target_item,
                shell=event.shell,
                known_index=event.known_index,
                hp_delta=event.hp_delta,
            )

            summary = self._apply_item_without_consuming(state, stolen_event)
            return f"{self._actor_name(event.actor)} usou ADRENALINE -> {summary}"

        return f"{self._actor_name(event.actor)} usou {item.name}"

    def _apply_inventory_update(self, state, event: GameEvent):
        if event.inventory is None:
            raise ValueError("Atualizacao de inventario precisa de inventario.")

        inventory = self._inventory_for_actor(state, event.actor)
        inventory.clear()
        inventory.update({item: max(0, count) for item, count in event.inventory.items()})

        visible_items = [
            f"{item.name}:{count}"
            for item, count in inventory.items()
            if count > 0
        ]
        items_text = ", ".join(visible_items) if visible_items else "nenhum"

        return f"Inventario de {self._actor_name(event.actor)} atualizado: {items_text}"

    def _apply_item_without_consuming(self, state, event: GameEvent):
        item = event.item

        if item == ItemType.SAW:
            state.saw_active = True
            return "SAW"

        if item == ItemType.MAGNIFIER:
            if event.shell is None:
                raise ValueError("Magnifier roubado precisa da bala observada.")
            state.set_known_shell(0, event.shell)
            return f"MAGNIFIER ({event.shell.name})"

        if item == ItemType.INVERTER:
            shell_before = event.shell or state.get_current_shell()
            if shell_before is None:
                raise ValueError("Inverter roubado precisa da bala antes da inversao.")

            if shell_before == ShellType.LIVE:
                state.live_shells -= 1
                state.blank_shells += 1
                shell_after = ShellType.BLANK
            else:
                state.blank_shells -= 1
                state.live_shells += 1
                shell_after = ShellType.LIVE

            state.set_known_shell(0, shell_after)
            return f"INVERTER ({shell_before.name}->{shell_after.name})"

        if item == ItemType.BEER:
            if event.shell is None:
                raise ValueError("Beer roubada precisa da bala removida.")
            state.remove_current_shell(event.shell)
            # Racking nao dispara: a serra continua ativa.
            return f"BEER ({event.shell.name})"

        if item == ItemType.PHONE:
            if event.known_index is None or event.shell is None:
                raise ValueError("Phone roubado precisa de posicao e bala.")
            state.set_known_shell(event.known_index, event.shell)
            return f"PHONE (pos {event.known_index + 1}={event.shell.name})"

        if item == ItemType.MEDICINE:
            hp_delta = event.hp_delta
            if hp_delta is None:
                raise ValueError("Medicine roubada precisa do delta de HP.")
            if hp_delta >= 0:
                self._heal_actor(state, event.actor, hp_delta)
            else:
                self._damage_actor(state, event.actor, -hp_delta)
            return f"MEDICINE ({hp_delta})"

        if item == ItemType.CIGARETTES:
            self._heal_actor(state, event.actor, 1)
            return "CIGARETTES"

        if item == ItemType.HANDCUFFS:
            state.handcuffed = state.opponent_turn
            return "HANDCUFFS"

        raise ValueError("Adrenaline nao pode copiar esse item.")
