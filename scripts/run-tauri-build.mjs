import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalBuildEnv(repoRoot);

const rawArgs = process.argv.slice(2);
const { args, channel } = parseArgs(rawArgs);
const customProductHuntMacDmg = shouldUseCustomProductHuntMacDmg(channel, args);
const tempConfigPath = customProductHuntMacDmg
  ? createProductHuntMacBuildConfig(args)
  : null;
const tauriArgs = customProductHuntMacDmg
  ? withAppBundleOnly(withConfigPath(args, tempConfigPath))
  : args;
const env = {
  ...process.env,
  GLANCE_BUILD_CHANNEL: channel,
  VITE_GLANCE_BUILD_CHANNEL: channel
};

try {
  const result = spawnSync('pnpm', ['exec', 'tauri', 'build', ...tauriArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
  });

  if (typeof result.status === 'number') {
    if (result.status === 0 && customProductHuntMacDmg) {
      buildProductHuntMacDmg(args);
    }
    process.exit(result.status);
  }

  process.exit(1);
} finally {
  if (tempConfigPath) {
    rmSync(tempConfigPath, { force: true });
  }
}

function parseArgs(rawArgs) {
  const args = [];
  let channel = 'paid';

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    const next = rawArgs[index + 1];

    if (arg === '--channel' && next) {
      channel = next;
      index += 1;
      continue;
    }

    args.push(arg);
  }

  if (channel === 'product_hunt' && !args.includes('--config')) {
    args.unshift('src-tauri/tauri.product-hunt.conf.json');
    args.unshift('--config');
  }

  return { args, channel };
}

function shouldUseCustomProductHuntMacDmg(channel, args) {
  if (channel !== 'product_hunt') {
    return false;
  }

  if (args.includes('--no-bundle')) {
    return false;
  }

  const target = resolveTarget(args);
  return target === null
    ? process.platform === 'darwin'
    : target.includes('apple-darwin');
}

function withAppBundleOnly(args) {
  const nextArgs = [...args];
  const bundlesIndex = nextArgs.findIndex((arg) => arg === '--bundles' || arg === '-b');

  if (bundlesIndex >= 0) {
    nextArgs[bundlesIndex + 1] = 'app';
    return nextArgs;
  }

  nextArgs.push('--bundles', 'app');
  return nextArgs;
}

function withConfigPath(args, configPath) {
  const nextArgs = [...args];
  const configIndex = nextArgs.indexOf('--config');

  if (configIndex === -1) {
    nextArgs.unshift(configPath);
    nextArgs.unshift('--config');
    return nextArgs;
  }

  nextArgs[configIndex + 1] = path.relative(repoRoot, configPath);
  return nextArgs;
}

function resolveTarget(args) {
  const targetIndex = args.findIndex((arg) => arg === '--target' || arg === '-t');
  if (targetIndex === -1) {
    return null;
  }

  return args[targetIndex + 1] ?? null;
}

function resolveConfigPath(args) {
  const configIndex = args.indexOf('--config');
  if (configIndex === -1) {
    return path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
  }

  return path.resolve(repoRoot, args[configIndex + 1]);
}

function createProductHuntMacBuildConfig(args) {
  const configPath = resolveConfigPath(args);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const tempConfigPath = path.join(
    os.tmpdir(),
    `glance-product-hunt-mac-build-${process.pid}-${Date.now()}.json`
  );

  config.bundle = {
    ...config.bundle,
    targets: ['app'],
    createUpdaterArtifacts: false
  };

  writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  return tempConfigPath;
}

function resolveMacReleaseDir(args) {
  const target = resolveTarget(args);
  if (target) {
    return path.join(repoRoot, 'src-tauri', 'target', target, 'release');
  }

  return path.join(repoRoot, 'src-tauri', 'target', 'release');
}

function resolveArchSuffix(args) {
  const target = resolveTarget(args);

  if (target?.startsWith('aarch64-')) {
    return 'aarch64';
  }

  if (target?.startsWith('x86_64-')) {
    return 'x64';
  }

  if (process.arch === 'arm64') {
    return 'aarch64';
  }

  if (process.arch === 'x64') {
    return 'x64';
  }

  return process.arch;
}

function buildProductHuntMacDmg(args) {
  const config = JSON.parse(readFileSync(resolveConfigPath(args), 'utf8'));
  const releaseDir = resolveMacReleaseDir(args);
  const productName = config.productName;
  const version = config.version;
  const archSuffix = resolveArchSuffix(args);
  const appBundlePath = path.join(releaseDir, 'bundle', 'macos', `${productName}.app`);
  const dmgDir = path.join(releaseDir, 'bundle', 'dmg');
  const dmgOutputPath = path.join(dmgDir, `${productName}_${version}_${archSuffix}.dmg`);

  if (!existsSync(appBundlePath)) {
    throw new Error(`Expected app bundle at ${appBundlePath}`);
  }

  mkdirSync(dmgDir, { recursive: true });
  rmSync(dmgOutputPath, { force: true });

  const stagingDir = mkdtempSync(path.join(os.tmpdir(), 'glance-ph-dmg-'));

  try {
    cpSync(appBundlePath, path.join(stagingDir, `${productName}.app`), { recursive: true });
    symlinkSync('/Applications', path.join(stagingDir, 'Applications'));

    const dmgResult = spawnSync(
      'hdiutil',
      [
        'create',
        '-volname',
        productName,
        '-srcfolder',
        stagingDir,
        '-ov',
        '-format',
        'UDZO',
        '-imagekey',
        'zlib-level=9',
        dmgOutputPath
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit'
      }
    );

    if (dmgResult.status !== 0) {
      throw new Error(`Custom DMG build failed with exit code ${dmgResult.status ?? 'unknown'}`);
    }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
