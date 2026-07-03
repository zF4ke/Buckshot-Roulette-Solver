// Shim SO para pre-visualizacao no browser (npm run dev:renderer sem Electron).
// Nunca e usado na app real: so ativa quando window.solver nao existe.
import type { AnalyzeResult, EventDTO, FullState, GameStateDTO, SolverApi } from "../shared/types";

let current: GameStateDTO = {
  player_hp: 3, enemy_hp: 2, player_max_hp: 4, enemy_max_hp: 4,
  live_shells: 2, blank_shells: 2, known_shells: ["LIVE"],
  player_items: {
    SAW: 1, MAGNIFIER: 1, INVERTER: 0, BEER: 1, PHONE: 0,
    ADRENALINE: 0, MEDICINE: 0, HANDCUFFS: 1, CIGARETTES: 0
  },
  enemy_items: {
    SAW: 0, MAGNIFIER: 0, INVERTER: 1, BEER: 0, PHONE: 1,
    ADRENALINE: 0, MEDICINE: 1, HANDCUFFS: 0, CIGARETTES: 0
  },
  turn: "PLAYER", saw_active: false, handcuffed: null
};

function fullState(): FullState {
  return {
    state: current,
    probabilities: { current_live: 1, current_blank: 0, pool_live: 0.333, pool_blank: 0.667 },
    history: [
      { index: 1, summary: "PLAYER usou MAGNIFIER e viu LIVE" }
    ]
  };
}

const analysis: AnalyzeResult = {
  perspective: "PLAYER",
  elapsed_ms: 42.7,
  exact: true,
  reached_depth: 12,
  moves: [
    { expected_value: 842, label: "Use Hand Saw → Shoot the dealer", action: { type: "USE_ITEM", item: "SAW", target_item: null }, sequence: [] },
    { expected_value: 610, label: "Use Handcuffs → Shoot the dealer → Shoot the dealer", action: { type: "USE_ITEM", item: "HANDCUFFS", target_item: null }, sequence: [] },
    { expected_value: 455, label: "Shoot the dealer", action: { type: "SHOOT_ENEMY", item: null, target_item: null }, sequence: [] },
    { expected_value: -120, label: "Shoot yourself", action: { type: "SHOOT_SELF", item: null, target_item: null }, sequence: [] }
  ]
};

export const devMock: SolverApi = {
  async setState(s: GameStateDTO) { current = s; return fullState(); },
  async updateState(s: GameStateDTO) { current = s; return fullState(); },
  async applyEvent(_e: EventDTO) { return fullState(); },
  async undo() { return fullState(); },
  async analyze(_level: number) { return analysis; },
  async getState() { return fullState(); }
};
