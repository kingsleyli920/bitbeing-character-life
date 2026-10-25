import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../../src/config.js';

export interface ServerProcess {
  baseUrl: string;
  dbPath: string;
  /** Graceful stop (SIGTERM). */
  stop(): Promise<void>;
  /** Hard kill (SIGKILL), simulating a crash. */
  kill(): Promise<void>;
  output(): string;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export function tempDbPath(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cl-${label}-`));
  return path.join(dir, 'app.db');
}

/** Starts the real server entry point as a child process with the fixture model. */
export async function startServer(
  opts: { dbPath?: string; env?: Record<string, string> } = {},
): Promise<ServerProcess> {
  const port = await freePort();
  const dbPath = opts.dbPath ?? tempDbPath('e2e');
  let log = '';
  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'server/src/index.ts', '--provider=fixture'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        APP_ENV: 'test',
        PORT: String(port),
        DB_PATH: dbPath,
        OPENROUTER_API_KEY: '',
        ...opts.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));
  const baseUrl = `http://127.0.0.1:${port}`;

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`server did not start in 30s:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const signal = async (sig: NodeJS.Signals) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(sig);
    await exited;
  };
  return { baseUrl, dbPath, stop: () => signal('SIGTERM'), kill: () => signal('SIGKILL'), output: () => log };
}
