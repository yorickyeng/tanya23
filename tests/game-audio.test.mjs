import test from 'node:test';
import assert from 'node:assert/strict';
import {installBufferedAudio} from '../game/buffered-audio.js';
function fixture(){
 let heap=new Uint8Array(1024*1024),tick;
 class Audio{
  constructor(){this.currentTime=0;this.sampleRate=48000;this.state='running';this.destination={};this.sources=[];}
  createBuffer(channels,frames,rate){const data=Array.from({length:channels},()=>new Float32Array(frames));return {data,rate,getChannelData:c=>data[c]};}
  createBufferSource(){const source={connect(){},disconnect(){},stop(){source.stopped=true;},start(time){source.time=time;}};this.sources.push(source);return source;}
  close(){this.state='closed';return Promise.resolve();}
 }
 const output={available:()=>false},module={};
 assert.equal(installBufferedAudio(output,()=>heap,module,{Audio,setTimer:fn=>(tick=fn,1),clearTimer:()=>{}}),true);
 const write=(samples,pointer=0)=>{const view=new DataView(heap.buffer);samples.forEach((value,i)=>view.setFloat32(pointer+i*4,value,true));};
 return {output,module,write,replaceHeap:()=>heap=new Uint8Array(1024*1024),tick:()=>tick()};
}
test('scheduled packets preserve stereo order and form a continuous native timeline',()=>{
 const {output,write}=fixture(),id=output.open(2,22050,2205);write([.25,-.5,.75,-1]);
 assert.equal(output.queue(id,0,2),1);assert.equal(output.queue(id,0,2),1);
 const [a,b]=output.context.sources;assert.deepEqual([...a.buffer.data[0]],[.25,.75]);assert.deepEqual([...a.buffer.data[1]],[-.5,-1]);
 assert.equal(a.time,.07);assert.equal(b.time,a.time+2/22050);assert.equal(output.queued(output.devices.get(id)),4);
});
test('consumption follows the native audio clock without main-thread timer callbacks',()=>{
 const {output}=fixture(),id=output.open(1,1000,100);output.queue(id,0,100);
 output.context.currentTime=.12;assert.equal(output.queued(output.devices.get(id)),50);
 output.context.currentTime=.2;assert.equal(output.queued(output.devices.get(id)),0);
 assert.equal(output.snapshot().devices[0].consumedFrames,100);
});
test('unaligned float packets read the current heap after memory growth',()=>{
 const {output,write,replaceHeap}=fixture(),id=output.open(1,22050,2205);write([.25],1);output.queue(id,1,1);
 replaceHeap();write([-.75],1);output.queue(id,1,1);
 assert.equal(output.context.sources[0].buffer.data[0][0],.25);assert.equal(output.context.sources[1].buffer.data[0][0],-.75);
});
test('full buffers reject complete packets without overwriting queued samples',()=>{
 const {output}=fixture(),id=output.open(1,1000,100),device=output.devices.get(id);
 output.queue(id,0,device.capacity);const written=device.written;
 assert.equal(output.queue(id,0,1),0);assert.equal(device.written,written);assert.equal(output.context.sources.length,1);
});
test('draining retains pending audio and abort only stops the selected device',()=>{
 const {output,tick}=fixture(),a=output.open(1,1000,100),b=output.open(1,1000,100);
 output.queue(a,0,100);output.queue(b,0,100);output.close(a,1);assert.equal(output.devices.has(a),true);
 output.close(b,0);assert.equal(output.devices.has(b),false);assert.equal(output.context.sources[1].stopped,true);
 output.context.currentTime=.2;tick();assert.equal(output.devices.has(a),false);
});
test('a scheduling failure allows the runtime to select its compatible audio backend',()=>{
 const {output}=fixture(),id=output.open(1,1000,100);output.context.createBuffer=()=>{throw new Error('unavailable');};
 assert.equal(output.queue(id,0,100),0);assert.equal(output.available(),false);
});
test('a supported shared worklet backend remains selected',()=>{
 const original=()=>true,output={available:original};assert.equal(installBufferedAudio(output,()=>{},{},{Audio:class {}}),false);assert.equal(output.available,original);
});
