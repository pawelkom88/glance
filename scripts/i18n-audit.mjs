#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');
const targetRoots = [path.join(srcDir, 'components'), path.join(srcDir, 'App.tsx')];
const strictMode = process.argv.includes('--strict');

function walkFiles(startPath, predicate) {
  const results = [];
  const stat = statSync(startPath);

  if (stat.isFile()) {
    if (predicate(startPath)) {
      results.push(startPath);
    }
    return results;
  }

  for (const entry of readdirSync(startPath)) {
    const fullPath = path.join(startPath, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      results.push(...walkFiles(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function shouldKeepLiteral(value) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^[A-Za-z]+$/.test(trimmed) && trimmed.length <= 2) return false;
  if (trimmed.includes('=>')) return false;
  if (/[;{}]/.test(trimmed)) return false;
  if (/\b(import|export|const|let|return|from)\b/.test(trimmed)) return false;
  return true;
}

function extractJsxTextLiterals(source) {
  const matches = [];
  const textRegex = />([^<>{}]+)</g;
  let match;
  while ((match = textRegex.exec(source)) !== null) {
    const value = normalizeWhitespace(match[1]);
    if (!shouldKeepLiteral(value)) {
      continue;
    }
    matches.push({
      value,
      index: match.index
    });
  }
  return matches;
}

function extractAttributeLiterals(source) {
  const matches = [];
  const attrRegex = /\b(aria-label|title|placeholder|alt)\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  let match;
  while ((match = attrRegex.exec(source)) !== null) {
    const value = normalizeWhitespace(match[2] ?? match[3] ?? '');
    if (!shouldKeepLiteral(value)) {
      continue;
    }
    matches.push({
      value,
      index: match.index
    });
  }
  return matches;
}

function indexToLine(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function collectUiFiles() {
  const filePredicate = (filePath) => {
    const posixPath = toPosixPath(filePath);
    if (!posixPath.endsWith('.tsx')) return false;
    if (posixPath.endsWith('.test.tsx')) return false;
    return true;
  };

  const files = [];
  for (const root of targetRoots) {
    files.push(...walkFiles(root, filePredicate));
  }

  return files;
}

function extractCatalogKeys(source) {
  const lines = source.split('\n');
  const pathStack = [];
  const keys = [];

  for (const line of lines) {
    const keyMatch = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.+)$/);
    if (!keyMatch) {
      continue;
    }

    const indent = keyMatch[1].length;
    const key = keyMatch[2];
    const rhs = keyMatch[3].trim();

    while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
      pathStack.pop();
    }

    if (rhs === '{') {
      pathStack.push({ key, indent });
      continue;
    }

    if (rhs.startsWith("'") || rhs.startsWith('"')) {
      const fullPath = [...pathStack.map((entry) => entry.key), key].join('.');
      keys.push(fullPath);
    }
  }

  return keys;
}

function collectReferencedI18nKeys() {
  const files = walkFiles(srcDir, (filePath) => {
    const posixPath = toPosixPath(filePath);
    if (!(posixPath.endsWith('.ts') || posixPath.endsWith('.tsx'))) {
      return false;
    }
    if (posixPath.endsWith('.test.ts') || posixPath.endsWith('.test.tsx')) {
      return false;
    }
    return true;
  });

  const keys = new Set();
  const tCallRegex = /\bt\(\s*['"]([^'"]+)['"]/g;
  const explicitKeyRegex = /\bkey\s*:\s*['"]([^'"]+)['"]/g;

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');

    let match;
    while ((match = tCallRegex.exec(source)) !== null) {
      keys.add(match[1]);
    }

    while ((match = explicitKeyRegex.exec(source)) !== null) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function main() {
  const uiFiles = collectUiFiles();
  const literals = [];
  const perFileCounts = new Map();

  for (const filePath of uiFiles) {
    const source = readFileSync(filePath, 'utf8');
    const fileLiterals = [
      ...extractJsxTextLiterals(source),
      ...extractAttributeLiterals(source)
    ];

    for (const literal of fileLiterals) {
      const line = indexToLine(source, literal.index);
      literals.push({
        filePath,
        line,
        value: literal.value
      });
    }

    if (fileLiterals.length > 0) {
      perFileCounts.set(filePath, fileLiterals.length);
    }
  }

  const uniqueLiterals = new Map();
  for (const entry of literals) {
    if (!uniqueLiterals.has(entry.value)) {
      uniqueLiterals.set(entry.value, entry);
    }
  }

  const enCatalogSource = readFileSync(path.join(srcDir, 'i18n', 'catalog', 'en.ts'), 'utf8');
  const enCatalogKeys = extractCatalogKeys(enCatalogSource);
  const referencedI18nKeys = collectReferencedI18nKeys();

  console.log('i18n coverage audit');
  console.log(`- English catalog keys: ${enCatalogKeys.length}`);
  console.log(`- Referenced i18n keys in runtime code: ${referencedI18nKeys.size}`);
  console.log(`- Runtime UI files scanned: ${uiFiles.length}`);
  console.log(`- Hardcoded UI literal instances: ${literals.length}`);
  console.log(`- Hardcoded UI unique literals: ${uniqueLiterals.size}`);

  const topFiles = [...perFileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topFiles.length > 0) {
    console.log('- Top files with hardcoded UI literals:');
    for (const [filePath, count] of topFiles) {
      const rel = path.relative(rootDir, filePath);
      console.log(`  - ${rel}: ${count}`);
    }
  }

  if (uniqueLiterals.size > 0) {
    console.log('- Sample literals to migrate (first 30):');
    const sample = [...uniqueLiterals.values()].slice(0, 30);
    for (const entry of sample) {
      const rel = path.relative(rootDir, entry.filePath);
      console.log(`  - ${rel}:${entry.line} :: ${entry.value}`);
    }
  }

  if (strictMode && uniqueLiterals.size > 0) {
    process.exit(1);
  }
}

main();
