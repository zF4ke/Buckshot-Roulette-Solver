// Ponte para o motor Python: mantem um subprocesso vivo e fala JSON-por-linha.
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function resolvePython(): string {
  // Permite forcar um interpretador especifico.
  if (process.env.BUCKSHOT_PYTHON) {
    return process.env.BUCKSHOT_PYTHON;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function resolveServiceScript(): string {
  // Dev: the engine lives in ./engine. Packaged: it ships under
  // resources/engine (see package.json > build.extraResources).
  const rel = path.join("engine", "solver_service.py");
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(__dirname, "..", "..", rel),
    path.join(__dirname, "..", "..", "..", rel),
    path.join(process.resourcesPath ?? "", rel)
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

export class SolverBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private starting: Promise<void> | null = null;

  private async ensureStarted(): Promise<void> {
    if (this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;

    this.starting = new Promise<void>((resolve, reject) => {
      const script = resolveServiceScript();
      const python = resolvePython();
      const proc = spawn(python, [script], {
        cwd: path.dirname(script),
        stdio: ["pipe", "pipe", "pipe"]
      });

      proc.on("error", (err) => {
        this.starting = null;
        reject(new Error(`Failed to launch Python engine (${python}): ${err.message}`));
      });

      proc.stderr.on("data", (chunk) => {
        console.error(`[engine] ${chunk.toString().trim()}`);
      });

      proc.on("exit", (code) => {
        console.error(`[engine] exited with code ${code}`);
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error("Python engine exited"));
        }
        this.pending.clear();
        this.proc = null;
        this.rl = null;
      });

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on("line", (line) => this.onLine(line));

      this.proc = proc;
      this.rl = rl;
      resolve();
    });

    try {
      await this.starting;
      // Handshake para garantir que o interpretador arrancou.
      await this.request("ping", {});
    } finally {
      this.starting = null;
    }
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      console.error(`[engine] non-JSON line: ${trimmed}`);
      return;
    }
    const id = payload.id as number | undefined;
    if (id === undefined || !this.pending.has(id)) return;
    const { resolve, reject } = this.pending.get(id)!;
    this.pending.delete(id);
    if (payload.ok === false) {
      reject(new Error((payload.error as string) ?? "engine error"));
    } else {
      resolve(payload);
    }
  }

  async request(cmd: string, extra: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureStarted();
    if (!this.proc) throw new Error("Engine not available");

    const id = this.nextId++;
    const message = JSON.stringify({ id, cmd, ...extra });

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Engine timed out"));
        }
      }, 30_000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as Record<string, unknown>);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });

      this.proc!.stdin.write(message + "\n");
    });
  }

  // Stop an in-flight search. The engine's search loop is blocking, so the only
  // way to interrupt it is to kill the process; the "exit" handler rejects the
  // pending request and nulls the proc, and the next request respawns it.
  cancel(): void {
    this.proc?.kill();
  }

  dispose(): void {
    this.proc?.kill();
    this.proc = null;
    this.rl?.close();
    this.rl = null;
  }
}

export const solverBridge = new SolverBridge();
