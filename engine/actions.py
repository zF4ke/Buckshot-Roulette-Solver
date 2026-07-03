from enums import *
from action import Action
from outcome import ActionOutcome
from probability import ProbabilityEngine


class Actions:

    @staticmethod
    def get_legal_actions(state):
        actions = []

        if state.total_shells > 0:
            actions.append(Action(ActionType.SHOOT_SELF))
            actions.append(Action(ActionType.SHOOT_ENEMY))

        inventory = state.active_inventory()
        enemy_inventory = state.opponent_inventory()

        if inventory[ItemType.SAW] > 0 and not state.saw_active and state.total_shells > 0:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.SAW))

        if inventory[ItemType.MAGNIFIER] > 0 and state.total_shells > 0:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.MAGNIFIER))

        if inventory[ItemType.INVERTER] > 0 and state.total_shells > 0:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.INVERTER))

        if inventory[ItemType.BEER] > 0 and state.total_shells > 0:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.BEER))

        if inventory[ItemType.PHONE] > 0 and state.total_shells > 1:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.PHONE))

        if inventory[ItemType.MEDICINE] > 0:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.MEDICINE))

        if inventory[ItemType.CIGARETTES] > 0 and state.active_hp() < state.active_max_hp():
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.CIGARETTES))

        if inventory[ItemType.HANDCUFFS] > 0 and state.handcuffed is None:
            actions.append(Action(ActionType.USE_ITEM, item=ItemType.HANDCUFFS))

        if inventory[ItemType.ADRENALINE] > 0:
            for item, count in enemy_inventory.items():
                if count > 0 and item != ItemType.ADRENALINE:
                    if item == ItemType.CIGARETTES and state.active_hp() >= state.active_max_hp():
                        continue

                    actions.append(
                        Action(
                            ActionType.USE_ITEM,
                            item=ItemType.ADRENALINE,
                            target_item=item,
                        )
                    )

        return actions

    @staticmethod
    def expand_action(state, action: Action):
        if action.action_type == ActionType.SHOOT_SELF:
            return Actions._expand_shot(state, action, target_self=True)

        if action.action_type == ActionType.SHOOT_ENEMY:
            return Actions._expand_shot(state, action, target_self=False)

        if action.action_type == ActionType.USE_ITEM:
            return Actions._expand_item(state, action)

        return []

    @staticmethod
    def _current_shell_outcomes(state):
        shell = state.get_current_shell()

        if shell is not None:
            return [(shell, 1.0)]

        probabilities = ProbabilityEngine.current_shell(state)
        return [
            (ShellType.LIVE, probabilities["live"]),
            (ShellType.BLANK, probabilities["blank"]),
        ]

    @staticmethod
    def _damage_active_player(state, damage):
        if state.turn == Turn.PLAYER:
            state.player_hp -= damage
        else:
            state.enemy_hp -= damage

    @staticmethod
    def _damage_opponent(state, damage):
        if state.turn == Turn.PLAYER:
            state.enemy_hp -= damage
        else:
            state.player_hp -= damage

    @staticmethod
    def _heal_active_player(state, amount):
        state.set_active_hp(min(state.active_max_hp(), state.active_hp() + amount))

    @staticmethod
    def _expand_shot(state, action, target_self):
        outcomes = []

        for shell, probability in Actions._current_shell_outcomes(state):
            if probability <= 0:
                continue

            new_state = state.clone()
            damage = 0

            if shell == ShellType.LIVE:
                damage = 2 if new_state.saw_active else 1

                if target_self:
                    Actions._damage_active_player(new_state, damage)
                else:
                    Actions._damage_opponent(new_state, damage)

            new_state.saw_active = False
            new_state.remove_current_shell(shell)

            if not target_self or shell == ShellType.LIVE or new_state.total_shells == 0:
                new_state.end_turn()

            target = "si" if target_self else "oponente"
            outcomes.append(
                ActionOutcome(
                    action,
                    probability,
                    new_state,
                    f"Disparo em {target} com {shell.name}, dano {damage}",
                )
            )

        return outcomes

    @staticmethod
    def _expand_item(state, action):
        if action.item == ItemType.ADRENALINE:
            return Actions._expand_adrenaline(state, action)

        return Actions._apply_item(state, action, action.item, consume_active=True)

    @staticmethod
    def _expand_adrenaline(state, action):
        if action.target_item is None:
            return []

        new_state = state.clone()
        new_state.consume_item(ItemType.ADRENALINE)
        new_state.consume_opponent_item(action.target_item)

        stolen_action = Action(
            ActionType.USE_ITEM,
            item=ItemType.ADRENALINE,
            target_item=action.target_item,
        )

        outcomes = Actions._apply_item(
            new_state,
            stolen_action,
            action.target_item,
            consume_active=False,
        )

        for outcome in outcomes:
            outcome.description = f"Adrenalina -> {outcome.description}"

        return outcomes

    @staticmethod
    def _apply_item(state, action, item, consume_active):
        if item is None:
            return []

        if item == ItemType.SAW:
            new_state = state.clone()
            if consume_active:
                new_state.consume_item(item)
            new_state.saw_active = True
            return [ActionOutcome(action, 1.0, new_state, "Usou Serra")]

        if item == ItemType.MAGNIFIER:
            return Actions._expand_magnifier(state, action, consume_active)

        if item == ItemType.INVERTER:
            return Actions._expand_inverter(state, action, consume_active)

        if item == ItemType.BEER:
            return Actions._expand_beer(state, action, consume_active)

        if item == ItemType.PHONE:
            return Actions._expand_phone(state, action, consume_active)

        if item == ItemType.MEDICINE:
            return Actions._expand_medicine(state, action, consume_active)

        if item == ItemType.CIGARETTES:
            if state.active_hp() >= state.active_max_hp():
                return []

            new_state = state.clone()
            if consume_active:
                new_state.consume_item(item)
            Actions._heal_active_player(new_state, 1)
            return [ActionOutcome(action, 1.0, new_state, "Usou Cigarro")]

        if item == ItemType.HANDCUFFS:
            new_state = state.clone()
            if consume_active:
                new_state.consume_item(item)
            new_state.handcuffed = new_state.opponent_turn
            return [ActionOutcome(action, 1.0, new_state, "Usou Algemas")]

        return []

    @staticmethod
    def _expand_magnifier(state, action, consume_active):
        outcomes = []

        for shell, probability in Actions._current_shell_outcomes(state):
            if probability <= 0:
                continue

            new_state = state.clone()
            if consume_active:
                new_state.consume_item(ItemType.MAGNIFIER)
            new_state.set_known_shell(0, shell)

            outcomes.append(
                ActionOutcome(
                    action,
                    probability,
                    new_state,
                    f"Lupa revelou {shell.name}",
                )
            )

        return outcomes

    @staticmethod
    def _expand_inverter(state, action, consume_active):
        outcomes = []

        for shell, probability in Actions._current_shell_outcomes(state):
            if probability <= 0:
                continue

            new_state = state.clone()
            if consume_active:
                new_state.consume_item(ItemType.INVERTER)

            if shell == ShellType.LIVE:
                new_state.live_shells -= 1
                new_state.blank_shells += 1
                new_shell = ShellType.BLANK
            else:
                new_state.blank_shells -= 1
                new_state.live_shells += 1
                new_shell = ShellType.LIVE

            new_state.set_known_shell(0, new_shell)
            outcomes.append(
                ActionOutcome(
                    action,
                    probability,
                    new_state,
                    f"Inversor mudou {shell.name} para {new_shell.name}",
                )
            )

        return outcomes

    @staticmethod
    def _expand_beer(state, action, consume_active):
        outcomes = []

        for shell, probability in Actions._current_shell_outcomes(state):
            if probability <= 0:
                continue

            new_state = state.clone()
            if consume_active:
                new_state.consume_item(ItemType.BEER)
            new_state.remove_current_shell(shell)
            # Racking com a cerveja ejeta a bala SEM disparar, por isso a serra
            # (estado do cano) permanece ativa. So um disparo consome a serra.

            outcomes.append(
                ActionOutcome(
                    action,
                    probability,
                    new_state,
                    f"Cerveja removeu {shell.name}",
                )
            )

        return outcomes

    @staticmethod
    def _expand_phone(state, action, consume_active):
        # O Telemovel nunca revela a bala na camara (posicao 0); apenas posicoes
        # futuras (a "segunda bala" em diante, relativa a atual).
        unknown_positions = [
            index
            for index in range(1, state.total_shells)
            if index >= len(state.known_shells) or state.known_shells[index] is None
        ]

        if not unknown_positions:
            new_state = state.clone()
            if consume_active:
                new_state.consume_item(ItemType.PHONE)
            return [ActionOutcome(action, 1.0, new_state, "Telemovel sem informacao nova")]

        outcomes = []
        position_probability = 1 / len(unknown_positions)
        shell_probability = ProbabilityEngine.current_shell(state)

        for index in unknown_positions:
            for shell, probability in [
                (ShellType.LIVE, shell_probability["live"]),
                (ShellType.BLANK, shell_probability["blank"]),
            ]:
                if probability <= 0:
                    continue

                new_state = state.clone()
                if consume_active:
                    new_state.consume_item(ItemType.PHONE)
                new_state.set_known_shell(index, shell)
                outcomes.append(
                    ActionOutcome(
                        action,
                        position_probability * probability,
                        new_state,
                        f"Telemovel revelou posicao {index + 1}: {shell.name}",
                    )
                )

        return outcomes

    @staticmethod
    def _expand_medicine(state, action, consume_active):
        heal_state = state.clone()
        damage_state = state.clone()

        if consume_active:
            heal_state.consume_item(ItemType.MEDICINE)
            damage_state.consume_item(ItemType.MEDICINE)

        Actions._heal_active_player(heal_state, 2)
        Actions._damage_active_player(damage_state, 1)

        return [
            ActionOutcome(action, 0.5, heal_state, "Medicamentos curaram 2 HP"),
            ActionOutcome(action, 0.5, damage_state, "Medicamentos tiraram 1 HP"),
        ]
