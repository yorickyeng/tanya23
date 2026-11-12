import {loadBundle} from './bundle-loader.js?v=5';

async function digest(bytes){
  const value=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):(await import('./sha256.js')).sha256(bytes);
  return Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function fetchChecked(url,record){
  const target=new URL(url,location.href);
  if(target.origin!==location.origin)throw new Error('Unexpected asset origin');
  const response=await fetch(target);if(!response.ok)throw new Error(`Asset unavailable: ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==record.bytes||await digest(bytes)!==record.sha256)throw new Error('Asset integrity check failed');
  return bytes;
}
export async function inflateChecked(bytes,record){
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw=new Uint8Array(await new Response(stream).arrayBuffer());
  if(raw.length!==record.rawBytes||await digest(raw)!==record.rawSha256)throw new Error('Expanded asset integrity check failed');
  return raw;
}
export function writeTrack(bank,decoded,track){
  const frames=track.pcmBytes/4;
  if(!Number.isSafeInteger(frames)||frames<0||!Number.isSafeInteger(track.offset)||track.offset<0||track.offset+track.pcmBytes>bank.length)throw new Error('Invalid audio bank range');
  if(decoded.sampleRate!==22050||Math.abs(decoded.length-frames)>4096)throw new Error('Unexpected decoded music duration');
  const left=decoded.getChannelData(0),right=decoded.getChannelData(Math.min(1,decoded.numberOfChannels-1));
  const view=new DataView(bank.buffer,bank.byteOffset+track.offset,track.pcmBytes);
  for(let i=0;i<Math.min(frames,decoded.length);i++){
    view.setInt16(i*4,Math.max(-32768,Math.min(32767,Math.round(left[i]*32768))),true);
    view.setInt16(i*4+2,Math.max(-32768,Math.min(32767,Math.round(right[i]*32768))),true);
  }
}
async function loadSounds(base,onProgress,onStep){
  const response=await fetch(new URL('audio/manifest.json',base));if(!response.ok)throw new Error('Missing music manifest');
  const manifest=await response.json();
  if(manifest.sampleRate!==22050||manifest.channels!==2||!Number.isSafeInteger(manifest.bankBytes)||manifest.bankBytes>128*1024*1024)throw new Error('Invalid music manifest');
  const audioBase=new URL('audio/',base),total=manifest.base.bytes+manifest.tracks.reduce((n,track)=>n+track.bytes,0);
  let received=0,next=0;onProgress(0,total);
  const effects=await fetchChecked(new URL(manifest.base.file,audioBase),manifest.base);received+=effects.length;onProgress(received,total);
  const bank=new Uint8Array(manifest.bankBytes);bank.set(await inflateChecked(effects,{...manifest.base,rawSha256:manifest.base.rawSha256}));
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  const decoder=new Offline(2,1,22050);
  async function worker(){
    for(;;){
      const index=next++;if(index>=manifest.tracks.length)return;
      const track=manifest.tracks[index];const bytes=await fetchChecked(new URL(track.file,audioBase),track);
      received+=bytes.length;onProgress(received,total);onStep('Готовим звук…');
      writeTrack(bank,await decoder.decodeAudioData(bytes.buffer),track);
    }
  }
  await Promise.all([worker(),worker()]);return bank;
}
export async function loadStartup({onProgress=()=>{},onStep=()=>{}}={}){
  const base=new URL('./assets/first-v3/',location.href);
  const response=await fetch(new URL('manifest.json',base));if(!response.ok)throw new Error('Missing startup manifest');
  const plan=await response.json(),amounts={wine:0,game:0,audio:0,runtime:0};
  const update=key=>(bytes)=>{amounts[key]=bytes;onProgress(Object.values(amounts).reduce((sum,n)=>sum+n,0),plan.downloadBytes);};
  onStep('Скачиваем данные…');
  const [root,game,sounds,wasm]=await Promise.all([
    loadBundle(new URL('wine/manifest.json',base),{onProgress:update('wine')}),
    loadBundle(new URL('game/manifest.json',base),{onProgress:update('game')}),
    loadSounds(base,update('audio'),onStep),
    (async()=>{
      const bytes=await fetchChecked(new URL(plan.runtime.file,base),plan.runtime);update('runtime')(bytes.length);
      return WebAssembly.compile(await inflateChecked(bytes,plan.runtime));
    })()
  ]);
  return {root,game,sounds,wasm,downloadBytes:plan.downloadBytes};
}
