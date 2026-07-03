import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { solverBridge } from "./solver";
import type { EventDTO, GameStateDTO } from "../shared/types";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#0e0b09",
    title: "Buckshot Roulette Solver",
    icon: path.join(__dirname, "../../assets/icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(__dirname, "../../dist-renderer/index.html"));
  }
}

ipcMain.handle("solver:setState", async (_e, state: GameStateDTO) => {
  return solverBridge.request("set_state", { state });
});

ipcMain.handle("solver:event", async (_e, event: EventDTO) => {
  return solverBridge.request("event", { event });
});

ipcMain.handle("solver:undo", async () => {
  return solverBridge.request("undo", {});
});

ipcMain.handle("solver:analyze", async (_e, level: number) => {
  return solverBridge.request("analyze", { level });
});

ipcMain.handle("solver:state", async () => {
  return solverBridge.request("state", {});
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  solverBridge.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
