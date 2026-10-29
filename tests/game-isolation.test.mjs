import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../game/coi-worker.js',import.meta.url),'utf8');
function setup(response){
 const handlers={};let calls=0;
 const self={location:{origin:'https://example.test'},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()}};
 vm.runInNewContext(source,{self,URL,Headers,Response,fetch:async()=>{calls++;return response;}});
 return {handlers,calls:()=>calls};
}
test('game responses keep status and streamed bytes while adding audio isolation',async()=>{
 const {handlers}=setup(new Response(new Uint8Array([0,1,2,255]),{status:206,headers:{'Content-Type':'application/wasm'}}));
 let result;handlers.fetch({request:{url:'https://example.test/tanya23/game/runtime/jit/boxedwine.wasm'},respondWith:value=>result=value});
 const response=await result;assert.equal(response.status,206);assert.equal(response.headers.get('Content-Type'),'application/wasm');
 assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),'same-origin');assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,2,255]);
});
test('missing game files retain their failure status',async()=>{
 const {handlers}=setup(new Response('missing',{status:404}));let result;
 handlers.fetch({request:{url:'https://example.test/tanya23/game/missing'},respondWith:value=>result=value});
 assert.equal((await result).status,404);
});
test('worker does not intercept other origins or invalid cache-only requests',()=>{
 const runtime=setup(new Response('unused'));let responses=0;
 for(const request of [{url:'https://elsewhere.test/file'},{url:'https://example.test/file',cache:'only-if-cached',mode:'no-cors'}])runtime.handlers.fetch({request,respondWith:()=>responses++});
 assert.equal(responses,0);assert.equal(runtime.calls(),0);
});
