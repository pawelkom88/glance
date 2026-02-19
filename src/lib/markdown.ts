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

export function markdownToDisplayLines(markdown: string): readonly DisplayLine[] {
  return markdown
    .split('\n')
    .map((line, lineIndex) => {
      if (line.startsWith('# ')) {
        return {
          id: `heading-${lineIndex}`,
          kind: 'heading' as const,
          text: line.replace(/^#\s+/, '')
        };
      }

      if (line.startsWith('- ')) {
        return {
          id: `bullet-${lineIndex}`,
          kind: 'bullet' as const,
          text: line.replace(/^-+\s*/, '')
        };
      }

      if (line.trim().length === 0) {
        return {
          id: `empty-${lineIndex}`,
          kind: 'empty' as const,
          text: ''
        };
      }

      return {
        id: `text-${lineIndex}`,
        kind: 'text' as const,
        text: line
      };
    });
}
