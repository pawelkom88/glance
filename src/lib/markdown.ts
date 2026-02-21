import type {
  DisplayLine,
  DisplaySegment,
  ParseWarning,
  ParsedMarkdown,
  SectionItem
} from '../types';

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

interface DisplayLineOptions {
  readonly maxCharsPerLine?: number;
  readonly maxLineWidthPx?: number;
  readonly measureText?: (text: string) => number;
}

function wrapWordsByChars(text: string, maxChars: number): string[] {
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

function wrapWordsByMeasurement(text: string, maxLineWidthPx: number, measureText: (text: string) => number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0 || measureText(trimmed) <= maxLineWidthPx) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (current.length > 0 && measureText(candidate) > maxLineWidthPx) {
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

function parseInlineSegments(text: string, lineId: string): readonly DisplaySegment[] {
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\])/g;
  const segments: DisplaySegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = null;
  let segmentIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({
        id: `${lineId}-segment-${segmentIndex}`,
        kind: 'plain',
        text: text.slice(cursor, match.index)
      });
      segmentIndex += 1;
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({
        id: `${lineId}-segment-${segmentIndex}`,
        kind: 'strong',
        text: token.slice(2, -2)
      });
    } else if (token.startsWith('_') && token.endsWith('_')) {
      segments.push({
        id: `${lineId}-segment-${segmentIndex}`,
        kind: 'emphasis',
        text: token.slice(1, -1)
      });
    } else {
      const cueValue = token.slice(1, -1).trim();
      const cue = cueValue.length > 0 ? cueValue : 'cue';
      segments.push({
        id: `${lineId}-segment-${segmentIndex}`,
        kind: 'cue',
        text: cue
      });
    }

    segmentIndex += 1;
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    segments.push({
      id: `${lineId}-segment-${segmentIndex}`,
      kind: 'plain',
      text: text.slice(cursor)
    });
  }

  if (segments.length === 0) {
    return [{ id: `${lineId}-segment-0`, kind: 'plain', text }];
  }

  return segments;
}

export function markdownToDisplayLines(markdown: string, options?: DisplayLineOptions): readonly DisplayLine[] {
  const output: DisplayLine[] = [];
  const maxChars = options?.maxCharsPerLine ?? 56;
  const maxLineWidthPx = options?.maxLineWidthPx ?? null;
  const measureText = options?.measureText;
  let currentSectionIndex: number | null = null;
  let sectionCursor = 0;
  const wrap = (text: string): string[] => {
    if (maxLineWidthPx && measureText) {
      return wrapWordsByMeasurement(text, maxLineWidthPx, measureText);
    }
    return wrapWordsByChars(text, maxChars);
  };

  markdown.split('\n').forEach((line, lineIndex) => {
    if (line.startsWith('# ')) {
      const headingText = line.replace(/^#\s+/, '').trim();
      const headingId = `heading-${lineIndex}`;
      output.push({
        id: headingId,
        kind: 'heading',
        text: headingText,
        sectionIndex: sectionCursor,
        segments: parseInlineSegments(headingText, headingId)
      });
      currentSectionIndex = sectionCursor;
      sectionCursor += 1;
      return;
    }

    if (line.startsWith('- ')) {
      const cleaned = line.replace(/^-+\s*/, '').trim();
      const wrapped = wrap(cleaned);
      wrapped.forEach((wrappedLine, wrappedIndex) => {
        const lineId = `bullet-${lineIndex}-${wrappedIndex}`;
        output.push({
          id: lineId,
          kind: wrappedIndex === 0 ? 'bullet' : 'text',
          text: wrappedLine,
          sectionIndex: currentSectionIndex,
          segments: wrapped.length === 1 ? parseInlineSegments(wrappedLine, lineId) : undefined
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
        text: '',
        sectionIndex: currentSectionIndex
      });
      return;
    }

    const wrapped = wrap(line.trim());
    wrapped.forEach((wrappedLine, wrappedIndex) => {
      const lineId = `text-${lineIndex}-${wrappedIndex}`;
      output.push({
        id: lineId,
        kind: 'text',
        text: wrappedLine,
        sectionIndex: currentSectionIndex,
        segments: wrapped.length === 1 ? parseInlineSegments(wrappedLine, lineId) : undefined
      });
    });
  });

  while (output[0]?.kind === 'empty') {
    output.shift();
  }

  while (output[output.length - 1]?.kind === 'empty') {
    output.pop();
  }

  return output;
}
