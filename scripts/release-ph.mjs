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
  const phTauriConfigPath = path.join(repoRoot, 'src-tauri/tauri.product-hunt.conf.json');

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const nextRelease = options.version
    ? coerceProductHuntRelease(options.version)
    : bumpVersion(currentVersion, options.level);
  const nextVersion = nextRelease.appVersion;
  const nextTag = `v${nextRelease.tagVersion}`;

  packageJson.version = nextVersion;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const cargoToml = await fs.readFile(cargoTomlPath, 'utf8');
  const nextCargoToml = cargoToml.replace(
    /^version = ".*"$/m,
    `version = "${nextVersion}"`
  );
  await fs.writeFile(cargoTomlPath, nextCargoToml, 'utf8');

  await updateTauriConfigVersion(tauriConfigPath, nextVersion);
  await updateTauriConfigVersion(phTauriConfigPath, nextVersion);

  run([
    'node',
    'scripts/update-release-config.mjs',
    '--channel',
    'product_hunt',
    '--tag-version',
    nextTag,
    '--app-version',
    nextVersion
  ]);
  run([
    'git',
    'add',
    'package.json',
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
    'src-tauri/tauri.product-hunt.conf.json',
    'landing-page/assets/release-config-ph.js',
    'landing-page/update-ph.json',
  ]);
  run(['git', 'commit', '-m', `release: ${nextTag} (product hunt)`]);
  run(['git', 'tag', '-a', nextTag, '-m', `release: ${nextTag} (product hunt)`]);
  run(['git', 'push', 'origin', 'HEAD', nextTag]);

  process.stdout.write(`Released Product Hunt build ${nextTag}\n`);
}

function parseArgs(args) {
  const options = {
    level: 'prerelease',
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
  const { baseVersion, phNumber } = parseProductHuntVersion(version);
  const parts = baseVersion.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const [major, minor, patch] = parts;
  if (level === 'major') {
    return makeProductHuntRelease(`${major + 1}.0.0`, 1);
  }

  if (level === 'minor') {
    return makeProductHuntRelease(`${major}.${minor + 1}.0`, 1);
  }

  if (level === 'patch') {
    return makeProductHuntRelease(`${major}.${minor}.${patch + 1}`, 1);
  }

  return makeProductHuntRelease(baseVersion, phNumber + 1);
}

function coerceProductHuntRelease(version) {
  const { baseVersion, phNumber } = parseProductHuntVersion(version);
  return makeProductHuntRelease(baseVersion, phNumber);
}

function parseProductHuntVersion(version) {
  const raw = String(version || '').trim().replace(/^v/, '');
  const match = raw.match(/^(\d+\.\d+\.\d+)(?:-(?:ph\.)?(\d+))?$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return {
    baseVersion: match[1],
    phNumber: Number.parseInt(match[2] || '1', 10),
  };
}

function makeProductHuntRelease(baseVersion, phNumber) {
  return {
    appVersion: `${baseVersion}-${phNumber}`,
    tagVersion: `${baseVersion}-ph.${phNumber}`,
  };
}

async function updateTauriConfigVersion(configPath, nextVersion) {
  const tauriConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  tauriConfig.version = nextVersion;
  await fs.writeFile(configPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8');
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
