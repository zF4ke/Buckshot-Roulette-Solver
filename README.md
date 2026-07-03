# Buckshot Roulette Helper

A fast **expectimax assistant** for *Buckshot Roulette*. Track the round as it
happens and it tells you the strongest move, with the exact expected value of
every option and the full plan for your turn.

It ships two front-ends over one engine:

- **Desktop app** (Electron + React), a dark, game-themed UI built for reading
  at a glance while you play.
- **CLI** (`assistant_cli.py`), the original terminal helper, still works.

## Quick start

### Desktop app
```bash
npm install
npm run dev                     # dev mode, needs Python 3 on PATH
npm run build && npm run dist   # package a portable build
```
The app launches the Python engine (`solver_service.py`) as a subprocess and
talks to it over JSON-lines stdio. Requires Python 3.10+ and Node 18+.

### CLI
```bash
python assistant_cli.py
```

### Tests
```bash
python tests/test_engine.py
```

## What the app shows

- **Best move**, front and center, with a plain-language reason (chamber odds,
  saw damage, whether it is lethal) and ranked alternatives.
- **The shotgun**: live chance for the chambered round, a live/blank meter, and a
  shell tracker you tap to record what you learn.
- **Versus HP**, items for both sides, and active effects (saw armed, cuffed).
- A **Strength** dial (Fast, Smart, Deep, Max) that trades compute for depth, and
  a turn toggle that also surfaces the dealer's most likely line on its turn.

## What changed vs. the original

### Correctness, verified against the game
Every mechanic was checked against the Buckshot Roulette wiki and fixed:

- **Burner Phone** never reveals the chambered shell now, only future positions
  (#2 onward), which is how the game works. (Was: could reveal the current shell,
  which is impossible in-game.)
- **Beer** no longer cancels an active **Hand Saw**. Racking ejects a shell
  without firing, so the sawed barrel stays armed, and only firing consumes the
  saw. This unlocks the real combo of Saw, Beer out a blank, then fire doubled.
  (Was: beer wrongly cancelled the saw.)
- Saw (x2 damage, consumed on the next shot), self-blank keeps your turn,
  self-live or any enemy shot passes it, handcuffs skip, medicine (+2 / -1),
  inverter, and adrenaline steal-and-use are all covered by regression tests.

### Speed, seconds became milliseconds
- Replaced the `deepcopy` and `md5(json(...))` hot path with a manual clone and a
  cheap tuple state key (about 10x faster per node).
- Rewrote the tangled search as a clean **memoized expectimax**. Because every
  action consumes a shell or an item, the game tree is naturally finite, so
  typical positions are solved exactly in well under a tenth of a second.
- Added **time-bounded iterative deepening**: the engine deepens until it is
  exact or the level's time budget runs out, always returning the deepest
  completed result. Even a pathological late-game board answers in about 1.5s
  instead of minutes.

### Strength and smart play
- The dealer is modeled as a strong minimizer, so recommendations are robust
  rather than optimistic.
- The engine finds real item combos on its own, for example shoot a known blank
  at yourself for free tempo, then Saw, then shoot the dealer for lethal, or
  Handcuffs then shoot twice (a cuffed opponent skips).
- Fixed a misleading-output bug: the shown line is the planned sequence, not the
  luckiest branch.

### Intelligence and accuracy dial
The Strength control maps four presets to search effort:

| Preset | Behaviour | Typical time |
|--------|-----------|-------------|
| Fast   | shallow, instant | under 15 ms |
| Smart  | balanced | fast |
| Deep   | deep | sub-second on normal states |
| Max    | exact when possible | capped around 1.6s worst case |

Small and normal positions are solved exactly at every preset. The dial mainly
governs how hard the engine works on complex late-game boards.

## Architecture

```
Electron main --spawn--> solver_service.py   (JSON-lines over stdio)
     |                        |
 preload (contextBridge)      +-- game_engine.py   apply real events (ground truth)
     |                        +-- search.py        expectimax + iterative deepening
 React renderer               +-- actions.py       legal moves + probabilistic outcomes
 (App.tsx, styles.css)        +-- evaluator.py     static position score
                              +-- probability.py   shell distribution
```

- `src/main`, `src/renderer`, `src/shared`: the Electron and React app.
- Root `*.py`: the engine, the single source of game logic. The app never
  reimplements the rules.
- `solver_service.py`: the stdio bridge exposing `set_state`, `event`, `undo`,
  `analyze`, `state`.

See `DIFFICULTY_PRESETS` in `search.py` to retune depth caps, probability
cutoffs, and per-level time budgets.
