export const TIME_RANGES = [{ id: '15', label: 'Last 15m', minutes: 15 }, { id: '30', label: 'Last 30m', minutes: 30 }, { id: '60', label: 'Last 1hr', minutes: 60 }, { id: 'today', label: 'Today' }];
export const money = n => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n);
export function nairobiDay(timestamp) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp); }
export function filterTransactions(transactions, { fare, range, query = '', status = 'all', claims = {}, now = Date.now() }) {
  const selected = TIME_RANGES.find(r => r.id === range) || TIME_RANGES[1];
  return transactions.filter(tx => {
    const age = now - tx.receivedAt;
    const inWindow = selected.id === 'today' ? nairobiDay(tx.receivedAt) === nairobiDay(now) : age <= selected.minutes * 60000;
    return age >= 0 && inWindow && tx.amount === fare && tx.name.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'all' || (status === 'claimed' ? !!claims[tx.id] : !claims[tx.id]));
  }).sort((a,b) => b.receivedAt - a.receivedAt);
}
export function lockTransaction(claims, tx, now = Date.now()) {
  if (claims[tx.id]) return claims;
  return { ...claims, [tx.id]: { customer: tx.name, claimedAt: now, amount: tx.amount } };
}
export function parseFare(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 250000 ? amount : null;
}
