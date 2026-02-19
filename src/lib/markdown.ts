import type { DisplayLine, ParseWarning, ParsedMarkdown, SectionItem } from '../types';

const headingPattern = /^#\s+(.+)$/;

export function parseMarkdown(markdown: string): ParsedMarkdown {
  const lines = markdown.split('\n');
  const sections: SectionItem[] = [];
  const warnings: ParseWarning[] = [];
  const headingOccurrences = new Map<string, number>();

  lines.forEach((line, lineIndex) => {
    const match = line.match(headingPattern);
    if (!match) {
      return;
    }

    const title = match[1].trim();
    const normalized = title.toLowerCase();
    const seenCount = headingOccurrences.get(normalized) ?? 0;
    headingOccurrences.set(normalized, seenCount + 1);

    if (seenCount > 0) {
      warnings.push({
        code: 'duplicate-heading',
        message: `Duplicate heading "${title}" found. Section labels may be ambiguous.`,
        lineIndex
      });
    }

    sections.push({
      id: `${lineIndex}-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      hotkeyIndex: null,
      lineIndex
    });
  });

  const finalizedSections = sections.map((section, index) => ({
    ...section,
    hotkeyIndex: index < 9 ? index + 1 : null
  }));

  if (finalizedSections.length === 0) {
    warnings.push({
      code: 'missing-h1',
      message: 'No H1 headings found. Add at least one `# Heading` to launch the prompter.'
    });
  }

  if (finalizedSections.length > 9) {
    warnings.push({
      code: 'hotkeys-limited',
      message: 'Only the first 9 sections receive global hotkeys.'
    });
  }

  return {
    sections: finalizedSections,
    warnings
  };
}

export function parseSections(markdown: string): readonly SectionItem[] {
  return parseMarkdown(markdown).sections;
}

function wrapWords(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

export function markdownToDisplayLines(markdown: string): readonly DisplayLine[] {
  const output: DisplayLine[] = [];
  const maxChars = 56;

  markdown.split('\n').forEach((line, lineIndex) => {
    if (line.startsWith('# ')) {
      output.push({
        id: `heading-${lineIndex}`,
        kind: 'heading',
        text: line.replace(/^#\s+/, '').trim()
      });
      return;
    }

    if (line.startsWith('- ')) {
      const wrapped = wrapWords(line.replace(/^-+\s*/, ''), maxChars);
      wrapped.forEach((wrappedLine, wrappedIndex) => {
        output.push({
          id: `bullet-${lineIndex}-${wrappedIndex}`,
          kind: wrappedIndex === 0 ? 'bullet' : 'text',
          text: wrappedLine
        });
      });
      return;
    }

    if (line.trim().length === 0) {
      const previous = output[output.length - 1];
      if (previous?.kind === 'empty') {
        return;
      }
      output.push({
        id: `empty-${lineIndex}`,
        kind: 'empty',
        text: ''
      });
      return;
    }

    const wrapped = wrapWords(line, maxChars);
    wrapped.forEach((wrappedLine, wrappedIndex) => {
      output.push({
        id: `text-${lineIndex}-${wrappedIndex}`,
        kind: 'text',
        text: wrappedLine
      });
    });
  });

  return output;
}
