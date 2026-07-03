import argparse
import time
import traceback

from enums import ActionType, GameEventType, ItemType, ShellType, Turn
from game_event import GameEvent
from game_session import GameSession
from game_state import GameState
from move_generator import MoveGenerator


DEBUG = False


ITEM_ALIASES = {
    "serra": ItemType.SAW,
    "saw": ItemType.SAW,
    "lupa": ItemType.MAGNIFIER,
    "magnifier": ItemType.MAGNIFIER,
    "inversor": ItemType.INVERTER,
    "inverter": ItemType.INVERTER,
    "cerveja": ItemType.BEER,
    "beer": ItemType.BEER,
    "telemovel": ItemType.PHONE,
    "telefone": ItemType.PHONE,
    "phone": ItemType.PHONE,
    "adrenalina": ItemType.ADRENALINE,
    "adrenaline": ItemType.ADRENALINE,
    "medicamentos": ItemType.MEDICINE,
    "medicine": ItemType.MEDICINE,
    "algemas": ItemType.HANDCUFFS,
    "handcuffs": ItemType.HANDCUFFS,
    "cigarro": ItemType.CIGARETTES,
    "cigarros": ItemType.CIGARETTES,
    "cigarettes": ItemType.CIGARETTES,
}


def ask_int(prompt, default=0):
    value = input(f"{prompt} [{default}]: ").strip()
    if not value:
        return default
    return int(value)


def ask_shell(prompt):
    value = input(f"{prompt} (v/f/?): ").strip().lower()
    return parse_shell_value(value)


def parse_shell_value(value):
    value = value.strip().lower()
    if value in ("v", "live", "verdadeira"):
        return ShellType.LIVE
    if value in ("f", "blank", "falsa"):
        return ShellType.BLANK
    return None


def parse_known_shells(text):
    known_shells = []
    text = text.strip().lower()

    if not text:
        return known_shells

    # Formato rapido por sequencia: v??f
    if "," not in text and ":" not in text and " " not in text:
        for char in text:
            known_shells.append(parse_shell_value(char))
        return known_shells

    # Formato por posicao: 1:v, 5:f
    for raw_part in text.split(","):
        part = raw_part.strip()
        if not part:
            continue

        if ":" not in part:
            print(f"Conhecimento ignorado: {raw_part.strip()}")
            continue

        index_text, shell_text = part.split(":", 1)
        try:
            index = int(index_text.strip()) - 1
        except ValueError:
            print(f"Posicao invalida ignorada: {index_text.strip()}")
            continue

        if index < 0:
            print(f"Posicao invalida ignorada: {index + 1}")
            continue

        shell = parse_shell_value(shell_text)

        while len(known_shells) <= index:
            known_shells.append(None)

        known_shells[index] = shell

    return known_shells


def parse_items(text):
    inventory = {item: 0 for item in ItemType}

    if not text.strip():
        return inventory

    for raw_part in text.split(","):
        part = raw_part.strip().lower()
        if not part:
            continue

        if ":" in part:
            name, count_text = part.split(":", 1)
            count = int(count_text.strip())
        else:
            name = part
            count = 1

        item = ITEM_ALIASES.get(name.strip())
        if item is None:
            print(f"Item ignorado: {raw_part.strip()}")
            continue

        inventory[item] += count

    return inventory


def item_name(item):
    names = {
        ItemType.SAW: "Serra",
        ItemType.MAGNIFIER: "Lupa",
        ItemType.INVERTER: "Inversor",
        ItemType.BEER: "Cerveja",
        ItemType.PHONE: "Telemovel",
        ItemType.ADRENALINE: "Adrenalina",
        ItemType.MEDICINE: "Medicamentos",
        ItemType.HANDCUFFS: "Algemas",
        ItemType.CIGARETTES: "Cigarro",
    }
    return names[item]


def action_text(action):
    if action.action_type == ActionType.SHOOT_SELF:
        return "Disparar em si proprio"

    if action.action_type == ActionType.SHOOT_ENEMY:
        return "Disparar no adversario"

    if action.item == ItemType.ADRENALINE and action.target_item is not None:
        return f"Usar Adrenalina para usar {item_name(action.target_item)}"

    if action.item is not None:
        return f"Usar {item_name(action.item)}"

    return action.action_type.name


def inventory_text(inventory):
    parts = [
        f"{item_name(item)}:{count}"
        for item, count in inventory.items()
        if count > 0
    ]
    return ", ".join(parts) if parts else "nenhum"


def move_text(move):
    sequence = " -> ".join(action_text(action) for action in move.action_sequence)
    return f"{move.expected_value:8.2f}  {sequence}"


def print_help():
    print()
    print("Como usar rapido:")
    print("- Define apenas o estado inicial visivel no arranque.")
    print("- Depois disso, regista acontecimentos: 'disparo', 'item' ou 'passar'.")
    print("- Cada acontecimento vira um GameEvent e o estado e atualizado automaticamente.")
    print("- O solver corre no turno do jogador e recomenda a melhor linha.")
    print("- Comandos: disparo, item, passar, historico, probabilidades, ajuda, sair.")
    print()


def build_initial_state():
    state = GameState()

    print("Estado visivel inicial")
    state.player_hp = ask_int("A tua vida")
    state.enemy_hp = ask_int("Vida do adversario")
    state.player_max_hp = state.player_hp
    state.enemy_max_hp = state.enemy_hp
    state.live_shells = ask_int("Balas verdadeiras")
    state.blank_shells = ask_int("Balas falsas")

    print("Balas conhecidas: usa 1:v, 5:f ou sequencia v??f. Enter se nao souberes.")
    state.known_shells = parse_known_shells(input("Balas conhecidas: "))

    print("Itens separados por virgula. Ex: serra,lupa,cerveja:2")
    state.player_items = parse_items(input("Os teus itens: "))
    state.enemy_items = parse_items(input("Itens do adversario: "))
    state.turn = Turn.PLAYER

    return state


def print_state(state):
    turn = "tu" if state.turn == Turn.PLAYER else "adversario"
    known = [
        "V" if shell == ShellType.LIVE else "F" if shell == ShellType.BLANK else "?"
        for shell in state.known_shells
    ]
    print()
    print(f"Turno: {turn}")
    print(f"HP: tu {state.player_hp}/{state.player_max_hp} | adversario {state.enemy_hp}/{state.enemy_max_hp}")
    print(f"Balas: {state.live_shells} verdadeiras | {state.blank_shells} falsas")
    print(f"Conhecidas: {' '.join(f'{index + 1}:{shell}' for index, shell in enumerate(known)) if known else 'nenhuma'}")
    print(f"Os teus itens: {inventory_text(state.player_items)}")
    print(f"Itens adversario: {inventory_text(state.enemy_items)}")


def print_probabilities(session):
    current = session.current_shell_probability()
    distribution = session.distribution()

    print()
    print(
        "Probabilidade bala atual: "
        f"LIVE={current['live']:.2f} | BLANK={current['blank']:.2f}"
    )
    print(
        "Distribuicao global desconhecida: "
        f"LIVE={distribution[ShellType.LIVE]:.2f} | BLANK={distribution[ShellType.BLANK]:.2f}"
    )


def parse_target(value, actor):
    value = value.strip().lower()

    if value in ("self", "si", "proprio", "eu"):
        return actor

    if value in ("enemy", "adversario", "oponente"):
        return Turn.ENEMY if actor == Turn.PLAYER else Turn.PLAYER

    return None


def read_item_event_details(event, item):
    if item in (ItemType.MAGNIFIER, ItemType.BEER, ItemType.INVERTER):
        shell = ask_shell("Bala observada (antes do inversor, se aplicavel)")
        if shell is None:
            print("Precisas indicar V ou F para este item.")
            return False
        event.shell = shell

    elif item == ItemType.PHONE:
        index = ask_int("Posicao revelada (1 = bala atual)", 1) - 1
        shell = ask_shell("Bala revelada")

        if index < 0 or shell is None:
            print("Phone precisa de posicao valida e bala valida.")
            return False

        event.known_index = index
        event.shell = shell

    elif item == ItemType.MEDICINE:
        event.hp_delta = ask_int("Delta real de HP (+2 ou -1)", 2)

    elif item == ItemType.ADRENALINE:
        target_name = input("Item roubado ao adversario: ").strip().lower()
        target_item = ITEM_ALIASES.get(target_name)

        if target_item is None or target_item == ItemType.ADRENALINE:
            print("Item roubado invalido para adrenalina.")
            return False

        event.target_item = target_item

        # Alguns itens roubados precisam de contexto adicional observado.
        return read_item_event_details(event, target_item)

    return True


def build_shoot_event(actor):
    target_text = input("Alvo (self/enemy): ").strip().lower()
    target = parse_target(target_text, actor)
    shell = ask_shell("Resultado da bala")

    if target is None or shell is None:
        print("Disparo invalido. Usa alvo self/enemy e bala v/f.")
        return None

    return GameEvent(
        actor=actor,
        event_type=GameEventType.SHOOT,
        target=target,
        shell=shell,
    )


def build_item_event(actor):
    name = input("Item usado: ").strip().lower()
    item = ITEM_ALIASES.get(name)

    if item is None:
        print("Item desconhecido.")
        return None

    event = GameEvent(
        actor=actor,
        event_type=GameEventType.USE_ITEM,
        item=item,
    )

    if not read_item_event_details(event, item):
        return None

    return event


def print_history(session, count=8):
    records = session.history.tail(count)

    if not records:
        print("Historico vazio.")
        return

    print()
    print("Historico recente:")
    for record in records:
        print(f"{record.index:>3}. {record.summary}")


def recommend(state):
    started_at = time.perf_counter()

    def progress(event, **data):
        elapsed = time.perf_counter() - started_at

        if event == "start":
            legal_actions = data["legal_actions"]
            print()
            print(f"[solver] Acoes legais: {len(legal_actions)}")
            for index, action in enumerate(legal_actions, start=1):
                print(f"[solver]   {index}. {action_text(action)}")

        elif event == "action_start":
            print(f"[solver] A avaliar: {action_text(data['action'])}")

        elif event == "action_done":
            sequence = " -> ".join(action_text(action) for action in data["best_sequence"])
            print(
                f"[solver] OK {action_text(data['action'])}: "
                f"{data['leaves']} ramos, EV {data['expected_value']:.2f}, melhor linha: {sequence}"
            )

        elif event == "done":
            print(f"[solver] Terminado em {elapsed:.2f}s.")

    try:
        moves = MoveGenerator.generate_moves(state, progress=progress)
    except Exception as error:
        print()
        print(f"[erro] O solver falhou: {error}")
        if DEBUG:
            traceback.print_exc()
        else:
            print("[erro] Corre com --debug para veres o traceback completo.")
        return

    if not moves:
        print("Sem jogadas disponiveis.")
        return

    print()
    print("Melhores jogadas:")
    for index, move in enumerate(moves[:5], start=1):
        print(f"{index}. {move_text(move)}")

    best = moves[0]
    print()
    print(f"Recomendacao: {move_text(best)}")


def refresh_visible_state(state):
    print("Atualiza apenas o que mudou. Enter mantem o valor.")
    state.player_hp = ask_int("A tua vida", state.player_hp)
    state.enemy_hp = ask_int("Vida do adversario", state.enemy_hp)
    state.player_max_hp = max(state.player_max_hp, state.player_hp)
    state.enemy_max_hp = max(state.enemy_max_hp, state.enemy_hp)
    state.live_shells = ask_int("Balas verdadeiras", state.live_shells)
    state.blank_shells = ask_int("Balas falsas", state.blank_shells)

    known = input("Balas conhecidas atuais (enter mantem): ").strip()
    if known:
        state.known_shells = parse_known_shells(known)

    player_items = input("Os teus itens atuais: ").strip()
    if player_items:
        state.player_items = parse_items(player_items)

    enemy_items = input("Itens atuais do adversario: ").strip()
    if enemy_items:
        state.enemy_items = parse_items(enemy_items)


def main():
    global DEBUG

    parser = argparse.ArgumentParser(description="Assistente CLI para Buckshot Roulette.")
    parser.add_argument("--debug", action="store_true", help="Mostra traceback completo quando houver erro.")
    args = parser.parse_args()
    DEBUG = args.debug

    print("Buckshot Roulette Helper")
    print("Escreve 'ajuda' nos menus para veres os formatos aceites.")

    session = GameSession(build_initial_state())
    state = session.state

    while True:
        print_state(state)

        if state.player_hp <= 0 or state.enemy_hp <= 0 or state.total_shells <= 0:
            print("Ronda terminada.")
            break

        if state.turn == Turn.PLAYER:
            recommend(state)
            prompt = "Acontecimento (disparo | item | passar | historico | probabilidades | ajuda | sair): "
        else:
            prompt = "Acontecimento adversario (disparo | item | passar | historico | probabilidades | ajuda | sair): "

        command = input(prompt).strip().lower()

        if command == "sair":
            break

        if command == "ajuda":
            print_help()
            continue

        if command == "historico":
            print_history(session)
            continue

        if command == "probabilidades":
            print_probabilities(session)
            continue

        actor = state.turn

        if command == "passar":
            event = GameEvent(actor=actor, event_type=GameEventType.END_TURN)
        elif command == "disparo":
            event = build_shoot_event(actor)
        elif command == "item":
            event = build_item_event(actor)
        else:
            print("Comando invalido.")
            continue

        if event is None:
            continue

        try:
            record = session.process_event(event)
            print(f"[ok] {record.summary}")
            print_probabilities(session)
        except Exception as error:
            print(f"[erro] {error}")
            if DEBUG:
                traceback.print_exc()


if __name__ == "__main__":
    main()
