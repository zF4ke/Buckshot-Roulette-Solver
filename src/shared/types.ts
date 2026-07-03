// Tipos partilhados entre o processo principal (Electron) e o renderer.
// Espelham os DTO do servico Python em solver_service.py.

export type ItemName =
  | "SAW"
  | "MAGNIFIER"
  | "INVERTER"
  | "BEER"
  | "PHONE"
  | "ADRENALINE"
  | "MEDICINE"
  | "HANDCUFFS"
  | "CIGARETTES";

export const ITEM_NAMES: ItemName[] = [
  "SAW",
  "MAGNIFIER",
  "INVERTER",
  "BEER",
  "PHONE",
  "ADRENALINE",
  "MEDICINE",
  "HANDCUFFS",
  "CIGARETTES"
];

export type ShellName = "LIVE" | "BLANK" | null;
export type TurnName = "PLAYER" | "ENEMY";

export type Inventory = Record<ItemName, number>;

export interface GameStateDTO {
  player_hp: number;
  enemy_hp: number;
  player_max_hp: number;
  enemy_max_hp: number;
  live_shells: number;
  blank_shells: number;
  known_shells: ShellName[];
  player_items: Inventory;
  enemy_items: Inventory;
  turn: TurnName;
  saw_active: boolean;
  handcuffed: TurnName | null;
}

export interface Probabilities {
  current_live: number;
  current_blank: number;
  pool_live: number;
  pool_blank: number;
}

export interface HistoryEntry {
  index: number;
  summary: string;
}

export interface ActionDTO {
  type: "SHOOT_SELF" | "SHOOT_ENEMY" | "USE_ITEM" | "END_TURN";
  item: ItemName | null;
  target_item: ItemName | null;
}

export interface MoveDTO {
  expected_value: number;
  label: string;
  sequence: ActionDTO[];
  action: ActionDTO;
}

export interface AnalyzeResult {
  moves: MoveDTO[];
  elapsed_ms: number;
  exact: boolean;
  reached_depth: number;
  perspective: TurnName;
}

export interface FullState {
  state: GameStateDTO;
  probabilities: Probabilities;
  history: HistoryEntry[];
  summary?: string;
}

// Evento (acontecimento) enviado ao motor.
export interface EventDTO {
  actor: TurnName;
  event_type: "SHOOT" | "USE_ITEM" | "END_TURN" | "UPDATE_INVENTORY";
  item?: ItemName | null;
  target_item?: ItemName | null;
  target?: TurnName | null;
  shell?: Exclude<ShellName, null> | null;
  known_index?: number | null;
  hp_delta?: number | null;
  inventory?: Partial<Inventory> | null;
}

// API exposta ao renderer via contextBridge.
export interface SolverApi {
  setState(state: GameStateDTO): Promise<FullState>;
  applyEvent(event: EventDTO): Promise<FullState>;
  undo(): Promise<FullState>;
  analyze(level: number): Promise<AnalyzeResult>;
  getState(): Promise<FullState>;
}

declare global {
  interface Window {
    solver: SolverApi;
  }
}
