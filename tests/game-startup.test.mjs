import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {writeTrack,inflateChecked} from '../game/startup.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function decoded(left,right=left){return {sampleRate:22050,length:left.length,numberOfChannels:2,getChannelData:channel=>channel===0?left:right};}
test('restores interleaved stereo PCM at the original bank offset without changing effects',()=>{
  const bank=new Uint8Array(20).fill(73);
  writeTrack(bank,decoded([0,1,-1],[-.5,.5,2]),{offset:4,pcmBytes:12});
  assert.deepEqual([...bank.slice(0,4)],[73,73,73,73]);
  const view=new DataView(bank.buffer);
  assert.deepEqual(Array.from({length:6},(_,i)=>view.getInt16(4+i*2,true)),[0,-16384,32767,16384,-32768,32767]);
  assert.deepEqual([...bank.slice(16)],[73,73,73,73]);
});
test('rejects corrupt music ranges and unexpected decoded tracks',()=>{
  const bank=new Uint8Array(16),audio=decoded([0,0]);
  for(const track of [{offset:-1,pcmBytes:8},{offset:1.5,pcmBytes:8},{offset:12,pcmBytes:8},{offset:0,pcmBytes:7}])
    assert.throws(()=>writeTrack(bank,audio,track),/bank range/);
  assert.throws(()=>writeTrack(bank,{...audio,sampleRate:44100},{offset:0,pcmBytes:8}),/duration/);
  assert.throws(()=>writeTrack(new Uint8Array(20000),audio,{offset:0,pcmBytes:20000}),/duration/);
});
test('compressed startup files must expand to the checked original bytes',async()=>{
  const raw=Buffer.from('original runtime bytes'),packed=gzipSync(raw),record={rawBytes:raw.length,rawSha256:hash(raw)};
  assert.deepEqual(Buffer.from(await inflateChecked(packed,record)),raw);
  await assert.rejects(inflateChecked(packed,{...record,rawBytes:raw.length+1}),/integrity/);
  await assert.rejects(inflateChecked(packed,{...record,rawSha256:'0'.repeat(64)}),/integrity/);
});
