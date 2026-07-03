import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { solverBridge } from "./solver";
import type { EventDTO, GameStateDTO } from "../shared/types";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#0e0b09",
    title: "Buckshot Roulette Solver",
    icon: path.join(__dirname, "../../assets/icon.ico"),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  win.on("maximize", () => win.webContents.send("win:state", true));
  win.on("unmaximize", () => win.webContents.send("win:state", false));

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

ipcMain.on("win:minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on("win:maximize", (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on("win:close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());

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
