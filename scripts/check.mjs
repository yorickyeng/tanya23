import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
for (const file of ['app.js','core.mjs','scripts/export.mjs']) execFileSync(process.execPath, ['--check', file], {stdio:'inherit'});
const config = JSON.parse(await readFile('content.json', 'utf8'));
const ids = new Set();
for (const moment of config.moments) {
  if (ids.has(moment.id)) throw new Error(`Duplicate moment: ${moment.id}`);
  ids.add(moment.id);
  if (!['letter','song','gallery'].includes(moment.type)) throw new Error(`Unknown widget: ${moment.type}`);
  if (!Number.isFinite(Date.parse(moment.opensAt))) throw new Error(`Invalid time: ${moment.id}`);
  if (moment.published && moment.type === 'song' && !moment.src) throw new Error('Add a song file before publishing the song widget');
  if (moment.published && moment.type === 'gallery' && !moment.items?.length) throw new Error('Add memories before publishing the gallery');
  for (const source of [moment.src, ...(moment.items || []).flatMap(item => [item.src,item.poster])].filter(Boolean)) {
    if (!source.startsWith('./assets/') && !source.startsWith('assets/')) throw new Error(`Use a local assets/ file: ${source}`);
    const absolute = path.resolve(root, source);
    if (!absolute.startsWith(path.resolve(root, 'assets') + path.sep)) throw new Error('Media path escapes assets/');
    const file = await stat(absolute);
    if (file.size >= 100 * 1024 * 1024) throw new Error(`Media file must be smaller than 100 MiB: ${source}`);
  }
}
JSON.parse(await readFile('manifest.webmanifest','utf8'));
for (const file of ['index.html','moment.html','styles.css','.nojekyll','assets/icon.svg']) await stat(file);
console.log('Checks passed: scripts, schedule, unique IDs and media references.');
