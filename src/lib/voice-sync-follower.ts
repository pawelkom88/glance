/**
 * Voice Sync Script Follower & Word Matcher
 *
 * Matches incoming words from Speechmatics real-time transcription
 * against the teleprompter's script lines and words.
 */

import type { DisplayLine } from '../types';

export interface ScriptWord {
  readonly globalIndex: number;
  readonly text: string;
  readonly normalized: string;
  readonly lineIndex: number;
  readonly wordIndexInLine: number;
  readonly totalWordsInLine: number;
  readonly kind?: 'plain' | 'strong' | 'emphasis' | 'cue';
  readonly segmentId?: string;
}

export interface WordMatchEvent {
  readonly scriptWord: ScriptWord;
  readonly globalIndex: number;
  readonly lineIndex: number;
  readonly spokenWord: string;
  readonly isPartial: boolean;
}

export interface VoiceSyncFollowerOptions {
  readonly lines: readonly DisplayLine[];
  readonly onMatch: (event: WordMatchEvent) => void;
  readonly lookaheadWindowSize?: number;
}

export interface VoiceSyncFollower {
  readonly processSpokenWord: (word: string, isPartial?: boolean) => boolean;
  readonly setCursorToLine: (lineIndex: number) => void;
  readonly setCursorToWord: (globalWordIndex: number) => void;
  readonly getCursorIndex: () => number;
  readonly getScriptWords: () => readonly ScriptWord[];
  readonly reset: () => void;
}

export function normalizeWord(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\p{L}\p{N}]+/gu, '') // keep only letters and numbers
    .trim();
}

export function extractScriptWords(lines: readonly DisplayLine[]): ScriptWord[] {
  const words: ScriptWord[] = [];
  let globalIndex = 0;

  lines.forEach((line, lineIndex) => {
    if (line.kind === 'empty') {
      return;
    }

    const lineTokens: Array<{
      text: string;
      normalized: string;
      kind?: 'plain' | 'strong' | 'emphasis' | 'cue';
      segmentId?: string;
    }> = [];

    if (line.segments && line.segments.length > 0) {
      line.segments.forEach((seg) => {
        if (seg.kind === 'cue') {
          return;
        }
        const tokens = seg.text.split(/\s+/).filter(Boolean);
        tokens.forEach((t) => {
          const norm = normalizeWord(t);
          if (norm.length > 0) {
            lineTokens.push({ text: t, normalized: norm, kind: seg.kind, segmentId: seg.id });
          }
        });
      });
    } else {
      const cleanLineText = line.text.replace(/\*\*/g, '').replace(/_/g, '').replace(/\[[^\]]+\]/g, '');
      const tokens = cleanLineText.split(/\s+/).filter(Boolean);
      tokens.forEach((t) => {
        const norm = normalizeWord(t);
        if (norm.length > 0) {
          lineTokens.push({ text: t, normalized: norm, kind: 'plain' });
        }
      });
    }

    const speakableTokens = lineTokens.filter((item) => item.normalized.length > 0);
    const totalWordsInLine = speakableTokens.length;
    let wordIndexInLine = 0;

    lineTokens.forEach((item) => {
      words.push({
        globalIndex,
        text: item.text,
        normalized: item.normalized,
        lineIndex,
        wordIndexInLine,
        totalWordsInLine,
        kind: item.kind,
        segmentId: item.segmentId
      });
      globalIndex += 1;
      wordIndexInLine += 1;
    });
  });

  return words;
}

export function groupScriptWordsByLine(scriptWords: readonly ScriptWord[]): Map<number, ScriptWord[]> {
  const map = new Map<number, ScriptWord[]>();
  scriptWords.forEach((word) => {
    const list = map.get(word.lineIndex);
    if (list) {
      list.push(word);
    } else {
      map.set(word.lineIndex, [word]);
    }
  });
  return map;
}

export function groupScriptWordsBySegment(scriptWords: readonly ScriptWord[]): Map<string, ScriptWord[]> {
  const map = new Map<string, ScriptWord[]>();
  scriptWords.forEach((word) => {
    if (word.segmentId) {
      const list = map.get(word.segmentId);
      if (list) {
        list.push(word);
      } else {
        map.set(word.segmentId, [word]);
      }
    }
  });
  return map;
}

export function damerauLevenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i += 1) {
    d[i] = new Array<number>(n + 1).fill(0);
    d[i]![0] = i;
  }
  for (let j = 0; j <= n; j += 1) {
    d[0]![j] = j;
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1); // transposition
      }
    }
  }

  return d[m]![n]!;
}

const SHORT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'or', 'so',
  'that', 'the', 'to', 'too', 'up', 'we', 'with', 'you', 'your'
]);

/**
 * Calculates string similarity / match confidence:
 * 1. Exact match
 * 2. Shortcut and abbreviation aliases (e.g. "command" <-> "cmd", "escape" <-> "esc")
 * 3. Prefix match if length >= 4
 * 4. Damerau-Levenshtein edit distance <= 1 for words >= 4 chars, or <= 2 for words >= 7 chars
 */
export function areWordsMatching(spoken: string, expected: string): boolean {
  if (!spoken || !expected) return false;
  if (spoken === expected) return true;

  // Shortcut and technical aliases
  if ((spoken === 'command' || spoken === 'cmd') && (expected.startsWith('cmd') || expected.startsWith('command'))) {
    return true;
  }
  if ((spoken === 'control' || spoken === 'ctrl') && (expected.startsWith('ctrl') || expected.startsWith('control'))) {
    return true;
  }
  if ((spoken === 'option' || spoken === 'opt' || spoken === 'alt') && (expected.startsWith('opt') || expected.startsWith('alt'))) {
    return true;
  }
  if ((spoken === 'escape' || spoken === 'esc') && (expected.startsWith('esc') || expected.startsWith('escape'))) {
    return true;
  }
  if ((spoken === 'app' || spoken === 'application') && (expected === 'app' || expected === 'application')) {
    return true;
  }

  // Subword matches for compound shortcut tokens (e.g., spoken "up" for "cmdup" or "down" for "cmddown")
  if (expected.startsWith('cmd') && expected.length > 3) {
    const sub = expected.slice(3);
    if (spoken === sub) return true;
  }

  // Short words (<= 3 chars) MUST match exactly to avoid spurious matches
  if (spoken.length <= 3 || expected.length <= 3) {
    return false;
  }

  // Prefix matching for words >= 4 chars (e.g. "prompter" and "promp")
  if (spoken.length >= 4 && expected.startsWith(spoken)) return true;
  if (expected.length >= 4 && spoken.startsWith(expected)) return true;

  const minLen = Math.min(spoken.length, expected.length);
  if (minLen >= 4) {
    const dist = damerauLevenshteinDistance(spoken, expected);
    if (minLen <= 6 && dist <= 1) return true;
    if (minLen >= 7 && dist <= 2) return true;
  }

  return false;
}

export function createVoiceSyncFollower(options: VoiceSyncFollowerOptions): VoiceSyncFollower {
  const { lines, onMatch, lookaheadWindowSize = 6 } = options;
  const scriptWords = extractScriptWords(lines);
  let cursorIndex = 0;

  const setCursorToLine = (lineIndex: number) => {
    const foundIndex = scriptWords.findIndex((w) => w.lineIndex >= lineIndex);
    const prev = cursorIndex;
    cursorIndex = foundIndex >= 0 ? foundIndex : scriptWords.length - 1;
    cursorIndex = Math.max(0, cursorIndex);
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Cursor] 📍 Repositioned cursor to line ${lineIndex} (word index ${prev} -> ${cursorIndex}: "${scriptWords[cursorIndex]?.text ?? 'EOF'}")`);
  };

  const setCursorToWord = (globalWordIndex: number) => {
    cursorIndex = Math.max(0, Math.min(scriptWords.length - 1, globalWordIndex));
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Cursor] 📍 Set cursor to word ${cursorIndex}: "${scriptWords[cursorIndex]?.text ?? 'EOF'}"`);
  };

  const reset = () => {
    cursorIndex = 0;
    // eslint-disable-next-line no-console
    console.log('[VoiceSync:Cursor] 🔄 Reset cursor to start (word 0).');
  };

  const processSpokenWord = (rawSpokenWord: string, isPartial: boolean = false): boolean => {
    const spokenNormalized = normalizeWord(rawSpokenWord);
    if (!spokenNormalized || scriptWords.length === 0) {
      return false;
    }

    const isStopword = SHORT_STOPWORDS.has(spokenNormalized);
    // If it's a stopword, only allow matching within the next 2 words to prevent section leaping
    const effectiveWindow = isStopword ? 2 : Math.min(lookaheadWindowSize, 6);
    const windowEnd = Math.min(scriptWords.length, cursorIndex + effectiveWindow + 1);

    // 1. Check exact match at current cursor first
    const currentCandidate = scriptWords[cursorIndex];
    if (currentCandidate && (currentCandidate.normalized === spokenNormalized || currentCandidate.text.toLowerCase() === rawSpokenWord.toLowerCase())) {
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceSync:Match] 🎯 EXACT match at cursor [${cursorIndex}]: spoken="${rawSpokenWord}" == script="${currentCandidate.text}" (line ${currentCandidate.lineIndex}, word ${currentCandidate.wordIndexInLine + 1}/${currentCandidate.totalWordsInLine})`
      );
      cursorIndex += 1;
      onMatch({
        scriptWord: currentCandidate,
        globalIndex: currentCandidate.globalIndex,
        lineIndex: currentCandidate.lineIndex,
        spokenWord: rawSpokenWord,
        isPartial
      });
      return true;
    }

    // 2. Search within the constrained window
    for (let i = cursorIndex; i < windowEnd; i += 1) {
      const candidate = scriptWords[i];
      if (!candidate) continue;

      if (areWordsMatching(spokenNormalized, candidate.normalized)) {
        const skip = i - cursorIndex;
        if (skip > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceSync:Match] ⏩ Advanced +${skip} words: [${cursorIndex} -> ${i}]: spoken="${rawSpokenWord}" ~ script="${candidate.text}" (line ${candidate.lineIndex}, word ${candidate.wordIndexInLine + 1}/${candidate.totalWordsInLine})`
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceSync:Match] 🎯 Matched: spoken="${rawSpokenWord}" ~ script="${candidate.text}" (line ${candidate.lineIndex}, word ${candidate.wordIndexInLine + 1}/${candidate.totalWordsInLine})`
          );
        }
        cursorIndex = i + 1;
        onMatch({
          scriptWord: candidate,
          globalIndex: candidate.globalIndex,
          lineIndex: candidate.lineIndex,
          spokenWord: rawSpokenWord,
          isPartial
        });
        return true;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[VoiceSync:Miss] ❌ No match: spoken="${rawSpokenWord}" (normalized="${spokenNormalized}", cursor=${cursorIndex}, window=[${cursorIndex}..${windowEnd - 1}], expected="${scriptWords[cursorIndex]?.text ?? 'EOF'}")`
    );
    return false;
  };

  return {
    processSpokenWord,
    setCursorToLine,
    setCursorToWord,
    getCursorIndex: () => cursorIndex,
    getScriptWords: () => scriptWords,
    reset
  };
}
