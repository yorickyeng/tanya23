import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.cwd();
for (const file of ['app.js','core.mjs','scripts/export.mjs','game/engine.js','game/bundle-loader.js','game/sha256.js','game/storage.js','game/isolation.js','game/coi-worker.js']) execFileSync(process.execPath, ['--check', file], {stdio:'inherit'});
const config = JSON.parse(await readFile('content.json', 'utf8'));
const ids = new Set();
for (const moment of config.moments) {
  if (ids.has(moment.id)) throw new Error(`Duplicate moment: ${moment.id}`);
  ids.add(moment.id);
  if (!['letter','song','gallery','game'].includes(moment.type)) throw new Error(`Unknown widget: ${moment.type}`);
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
for (const file of ['game/index.html','game/screen.css','game/runtime/boxedwine.js','game/runtime/boxedwine.wasm',
  'game/runtime/browserfs.boxedwine.js','game/assets/codec/ir50_32.dll']) await stat(file);
for (const archive of ['wine','game','wine-jit-v1','game-fast-v1']) {
  const base = path.resolve(root,'game','assets',archive);
  const manifest = JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
  if (manifest.parts.reduce((sum,part) => sum + part.bytes,0) !== manifest.bytes) throw new Error(`Invalid archive size: ${archive}`);
  const archiveHash = createHash('sha256');
  for (const part of manifest.parts) {
    const file = path.resolve(base,part.url);
    if (!file.startsWith(base + path.sep)) throw new Error('Archive part escapes its folder');
    if ((await stat(file)).size !== part.bytes) throw new Error(`Incomplete archive part: ${file}`);
    const bytes = await readFile(file);
    archiveHash.update(bytes);
    if (createHash('sha256').update(bytes).digest('hex') !== part.sha256) throw new Error(`Changed archive part: ${file}`);
  }
  if (archiveHash.digest('hex') !== manifest.sha256) throw new Error(`Changed archive: ${archive}`);
}
const runtime = JSON.parse(await readFile('game/runtime/BUILD.json','utf8'));
for (const part of runtime.files) {
  const bytes = await readFile(path.resolve(root,'game/runtime',part.file));
  if (bytes.length !== part.bytes || createHash('sha256').update(bytes).digest('hex') !== part.sha256) throw new Error(`Changed runtime: ${part.file}`);
}
console.log('Checks passed: scripts, schedule, media and complete local game archives.');
