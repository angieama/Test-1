import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions, lockTransaction, parseFare } from './domain.js';
const now = Date.parse('2026-10-21T12:00:00Z');
const tx = (id, amount, minutes, name = 'Grace Akinyi') => ({ id, amount, name, receivedAt: now - minutes * 60000 });
const rows = [tx('a', 100, 2), tx('b', 150, 8), tx('c', 100, 30), tx('d', 100, 31), tx('future', 100, -1)];
test('fare and rolling window combine inclusively and exclude future receipts', () => {
 assert.deepEqual(filterTransactions(rows, { fare: 100, range: '30', now }).map(t => t.id), ['a','c']);
 assert.deepEqual(filterTransactions(rows, { fare: 150, range: '30', now }).map(t => t.id), ['b']);
});
test('case-insensitive name search combines with claim status', () => {
 const claims = lockTransaction({}, rows[0], now);
 assert.equal(filterTransactions(rows, { fare: 100, range: '30', query: ' GRACE ', status: 'unclaimed', claims, now })[0].id, 'c');
 assert.equal(filterTransactions(rows, { fare: 100, range: '30', status: 'claimed', claims, now }).length, 1);
 assert.strictEqual(lockTransaction(claims, {...rows[0], name:'Someone else'}, now + 1), claims);
});
test('Today uses Nairobi midnight rather than the host timezone', () => {
 const midnight = Date.parse('2026-10-21T21:01:00Z');
 const data = [{...rows[0], receivedAt: Date.parse('2026-10-21T20:59:00Z')}, {...rows[1], amount:100, receivedAt: Date.parse('2026-10-21T21:00:00Z')}];
 assert.deepEqual(filterTransactions(data, {fare:100, range:'today', now:midnight}).map(t=>t.id), ['b']);
});
test('fare validation rejects invalid and zero input', () => {
 for (const value of ['', '0','-1','NaN','150.123','250001','1e2']) assert.equal(parseFare(value), null);
 assert.equal(parseFare('150.50'), 150.5);
});
