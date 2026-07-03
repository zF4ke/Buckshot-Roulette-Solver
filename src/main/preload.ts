import { contextBridge, ipcRenderer } from "electron";
import type { AnalyzeResult, EventDTO, FullState, GameStateDTO, SolverApi, WindowApi } from "../shared/types";

const api: SolverApi = {
  setState(state: GameStateDTO): Promise<FullState> {
    return ipcRenderer.invoke("solver:setState", state) as Promise<FullState>;
  },
  applyEvent(event: EventDTO): Promise<FullState> {
    return ipcRenderer.invoke("solver:event", event) as Promise<FullState>;
  },
  undo(): Promise<FullState> {
    return ipcRenderer.invoke("solver:undo") as Promise<FullState>;
  },
  analyze(level: number): Promise<AnalyzeResult> {
    return ipcRenderer.invoke("solver:analyze", level) as Promise<AnalyzeResult>;
  },
  getState(): Promise<FullState> {
    return ipcRenderer.invoke("solver:state") as Promise<FullState>;
  }
};

contextBridge.exposeInMainWorld("solver", api);

const windowApi: WindowApi = {
  minimize() { ipcRenderer.send("win:minimize"); },
  maximize() { ipcRenderer.send("win:maximize"); },
  close() { ipcRenderer.send("win:close"); }
};

contextBridge.exposeInMainWorld("win", windowApi);
