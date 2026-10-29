import {loadBundle} from './bundle-loader.js?v=3';
import {enableIsolation} from './isolation.js?v=3';
import {installBufferedAudio} from './buffered-audio.js?v=4';
import {loadLegacySaves,prepareStorage} from './storage.js?v=3';

const stage=document.querySelector('#stage');
const canvas=document.querySelector('#canvas');
const loading=document.querySelector('#loading');
const progress=document.querySelector('#progress');
const gate=document.querySelector('#continue');
const failure=document.querySelector('#failure');
const logView=document.querySelector('#log');
const logs=[];
const keys=new Map();
const watchedAudio=new WeakSet();
let phase='loading',paused=false,dirtyLog=false,guestAudioActivated=false;
let frames=0,mips=0;
const diagnostics=new URLSearchParams(location.search).has('diagnostics');
new MutationObserver(()=>{
  const sample=/BoxedWine (\d+) MIPS/.exec(document.title);
  if(sample)mips=Number(sample[1]);
  if(document.title!=='tanya23')document.title='tanya23';
}).observe(document.querySelector('title'),{childList:true,characterData:true,subtree:true});
function setPhase(value){phase=value;stage.dataset.state=value;}
function currentAudio(){return window.Module?.boxedwineAudio?.context || window.Module?.SDL2?.audioContext;}
function syncGate(){
  const audio=currentAudio();
  if(audio&&!watchedAudio.has(audio)){watchedAudio.add(audio);audio.addEventListener('statechange',syncGate);}
  if(phase==='running')gate.hidden=!paused&&audio?.state==='running';
}
function log(...args){
  logs.push(args.join(' '));if(logs.length>80)logs.shift();dirtyLog=true;
}
// Wine can emit thousands of diagnostics per second. Keep those out of the hot path.
setInterval(()=>{if(dirtyLog){logView.textContent=logs.join('\n');dirtyLog=false;}syncGate();},300);
function fail(error){
  console.error(error);log(error?.stack||String(error));setPhase('error');
  loading.hidden=true;gate.hidden=true;failure.hidden=false;
  try{window.Module?.pauseMainLoop?.();currentAudio()?.suspend();}catch{}
}
window.addEventListener('error',event=>fail(new Error(event.message)));
window.addEventListener('unhandledrejection',event=>fail(event.reason));
document.querySelector('#retry').addEventListener('click',()=>location.reload());
function releaseKeys(){
  for(const [code,held] of [...keys]){
    const event=new KeyboardEvent('keyup',{key:held.key,code,bubbles:true,cancelable:true});
    Object.defineProperty(event,'keyCode',{value:held.keyCode});Object.defineProperty(event,'which',{value:held.keyCode});
    canvas.dispatchEvent(event);
  }
  keys.clear();
}
function pause(){
  if(phase!=='running'||paused)return;
  releaseKeys();paused=true;window.Module.pauseMainLoop();
  currentAudio()?.suspend().catch(()=>{});stage.dataset.state='paused';syncGate();
}
async function activate(){
  if(phase==='ended'){location.reload();return;}
  if(phase==='error')return;
  try{
    if(currentAudio()?.state==='suspended')await currentAudio().resume();
    if(paused){paused=false;window.Module.resumeMainLoop();stage.dataset.state='running';}
    canvas.focus();syncGate();
  }catch(error){console.warn('Audio activation unavailable',error);}
}
gate.addEventListener('click',()=>{
  // A release at the top-left enables the guest sound device without clicking a menu item.
  // This runs in the real click gesture, so the worklet context can resume immediately.
  if(!guestAudioActivated&&window.Module?._boxedwineEmscriptenMouseButton){
    guestAudioActivated=true;window.Module._boxedwineEmscriptenMouseButton(0,0,0,0);
  }
  activate();
});
stage.addEventListener('pointerdown',event=>{if(event.target!==gate&&!gate.contains(event.target))activate();});
// Run before the runtime's window-level input capture. Host buttons must receive
// their own clicks, and held keys must be released before pausing the emulator.
const hostControl=event=>event.target instanceof Element&&Boolean(event.target.closest('button,.veil'));
window.addEventListener('keydown',event=>{
  if(hostControl(event)){event.stopImmediatePropagation();return;}
  keys.set(event.code,{key:event.key,keyCode:event.keyCode});activate();
},true);
window.addEventListener('keyup',event=>{
  if(hostControl(event)){event.stopImmediatePropagation();return;}
  keys.delete(event.code);
},true);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});

// DirectInput polls mouse state; retain short clicks long enough for the original game.
const downAt=new Map(),delayed=new WeakSet();
window.addEventListener('mousedown',event=>{
  if(hostControl(event)){event.stopImmediatePropagation();return;}
  downAt.set(event.button,performance.now());
},true);
window.addEventListener('mouseup',event=>{
  if(delayed.has(event))return;
  if(hostControl(event)){event.stopImmediatePropagation();return;}
  const elapsed=performance.now()-(downAt.get(event.button)||0);if(elapsed>=90)return;
  event.preventDefault();event.stopImmediatePropagation();
  const options={bubbles:true,cancelable:true,button:event.button,buttons:event.buttons,
    clientX:event.clientX,clientY:event.clientY,screenX:event.screenX,screenY:event.screenY};
  setTimeout(()=>{const up=new MouseEvent('mouseup',options);delayed.add(up);canvas.dispatchEvent(up);},90-elapsed);
},true);
let context;
function present(width,height,buffer,presentState){
  try{
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    context ||= canvas.getContext('2d',{alpha:false});
    context.putImageData(new ImageData(new Uint8ClampedArray(buffer),width,height),0,0);frames++;
    if(phase==='starting'){setPhase('running');loading.hidden=true;syncGate();if(document.hidden)pause();}
  }finally{if(presentState)Atomics.store(presentState,0,0);}
}
if(diagnostics){
  const node=document.createElement('pre');node.id='diagnostics';node.hidden=true;document.body.append(node);
  let start=performance.now();
  setInterval(()=>{
    const now=performance.now();node.textContent=JSON.stringify({fps:frames*1000/(now-start),mips,state:stage.dataset.state,
      isolated:window.crossOriginIsolated,audio:window.Module?.boxedwineAudio?.snapshot()});
    frames=0;start=now;
  },2000);
}
async function main(){
  if(location.protocol==='file:')throw new Error('Use the website or a local HTTP server');
  await enableIsolation();
  const amounts={root:0,game:0};
  const update=(part,weight)=>(received,total)=>{amounts[part]=weight*received/total;progress.value=amounts.root+amounts.game;};
  const [root,game,legacy]=await Promise.all([
    loadBundle('./assets/wine-jit-v1/manifest.json',{onProgress:update('root',22)}),
    loadBundle('./assets/game-fast-v1/manifest.json',{onProgress:update('game',71)}),
    loadLegacySaves()
  ]);
  progress.value=97;setPhase('starting');
  window.Module={
    arguments:['-root','/state','-zip','/wine.zip','-mount','/game.zip','/home/username/.wine/drive_c/game',
      '-bpp','16','-skipFrameFPS','30','-audioFreq','22050','-env','WINEDEBUG=-all',
      '-w','/home/username/.wine/drive_c/game','/bin/wine','cmd','/c','C:\\start.cmd'],
    canvas,boxedwinePresentSoftwareFrame:present,boxedwineAudioPrimeMs:70,
    locateFile:path=>new URL('./runtime/jit/'+path+'?v=4',location.href).href,
    preRun:[()=>{
      installBufferedAudio(window.BoxedwineAudio,()=>HEAPU8,window.Module,{force:new URLSearchParams(location.search).get('audioBackend')==='buffer'});
      FS.writeFile('/wine.zip',root.data,{canOwn:true});FS.writeFile('/game.zip',game.data,{canOwn:true});
      root.data=null;game.data=null;prepareStorage(legacy,log);
    }],
    print:log,printErr:log,setStatus:text=>{if(text)log(text);},
    onAbort:reason=>fail(new Error(String(reason))),
    onExit:()=>{setPhase('ended');gate.hidden=false;gate.setAttribute('aria-label','Открыть снова');currentAudio()?.suspend().catch(()=>{});}
  };
  const script=document.createElement('script');script.src='./runtime/jit/boxedwine.js?v=4';
  script.onerror=()=>fail(new Error('Runtime unavailable'));document.body.append(script);
}
main().catch(fail);
