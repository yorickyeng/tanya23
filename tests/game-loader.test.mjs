import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {loadBundle} from '../game/bundle-loader.js';

globalThis.location={href:'https://example.test/tanya23/game/index.html'};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const originalFetch=globalThis.fetch;
const blocks=[new TextEncoder().encode('first'),new TextEncoder().encode('second'),new TextEncoder().encode('third')];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function setup({badHash=false,short=false,external=false,missing=false}={}){
  const manifest={title:'Test',bytes:blocks.reduce((n,b)=>n+b.length,0),parts:blocks.map((b,i)=>({url:external&&i===0?'https://other.test/part.bin':`part-${i}.bin`,bytes:b.length,sha256:badHash&&i===0?'0'.repeat(64):hash(b)}))};
  const requests=[];
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;requests.push(String(url));
    if(path.endsWith('/manifest.json'))return new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}});
    const index=Number(path.match(/part-(\d).bin/)?.[1]);
    if(!Number.isInteger(index)||missing&&index===0)return new Response('',{status:404});
    return new Response(short&&index===0?blocks[index].slice(1):blocks[index]);
  };
  return {requests,manifest};
}
test('assembles checked parts relative to manifest in a nested site path',async()=>{
  const {requests}=setup();const updates=[];
  try{
    const {data}=await loadBundle('assets/game/manifest.json',{onProgress:(n,total)=>updates.push([n,total])});
    assert.equal(new TextDecoder().decode(data),'firstsecondthird');
    assert.ok(requests.includes('https://example.test/tanya23/game/assets/game/part-0.bin'));
    assert.deepEqual(updates.at(-1),[16,16]);
    for(let i=1;i<updates.length;i++)assert.ok(updates[i][0]>=updates[i-1][0]);
  }finally{globalThis.fetch=originalFetch;}
});
test('rejects altered archive bytes',async()=>{setup({badHash:true});try{await assert.rejects(loadBundle('assets/game/manifest.json'),/Проверка файла/);}finally{globalThis.fetch=originalFetch;}});
test('rejects incomplete downloads',async()=>{setup({short:true});try{await assert.rejects(loadBundle('assets/game/manifest.json'),/не полностью/);}finally{globalThis.fetch=originalFetch;}});
test('reports missing hosted assets',async()=>{setup({missing:true});try{await assert.rejects(loadBundle('assets/game/manifest.json'),/404/);}finally{globalThis.fetch=originalFetch;}});
test('rejects unexpected cross-origin parts',async()=>{setup({external:true});try{await assert.rejects(loadBundle('assets/game/manifest.json'),/другом сайте/);}finally{globalThis.fetch=originalFetch;}});
