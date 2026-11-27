// Zips every source file (code, tests, tools, config, assets) to ../picture-palace-backups/. Usage: npm run backup -- "label"
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
const root = fileURLToPath(new URL('..', import.meta.url)), out = join(root, '..', 'picture-palace-backups');
const skip = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.git', '__pycache__']);
const files = {};
const walk = (d) => { for (const n of readdirSync(d)) { if (skip.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else { const k = relative(root, p).split(sep).join('/'); files[`picture-palace/${k}`] = [readFileSync(p), { level: /\.(webp|png|bin)$/.test(n) ? 1 : 6 }]; } } };
walk(root);
mkdirSync(out, { recursive: true });
const d = new Date(), z = (n) => String(n).padStart(2, '0'), label = (process.argv[2] ?? 'backup').replace(/[^\w.-]+/g, '-');
const name = join(out, `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}_${label}.zip`);
const zip = zipSync(files); writeFileSync(name, zip);
console.log(`Backed up ${Object.keys(files).length} files (${(zip.length / 1e6).toFixed(1)} MB) to ${name}`);
