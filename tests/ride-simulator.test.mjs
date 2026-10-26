import assert from 'node:assert/strict';
import { generateRideSamples } from '../lib/ride-simulator.ts';
for (const fare of [2, 99, 10000, 15050, 12500000]) {
  for (const count of [4, 12, 30]) {
    let seed = 42;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const samples = generateRideSamples(fare, count, random);
    assert.equal(samples.length, count);
    assert.equal(new Set(samples.map(s => s.customer)).size, count);
    assert.equal(new Set(samples.map(s => s.kind)).size, 4);
    for (const sample of samples) {
      assert.ok(sample.amounts.every(a => Number.isSafeInteger(a) && a >= 1 && a <= 25000000));
      const total = sample.amounts.reduce((a,b) => a+b, 0);
      if (sample.kind === 'underpaid') assert.ok(total < fare);
      else assert.equal(total, fare * sample.passengers);
      if (sample.kind === 'topup') { assert.equal(sample.amounts.length, 2); assert.ok(sample.amounts.every(a => a < fare)); }
      if (sample.kind === 'group') assert.ok(sample.passengers >= 2 && sample.passengers <= 10);
    }
  }
}
for (const count of [0,3,31,12.5,NaN,'12']) assert.throws(() => generateRideSamples(10000, count));
for (const fare of [0,1,12500001,NaN,1.5]) assert.throws(() => generateRideSamples(fare,12));
console.log('PASS: mixed batches include exact, underpaid, split top-up and group payments; integer cents, unique names, counts and transaction limits hold');
