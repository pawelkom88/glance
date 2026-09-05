import { describe, expect, it } from 'vitest';
import {
  areWordsMatching,
  createVoiceSyncFollower,
  extractScriptWords,
  normalizeWord,
  type WordMatchEvent
} from './voice-sync-follower';
import type { DisplayLine } from '../types';

describe('voice-sync-follower', () => {
  describe('normalizeWord', () => {
    it('lowercases and removes punctuation', () => {
      expect(normalizeWord('Hello,')).toBe('hello');
      expect(normalizeWord('"World!"')).toBe('world');
      expect(normalizeWord("don't")).toBe('dont');
      expect(normalizeWord('tele-prompter')).toBe('teleprompter');
      expect(normalizeWord('Crème')).toBe('creme');
    });
  });

  describe('areWordsMatching', () => {
    it('matches identical words', () => {
      expect(areWordsMatching('hello', 'hello')).toBe(true);
    });

    it('matches prefix matches of sufficient length', () => {
      expect(areWordsMatching('presentation', 'present')).toBe(true);
      expect(areWordsMatching('present', 'presentation')).toBe(true);
    });

    it('matches minor single edit distance', () => {
      expect(areWordsMatching('glance', 'glanec')).toBe(true);
      expect(areWordsMatching('teleprompter', 'telepromter')).toBe(true);
    });

    it('does not match completely distinct words', () => {
      expect(areWordsMatching('cat', 'dog')).toBe(false);
      expect(areWordsMatching('welcome', 'goodbye')).toBe(false);
    });
  });

  describe('extractScriptWords', () => {
    it('extracts words with line numbers and positions', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'heading', text: '# Introduction', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Welcome to Glance teleprompter.', sectionIndex: 0 },
        { id: '3', kind: 'empty', text: '', sectionIndex: 0 }
      ];

      const words = extractScriptWords(lines);
      expect(words.length).toBe(5);
      expect(words[0]?.text).toBe('Introduction');
      expect(words[0]?.lineIndex).toBe(0);
      expect(words[1]?.text).toBe('Welcome');
      expect(words[1]?.lineIndex).toBe(1);
      expect(words[4]?.text).toBe('teleprompter.');
      expect(words[4]?.normalized).toBe('teleprompter');
    });
  });

  describe('createVoiceSyncFollower', () => {
    it('progressively matches spoken words in order', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'Welcome everyone to this live demo of Glance.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'We are glad you joined us today.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      expect(follower.processSpokenWord('Welcome')).toBe(true);
      expect(matches.length).toBe(1);
      expect(matches[0]?.scriptWord.text).toBe('Welcome');
      expect(follower.getCursorIndex()).toBe(1);

      // Spoken filler word not in script should be ignored
      expect(follower.processSpokenWord('um')).toBe(false);
      expect(matches.length).toBe(1);

      // Next word in script matches
      expect(follower.processSpokenWord('everyone')).toBe(true);
      expect(matches.length).toBe(2);
      expect(matches[1]?.scriptWord.text).toBe('everyone');
      expect(follower.getCursorIndex()).toBe(2);
    });

    it('handles skipping ahead within lookahead window', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'First second third fourth fifth sixth.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // Speaker jumps to "fourth"
      expect(follower.processSpokenWord('fourth')).toBe(true);
      expect(matches.length).toBe(1);
      expect(matches[0]?.scriptWord.text).toBe('fourth');
      expect(follower.getCursorIndex()).toBe(4);
    });

    it('repositions cursor when setCursorToLine or reset is called', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'Line one words here.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Line two words start.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      follower.setCursorToLine(1);
      expect(follower.getCursorIndex()).toBe(4); // "Line" on line 2

      follower.reset();
      expect(follower.getCursorIndex()).toBe(0);
    });
  });
});
