import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadBytes} from '../game/download.js';
const original=globalThis.fetch;
function interrupted(){let read=0;return new Response(new ReadableStream({pull(controller){if(!read++){controller.enqueue(new Uint8Array([1,2]));}else controller.error(new TypeError('connection lost'));}}));}
test('resumes a broken first download from the last received byte',async()=>{
  const requests=[],progress=[];
  globalThis.fetch=async(url,options)=>{
    requests.push(options.headers?.Range||null);
    return requests.length===1?interrupted():new Response(new Uint8Array([3,4]),{status:206,headers:{'Content-Range':'bytes 2-3/4'}});
  };
  try{assert.deepEqual([...await downloadBytes('https://example.test/part.bin',4,{onProgress:n=>progress.push(n)})],[1,2,3,4]);
    assert.deepEqual(requests,[null,'bytes=2-']);assert.deepEqual(progress,[2,4]);
  }finally{globalThis.fetch=original;}
});
test('accepts a complete restart when the host ignores a range request',async()=>{
  let calls=0;const progress=[];
  globalThis.fetch=async()=>++calls===1?interrupted():new Response(new Uint8Array([1,2,3,4]));
  try{assert.deepEqual([...await downloadBytes('https://example.test/part.bin',4,{onProgress:n=>progress.push(n)})],[1,2,3,4]);
    assert.equal(calls,2);assert.ok(progress.every((n,i)=>i===0||n>=progress[i-1]));
  }finally{globalThis.fetch=original;}
});
test('does not retry missing files or accept an incorrect resume offset',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:404});};
  try{await assert.rejects(downloadBytes('https://example.test/missing',4),/404/);assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>++calls===1?interrupted():new Response(new Uint8Array([3,4]),{status:206,headers:{'Content-Range':'bytes 1-2/4'}});
    await assert.rejects(downloadBytes('https://example.test/part.bin',4),/range/);assert.equal(calls,2);
  }finally{globalThis.fetch=original;}
});
