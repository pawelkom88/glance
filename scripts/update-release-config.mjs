import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const packageJsonPath = path.join(repoRoot, 'package.json');

const githubRepo = 'https://github.com/pawelkom88/glance/releases/download';
const updaterDownloadBase = 'https://atglance.app/downloads';
const defaultWorkerBaseUrl = 'https://glance-payments.paulus-react.workers.dev';
const channelConfig = {
  paid: {
    releaseConfigPath: path.join(repoRoot, 'landing-page/assets/release-config.js'),
    updaterManifestPath: path.join(repoRoot, 'landing-page/update.json'),
    artifactBaseName: (versionNumber) => `Glance_${versionNumber}`,
    windowsLabel: (versionTag) => `${versionTag} · 64-bit`,
    globalName: 'window.__GLANCE_RELEASE__',
  },
  product_hunt: {
    releaseConfigPath: path.join(repoRoot, 'landing-page/assets/release-config-ph.js'),
    updaterManifestPath: path.join(repoRoot, 'landing-page/update-ph.json'),
    artifactBaseName: (versionNumber) => `Glance_Trial_${versionNumber}`,
    windowsLabel: (versionTag) => `${versionTag} · Trial · 64-bit`,
    globalName: 'window.__GLANCE_RELEASE_PH__',
  }
};

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const options = parseArgs(process.argv.slice(2));
  const channel = options.channel || 'paid';
  const selectedConfig = channelConfig[channel];
  if (!selectedConfig) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }
  const versionTag = normalizeVersion(options.version || packageJson.version);
  const versionNumber = versionTag.slice(1);
  const artifactBaseName = selectedConfig.artifactBaseName(versionNumber);
  const workerBaseUrl = options.workerBaseUrl || defaultWorkerBaseUrl;

  await writeReleaseConfig({
    releaseConfigPath: selectedConfig.releaseConfigPath,
    versionTag,
    artifactBaseName,
    workerBaseUrl,
    windowsLabel: selectedConfig.windowsLabel(versionTag),
    globalName: selectedConfig.globalName,
  });
  await writeUpdaterManifest({
    updaterManifestPath: selectedConfig.updaterManifestPath,
    versionNumber,
    artifactBaseName,
    notes: options.notes,
    pubDate: options.pubDate,
  });

  process.stdout.write(
    `Updated release config for ${versionTag}\n` +
    `- ${relativeToRepo(selectedConfig.releaseConfigPath)}\n` +
    `- ${relativeToRepo(selectedConfig.updaterManifestPath)}\n`
  );
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--version' && value) {
      options.version = value;
      index += 1;
      continue;
    }

    if (arg === '--worker-base-url' && value) {
      options.workerBaseUrl = value;
      index += 1;
      continue;
    }

    if (arg === '--notes' && value) {
      options.notes = value;
      index += 1;
      continue;
    }

    if (arg === '--channel' && value) {
      options.channel = value;
      index += 1;
      continue;
    }

    if (arg === '--pub-date' && value) {
      options.pubDate = value;
      index += 1;
    }
  }

  return options;
}

function normalizeVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('A version is required. Pass --version vX.Y.Z or set package.json version.');
  }

  return raw.startsWith('v') ? raw : `v${raw}`;
}

async function writeReleaseConfig({
  releaseConfigPath,
  versionTag,
  artifactBaseName,
  workerBaseUrl,
  windowsLabel,
  globalName,
}) {
  const nextContents = `${globalName} = {
  version: '${versionTag}',
  windowsLabel: '${windowsLabel}',
  artifactBaseName: '${artifactBaseName}',
  workerBaseUrl: '${workerBaseUrl}',
  downloads: {
    windows: '${githubRepo}/${versionTag}/${artifactBaseName}_x64-setup.exe',
    macArm: '${githubRepo}/${versionTag}/${artifactBaseName}_aarch64.dmg',
    macIntel: '${githubRepo}/${versionTag}/${artifactBaseName}_x64.dmg',
  },
};
`;

  await fs.writeFile(releaseConfigPath, nextContents, 'utf8');
}

async function writeUpdaterManifest({
  updaterManifestPath,
  versionNumber,
  artifactBaseName,
  notes,
  pubDate,
}) {
  const existing = JSON.parse(await fs.readFile(updaterManifestPath, 'utf8'));
  const nextManifest = {
    ...existing,
    version: versionNumber,
    notes: notes || existing.notes,
    pub_date: pubDate || existing.pub_date,
    platforms: {
      ...existing.platforms,
      'darwin-aarch64': {
        ...existing.platforms['darwin-aarch64'],
        url: `${updaterDownloadBase}/${artifactBaseName}_aarch64.tar.gz`,
      },
      'windows-x86_64': {
        ...existing.platforms['windows-x86_64'],
        url: `${updaterDownloadBase}/${artifactBaseName}_x64_en-US.msi.zip`,
      },
    },
  };

  await fs.writeFile(
    updaterManifestPath,
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    'utf8'
  );
}

function relativeToRepo(targetPath) {
  return path.relative(repoRoot, targetPath);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
