import hashlib
import json

def state_hash(state):
    """
    Cria um ID único para um estado.
    Isto permite detectar estados repetidos.
    """

    data = {
        "player_hp": state.player_hp,
        "enemy_hp": state.enemy_hp,
        "player_max_hp": state.player_max_hp,
        "enemy_max_hp": state.enemy_max_hp,
        "live_shells": state.live_shells,
        "blank_shells": state.blank_shells,
        "known_shells": [s.name if s else None for s in state.known_shells],
        "player_items": {k.name: v for k, v in state.player_items.items()},
        "enemy_items": {k.name: v for k, v in state.enemy_items.items()},
        "turn": state.turn.name,
        "saw_active": state.saw_active,
        "handcuffed": state.handcuffed.name if state.handcuffed else None,
    }

    raw = json.dumps(data, sort_keys=True)

    return hashlib.md5(raw.encode()).hexdigest()
