# Architecture

Buckshot Roulette Solver is a Python solver behind an Electron + React UI. The
Python engine is the single source of game logic; the app never reimplements the
rules. The two talk over a small JSON protocol.

```
Electron main ──spawn──▶ engine/solver_service.py   (JSON-lines over stdio)
     │                        │
 preload (contextBridge)      ├── game_engine.py   applies real events (ground truth)
     │                        ├── search.py        expectimax + iterative deepening
 React renderer               ├── actions.py       legal moves + probabilistic outcomes
 (App.tsx, styles.css)        ├── evaluator.py     static position score
                              └── probability.py   shell distribution
```

## Processes

- **Main** (`src/main/`): creates the frameless window, owns the window controls,
  and spawns the Python engine as one persistent subprocess (`src/main/solver.ts`).
  Requests are matched to responses by id over stdio.
- **Preload** (`src/main/preload.ts`): exposes `window.solver` (analyze, apply
  event, undo, set state) and `window.win` (minimize, maximize, close) through the
  context bridge. No Node access leaks into the renderer.
- **Renderer** (`src/renderer/`): a two-mode React app, the New Game setup screen
  and the play view (stage plus a side rail).
- **Engine** (`engine/`): pure Python, flat imports, run with `engine/` as the
  working directory. Ships beside the packaged app as `extraResources`.

## The protocol

`solver_service.py` reads one JSON object per line from stdin and writes one per
line to stdout:

- `set_state` resets the round from a full state object.
- `event` applies a real game event (shot, item, pass) and returns the new state.
- `analyze` returns the ranked moves for the side to act, each with its expected
  value and a readable line, plus timing and whether the search was exact.
- `undo` reverts the last event; `state` returns the current state.

## The solver

Every action in Buckshot Roulette consumes a shell or an item, so the potential
`shells + items` strictly decreases and the game tree is finite and acyclic. The
search (`search.py`) is a **memoized expectimax**:

- Decision nodes: the player maximizes, the dealer minimizes, over the legal
  actions. The dealer is modeled as a perfect adversary, which keeps
  recommendations robust rather than optimistic.
- Chance nodes: the outcome of an unknown shell is averaged over the live/blank
  distribution implied by the counts and anything already known.
- **Iterative deepening with a time budget**: the engine deepens until it is
  exact (depth reaches the potential) or the level's time budget runs out, and
  always returns the deepest completed result. Typical positions are exact in a
  few milliseconds; a pathological board is capped instead of running long.

The `Engine strength` dial maps a 1..10 level to a depth cap, probability cutoff,
and per-level time budget (`DIFFICULTY_PRESETS` in `search.py`).

## Rules of note

Verified against the Buckshot Roulette wiki and covered by
`engine/tests/test_engine.py`:

- **Beer** racks a shell without firing, so it does **not** consume an active Hand
  Saw. Only firing does.
- The **Burner Phone** never reveals the chambered shell, only a later position.
- Shooting yourself with a blank keeps your turn; a live shot, or any shot at the
  opponent, passes it. Handcuffs skip the opponent's next turn.
