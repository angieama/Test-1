import assert from "node:assert/strict";
import { amountToCents, coverageError, fareBalance, firstName, isRecent, suggestedPassengers, WINDOW_MS } from "../lib/payment-types.ts";

for (const [input, cents] of [["100", 10000], ["100.5", 10050], ["0.01", 1], ["250000.00", 25000000], [" 50.05 ", 5005]]) {
  assert.equal(amountToCents(input), cents);
}
for (const input of ["", "0", "0.00", "-100", ".5", "1.001", "1e2", "250000.01", "NaN", "1,000", "1.2.3"]) {
  assert.equal(amountToCents(input), null, input);
}
const now = 1800000000000;
assert.equal(isRecent({ receivedAt: now - WINDOW_MS }, now), false);
assert.equal(isRecent({ receivedAt: now - WINDOW_MS + 1 }, now), true);
assert.equal(isRecent({ receivedAt: now + 1 }, now), false);
assert.equal(isRecent({ receivedAt: now }, now), true);
console.log("PASS: exact integer cents, invalid amounts, and synchronized rolling-window boundaries");
assert.equal(firstName("  Brian   Mwangi "), "Brian");
assert.equal(firstName("Wanjiku"), "Wanjiku");
assert.equal(suggestedPassengers(20000, 10000), 2);
assert.equal(suggestedPassengers(15000, 10000), 1);
assert.equal(suggestedPassengers(50000, 10000), 5);
assert.equal(coverageError(20000, 10000, 2), null);
assert.ok(coverageError(15000, 10000, 2));
assert.ok(coverageError(5000, 10000, 1));
assert.ok(coverageError(20000, null, 2));
assert.ok(coverageError(20000, 10000, 3));
assert.equal(suggestedPassengers(100000, 10000), 10);
assert.equal(suggestedPassengers(105000, 10000), 10);
assert.equal(suggestedPassengers(5000, 10000), 0);
assert.equal(suggestedPassengers(5000, null), 0);
assert.equal(coverageError(100000, 10000, 10), null);
assert.ok(coverageError(100000, 10000, 1.5));
assert.deepEqual(fareBalance(25000, 10000, 2), { expected: 20000, shortfall: 0, extra: 5000 });
console.log("PASS: first-name privacy, automatic group passenger coverage, underpayment and surplus handling");

assert.equal(amountToCents("0", true), 0);
assert.equal(amountToCents("0.00", true), 0);
assert.equal(amountToCents("50.25", true), 5025);
assert.equal(amountToCents("-1", true), null);
assert.equal(amountToCents("250000.01", true), null);
