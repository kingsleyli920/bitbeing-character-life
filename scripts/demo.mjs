// Starts the app on a copy of demo/demo.db (real-model stories from the evaluation runs).
//   npm run demo            reuse data/demo.db if it exists, otherwise copy it from demo/demo.db
//   npm run demo -- --reset start again from demo/demo.db
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'demo/demo.db');
const target = path.join(root, 'data/demo.db');
if (!fs.existsSync(source)) {
  console.error('缺少 demo/demo.db。');
  process.exit(1);
}
if (process.argv.includes('--reset') || !fs.existsSync(target)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
  fs.copyFileSync(source, target);
  console.log('已从 demo/demo.db 复制演示数据到 data/demo.db');
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'dev'], { cwd: root, stdio: 'inherit', env: { ...process.env, DB_PATH: 'data/demo.db' }, shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
