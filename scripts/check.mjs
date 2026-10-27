import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [
  [process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ...['amounts', 'mobile-app', 'ride-simulator', 'earnings', 'client-api', 'browser-ledger', 'saved-routes'].map(name => [process.execPath, ['--experimental-strip-types', `tests/${name}.test.mjs`]]),
  ...['integrity', 'combine-payments', 'earnings', 'refunds', 'cash', 'saved-routes'].map(name => [process.env.PYTHON || 'python3', [`tests/${name}.py`]]),
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('All checks passed.');
