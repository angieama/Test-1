import assert from 'node:assert/strict';
import { earningsBounds, earningsPreset } from '../lib/earnings-types.ts';
const midnight = Date.parse('2026-10-25T21:00:00Z'); // Monday in Kenya
assert.deepEqual(earningsPreset('today', midnight), {from:'2026-10-26',to:'2026-10-26'});
assert.deepEqual(earningsPreset('week', midnight-1), {from:'2026-10-19',to:'2026-10-25'});
assert.deepEqual(earningsPreset('week', midnight), {from:'2026-10-26',to:'2026-10-26'});
assert.deepEqual(earningsPreset('month', Date.parse('2026-10-31T21:00:00Z')), {from:'2026-11-01',to:'2026-11-01'});
assert.deepEqual(earningsBounds('2026-10-26','2026-10-26'), {start:midnight,end:midnight+86400000});
assert.equal(earningsBounds('2024-02-29','2024-03-01').end-earningsBounds('2024-02-29','2024-03-01').start, 2*86400000);
for (const [from,to] of [['2026-02-29','2026-03-01'],['2026-10-26','2026-10-25'],['','2026-01-01'],['2026-2-1','2026-02-02'],['oops','oops']]) assert.throws(() => earningsBounds(from,to));
console.log('PASS: Kenya midnight, Monday weeks, month transitions, inclusive custom dates, leap days and invalid ranges');
