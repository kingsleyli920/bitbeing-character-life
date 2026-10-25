/**
 * Renders a Markdown document to an A4 PDF with the project's Playwright Chromium.
 *   npm run docs:pdf                       → docs/ARCHITECTURE.pdf
 *   npx tsx scripts/build-pdf.ts <file.md> → <file>.pdf next to it
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { marked } from 'marked';

const input = path.resolve(process.argv[2] ?? 'docs/ARCHITECTURE.md');
const output = input.replace(/\.md$/, '.pdf');
const markdown = fs.readFileSync(input, 'utf8');
const title = /^#\s+(.+)$/m.exec(markdown)?.[1] ?? path.basename(input);
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: path.dirname(input) }).toString().trim();
} catch {
  // not a git checkout
}
const generated = new Date().toISOString().slice(0, 10);

const css = `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
  font-size: 10pt; line-height: 1.7; color: #2b2420; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-family: 'Songti SC', 'Noto Serif CJK SC', serif; font-size: 22pt; margin: 0 0 6pt; color: #3a2a1f; }
h2 { font-size: 15pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid #8a5a3b; color: #3a2a1f; break-after: avoid; }
h3 { font-size: 12pt; margin: 16pt 0 6pt; color: #6e4429; break-after: avoid; }
h2 + *, h3 + * { break-before: avoid; }
p, li { orphans: 2; widows: 2; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; background: #f6f0e4; border-left: 3px solid #8a5a3b; color: #5c514a; }
blockquote p { margin: 0; }
a { color: #8a5a3b; text-decoration: none; }
code { font-family: Menlo, 'PingFang SC', monospace; font-size: 8.6pt; background: #f3eee5; padding: 0 3pt; border-radius: 3px; }
pre { background: #faf7f1; border: 1px solid #e3d8c6; border-radius: 6px; padding: 8pt 10pt; white-space: pre-wrap;
  word-break: break-word; break-inside: avoid; line-height: 1.5; }
pre code { background: none; padding: 0; font-size: 8.2pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 9pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #d8ccb9; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { background: #efe6d5; }
th:first-child, td:first-child { min-width: 4.5em; }
img { max-width: 100%; border: 1px solid #d8ccb9; border-radius: 6px; margin: 6pt 0; }
hr { border: none; border-top: 1px solid #e3d8c6; margin: 14pt 0; }
.meta { color: #8c8079; font-size: 9pt; margin-bottom: 14pt; }
`;

const body = await marked.parse(markdown, { gfm: true });
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${pathToFileURL(path.dirname(input))}/">
<title>${title}</title><style>${css}</style></head><body>
<div class="meta">版本 ${commit} · 生成于 ${generated} · bitbeing-character-life</div>
${body}</body></html>`;

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-pdf-')), 'doc.html');
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7pt;color:#8c8079;width:100%;padding:0 16mm;text-align:right;">${title}</div>`,
    footerTemplate: '<div style="font-size:7pt;color:#8c8079;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '18mm', bottom: '16mm', left: '16mm', right: '16mm' },
  });
} finally {
  await browser.close();
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}
console.log(`写入 ${path.relative(process.cwd(), output)}`);
