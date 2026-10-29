import {loadBundle} from './bundle-loader.js?v=2';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#canvas');
const loading = document.querySelector('#loading');
const progress = document.querySelector('#progress');
const gate = document.querySelector('#continue');
const failure = document.querySelector('#failure');
const logView = document.querySelector('#log');
const logs = [];
const keys = new Map();
let phase = 'loading';
let paused = false;
let earlyAudio;
const watchedAudio = new WeakSet();
// The emulated program also reports performance in its window title.
// Keep that internal title from appearing in the browser tab.
new MutationObserver(() => {
  if (document.title !== 'tanya23') document.title = 'tanya23';
}).observe(document.querySelector('title'),{childList:true,characterData:true,subtree:true});
const create = (type,options) => new Promise((resolve,reject) =>
  BrowserFS.FileSystem[type].Create(options,(error,fs) => error ? reject(error) : resolve(fs)));

function setPhase(value) {
  phase = value;
  stage.dataset.state = value;
}
function currentAudio() { return window.Module?.SDL2?.audioContext || earlyAudio; }
function syncGate() {
  const audio = currentAudio();
  if (audio && !watchedAudio.has(audio)) {
    watchedAudio.add(audio);
    audio.addEventListener('statechange',syncGate);
  }
  if (phase === 'running') gate.hidden = !paused && audio?.state === 'running';
}
function log(...args) {
  const line = args.join(' ');
  logs.push(line); if (logs.length > 150) logs.shift();
  logView.textContent = logs.join('\n');
  if (line.startsWith('Creating Window:') && phase !== 'error') {
    setPhase('running'); loading.hidden = true; syncGate();
  }
}
function fail(error) {
  console.error(error);
  log(error?.stack || String(error));
  setPhase('error'); loading.hidden = true; gate.hidden = true; failure.hidden = false;
  try { window.Module?.pauseMainLoop?.(); } catch {}
}
window.addEventListener('error',event => fail(new Error(event.message)));
window.addEventListener('unhandledrejection',event => fail(event.reason));
document.querySelector('#retry').addEventListener('click',() => location.reload());

function releaseKeys() {
  for (const [code,held] of [...keys]) {
    const event = new KeyboardEvent('keyup',{key:held.key,code,bubbles:true,cancelable:true});
    Object.defineProperty(event,'keyCode',{value:held.keyCode});
    Object.defineProperty(event,'which',{value:held.keyCode});
    canvas.dispatchEvent(event);
  }
  keys.clear();
}
function pause() {
  if (phase !== 'running' || paused) return;
  releaseKeys(); paused = true;
  window.Module.pauseMainLoop();
  currentAudio()?.suspend().catch(() => {});
  stage.dataset.state = 'paused'; syncGate();
}
async function activate() {
  if (phase === 'ended') { location.reload(); return; }
  if (phase === 'error') return;
  try {
    let audio = currentAudio();
    if (!audio || audio.state === 'closed') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        earlyAudio = audio = new Audio();
        if (window.Module) {
          window.Module.SDL2 ||= {};
          window.Module.SDL2.audioContext = audio;
        }
      }
    }
    if (audio?.state === 'suspended') await audio.resume();
    if (paused) {
      paused = false; window.Module.resumeMainLoop(); stage.dataset.state = 'running';
    }
    canvas.focus(); syncGate();
  } catch(error) { console.warn('Audio activation unavailable',error); }
}
gate.addEventListener('click',activate);
stage.addEventListener('pointerdown',event => {
  if (event.target !== gate && !gate.contains(event.target)) activate();
});
canvas.addEventListener('keydown',event => {
  keys.set(event.code,{key:event.key,keyCode:event.keyCode}); activate();
});
canvas.addEventListener('keyup',event => keys.delete(event.code));
canvas.addEventListener('contextmenu',event => event.preventDefault());
canvas.addEventListener('webglcontextlost',event => {event.preventDefault();fail(new Error('Graphics context lost'));});
document.addEventListener('visibilitychange',() => {if(document.hidden)pause();});
setInterval(syncGate,300);

// DirectInput polls button state. Keep quick pointer taps visible for one frame.
const downAt = new Map();
const delayed = new WeakSet();
canvas.addEventListener('mousedown',event => downAt.set(event.button,performance.now()),true);
canvas.addEventListener('mouseup',event => {
  if (delayed.has(event)) return;
  const elapsed = performance.now() - (downAt.get(event.button) || 0);
  if (elapsed >= 90) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const options = {bubbles:true,cancelable:true,button:event.button,buttons:event.buttons,
    clientX:event.clientX,clientY:event.clientY,screenX:event.screenX,screenY:event.screenY};
  setTimeout(() => {
    const up = new MouseEvent('mouseup',options); delayed.add(up); canvas.dispatchEvent(up);
  },90-elapsed);
},true);

async function mountFiles(rootData,gameData) {
  const Buffer = BrowserFS.BFSRequire('buffer').Buffer;
  const rootZip = await create('ZipFS',{zipData:Buffer.from(rootData.buffer)});
  const root = await create('OverlayFS',{readable:rootZip,writable:new BrowserFS.FileSystem.InMemory()});
  const filesystem = new BrowserFS.FileSystem.MountableFileSystem();
  filesystem.mount('/root/base',root); BrowserFS.initialize(filesystem);
  const bfs = BrowserFS.BFSRequire('fs');
  try { root.unlinkSync('/lib/wine/wineboot.exe.so'); } catch {}
  const codec = await fetch('./assets/codec/ir50_32.dll');
  if (!codec.ok) throw new Error(`Codec unavailable: ${codec.status}`);
  bfs.writeFileSync('/root/base/home/username/.wine/drive_c/windows/system32/ir50_32.dll',Buffer.from(await codec.arrayBuffer()));
  const iniPath = '/root/base/home/username/.wine/drive_c/windows/system.ini';
  let ini = ''; try { ini = bfs.readFileSync(iniPath,'utf8'); } catch {}
  ini = /\[drivers32\]/i.test(ini) ? ini.replace(/\[drivers32\]/i,'[drivers32]\r\nVIDC.IV50=ir50_32.dll') :
    ini + '\r\n[drivers32]\r\nVIDC.IV50=ir50_32.dll\r\n';
  bfs.writeFileSync(iniPath,ini);
  bfs.writeFileSync('/root/base/home/username/.wine/drive_c/start.cmd',
    '@echo off\r\nregsvr32 /s C:\\windows\\system32\\ir50_32.dll\r\nD:\r\ncd \\\r\nNP.EXE\r\n');
  const gameZip = await create('ZipFS',{zipData:Buffer.from(gameData.buffer)});
  let writes;
  try {
    const database = await create('IndexedDB',{storeName:'tanya23-game-v1'});
    writes = await create('AsyncMirror',{sync:new BrowserFS.FileSystem.InMemory(),async:database});
  } catch {
    writes = new BrowserFS.FileSystem.InMemory();
  }
  const game = await create('OverlayFS',{readable:gameZip,writable:writes});
  filesystem.mount('/root/files',game);
  if (new URLSearchParams(location.search).get('skipvideos') === '1') {
    filesystem.mount('/root/files/AVI',new BrowserFS.FileSystem.InMemory());
  }
}

async function main() {
  if (location.protocol === 'file:') throw new Error('Use the website or a local HTTP server');
  const amounts = {root:0,game:0};
  const update = (part,weight) => (received,total) => {
    amounts[part] = weight * received / total;
    progress.value = amounts.root + amounts.game;
  };
  const [root,game] = await Promise.all([
    loadBundle('./assets/wine/manifest.json',{onProgress:update('root',5)}),
    loadBundle('./assets/game/manifest.json',{onProgress:update('game',88)})
  ]);
  await mountFiles(root.data,game.data);
  progress.value = 97; setPhase('starting');
  window.Module = {
    arguments:['-root','/root/base','-mount_drive','/root/files','d','-nozip','-bpp','16',
      '-w','/home/username/.wine/dosdevices/d:','/bin/wine','cmd','/c','C:\\start.cmd'],
    canvas,
    SDL2:earlyAudio ? {audioContext:earlyAudio} : {},
    locateFile:path => new URL('./runtime/'+path,location.href).href,
    preRun:[() => {
      // Emscripten assigns its title callback while loading; replace it here,
      // after that assignment, so no program name appears before the reveal.
      window.setWindowTitle = window.Module.setWindowTitle = () => {document.title='tanya23';};
      FS.mkdir('/root');
      FS.mount(new BrowserFS.EmscriptenFS(),{root:'/root'},'/root');
    }],
    print:log, printErr:log,
    setStatus:text => {if(text)log(text);},
    onAbort:reason => fail(new Error(String(reason))),
    onExit:() => {
      setPhase('ended'); gate.hidden=false; gate.setAttribute('aria-label','Открыть снова');
      currentAudio()?.suspend().catch(() => {});
    }
  };
  const script = document.createElement('script'); script.src='./runtime/boxedwine.js';
  script.onerror = () => fail(new Error('Runtime unavailable')); document.body.append(script);
}
main().catch(fail);
