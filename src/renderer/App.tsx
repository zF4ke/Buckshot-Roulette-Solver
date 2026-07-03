import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Beer, Cigarette, Crosshair, Heart, Loader2, Lock, Minus, Phone, Pill, Plus, RefreshCw,
  RotateCcw, Scissors, Search, SkipForward, Skull, Syringe, Target, Trophy, Zap
} from "lucide-react";
import type {
  AnalyzeResult, EventDTO, FullState, GameStateDTO, ItemName, MoveDTO, ShellName, TurnName
} from "../shared/types";
import { ITEM_NAMES } from "../shared/types";

// ----------------------------------------------------------------- retro motion

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// count a number up to its target on change (retro digital readout)
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

// scramble/decode short text on change (retro terminal reveal)
const GLYPHS = "#%&*+=/\\<>[]".split("");
function useScramble(text: string, ms = 360) {
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

const ITEM_META: Record<ItemName, { label: string; short: string; icon: ReactNode; needsShell?: boolean; needsPhone?: boolean; needsMed?: boolean }> = {
  SAW: { label: "Hand Saw", short: "Hand Saw", icon: <Scissors size={14} /> },
  MAGNIFIER: { label: "Magnifying Glass", short: "Magnifier", icon: <Search size={14} />, needsShell: true },
  INVERTER: { label: "Inverter", short: "Inverter", icon: <RefreshCw size={14} />, needsShell: true },
  BEER: { label: "Beer", short: "Beer", icon: <Beer size={14} />, needsShell: true },
  PHONE: { label: "Burner Phone", short: "Phone", icon: <Phone size={14} />, needsPhone: true },
  ADRENALINE: { label: "Adrenaline", short: "Adrenaline", icon: <Syringe size={14} /> },
  MEDICINE: { label: "Expired Medicine", short: "Medicine", icon: <Pill size={14} />, needsMed: true },
  HANDCUFFS: { label: "Handcuffs", short: "Handcuffs", icon: <Lock size={14} /> },
  CIGARETTES: { label: "Cigarettes", short: "Cigarettes", icon: <Cigarette size={14} /> }
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
  const [full, setFull] = useState<FullState | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [level, setLevel] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const levelRef = useRef(level);
  levelRef.current = level;
  const state = full?.state ?? null;

  const runAnalyze = useCallback(async () => {
    try { setAnalysis(await window.solver.analyze(levelRef.current)); } catch (e) { setError(String(e)); }
  }, []);
  const pushState = useCallback(async (next: GameStateDTO) => {
    setBusy(true);
    try { setFull(await window.solver.setState(next)); setError(null); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [runAnalyze]);
  const applyEvent = useCallback(async (event: EventDTO) => {
    setBusy(true);
    try { setFull(await window.solver.applyEvent(event)); setError(null); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [runAnalyze]);
  const undo = useCallback(async () => {
    setBusy(true);
    try { setFull(await window.solver.undo()); await runAnalyze(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [runAnalyze]);

  useEffect(() => { void pushState(DEFAULT_STATE); }, [pushState]);
  useEffect(() => { if (full) void runAnalyze(); }, [level]); // eslint-disable-line

  const patch = useCallback((p: Partial<GameStateDTO>) => { if (state) void pushState({ ...state, ...p }); }, [state, pushState]);

  return (
    <div className="app">
      <div className="bar">
        <div className="brand"><BrandMark />Buckshot Roulette<small>solver</small></div>
        <div className="spacer" />
        <EngineControl level={level} setLevel={setLevel} analysis={analysis} />
      </div>
      {error && <div className="banner err"><Skull size={14} />{error}</div>}
      {state && (
        <div className="main">
          <div className="stage">
            <Combatants state={state} patch={patch} />
            <Shotgun state={state} patch={patch} />
            <Call analysis={analysis} state={state} busy={busy} />
            <Actions state={state} applyEvent={applyEvent} undo={undo} onNewRound={() => pushState(DEFAULT_STATE)} />
          </div>
          <div className="rail">
            <LoadBlock state={state} patch={patch} />
            <ItemsBlock state={state} patch={patch} />
            <LogBlock full={full} />
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- brand + engine

function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden>
      <g transform="rotate(-18 16 16)">
        <rect x="10.5" y="5" width="11" height="14.5" rx="2.4" fill="#e2452f" />
        <rect x="10.5" y="8" width="11" height="1" fill="#0e0b09" opacity="0.5" />
        <rect x="10" y="18" width="12" height="9" rx="2.2" fill="#c8973a" />
        <circle cx="16" cy="23.5" r="1.7" fill="#0e0b09" opacity="0.55" />
      </g>
    </svg>
  );
}

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
        Engine
        <span className={`stat ${stat.cls}`}><span className="d" />{stat.word}</span>
      </button>
      {open && (
        <div className="pop">
          <h4>Engine strength</h4>
          <div className="lead">How hard the solver thinks before answering.</div>
          <div className="sliderrow">
            <input className="range" type="range" min={1} max={10} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
            <span className="lvl num">{level}</span>
          </div>
          <div className="ticks"><span>Fast</span><span>Recommended</span><span>Max</span></div>
          {analysis && (
            <div className={`status ${exact ? "ok" : "warn"}`}>
              <span className="d" />
              {exact
                ? <span><b>Optimal.</b> Solved this position fully in {analysis.elapsed_ms} ms. A higher level will not change the move.</span>
                : <span><b>Deep position.</b> Searched to depth {analysis.reached_depth} in {analysis.elapsed_ms} ms. Raise the level for a stronger move.</span>}
            </div>
          )}
          <div className="explain">
            Higher digs deeper: <b>stronger but slower</b>. Most positions are solved perfectly even at a low level, so the number only matters in long, item heavy positions. <b>7 is a good default.</b>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionIcon({ type, item, size = 16 }: { type: string; item: ItemName | null; size?: number }) {
  if (type === "SHOOT_ENEMY") return <span className="ico aim"><Crosshair size={size} /></span>;
  if (type === "SHOOT_SELF") return <span className="ico self"><Target size={size} /></span>;
  if (item) return <span className="ico item">{ITEM_META[item].icon}</span>;
  return <span className="ico item"><SkipForward size={size} /></span>;
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
      <div className="hearts">
        {Array.from({ length: cap }).map((_, i) => <span key={i} className={`heart ${i < hp ? "" : "off"}`}><Heart size={17} fill={i < hp ? "currentColor" : "none"} /></span>)}
      </div>
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
        <div className="empty">No shells loaded. Set the counts in the panel on the right.</div>
      ) : (
        <>
          <div className="gun-odds">
            {known ? (
              <div className={`knownchamber ${known === "LIVE" ? "live" : "blank"}`}>
                {known === "LIVE" ? <Crosshair size={18} /> : <Target size={18} />}Chamber is {known === "LIVE" ? "LIVE" : "a BLANK"}
              </div>
            ) : (
              <>
                <div className="pctline">
                  <span className="pct live">{livePct}%</span>
                  <span className="lab" style={{ color: "var(--accent)" }}>LIVE</span>
                </div>
                <div className="sub num">{100 - livePct}% chance of a blank</div>
              </>
            )}
          </div>
          <div className="shells">
            {Array.from({ length: total }).map((_, i) => {
              const s = state.known_shells[i] ?? null;
              return <div key={i} className={`shell ${s === "LIVE" ? "l" : s === "BLANK" ? "b" : ""} ${i === 0 ? "ch" : ""}`} onClick={() => cycle(i)} title={`Shell ${i + 1}, tap to mark`}><span className="n">{i + 1}</span></div>;
            })}
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
              <span className="txt">{moveText}</span>
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
                  <span className="alt-move">{m.label}</span>
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

// ----------------------------------------------------------------- actions

type Mode = null | "shoot-self" | "shoot-enemy" | "item";

function Actions({ state, applyEvent, undo, onNewRound }: { state: GameStateDTO; applyEvent: (e: EventDTO) => void; undo: () => void; onNewRound: () => void }) {
  const actor = state.turn;
  const isPlayer = actor === "PLAYER";
  const [mode, setMode] = useState<Mode>(null);
  const [item, setItem] = useState<ItemName | "">("");
  const [shell, setShell] = useState<ShellName>(null);
  const [phonePos, setPhonePos] = useState(2);
  const [medDelta, setMedDelta] = useState(2);
  const [adrTarget, setAdrTarget] = useState<ItemName | "">("");
  const reset = () => { setMode(null); setItem(""); setShell(null); setPhonePos(2); setMedDelta(2); setAdrTarget(""); };
  useEffect(() => { reset(); }, [actor]); // eslint-disable-line

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
    <div className="call" style={{ gap: 14 }}>
      <div className="acts">
        <button className="btn" onClick={() => { reset(); setMode("shoot-enemy"); }}><Crosshair size={15} />Shoot {isPlayer ? "dealer" : "you"}</button>
        <button className="btn" onClick={() => { reset(); setMode("shoot-self"); }}><Target size={15} />Shoot {isPlayer ? "self" : "itself"}</button>
        <button className="btn" disabled={owned.length === 0} onClick={() => { reset(); setMode("item"); }}><Zap size={15} />Use item</button>
        <button className="btn ghost" onClick={() => applyEvent({ actor, event_type: "END_TURN" })}><SkipForward size={14} />Pass</button>
        <button className="btn ghost" onClick={undo}><RotateCcw size={13} />Undo</button>
        <button className="btn ghost" onClick={onNewRound}><RefreshCw size={13} />New round</button>
      </div>

      <div className={`reveal ${mode ? "open" : ""}`}><div>
        {(mode === "shoot-self" || mode === "shoot-enemy") && (
          <div className="detail">
            <div className="mini">What came out of the chamber</div>
            {chamberKnown && <div className="hint">Your tracker says <b style={{ color: chamberKnown === "LIVE" ? "var(--accent)" : "var(--blank)" }}>{chamberKnown}</b>.</div>}
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <button className="btn live" onClick={() => shoot(mode === "shoot-self" ? actor : opponent, "LIVE")}>Live round</button>
              <button className="btn blank" onClick={() => shoot(mode === "shoot-self" ? actor : opponent, "BLANK")}>Blank</button>
              <button className="btn ghost" onClick={reset}>Cancel</button>
            </div>
          </div>
        )}
        {mode === "item" && (
          <div className="detail">
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
                <div className="acts" style={{ justifyContent: "flex-start" }}>
                  <button className={`btn sm ${shell === "LIVE" ? "on-live" : ""}`} onClick={() => setShell("LIVE")}>Live</button>
                  <button className={`btn sm ${shell === "BLANK" ? "on-blank" : ""}`} onClick={() => setShell("BLANK")}>Blank</button>
                </div>
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
                  <div className="acts" style={{ justifyContent: "flex-start" }}>
                    <button className={`btn sm ${shell === "LIVE" ? "on-live" : ""}`} onClick={() => setShell("LIVE")}>Live</button>
                    <button className={`btn sm ${shell === "BLANK" ? "on-blank" : ""}`} onClick={() => setShell("BLANK")}>Blank</button>
                  </div>
                </div>
              </>
            )}
            {meta?.needsMed && (
              <div className="field">
                <div className="mini">Expired Medicine result</div>
                <div className="acts" style={{ justifyContent: "flex-start" }}>
                  <button className={`btn sm ${medDelta === 2 ? "primary" : ""}`} onClick={() => setMedDelta(2)}>Healed 2</button>
                  <button className={`btn sm ${medDelta === -1 ? "live" : ""}`} onClick={() => setMedDelta(-1)}>Lost 1</button>
                </div>
              </div>
            )}
            <div className="acts" style={{ justifyContent: "flex-start" }}>
              <button className="btn primary" disabled={!ready} onClick={useItem}>Apply</button>
              <button className="btn ghost" onClick={reset}>Cancel</button>
            </div>
          </div>
        )}
      </div></div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="step">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="decrease"><Minus size={13} /></button>
      <span className="v">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="increase"><Plus size={13} /></button>
    </div>
  );
}

// ----------------------------------------------------------------- rail

function LoadBlock({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  return (
    <div>
      <div className="rail-h">Load</div>
      <div className="load">
        <div className="c"><span className="pip-dot l" /><span className="cl">Live</span><Stepper value={state.live_shells} min={0} max={8} onChange={(v) => patch({ live_shells: v })} /></div>
        <div className="c"><span className="pip-dot b" /><span className="cl">Blank</span><Stepper value={state.blank_shells} min={0} max={8} onChange={(v) => patch({ blank_shells: v })} /></div>
      </div>
    </div>
  );
}

function ItemsBlock({ state, patch }: { state: GameStateDTO; patch: (p: Partial<GameStateDTO>) => void }) {
  return (
    <div>
      <div className="rail-h">Items</div>
      <div className="invs">
        <ItemColumn title="You" icon={<Crosshair size={12} />} inv={state.player_items} onChange={(inv) => patch({ player_items: inv })} />
        <ItemColumn title="Dealer" icon={<Skull size={12} />} inv={state.enemy_items} onChange={(inv) => patch({ enemy_items: inv })} />
      </div>
    </div>
  );
}

function ItemColumn({ title, icon, inv, onChange }: { title: string; icon: ReactNode; inv: Record<ItemName, number>; onChange: (inv: Record<ItemName, number>) => void }) {
  const set = (item: ItemName, v: number) => onChange({ ...inv, [item]: Math.max(0, Math.min(8, v)) });
  return (
    <div>
      <div className="inv-h">{icon}{title}</div>
      <div className="inv">
        {ITEM_NAMES.map((name) => (
          <div className={`it ${inv[name] > 0 ? "on" : "off"}`} key={name}>
            <span className="ii">{ITEM_META[name].icon}</span>
            <span className="in">{ITEM_META[name].short}</span>
            <div className="step">
              <button onClick={() => set(name, inv[name] - 1)} disabled={inv[name] <= 0}><Minus size={11} /></button>
              <span className="v">{inv[name]}</span>
              <button onClick={() => set(name, inv[name] + 1)}><Plus size={11} /></button>
            </div>
          </div>
        ))}
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
