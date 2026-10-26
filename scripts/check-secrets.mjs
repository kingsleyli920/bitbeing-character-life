// Fails if a model API key or this machine's home directory path is in a tracked or staged file
// (including binaries such as demo.db and the PDF), or if .env.local is not ignored. Runs in `npm run test:all` and the pre-commit hook.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const PATTERNS = [
  /sk-or-v1-[0-9a-f]{32,}/,
  /sk-ant-[A-Za-z0-9_-]{32,}/,
  /OPENROUTER_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{20,}/,
];
const HOME = os.homedir();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

const files = new Set([...git('ls-files', '-z').split('\0'), ...git('diff', '--cached', '--name-only', '-z').split('\0')].filter(Boolean));
const hits = [];
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const text = fs.readFileSync(file).toString('latin1');
  for (const re of PATTERNS) if (re.test(text)) hits.push(`${file}（匹配 ${re.source.slice(0, 16)}…）`);
  if (HOME.length > 3 && text.includes(HOME)) hits.push(`${file}（含本机路径）`);
}
try {
  git('check-ignore', '-q', '.env.local');
} catch {
  hits.push('.env.local 没有被 .gitignore 忽略');
}
if (hits.length) {
  console.error(`发现疑似密钥或本机路径，停止：\n${hits.map((h) => `  - ${h}`).join('\n')}`);
  process.exit(1);
}
console.log(`密钥检查通过：${files.size} 个跟踪文件里没有 API key 和本机路径`);
