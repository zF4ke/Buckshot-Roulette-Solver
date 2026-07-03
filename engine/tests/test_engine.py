"""
Testes de regressao do motor. Correr com: python tests/test_engine.py
(nao precisa de pytest; usa asserts simples e imprime um resumo).
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from actions import Actions
from enums import GameEventType, ItemType, ShellType, Turn
from event_history import EventHistory
from game_engine import GameEngine
from game_event import GameEvent
from game_state import GameState
from solver import Solver


PASSED = 0
FAILED = 0


def check(name, condition):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  ok   {name}")
    else:
        FAILED += 1
        print(f"  FAIL {name}")


def base_state():
    s = GameState()
    s.player_hp = 3
    s.enemy_hp = 3
    s.player_max_hp = 3
    s.enemy_max_hp = 3
    s.player_items = {i: 0 for i in ItemType}
    s.enemy_items = {i: 0 for i in ItemType}
    s.turn = Turn.PLAYER
    return s


def engine():
    return GameEngine(EventHistory())


def shell_result_outcome(outcomes, shell):
    for o in outcomes:
        # cada outcome corresponde a um tipo de bala via a sua descricao/estado
        pass
    return outcomes


# ---------------------------------------------------------------- mechanics

def test_self_blank_keeps_turn():
    s = base_state()
    s.blank_shells = 1
    s.live_shells = 1
    s.known_shells = [ShellType.BLANK]
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.SHOOT,
                               target=Turn.PLAYER, shell=ShellType.BLANK))
    check("shoot self with blank keeps your turn", s.turn == Turn.PLAYER)
    check("shoot self with blank costs no HP", s.player_hp == 3)
    check("blank shell consumed", s.blank_shells == 0)


def test_self_live_passes_turn():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.known_shells = [ShellType.LIVE]
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.SHOOT,
                               target=Turn.PLAYER, shell=ShellType.LIVE))
    check("shoot self with live passes turn", s.turn == Turn.ENEMY)
    check("shoot self with live costs 1 HP", s.player_hp == 2)


def test_shoot_enemy_passes_turn():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.SHOOT,
                               target=Turn.ENEMY, shell=ShellType.LIVE))
    check("shoot enemy passes turn", s.turn == Turn.ENEMY)
    check("enemy loses 1 HP", s.enemy_hp == 2)


def test_saw_doubles_damage_and_consumes():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.saw_active = True
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.SHOOT,
                               target=Turn.ENEMY, shell=ShellType.LIVE))
    check("saw makes live deal 2 damage", s.enemy_hp == 1)
    check("saw consumed after firing", s.saw_active is False)


def test_beer_keeps_saw():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.saw_active = True
    s.player_items[ItemType.BEER] = 1
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.BEER, shell=ShellType.BLANK))
    check("beer does NOT consume the saw (rack, not fire)", s.saw_active is True)
    check("beer keeps your turn", s.turn == Turn.PLAYER)


def test_phone_never_reveals_chamber():
    s = base_state()
    s.live_shells = 2
    s.blank_shells = 2
    s.player_items[ItemType.PHONE] = 1
    outcomes = Actions._expand_phone(s, None, True)
    revealed_first = any(o.state.known_shells and o.state.known_shells[0] is not None
                         and len(o.state.known_shells) == 1 for o in outcomes)
    # Nenhuma revelacao deve fixar a posicao 0 isoladamente
    positions = set()
    for o in outcomes:
        for i, sh in enumerate(o.state.known_shells):
            if sh is not None:
                positions.add(i)
    check("phone reveals only positions >= 1 (never the chamber)", 0 not in positions)
    check("phone reveals at least one future position", len(positions) > 0)


def test_handcuffs_skip_enemy():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.player_items[ItemType.HANDCUFFS] = 1
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.HANDCUFFS))
    check("handcuffs mark enemy", s.handcuffed == Turn.ENEMY)
    # dispara no inimigo -> normalmente passaria o turno, mas o inimigo esta algemado
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.SHOOT,
                               target=Turn.ENEMY, shell=ShellType.LIVE))
    check("cuffed enemy is skipped, you keep the turn", s.turn == Turn.PLAYER)
    check("handcuff cleared after the skip", s.handcuffed is None)


def test_medicine_branches():
    s = base_state()
    s.player_hp = 2
    s.live_shells = 1
    s.blank_shells = 1
    s.player_items[ItemType.MEDICINE] = 2
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.MEDICINE, hp_delta=2))
    check("medicine heal +2 (capped at max)", s.player_hp == 3)
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.MEDICINE, hp_delta=-1))
    check("medicine damage -1", s.player_hp == 2)


def test_inverter_flips_chamber():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.known_shells = [ShellType.BLANK]
    s.player_items[ItemType.INVERTER] = 1
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.INVERTER, shell=ShellType.BLANK))
    check("inverter flips blank->live in the chamber", s.get_current_shell() == ShellType.LIVE)
    check("inverter adjusts pool counts", s.live_shells == 2 and s.blank_shells == 0)


def test_adrenaline_steals_and_uses():
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.player_items[ItemType.ADRENALINE] = 1
    s.enemy_items[ItemType.SAW] = 1
    e = engine()
    e.apply_event(s, GameEvent(actor=Turn.PLAYER, event_type=GameEventType.USE_ITEM,
                               item=ItemType.ADRENALINE, target_item=ItemType.SAW))
    check("adrenaline consumed", s.player_items[ItemType.ADRENALINE] == 0)
    check("stolen saw removed from enemy", s.enemy_items[ItemType.SAW] == 0)
    check("stolen saw takes effect immediately", s.saw_active is True)


# ---------------------------------------------------------------- solver

def test_solver_prefers_free_blank_shot():
    # camara conhecida BLANK: disparar em si e gratis e mantem o turno
    s = base_state()
    s.live_shells = 1
    s.blank_shells = 1
    s.known_shells = [ShellType.BLANK]
    best = Solver.best_move(s, level=10)
    top = best.action_sequence[0]
    check("known blank -> best move is shoot self", top.action_type.name == "SHOOT_SELF")


def test_solver_lethal_saw_combo():
    # inimigo a 2 HP, camara conhecida LIVE, serra disponivel -> serra + disparo mata
    s = base_state()
    s.enemy_hp = 2
    s.live_shells = 1
    s.blank_shells = 1
    s.known_shells = [ShellType.LIVE]
    s.player_items[ItemType.SAW] = 1
    best = Solver.best_move(s, level=10)
    labels = [a.item.name if a.item else a.action_type.name for a in best.action_sequence]
    check("finds saw -> shoot lethal line", "SAW" in labels and best.expected_value >= 9000)


def test_solver_is_fast():
    s = base_state()
    s.player_hp = 4
    s.enemy_hp = 4
    s.player_max_hp = 4
    s.enemy_max_hp = 4
    s.live_shells = 4
    s.blank_shells = 4
    for it in (ItemType.SAW, ItemType.MAGNIFIER, ItemType.HANDCUFFS, ItemType.BEER):
        s.player_items[it] = 1
    for it in (ItemType.INVERTER, ItemType.PHONE, ItemType.MEDICINE):
        s.enemy_items[it] = 1
    start = time.perf_counter()
    Solver.analyze(s, level=10)
    elapsed = time.perf_counter() - start
    check(f"max-strength analysis under 2s (took {elapsed*1000:.0f} ms)", elapsed < 2.0)


def main():
    tests = [
        test_self_blank_keeps_turn,
        test_self_live_passes_turn,
        test_shoot_enemy_passes_turn,
        test_saw_doubles_damage_and_consumes,
        test_beer_keeps_saw,
        test_phone_never_reveals_chamber,
        test_handcuffs_skip_enemy,
        test_medicine_branches,
        test_inverter_flips_chamber,
        test_adrenaline_steals_and_uses,
        test_solver_prefers_free_blank_shot,
        test_solver_lethal_saw_combo,
        test_solver_is_fast,
    ]
    for test in tests:
        print(test.__name__)
        test()
    print()
    print(f"{PASSED} passed, {FAILED} failed")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
