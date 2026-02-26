import { describe, expect, it } from 'vitest';
import { markdownToDisplayLines, parseMarkdown } from './markdown';

describe('markdown parsing', () => {
  it('returns missing-h1 warning when no headings exist', () => {
    const parsed = parseMarkdown('Plain text only\n\n- bullet');

    expect(parsed.sections).toHaveLength(0);
    expect(parsed.warnings).toEqual([
      {
        code: 'missing-h1',
        message: 'No H1 headings found. Add at least one `# Heading` to launch the prompter.'
      }
    ]);
  });

  it('reports duplicate heading with line index', () => {
    const parsed = parseMarkdown('# Intro\n\n# Intro');

    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-heading',
          lineIndex: 2
        })
      ])
    );
  });

  it('reports hotkey limitation for more than 9 headings', () => {
    const markdown = Array.from({ length: 10 }, (_, index) => `# Section ${index + 1}`).join('\n');

    const parsed = parseMarkdown(markdown);

    expect(parsed.sections).toHaveLength(10);
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'hotkeys-limited'
        })
      ])
    );
    expect(parsed.sections[8]?.hotkeyIndex).toBe(9);
    expect(parsed.sections[9]?.hotkeyIndex).toBeNull();
  });
});

describe('display line generation', () => {
  it('trims leading and trailing empty lines while keeping section mapping', () => {
    const lines = markdownToDisplayLines('\n\n# Intro\nBody\n\n# Next\nMore\n\n');

    expect(lines[0]?.kind).toBe('heading');
    expect(lines[0]?.sectionIndex).toBe(0);
    expect(lines[1]?.kind).toBe('text');
    expect(lines[1]?.sectionIndex).toBe(0);
    expect(lines.find((line) => line.text === 'Next')?.sectionIndex).toBe(1);
    expect(lines[lines.length - 1]?.kind).not.toBe('empty');
  });

  it('parses inline strong, emphasis and cue segments', () => {
    const [line] = markdownToDisplayLines('Hello **bold** _italics_ [slow down]');

    expect(line?.segments?.map((segment) => segment.kind)).toEqual([
      'plain',
      'strong',
      'plain',
      'emphasis',
      'plain',
      'cue'
    ]);
    expect(line?.segments?.find((segment) => segment.kind === 'cue')?.text).toBe('slow down');
  });

  it('wraps deterministically with width measurement constraints', () => {
    const lines = markdownToDisplayLines('alpha beta gamma delta', {
      maxLineWidthPx: 55,
      measureText: (value) => value.length * 10
    });

    expect(lines.map((line) => line.text)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });
});
