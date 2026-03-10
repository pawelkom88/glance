import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadLocalBuildEnv(repoRoot);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureEnv('GLANCE_LICENSE_PUBLIC_KEY');

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const cargoTomlPath = path.join(repoRoot, 'src-tauri/Cargo.toml');
  const tauriConfigPath = path.join(repoRoot, 'src-tauri/tauri.conf.json');

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const nextVersion = options.version || bumpVersion(currentVersion, options.level);
  const nextTag = `v${nextVersion}`;

  packageJson.version = nextVersion;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const cargoToml = await fs.readFile(cargoTomlPath, 'utf8');
  const nextCargoToml = cargoToml.replace(
    /^version = ".*"$/m,
    `version = "${nextVersion}"`
  );
  await fs.writeFile(cargoTomlPath, nextCargoToml, 'utf8');

  const tauriConfig = JSON.parse(await fs.readFile(tauriConfigPath, 'utf8'));
  tauriConfig.version = nextVersion;
  await fs.writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8');

  run(['node', 'scripts/update-release-config.mjs', '--version', nextTag]);
  run([
    'git',
    'add',
    'package.json',
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
    'landing-page/assets/release-config.js',
    'landing-page/update.json',
  ]);
  run(['git', 'commit', '-m', `release: ${nextTag}`]);
  run(['git', 'tag', '-a', nextTag, '-m', `release: ${nextTag}`]);
  run(['git', 'push', 'origin', 'HEAD', nextTag]);

  process.stdout.write(`Released ${nextTag}\n`);
}

function parseArgs(args) {
  const options = {
    level: 'patch',
    version: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--level' && value) {
      options.level = value;
      index += 1;
      continue;
    }

    if (arg === '--version' && value) {
      options.version = value.replace(/^v/, '');
      index += 1;
    }
  }

  return options;
}

function bumpVersion(version, level) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const [major, minor, patch] = parts;

  if (level === 'major') {
    return `${major + 1}.0.0`;
  }

  if (level === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

function ensureEnv(name) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required. Put it in .env.local or .env.build before releasing.`);
  }
}

function run(command) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command.join(' ')}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
