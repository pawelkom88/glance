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

export const SHORT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'in', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'or', 'so',
  'that', 'the', 'to', 'too', 'up', 'we', 'with', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'my', 'me', 'our', 'us',
  'who', 'whom', 'which', 'what', 'where', 'when', 'why', 'how',
  'this', 'these', 'those', 'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'do', 'does', 'did', 'have', 'has', 'had',
  'if', 'then', 'else', 'but', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'into', 'over', 'after', 'before', 'there', 'here',
  'now', 'was', 'were', 'been', 'being', 'also', 'just',
  'go', 'get', 'got', 'see', 'saw', 'make', 'made', 'take', 'took', 'come', 'came',
  'like', 'good', 'new', 'well', 'out', 'back', 'very', 'only', 'much', 'about',
  'down', 'way', 'first', 'even', 'one', 'two', 'part', 'time'
]);

/**
 * Determines whether a candidate script word is a repeated or high-risk skip token:
 * 1. Is a common stopword or function word
 * 2. Short token (<= 3 chars) with high acoustic collision rate
 * 3. Appeared recently in script history (within last 20 words)
 * 4. Appears multiple times in the upcoming context window (next 40 words)
 */
export function isRepeatedOrHighRiskToken(
  candidate: ScriptWord,
  cursorIndex: number,
  scriptWords: readonly ScriptWord[]
): boolean {
  const norm = candidate.normalized;

  if (SHORT_STOPWORDS.has(norm)) {
    return true;
  }

  if (norm.length <= 3) {
    return true;
  }

  const historyStart = Math.max(0, cursorIndex - 20);
  for (let h = historyStart; h < cursorIndex; h += 1) {
    if (scriptWords[h]?.normalized === norm) {
      return true;
    }
  }

  const lookaheadBoundary = Math.min(scriptWords.length, cursorIndex + 40);
  let upcomingCount = 0;
  for (let f = cursorIndex; f < lookaheadBoundary; f += 1) {
    if (scriptWords[f]?.normalized === norm) {
      upcomingCount += 1;
      if (upcomingCount > 1) {
        return true;
      }
    }
  }

  return false;
}

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

interface PendingSkip {
  readonly targetIndex: number;
  readonly spokenWord: string;
  readonly isPartial: boolean;
}

export function createVoiceSyncFollower(options: VoiceSyncFollowerOptions): VoiceSyncFollower & { readonly getPendingSkip?: () => PendingSkip | null } {
  const { lines, onMatch, lookaheadWindowSize = 6 } = options;
  const scriptWords = extractScriptWords(lines);
  let cursorIndex = 0;
  let lastMatchedIsPartial: boolean = false;
  let pendingSkip: PendingSkip | null = null;
  let matchedInClause: number[] = [];
  let clauseReplayIndex = 0;

  const setCursorToLine = (lineIndex: number) => {
    const foundIndex = scriptWords.findIndex((w) => w.lineIndex >= lineIndex);
    const prev = cursorIndex;
    cursorIndex = foundIndex >= 0 ? foundIndex : Math.max(0, scriptWords.length - 1);
    cursorIndex = Math.max(0, cursorIndex);
    lastMatchedIsPartial = false;
    pendingSkip = null;
    matchedInClause = [];
    clauseReplayIndex = 0;
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Cursor] 📍 Repositioned cursor to line ${lineIndex} (word index ${prev} -> ${cursorIndex}: "${scriptWords[cursorIndex]?.text ?? 'EOF'}")`);
  };

  const setCursorToWord = (globalWordIndex: number) => {
    cursorIndex = Math.max(0, Math.min(scriptWords.length - 1, globalWordIndex));
    lastMatchedIsPartial = false;
    pendingSkip = null;
    matchedInClause = [];
    clauseReplayIndex = 0;
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Cursor] 📍 Set cursor to word ${cursorIndex}: "${scriptWords[cursorIndex]?.text ?? 'EOF'}"`);
  };

  const reset = () => {
    cursorIndex = 0;
    lastMatchedIsPartial = false;
    pendingSkip = null;
    matchedInClause = [];
    clauseReplayIndex = 0;
    // eslint-disable-next-line no-console
    console.log('[VoiceSync:Cursor] 🔄 Reset cursor to start (word 0).');
  };

  const processSpokenWord = (rawSpokenWord: string, isPartial: boolean = false): boolean => {
    const spokenNormalized = normalizeWord(rawSpokenWord);
    if (!spokenNormalized || scriptWords.length === 0) {
      return false;
    }

    if (cursorIndex >= scriptWords.length) {
      return false;
    }

    // 1. CLAUSE REPLAY ABSORPTION (Speechmatics streaming re-emits partials or finalizes ongoing partial clause from start):
    const isClauseStream = (isPartial || lastMatchedIsPartial) && matchedInClause.length > 0;
    if (isClauseStream) {
      if (clauseReplayIndex === 0) {
        const firstIdx = matchedInClause[0]!;
        const firstWord = scriptWords[firstIdx];
        if (
          firstWord &&
          (firstWord.normalized === spokenNormalized ||
            firstWord.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
            areWordsMatching(spokenNormalized, firstWord.normalized))
        ) {
          clauseReplayIndex = 1;
          pendingSkip = null;
          if (clauseReplayIndex >= matchedInClause.length && !isPartial) {
            matchedInClause = [];
            clauseReplayIndex = 0;
            lastMatchedIsPartial = false;
          }
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceSync:Repeat] 🔄 Replaying clause start at word [${firstIdx}] "${firstWord.text}" (cursor remains at ${cursorIndex})`
          );
          return true;
        }
      } else if (clauseReplayIndex < matchedInClause.length) {
        const expectedIdx = matchedInClause[clauseReplayIndex]!;
        const expectedWord = scriptWords[expectedIdx];
        if (
          expectedWord &&
          (expectedWord.normalized === spokenNormalized ||
            expectedWord.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
            areWordsMatching(spokenNormalized, expectedWord.normalized))
        ) {
          clauseReplayIndex += 1;
          pendingSkip = null;
          if (clauseReplayIndex >= matchedInClause.length && !isPartial) {
            matchedInClause = [];
            clauseReplayIndex = 0;
            lastMatchedIsPartial = false;
          }
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceSync:Repeat] 🔄 Replaying clause word [${expectedIdx}] "${expectedWord.text}" (${clauseReplayIndex}/${matchedInClause.length}, cursor remains at ${cursorIndex})`
          );
          return true;
        }
        // Replay diverged
        clauseReplayIndex = 0;
        if (!isPartial) {
          matchedInClause = [];
          lastMatchedIsPartial = false;
        }
      }
    }

    // 2. CHECK PENDING SKIP CONFIRMATION:
    if (pendingSkip) {
      const confirmedIndex = pendingSkip.targetIndex + 1;
      if (confirmedIndex < scriptWords.length) {
        const nextCandidate = scriptWords[confirmedIndex];
        if (
          nextCandidate &&
          (nextCandidate.normalized === spokenNormalized ||
            nextCandidate.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
            areWordsMatching(spokenNormalized, nextCandidate.normalized))
        ) {
          const firstWord = scriptWords[pendingSkip.targetIndex]!;
          const secondWord = nextCandidate;
          const savedSkip = pendingSkip;
          pendingSkip = null;

          cursorIndex = secondWord.globalIndex + 1;
          lastMatchedIsPartial = isPartial;
          clauseReplayIndex = 0;
          matchedInClause = isPartial ? [firstWord.globalIndex, secondWord.globalIndex] : [];

          // eslint-disable-next-line no-console
          console.log(
            `[VoiceSync:Match] ⏩ CONFIRMED multi-word skip to [${savedSkip.targetIndex}..${confirmedIndex}]: "${savedSkip.spokenWord} ${rawSpokenWord}" -> script="${firstWord.text} ${secondWord.text}" (cursor -> ${cursorIndex})`
          );

          onMatch({
            scriptWord: firstWord,
            globalIndex: firstWord.globalIndex,
            lineIndex: firstWord.lineIndex,
            spokenWord: savedSkip.spokenWord,
            isPartial: savedSkip.isPartial
          });

          onMatch({
            scriptWord: secondWord,
            globalIndex: secondWord.globalIndex,
            lineIndex: secondWord.lineIndex,
            spokenWord: rawSpokenWord,
            isPartial
          });

          return true;
        }
      }

      const pendingTargetWord = scriptWords[pendingSkip.targetIndex];
      if (
        pendingTargetWord &&
        (pendingTargetWord.normalized === spokenNormalized ||
          pendingTargetWord.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
          areWordsMatching(spokenNormalized, pendingTargetWord.normalized))
      ) {
        pendingSkip = {
          targetIndex: pendingSkip.targetIndex,
          spokenWord: rawSpokenWord,
          isPartial
        };
        return false;
      }

      pendingSkip = null;
    }

    // 3. IMMEDIATE PREVIOUS WORD REPETITION (stutter/hesitation):
    if (cursorIndex > 0) {
      const prevWord = scriptWords[cursorIndex - 1];
      if (
        prevWord &&
        (prevWord.normalized === spokenNormalized ||
          prevWord.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
          areWordsMatching(spokenNormalized, prevWord.normalized))
      ) {
        pendingSkip = null;
        // eslint-disable-next-line no-console
        console.log(
          `[VoiceSync:Repeat] 🔄 Absorbed immediate repetition of word [${cursorIndex - 1}] "${prevWord.text}" (cursor remains at ${cursorIndex})`
        );
        return true;
      }
    }

    // 4. HIGHEST PRIORITY (distance = 0): Immediate match at current cursor
    const currentCandidate = scriptWords[cursorIndex];
    if (
      currentCandidate &&
      (currentCandidate.normalized === spokenNormalized ||
        currentCandidate.text.toLowerCase() === rawSpokenWord.toLowerCase() ||
        areWordsMatching(spokenNormalized, currentCandidate.normalized))
    ) {
      pendingSkip = null;
      lastMatchedIsPartial = isPartial;
      const matchedIdx = cursorIndex;
      cursorIndex += 1;
      clauseReplayIndex = 0;
      if (isPartial) {
        matchedInClause.push(matchedIdx);
        if (matchedInClause.length > 20) {
          matchedInClause.shift();
        }
      } else {
        matchedInClause = [];
      }
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceSync:Match] 🎯 EXACT/IMMEDIATE match at cursor [${cursorIndex - 1}]: spoken="${rawSpokenWord}" == script="${currentCandidate.text}" (line ${currentCandidate.lineIndex}, word ${currentCandidate.wordIndexInLine + 1}/${currentCandidate.totalWordsInLine})`
      );
      onMatch({
        scriptWord: currentCandidate,
        globalIndex: currentCandidate.globalIndex,
        lineIndex: currentCandidate.lineIndex,
        spokenWord: rawSpokenWord,
        isPartial
      });
      return true;
    }

    // 5. LOOKAHEAD SEARCH WITHIN CONSTRAINED WINDOW:
    // Partial transcripts must NEVER initiate speculative lookahead skips across unread text.
    if (isPartial) {
      return false;
    }

    const windowEnd = Math.min(scriptWords.length, cursorIndex + lookaheadWindowSize + 1);

    let matchedIndex = -1;
    let bestScore = -Infinity;

    for (let i = cursorIndex + 1; i < windowEnd; i += 1) {
      const candidate = scriptWords[i];
      if (!candidate) continue;

      const isExact =
        candidate.normalized === spokenNormalized ||
        candidate.text.toLowerCase() === rawSpokenWord.toLowerCase();
      const isFuzzy = !isExact && areWordsMatching(spokenNormalized, candidate.normalized);

      if (isExact || isFuzzy) {
        const quality = isExact ? 1.0 : 0.7;
        const dist = i - cursorIndex;
        const score = quality - dist * 0.05;

        if (score > bestScore) {
          bestScore = score;
          matchedIndex = i;
        }
      }
    }

    if (matchedIndex >= 0) {
      const candidate = scriptWords[matchedIndex]!;
      const distance = matchedIndex - cursorIndex;
      const isHighRisk = isRepeatedOrHighRiskToken(candidate, cursorIndex, scriptWords);

      if (isHighRisk || distance >= 4) {
        // High-risk skip (repeated token, stopword, or large distance >= 4):
        // Hold as tentative skip awaiting consecutive sequence confirmation!
        pendingSkip = {
          targetIndex: matchedIndex,
          spokenWord: rawSpokenWord,
          isPartial
        };
        // eslint-disable-next-line no-console
        console.log(
          `[VoiceSync:SkipHold] ⏳ Tentative skip to repeated/high-risk word at [${matchedIndex}] ("${candidate.text}", dist +${distance}). Awaiting consecutive confirmation.`
        );
        return false;
      }

      // Safe, unique, non-repeated keyword skip at distance 1:
      cursorIndex = matchedIndex + 1;
      lastMatchedIsPartial = isPartial;
      clauseReplayIndex = 0;
      matchedInClause = isPartial ? [candidate.globalIndex] : [];
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceSync:Match] ⏩ Advanced +${distance} words: [${cursorIndex - 1 - distance} -> ${matchedIndex}]: spoken="${rawSpokenWord}" ~ script="${candidate.text}" (line ${candidate.lineIndex}, word ${candidate.wordIndexInLine + 1}/${candidate.totalWordsInLine})`
      );
      onMatch({
        scriptWord: candidate,
        globalIndex: candidate.globalIndex,
        lineIndex: candidate.lineIndex,
        spokenWord: rawSpokenWord,
        isPartial
      });
      return true;
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
    getPendingSkip: () => pendingSkip,
    reset
  };
}
