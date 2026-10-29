import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {getContext,visibleMoments,clockTime,mediaURL} from '../core.mjs';
const config = {birthday:'2026-11-13',archiveAt:'2026-11-14T00:00:00+03:00',moments:[
  {id:'midnight',published:true,opensAt:'2026-11-13T00:00:00+03:00'},
  {id:'song',published:true,opensAt:'2026-11-13T16:00:00+03:00'},
  {id:'draft',published:false,opensAt:'2026-11-13T09:00:00+03:00'}
]};
const at = (time,search='') => getContext(search,Date.parse(time),config);
test('Nothing is revealed before Moscow midnight',()=>{
  assert.deepEqual(visibleMoments(config,at('2026-11-12T20:59:59Z')),[]);
});
test('A moment opens exactly at the configured Moscow time',()=>{
  assert.deepEqual(visibleMoments(config,at('2026-11-13T13:00:00Z')).map(x=>x.id),['midnight','song']);
});
test('Drafts remain hidden after the birthday',()=>{
  assert.deepEqual(visibleMoments(config,at('2027-01-01T12:00:00Z')).map(x=>x.id),['midnight','song']);
});
test('Author preview includes unfinished widgets',()=>{
  assert.equal(visibleMoments(config,at('2026-10-28T12:00:00Z','?preview=all')).length,3);
});
test('A simulated time behaves like the real schedule',()=>{
  const context=at('2026-10-28T12:00:00Z','?preview=2026-11-13T15%3A59%3A59%2B03%3A00');
  assert.deepEqual(visibleMoments(config,context).map(x=>x.id),['midnight']);
});
test('Replay is only available after the birthday',()=>{
  assert.equal(at('2026-10-28T12:00:00Z','?replay=16%3A00').isReplay,false);
  const replay=at('2027-01-01T12:00:00Z','?replay=09%3A00');
  assert.equal(replay.isReplay,true);
  assert.deepEqual(visibleMoments(config,replay).map(x=>x.id),['midnight']);
});
test('Invalid preview or replay values do not change the schedule',()=>{
  const context=at('2026-10-28T12:00:00Z','?preview=banana&replay=99%3A99');
  assert.equal(context.isPreview,false); assert.equal(context.isReplay,false);
});
test('Player timer handles an unloaded or invalid duration',()=>{
  assert.equal(clockTime(NaN),'0:00'); assert.equal(clockTime(Infinity),'0:00');
  assert.equal(clockTime(180),'3:00'); assert.equal(clockTime(61.9),'1:01');
});
test('Media paths preserve the GitHub Pages project prefix',()=>{
  assert.equal(mediaURL('./assets/audio/song.mp3','https://example.github.io/tanya23/moment.html'), 'https://example.github.io/tanya23/assets/audio/song.mp3');
  assert.throws(()=>mediaURL('javascript:alert(1)','https://example.github.io/tanya23/'));
  assert.throws(()=>mediaURL('https://other.example/video.mp4','https://example.github.io/tanya23/'));
});

test('The dinner surprise appears at 16:00 Moscow and stays hidden before then, including direct links',()=>{
  const content = JSON.parse(readFileSync(new URL('../content.json', import.meta.url), 'utf8'));
  const visibleAt = time => visibleMoments(content, getContext('', Date.parse(time), content));
  assert.equal(visibleAt('2026-11-13T15:59:59+03:00').some(moment => moment.id === 'dinner'), false);
  const dinner = visibleAt('2026-11-13T16:00:00+03:00').find(moment => moment.id === 'dinner');
  assert.ok(dinner);
  assert.equal(dinner.invitation.startsAt, '2026-11-13T19:30:00+03:00');
  assert.ok(Date.parse(dinner.opensAt) < Date.parse(dinner.invitation.startsAt));
  const preview = getContext('?preview=all', Date.parse('2026-10-29T12:00:00+03:00'), content);
  assert.ok(visibleMoments(content, preview).some(moment => moment.id === 'dinner'));
});
