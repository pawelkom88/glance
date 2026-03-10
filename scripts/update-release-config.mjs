import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const packageJsonPath = path.join(repoRoot, 'package.json');
const releaseConfigPath = path.join(repoRoot, 'landing-page/assets/release-config.js');
const updaterManifestPath = path.join(repoRoot, 'landing-page/update.json');

const githubRepo = 'https://github.com/pawelkom88/glance/releases/download';
const updaterDownloadBase = 'https://atglance.app/downloads';
const defaultWorkerBaseUrl = 'https://glance-payments.paulus-react.workers.dev';

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const options = parseArgs(process.argv.slice(2));
  const versionTag = normalizeVersion(options.version || packageJson.version);
  const versionNumber = versionTag.slice(1);
  const artifactBaseName = `Glance_${versionNumber}`;
  const workerBaseUrl = options.workerBaseUrl || defaultWorkerBaseUrl;

  await writeReleaseConfig({
    versionTag,
    versionNumber,
    artifactBaseName,
    workerBaseUrl,
  });
  await writeUpdaterManifest({
    versionNumber,
    artifactBaseName,
    notes: options.notes,
    pubDate: options.pubDate,
  });

  process.stdout.write(
    `Updated release config for ${versionTag}\n` +
    `- ${relativeToRepo(releaseConfigPath)}\n` +
    `- ${relativeToRepo(updaterManifestPath)}\n`
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
  versionTag,
  versionNumber,
  artifactBaseName,
  workerBaseUrl,
}) {
  const nextContents = `window.__GLANCE_RELEASE__ = {
  version: '${versionTag}',
  windowsLabel: '${versionTag} · 64-bit',
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
