import type { FontChoice } from '../types';

export interface FontOption {
  readonly id: FontChoice;
  readonly label: string;
  readonly fontFamily: string;
}

export const FONT_STACKS: Record<FontChoice, string> = {
  inter: "'Inter Variable', 'Inter', 'Segoe UI', sans-serif",
  commissioner: "'Commissioner Variable', 'Commissioner', sans-serif",
  lexend: "'Lexend Variable', 'Lexend', sans-serif",
  atkinson: "'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible Next', sans-serif"
};

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    fontFamily: FONT_STACKS.inter
  },
  {
    id: 'commissioner',
    label: 'Commissioner',
    fontFamily: FONT_STACKS.commissioner
  },
  {
    id: 'lexend',
    label: 'Lexend',
    fontFamily: FONT_STACKS.lexend
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    fontFamily: FONT_STACKS.atkinson
  }
];

export function applyFontToDocument(font: FontChoice): void {
  if (typeof document === 'undefined') {
    return;
  }
  const stack = FONT_STACKS[font] ?? FONT_STACKS.inter;
  document.documentElement.style.setProperty('--font-body', stack);
  document.documentElement.setAttribute('data-font', font);
}
