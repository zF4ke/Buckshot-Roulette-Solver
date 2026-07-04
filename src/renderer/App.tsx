import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Beer, ChevronDown, ChevronRight, Cigarette, Crosshair, Heart, Loader2, Lock, Minus, Phone, Pill,
  Play, Plus, RefreshCw, RotateCcw, Scissors, Search, SkipForward, Skull, Square, Syringe, Target,
  Trophy, X, Zap
} from "lucide-react";
import type {
  AnalyzeResult, EventDTO, FullState, GameStateDTO, ItemName, MoveDTO, ShellName, TurnName
} from "../shared/types";
import { ITEM_NAMES } from "../shared/types";

// ----------------------------------------------------------------- retro motion

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCountUp(target: number, ms = 460) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced() || from.current === target) { from.current = target; setVal(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(a + (target - a) * e));
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

const GLYPHS = "#%&*+=/\\<>[]".split("");
function useScramble(text: string, ms = 340) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (reduced() || !text) { setOut(text); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const shown = Math.floor(text.length * t);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        s += (i < shown || c === " " || c === "→") ? c : GLYPHS[(i * 7 + Math.floor(now / 36)) % GLYPHS.length];
      }
      setOut(s);
      if (t < 1) raf = requestAnimationFrame(tick); else setOut(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);
  return out;
}

// ----------------------------------------------------------------- metadata

const ITEM_META: Record<ItemName, { label: string; short: string; icon: ReactNode; needsShell?: boolean; needsPhone?: boolean; needsMed?: boolean }> = {
  SAW: { label: "Hand Saw", short: "Saw", icon: <Scissors size={13} /> },
  MAGNIFIER: { label: "Magnifying Glass", short: "Magnifier", icon: <Search size={13} />, needsShell: true },
  INVERTER: { label: "Inverter", short: "Inverter", icon: <RefreshCw size={13} />, needsShell: true },
  BEER: { label: "Beer", short: "Beer", icon: <Beer size={13} />, needsShell: true },
  PHONE: { label: "Burner Phone", short: "Phone", icon: <Phone size={13} />, needsPhone: true },
  ADRENALINE: { label: "Adrenaline", short: "Adrenaline", icon: <Syringe size={13} /> },
  MEDICINE: { label: "Expired Medicine", short: "Medicine", icon: <Pill size={13} />, needsMed: true },
  HANDCUFFS: { label: "Handcuffs", short: "Cuffs", icon: <Lock size={13} /> },
  CIGARETTES: { label: "Cigarettes", short: "Smokes", icon: <Cigarette size={13} /> }
};

function emptyInv(): Record<ItemName, number> {
  const inv = {} as Record<ItemName, number>;
  for (const n of ITEM_NAMES) inv[n] = 0;
  return inv;
}
const DEFAULT_STATE: GameStateDTO = {
  player_hp: 3, enemy_hp: 3, player_max_hp: 3, enemy_max_hp: 3,
  live_shells: 2, blank_shells: 2, known_shells: [],
  player_items: emptyInv(), enemy_items: emptyInv(),
  turn: "PLAYER", saw_active: false, handcuffed: null
};

function chamberInfo(s: GameStateDTO) {
  const known = s.known_shells[0] ?? null;
  let liveU = s.live_shells, blankU = s.blank_shells;
  for (const x of s.known_shells) { if (x === "LIVE") liveU--; else if (x === "BLANK") blankU--; }
  const denom = Math.max(0, liveU) + Math.max(0, blankU);
  const liveP = denom > 0 ? Math.max(0, liveU) / denom : 0;
  return { known, liveP, blankP: 1 - liveP, total: s.live_shells + s.blank_shells };
}

function explain(move: MoveDTO, s: GameStateDTO): ReactNode {
  const { known, liveP, blankP } = chamberInfo(s);
  const dmg = s.saw_active ? 2 : 1;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const a = move.action;
  if (a.type === "USE_ITEM") {
    switch (a.item) {
      case "SAW": return <>Saw first so your next live shot deals <b>2 damage</b>.</>;
      case "MAGNIFIER": return <>Peek the chamber before you commit to a shot.</>;
      case "HANDCUFFS": return <>Cuff the dealer, it skips a turn and you keep shooting.</>;
      case "BEER": return <>Rack out the current shell to reach a better one.</>;
      case "INVERTER": return <>Flip the chamber to turn it in your favour.</>;
      case "PHONE": return <>Learn a future shell so you can plan your shots.</>;
      case "MEDICINE": case "CIGARETTES": return <>Heal while you hold the tempo.</>;
      case "ADRENALINE": return <>Steal the dealer's item and use it right away.</>;
    }
  }
  if (a.type === "SHOOT_SELF") {
    if (known === "BLANK") return <>The chamber is a <b>blank</b>, so shoot yourself to spend it for free and keep your turn.</>;
    return <>Blank is likely (<b>{pct(blankP)}</b>), so shooting yourself keeps your turn at low risk.</>;
  }
  if (a.type === "SHOOT_ENEMY") {
    const lethal = s.enemy_hp <= dmg && (known === "LIVE" || liveP > 0.5);
    if (known === "LIVE") return <>The chamber is <b>live</b>. Shoot the dealer for <b>{dmg}</b>{lethal ? <>, this ends the round</> : null}.</>;
    return <>Live is likely (<b>{pct(liveP)}</b>), so shooting the dealer has the best expected value{lethal ? <>, and it can end the round</> : null}.</>;
  }
  return <>Best expected value across the search.</>;
}

function cleanSummary(s: string): string {
  return s.replace("PLAYER", "You").replace("ENEMY", "Dealer")
    .replace("disparou em", "shot").replace("usou", "used").replace("terminou o turno", "passed the turn")
    .replace(" com ", " with ").replace("dano", "damage").replace("e viu", "and saw")
    .replace("e removeu", "and removed").replace("revelou", "revealed").replace("posicao", "position");
}

// ----------------------------------------------------------------- app

export function App() {
  const [mode, setMode] = useState<"setup" | "play">("setup");
  const [full, setFull] = useState<FullState | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [level, setLevel] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const levelRef = useRef(level);
  levelRef.current = level;
  const state = full?.state ?? null;
  // Always-latest state, updated synchronously so rapid edits never read a stale
  // value or get lost.
  const stateRef = useRef<GameStateDTO | null>(null);
  const editTimer = useRef<number | undefined>(undefined);
  const levelTimer = useRef<number | undefined>(undefined);
  const calcTimer = useRef<number | undefined>(undefined);
  const cancelling = useRef(false);

  const runAnalyze = useCallback(async () => {
    cancelling.current = false;
    // Only reveal the "calculating" overlay if the search actually runs long.
    if (calcTimer.current) window.clearTimeout(calcTimer.current);
    calcTimer.current = window.setTimeout(() => setCalculating(true), 280);
    try {
      const res = await window.solver.analyze(levelRef.current);
      setAnalysis(res);
    } catch (e) {
      if (!cancelling.current) setError(String(e));
    } finally {
      if (calcTimer.current) window.clearTimeout(calcTimer.current);
      setCalculating(false);
    }
  }, []);
  const cancelAnalyze = useCallback(async () => {
    cancelling.current = true;
    if (calcTimer.current) window.clearTimeout(calcTimer.current);
    setCalculating(false);
    try { await window.solver.cancel(); } catch { /* ignore */ }
    // Bring the freshly respawned engine back to the current state, ready for
    // the next request. Keep whatever recommendation was already showing.
    try { if (stateRef.current) await window.solver.updateState(stateRef.current); } catch { /* ignore */ }
  }, []);
  const commit = useCallback((res: FullState) => { stateRef.current = res.state; setFull(res); }, []);

  const pushState = useCallback(async (next: GameStateDTO) => {
    setBusy(true);
    try { commit(await window.solver.setState(next)); setError(null); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [commit, runAnalyze]);
  const applyEvent = useCallback(async (event: EventDTO) => {
    setBusy(true);
    try { commit(await window.solver.applyEvent(event)); setError(null); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [commit, runAnalyze]);
  const undo = useCallback(async () => {
    setBusy(true);
    try { commit(await window.solver.undo()); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [commit, runAnalyze]);

  // Manual edit: update the UI now, sync the engine (keeps the log) shortly after.
  const syncEdit = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    try { await window.solver.updateState(s); setError(null); await runAnalyze(); }
    catch (e) { setError(String(e)); }
  }, [runAnalyze]);
  const patch = useCallback((p: Partial<GameStateDTO>) => {
    setFull((prev) => {
      if (!prev) return prev;
      const next: FullState = { ...prev, state: { ...prev.state, ...p } };
      stateRef.current = next.state;
      return next;
    });
    if (editTimer.current) window.clearTimeout(editTimer.current);
    editTimer.current = window.setTimeout(() => { void syncEdit(); }, 90);
  }, [syncEdit]);

  // Re-analyze when strength changes, debounced so dragging the slider does not
  // fire an analysis on every tick (the last one wins, at the latest level).
  useEffect(() => {
    if (!full) return;
    if (levelTimer.current) window.clearTimeout(levelTimer.current);
    levelTimer.current = window.setTimeout(() => { void runAnalyze(); }, 120);
    return () => { if (levelTimer.current) window.clearTimeout(levelTimer.current); };
  }, [level]); // eslint-disable-line

  const startGame = useCallback(async (s: GameStateDTO) => { await pushState(s); setMode("play"); }, [pushState]);

  return (
    <div className="app">
      <TitleBar>{mode === "play" && <EngineControl level={level} setLevel={setLevel} analysis={analysis} />}</TitleBar>
      {error && <div className="banner err"><Skull size={14} />{error}</div>}

      {mode === "setup" ? (
        <Setup onDeal={startGame} />
      ) : state && (
        <div className="main">
          <div className="stage">
            <Combatants state={state} patch={patch} />
            <Shotgun state={state} patch={patch} />
            <Call analysis={analysis} state={state} busy={busy} />
            <Actions state={state} applyEvent={applyEvent} undo={undo} onNewGame={() => setMode("setup")} />
          </div>
          <div className="rail">
            <LoadBlock state={state} patch={patch} />
            <ItemsBlock state={state} patch={patch} />
            <LogBlock full={full} />
          </div>
        </div>
      )}
      {calculating && <CalcOverlay onCancel={cancelAnalyze} level={level} />}
    </div>
  );
}

function CalcOverlay({ onCancel, level }: { onCancel: () => void; level: number }) {
  return (
    <div className="calc-scrim">
      <div className="calc-box">
        <div className="calc-title crt">CALCULATING</div>
        <div className="calc-bar"><span /></div>
        <div className="calc-sub">deep search at strength {level}</div>
        <button className="btn" onClick={onCancel}><X size={14} />Cancel</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- title bar

function TitleBar({ children }: { children?: ReactNode }) {
  return (
    <div className="titlebar">
      <div className="brand"><BrandMark />Buckshot Roulette<small>solver</small></div>
      <div className="spacer" />
      {children}
      <div className="winctl nodrag">
        <button className="winbtn" onClick={() => window.win?.minimize()} aria-label="Minimize"><Minus size={15} /></button>
        <button className="winbtn" onClick={() => window.win?.maximize()} aria-label="Maximize"><Square size={12} /></button>
        <button className="winbtn close" onClick={() => window.win?.close()} aria-label="Close"><X size={15} /></button>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden>
      <g transform="rotate(-18 16 16)">
        <rect x="10.5" y="5" width="11" height="14.5" rx="2.4" fill="#e6482f" />
        <rect x="10.5" y="8" width="11" height="1" fill="#100c0a" opacity="0.5" />
        <rect x="10" y="18" width="12" height="9" rx="2.2" fill="#cf9c3c" />
        <circle cx="16" cy="23.5" r="1.7" fill="#100c0a" opacity="0.55" />
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------- shared bits

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="step">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="decrease"><Minus size={14} /></button>
      <span className="v">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="increase"><Plus size={14} /></button>
    </div>
  );
}

// hearts that never overflow: wrap, and collapse to a count past 7
function Hearts({ hp, max, size = 16 }: { hp: number; max?: number; size?: number }) {
  const cap = Math.max(max ?? hp, 1);
  if (cap > 7) {
    return <div className="hearts"><span className="heart"><Heart size={size} fill="currentColor" /></span><span className="hcount num">×{hp}</span></div>;
  }
  return (
    <div className="hearts">
      {Array.from({ length: cap }).map((_, i) => <span key={i} className={`heart ${i < hp ? "" : "off"}`}><Heart size={size} fill={i < hp ? "currentColor" : "none"} /></span>)}
    </div>
  );
}

function LoadControls({ live, blank, onLive, onBlank }: { live: number; blank: number; onLive: (v: number) => void; onBlank: (v: number) => void }) {
  return (
    <div className="load">
      <div className="loadunit"><span className="shellgfx xs live" /><span className="cl">Live</span><Stepper value={live} min={0} max={8} onChange={onLive} /></div>
      <div className="loadunit"><span className="shellgfx xs blank" /><span className="cl">Blank</span><Stepper value={blank} min={0} max={8} onChange={onBlank} /></div>
    </div>
  );
}

function Segmented<T extends string | number>(
  { options, value, onChange }: { options: { value: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void }
) {
  // Measure each option's box ONCE (and on resize). On selection change only the
  // index changes, so the thumb style updates in a normal render and the CSS
  // transition animates (a layout-effect measure per change would teleport).
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [boxes, setBoxes] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const measure = useCallback(() => {
    setBoxes(refs.current.map((el) => (el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 })));
  }, []);
  useLayoutEffect(() => { measure(); }, [measure, options.length]);
  useEffect(() => { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure]);
  const t = boxes[idx];
  return (
    <div className="seg">
      {t && <div className="seg-thumb" style={{ left: t.x, top: t.y, width: t.w, height: t.h }} />}
      {options.map((o, i) => (
        <button key={String(o.value)} ref={(el) => { refs.current[i] = el; }} className={`seg-btn ${o.value === value ? "on" : ""}`} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function ShellPick({ value, onPick }: { value?: ShellName; onPick: (s: "LIVE" | "BLANK") => void }) {
  return (
    <div className="shellpick">
      <button className={`shellopt live ${value === "LIVE" ? "on" : ""}`} onClick={() => onPick("LIVE")}>
        <span className="shellgfx live" /><span className="so-name">LIVE</span><span className="so-sub">deals damage</span>
      </button>
      <button className={`shellopt blank ${value === "BLANK" ? "on" : ""}`} onClick={() => onPick("BLANK")}>
        <span className="shellgfx blank" /><span className="so-name">BLANK</span><span className="so-sub">harmless</span>
      </button>
    </div>
  );
}

// render a move line, turning the " -> " separators into a chevron icon
function MoveText({ text, size = 15 }: { text: string; size?: number }) {
  const parts = text.split(" → ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{i > 0 && <ChevronRight className="movesep" size={size} />}{p}</span>
      ))}
    </>
  );
}

function ActionIcon({ type, item, size = 16 }: { type: string; item: ItemName | null; size?: number }) {
  if (type === "SHOOT_ENEMY") return <span className="ico aim"><Crosshair size={size} /></span>;
  if (type === "SHOOT_SELF") return <span className="ico self"><Target size={size} /></span>;
  if (item) return <span className="ico item">{ITEM_META[item].icon}</span>;
  return <span className="ico item"><SkipForward size={size} /></span>;
}

// compact item input used in setup and rail
function ItemChips({ inv, onChange }: { inv: Record<ItemName, number>; onChange: (inv: Record<ItemName, number>) => void }) {
  const set = (n: ItemName, v: number) => onChange({ ...inv, [n]: Math.max(0, Math.min(8, v)) });
  return (
    <div className="chips">
      {ITEM_NAMES.map((n) => {
        const c = inv[n];
        return (
          <button key={n} className={`chip ${c > 0 ? "on" : ""}`} onClick={() => set(n, c + 1)} title={`Add ${ITEM_META[n].label}`}>
            <span className="chip-ic">{ITEM_META[n].icon}</span>
            <span className="chip-nm">{ITEM_META[n].short}</span>
            {c > 0 && <span className="chip-ct">{c}</span>}
            {c > 0 && <span className="chip-minus" onClick={(e) => { e.stopPropagation(); set(n, c - 1); }}><Minus size={11} /></span>}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- setup / new game

function Setup({ onDeal }: { onDeal: (s: GameStateDTO) => void }) {
  const [d, setD] = useState<GameStateDTO>(() => ({ ...DEFAULT_STATE, player_items: emptyInv(), enemy_items: emptyInv(), known_shells: [] }));
  const set = (p: Partial<GameStateDTO>) => setD((prev) => ({ ...prev, ...p }));
  const total = d.live_shells + d.blank_shells;

  return (
    <div className="setup-wrap">
      <div className="setup">
        <div className="setup-title">
          <h1 className="crt">New Game</h1>
          <p>Enter what you can see at the start of the round, then deal.</p>
        </div>

        <div className="setup-cols">
          <div className="setup-col">
            <div className="sec">
              <div className="sec-h">Charges</div>
              <div className="sec-row">
                <HpCard you name="You" hp={d.player_hp} onHp={(v) => set({ player_hp: v, player_max_hp: v })} />
                <HpCard name="Dealer" hp={d.enemy_hp} onHp={(v) => set({ enemy_hp: v, enemy_max_hp: v })} />
              </div>
            </div>
            <div className="sec">
              <div className="sec-h">The load</div>
              <LoadControls live={d.live_shells} blank={d.blank_shells} onLive={(v) => set({ live_shells: v })} onBlank={(v) => set({ blank_shells: v })} />
              <div className="load-preview">
                {Array.from({ length: d.live_shells }).map((_, i) => <span key={"l" + i} className="shellgfx sm live" />)}
                {Array.from({ length: d.blank_shells }).map((_, i) => <span key={"b" + i} className="shellgfx sm blank" />)}
                {total === 0 && <span className="empty">No shells yet.</span>}
              </div>
            </div>
            <div className="sec">
              <div className="sec-h">Who shoots first</div>
              <div className="turn-seg">
                <Segmented<TurnName>
                  options={[{ value: "PLAYER", label: "You", icon: <Crosshair size={13} /> }, { value: "ENEMY", label: "Dealer", icon: <Skull size={13} /> }]}
                  value={d.turn} onChange={(t) => set({ turn: t })}
                />
              </div>
            </div>
          </div>

          <div className="setup-col">
            <div className="sec">
              <div className="sec-h">Items dealt</div>
              <div className="invs">
                <div className="invset">
                  <div className="inv-h"><Crosshair size={12} />You</div>
                  <ItemChips inv={d.player_items} onChange={(inv) => set({ player_items: inv })} />
                </div>
                <div className="invset">
                  <div className="inv-h"><Skull size={12} />Dealer</div>
                  <ItemChips inv={d.enemy_items} onChange={(inv) => set({ enemy_items: inv })} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="setup-go">
          <button className="btn primary big" disabled={total === 0} onClick={() => onDeal(d)}><Play size={17} />Deal the round</button>
        </div>
      </div>
    </div>
  );
}

function HpCard({ name, you, hp, onHp }: { name: string; you?: boolean; hp: number; onHp: (v: number) => void }) {
  return (
    <div className="hp-card">
      <div className="hp-top">
        <div className="who-name">{you ? <Crosshair size={13} /> : <Skull size={13} />}{name}</div>
        <Stepper value={hp} min={1} max={12} onChange={onHp} />
      </div>
      <Hearts hp={hp} size={15} />
    </div>
  );
}

// ----------------------------------------------------------------- engine control

const MAX_LEVEL = 15;

function EngineControl({ level, setLevel, analysis }: { level: number; setLevel: (n: number) => void; analysis: AnalyzeResult | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const exact = analysis?.exact ?? false;
  const stat = analysis ? (exact ? { cls: "ok", word: "Optimal" } : { cls: "warn", word: `Depth ${analysis.reached_depth}` }) : { cls: "", word: "..." };

  return (
    <div className="engine" ref={ref}>
      <button className="engine-btn" onClick={() => setOpen((o) => !o)} title="Engine strength">
        Engine<span className={`stat ${stat.cls}`}><span className="d" />{stat.word}</span>
      </button>
      {open && (
        <div className="pop">
          <h4>Engine strength</h4>
          <div className="lead">How hard the solver thinks before answering.</div>
          <div className="sliderrow">
            <input className="range" type="range" min={1} max={MAX_LEVEL} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
            <span className="lvl">{level}</span>
          </div>
          <div className="ticks"><span>Fast</span><span>Recommended</span><span>Max</span></div>
          {analysis && (
            <div className={`status ${exact ? "ok" : "warn"}`}>
              <span className="d" />
              {exact
                ? <span><b>Optimal.</b> Solved this position fully in {analysis.elapsed_ms} ms. A higher level will not change the move.</span>
                : <span><b>Deep position.</b> Searched to depth {analysis.reached_depth} in {analysis.elapsed_ms} ms. {level >= MAX_LEVEL ? "Too deep to solve exactly in the time budget; this is the best move found so far." : "Raise the level for a stronger move."}</span>}
            </div>
          )}
          <div className="explain">Higher digs deeper: <b>stronger but slower</b>. Most positions are solved perfectly even at a low level, so the number only matters in long, item heavy positions. <b>7 is a good default.</b></div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- combatants

function Combatants({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  return (
    <div className="table">
      <Who you name="You" act={state.turn === "PLAYER"} hp={state.player_hp} maxHp={state.player_max_hp}
        onPick={() => patch({ turn: "PLAYER" })}
        onHp={(v) => patch({ player_hp: v, player_max_hp: Math.max(state.player_max_hp, v) })} />
      <div className="mid"><span className="vs">VS</span></div>
      <Who name="Dealer" act={state.turn === "ENEMY"} hp={state.enemy_hp} maxHp={state.enemy_max_hp}
        onPick={() => patch({ turn: "ENEMY" })}
        onHp={(v) => patch({ enemy_hp: v, enemy_max_hp: Math.max(state.enemy_max_hp, v) })} />
    </div>
  );
}

function Who({ name, you, act, hp, maxHp, onPick, onHp }: { name: string; you?: boolean; act: boolean; hp: number; maxHp: number; onPick: () => void; onHp: (v: number) => void }) {
  const cap = Math.max(hp, maxHp, 1);
  return (
    <div className={`who ${act ? "act" : ""}`} onClick={onPick}>
      <div className="toact">To act</div>
      <div className="who-name">{you ? <Crosshair size={14} /> : <Skull size={14} />}{name}</div>
      <Hearts hp={hp} max={cap} size={17} />
      <div className="who-hp" onClick={(e) => e.stopPropagation()}><span className="mini">HP</span><Stepper value={hp} min={0} max={12} onChange={onHp} /></div>
    </div>
  );
}

// ----------------------------------------------------------------- shotgun

function Shotgun({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  const { known, liveP, total } = chamberInfo(state);
  const livePct = useCountUp(Math.round(liveP * 100));
  const cycle = (index: number) => {
    const arr: ShellName[] = [];
    for (let i = 0; i < total; i++) arr.push(state.known_shells[i] ?? null);
    const cur = arr[index];
    arr[index] = cur === null ? "LIVE" : cur === "LIVE" ? "BLANK" : null;
    while (arr.length && arr[arr.length - 1] === null) arr.pop();
    patch({ known_shells: arr });
  };
  return (
    <div className="gun">
      <div className="head">The Shotgun</div>
      {total === 0 ? (
        <div className="empty">No shells loaded.</div>
      ) : (
        <>
          <div className="gun-odds">
            {known ? (
              <div className={`knownchamber ${known === "LIVE" ? "live" : "blank"}`}>
                {known === "LIVE" ? <Crosshair size={20} /> : <Target size={20} />}Chamber is {known === "LIVE" ? "LIVE" : "a BLANK"}
              </div>
            ) : (
              <>
                <div className="pctline">
                  <span className="pct live crt">{livePct}%</span>
                  <span className="lab" style={{ color: "var(--accent)" }}>LIVE</span>
                </div>
                <div className="sub"><b>{100 - livePct}%</b> chance of a blank</div>
              </>
            )}
          </div>
          <div className="tracker">
            <div className="shells">
              {Array.from({ length: total }).map((_, i) => {
                const s = state.known_shells[i] ?? null;
                const label = s === "LIVE" ? "live" : s === "BLANK" ? "blank" : "unknown";
                const tip = `${i === 0 ? "Chamber (next shot)" : `Shell ${i + 1}`} is ${label}. Tap to cycle live, blank, unknown.`;
                return (
                  <div key={i} className={`shell ${s === "LIVE" ? "l" : s === "BLANK" ? "b" : ""} ${i === 0 ? "ch" : ""}`} onClick={() => cycle(i)} title={tip}>
                    {i === 0 && <ChevronDown className="chpoint" size={14} />}
                    {s === null && <span className="q">?</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {(state.saw_active || state.handcuffed) && (
        <div className="gun-fx">
          {state.saw_active && <span className="fxtag"><Scissors size={12} />Saw armed, next shot deals 2</span>}
          {state.handcuffed === "ENEMY" && <span className="fxtag"><Lock size={12} />Dealer cuffed, skips a turn</span>}
          {state.handcuffed === "PLAYER" && <span className="fxtag"><Lock size={12} />You are cuffed, skip a turn</span>}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- the call

function Call({ analysis, state, busy }: { analysis: AnalyzeResult | null; state: GameStateDTO; busy: boolean }) {
  const isPlayer = state.turn === "PLAYER";
  const moves = analysis?.moves ?? [];
  const over = state.player_hp <= 0 || state.enemy_hp <= 0;
  const top = moves[0];
  const alts = moves.slice(1, 3);
  const moveText = useScramble(top?.label ?? "");

  if (over) {
    return (
      <div className="call">
        <div className="head">The Call</div>
        <div className={`banner ${state.enemy_hp <= 0 ? "win" : "warn"}`}>
          {state.enemy_hp <= 0 ? <><Trophy size={16} />Dealer is down. You take the round.</> : <><Skull size={16} />You are out of charges.</>}
        </div>
      </div>
    );
  }
  return (
    <div className="call">
      <div className="head">The Call{busy && <span className="think" style={{ marginLeft: 8 }}><Loader2 size={11} className="sp" />reading</span>}</div>
      {!top ? <div className="empty">No legal moves in this position.</div> : (
        <>
          <div className={`persp ${isPlayer ? "" : "enemy"}`}>
            {isPlayer ? <><Crosshair size={13} />Play this on your turn</> : <><Skull size={13} />The dealer will most likely do this</>}
          </div>
          <div className="call-card">
            <div className="call-move">
              <ActionIcon type={top.action.type} item={top.action.item} size={19} />
              <span className="txt"><MoveText text={moveText} size={16} /></span>
              <span className={`ev num ${top.expected_value >= 0 ? "pos" : "neg"}`}>{top.expected_value >= 0 ? "+" : ""}{top.expected_value.toFixed(0)}</span>
            </div>
            {isPlayer && <div className="call-why">{explain(top, state)}</div>}
          </div>
          {alts.length > 0 && (
            <div className="alts">
              {alts.map((m, i) => (
                <div className="alt" key={m.label}>
                  <span className="alt-rank num">{i + 2}</span>
                  <ActionIcon type={m.action.type} item={m.action.item} size={14} />
                  <span className="alt-move"><MoveText text={m.label} size={13} /></span>
                  <span className={`alt-ev num ${m.expected_value >= 0 ? "pos" : "neg"}`}>{m.expected_value >= 0 ? "+" : ""}{m.expected_value.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- actions + modal

type Panel = null | "shoot-self" | "shoot-enemy" | "item";

function Actions({ state, applyEvent, undo, onNewGame }: { state: GameStateDTO; applyEvent: (e: EventDTO) => void; undo: () => void; onNewGame: () => void }) {
  const actor = state.turn;
  const isPlayer = actor === "PLAYER";
  const [panel, setPanel] = useState<Panel>(null);
  const [item, setItem] = useState<ItemName | "">("");
  const [shell, setShell] = useState<ShellName>(null);
  const [phonePos, setPhonePos] = useState(2);
  const [medDelta, setMedDelta] = useState(2);
  const [adrTarget, setAdrTarget] = useState<ItemName | "">("");
  const reset = () => { setPanel(null); setItem(""); setShell(null); setPhonePos(2); setMedDelta(2); setAdrTarget(""); };
  useEffect(() => { reset(); }, [actor]); // eslint-disable-line
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") reset(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  const actorInv = isPlayer ? state.player_items : state.enemy_items;
  const oppInv = isPlayer ? state.enemy_items : state.player_items;
  const owned = ITEM_NAMES.filter((n) => actorInv[n] > 0);
  const stealable = ITEM_NAMES.filter((n) => oppInv[n] > 0 && n !== "ADRENALINE");
  const effItem: ItemName | "" = item === "ADRENALINE" ? adrTarget : item;
  const meta = effItem ? ITEM_META[effItem] : null;
  const chamberKnown = state.known_shells[0] ?? null;
  const opponent: TurnName = actor === "PLAYER" ? "ENEMY" : "PLAYER";

  const shoot = (target: TurnName, sh: "LIVE" | "BLANK") => { applyEvent({ actor, event_type: "SHOOT", target, shell: sh }); reset(); };
  const useItem = () => {
    const ev: EventDTO = { actor, event_type: "USE_ITEM", item: item as ItemName };
    if (item === "ADRENALINE") ev.target_item = adrTarget as ItemName;
    if (meta?.needsShell) ev.shell = shell as "LIVE" | "BLANK";
    if (meta?.needsPhone) { ev.known_index = phonePos - 1; ev.shell = shell as "LIVE" | "BLANK"; }
    if (meta?.needsMed) ev.hp_delta = medDelta;
    applyEvent(ev); reset();
  };
  const ready = Boolean(item) && !(item === "ADRENALINE" && !adrTarget) && !((meta?.needsShell || meta?.needsPhone) && !shell);

  return (
    <div className="call" style={{ gap: 12 }}>
      <div className="acts">
        <button className="btn" onClick={() => { reset(); setPanel("shoot-enemy"); }}><Crosshair size={16} />Shoot {isPlayer ? "dealer" : "you"}</button>
        <button className="btn" onClick={() => { reset(); setPanel("shoot-self"); }}><Target size={16} />Shoot {isPlayer ? "self" : "itself"}</button>
        <button className="btn" disabled={owned.length === 0} onClick={() => { reset(); setPanel("item"); }}><Zap size={16} />Use item</button>
        <button className="btn ghost" onClick={() => applyEvent({ actor, event_type: "END_TURN" })}><SkipForward size={15} />Pass</button>
        <button className="btn ghost" onClick={undo}><RotateCcw size={14} />Undo</button>
        <button className="btn ghost" onClick={onNewGame}><RefreshCw size={14} />New game</button>
      </div>

      {(panel === "shoot-self" || panel === "shoot-enemy") && (
        <Modal title="What came out of the chamber?" onClose={reset}>
          {chamberKnown && <div className="hint">Your tracker expects a <b style={{ color: chamberKnown === "LIVE" ? "var(--accent)" : "var(--blank)" }}>{chamberKnown}</b>.</div>}
          <ShellPick onPick={(sh) => shoot(panel === "shoot-self" ? actor : opponent, sh)} />
          <div className="modal-actions"><button className="btn ghost" onClick={reset}>Cancel</button></div>
        </Modal>
      )}

      {panel === "item" && (
        <Modal title="Use an item" onClose={reset}>
          <div className="field">
            <div className="mini">Which item</div>
            <select className="sel" value={item} onChange={(e) => { setItem(e.target.value as ItemName); setShell(null); setAdrTarget(""); }}>
              <option value="">Select an item</option>
              {owned.map((n) => <option key={n} value={n}>{ITEM_META[n].label}</option>)}
            </select>
          </div>
          {item === "ADRENALINE" && (
            <div className="field">
              <div className="mini">Steal and use which dealer item</div>
              <select className="sel" value={adrTarget} onChange={(e) => { setAdrTarget(e.target.value as ItemName); setShell(null); }}>
                <option value="">Select an item</option>
                {stealable.map((n) => <option key={n} value={n}>{ITEM_META[n].label}</option>)}
              </select>
              {stealable.length === 0 && <div className="hint">The dealer has nothing to steal.</div>}
            </div>
          )}
          {meta?.needsShell && (
            <div className="field">
              <div className="mini">{effItem === "INVERTER" ? "Chamber before flipping" : effItem === "BEER" ? "Shell ejected" : "Shell revealed"}</div>
              <ShellPick value={shell} onPick={setShell} />
            </div>
          )}
          {meta?.needsPhone && (
            <>
              <div className="field">
                <div className="mini">Position revealed (2 is next after the chamber)</div>
                <Stepper value={phonePos} min={2} max={Math.max(2, state.live_shells + state.blank_shells)} onChange={setPhonePos} />
              </div>
              <div className="field">
                <div className="mini">That shell is</div>
                <ShellPick value={shell} onPick={setShell} />
              </div>
            </>
          )}
          {meta?.needsMed && (
            <div className="field">
              <div className="mini">Expired Medicine result</div>
              <div className="choice2">
                <button className={`btn ${medDelta === 2 ? "primary" : ""}`} onClick={() => setMedDelta(2)}>Healed 2</button>
                <button className={`btn ${medDelta === -1 ? "primary" : ""}`} onClick={() => setMedDelta(-1)}>Lost 1</button>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn primary" disabled={!ready} onClick={useItem}>Apply</button>
            <button className="btn ghost" onClick={reset}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- rail

function LoadBlock({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  return (
    <div>
      <div className="rail-h">Load</div>
      <LoadControls live={state.live_shells} blank={state.blank_shells} onLive={(v) => patch({ live_shells: v })} onBlank={(v) => patch({ blank_shells: v })} />
    </div>
  );
}

function ItemsBlock({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  return (
    <div>
      <div className="rail-h">Items</div>
      <div className="invs">
        <div className="invset">
          <div className="inv-h"><Crosshair size={12} />You</div>
          <ItemChips inv={state.player_items} onChange={(inv) => patch({ player_items: inv })} />
        </div>
        <div className="invset">
          <div className="inv-h"><Skull size={12} />Dealer</div>
          <ItemChips inv={state.enemy_items} onChange={(inv) => patch({ enemy_items: inv })} />
        </div>
      </div>
    </div>
  );
}

function LogBlock({ full }: { full: FullState | null }) {
  const history = full?.history ?? [];
  return (
    <div>
      <div className="rail-h">Round log</div>
      {history.length === 0 ? <div className="empty">Nothing logged yet.</div> : (
        <div className="log">
          {[...history].reverse().map((h) => <div className="log-row" key={h.index}><span className="n">{h.index}</span><span>{cleanSummary(h.summary)}</span></div>)}
        </div>
      )}
    </div>
  );
}
