import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalBuildEnv(repoRoot);

const args = process.argv.slice(2);
const result = spawnSync('pnpm', ['exec', 'tauri', 'build', ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
