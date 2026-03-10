import fs from 'node:fs';
import path from 'node:path';

export function loadLocalBuildEnv(repoRoot) {
  const envFiles = ['.env.local', '.env.build'];

  envFiles.forEach((fileName) => {
    const filePath = path.join(repoRoot, fileName);
    if (!fs.existsSync(filePath)) {
      return;
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    parseEnvFile(contents).forEach(([key, value]) => {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  });
}

function parseEnvFile(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      return [key, value];
    })
    .filter(Boolean);
}
