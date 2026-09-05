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

    it('attaches segmentId to words and ignores cue segments for matching', () => {
      const lines: DisplayLine[] = [
        {
          id: '1',
          kind: 'text',
          text: 'Welcome [pause] everyone',
          sectionIndex: 0,
          segments: [
            { id: 'seg-1', kind: 'plain', text: 'Welcome ' },
            { id: 'seg-2', kind: 'cue', text: 'pause' },
            { id: 'seg-3', kind: 'plain', text: ' everyone' }
          ]
        }
      ];

      const words = extractScriptWords(lines);
      expect(words.length).toBe(2);
      expect(words[0]?.text).toBe('Welcome');
      expect(words[0]?.segmentId).toBe('seg-1');
      expect(words[1]?.text).toBe('everyone');
      expect(words[1]?.segmentId).toBe('seg-3');
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

    it('does not jump ahead when a common word is repeated within adjacent sentences', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'We are excited to share this project with you.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Our goal is to make your workflow faster.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // Words in line 1:
      // [0] We, [1] are, [2] excited, [3] to, [4] share, [5] this, [6] project, [7] with, [8] you.
      // Words in line 2:
      // [9] Our, [10] goal, [11] is, [12] to, [13] make, [14] your, [15] workflow, [16] faster.

      // Speak words up to "to"
      expect(follower.processSpokenWord('We')).toBe(true);
      expect(follower.processSpokenWord('are')).toBe(true);
      expect(follower.processSpokenWord('excited')).toBe(true);
      expect(follower.processSpokenWord('to')).toBe(true);
      expect(follower.getCursorIndex()).toBe(4); // cursor at "share"

      // Speaker stumbles or repeats "to"
      follower.processSpokenWord('to');
      // Cursor must NOT jump ahead to line 2 word 12 ("to")
      expect(follower.getCursorIndex()).toBe(4);

      // Now speaker continues with expected word "share"
      expect(follower.processSpokenWord('share')).toBe(true);
      expect(follower.getCursorIndex()).toBe(5);
    });

    it('absorbs repeated keywords without jumping ahead to later occurrences', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'This video introduces video editing features.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Every video project starts here.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] This, [1] video, [2] introduces, [3] video, [4] editing, [5] features.
      // [6] Every, [7] video, [8] project, [9] starts, [10] here.

      expect(follower.processSpokenWord('This')).toBe(true);
      expect(follower.processSpokenWord('video')).toBe(true);
      expect(follower.getCursorIndex()).toBe(2); // cursor at "introduces"

      // Speaker stutters or repeats "video"
      follower.processSpokenWord('video');
      // Must not jump ahead to index 3 or index 7
      expect(follower.getCursorIndex()).toBe(2);

      // Next expected word matches cleanly
      expect(follower.processSpokenWord('introduces')).toBe(true);
      expect(follower.getCursorIndex()).toBe(3);

      // Next is the second "video" at index 3
      expect(follower.processSpokenWord('video')).toBe(true);
      expect(follower.getCursorIndex()).toBe(4);
    });

    it('requires multi-word sequence confirmation before jumping ahead over repeated words', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'We will review the first draft today.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Later we will discuss the next steps.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] We, [1] will, [2] review, [3] the, [4] first, [5] draft, [6] today.
      // [7] Later, [8] we, [9] will, [10] discuss, [11] the, [12] next, [13] steps.

      // Follower is at "review" (index 2)
      expect(follower.processSpokenWord('We')).toBe(true);
      expect(follower.processSpokenWord('will')).toBe(true);
      expect(follower.getCursorIndex()).toBe(2);

      // Speaker skips ahead to line 2 and speaks "we" (repeated word at index 8)
      // Single word "we" must not immediately jump across to line 2!
      expect(follower.processSpokenWord('we')).toBe(false);
      expect(follower.getCursorIndex()).toBe(2);

      // Speaker confirms jump by speaking the next consecutive word "will" (index 9)
      expect(follower.processSpokenWord('will')).toBe(true);
      // Now skip is confirmed: cursor advances to index 10 ("discuss")
      expect(follower.getCursorIndex()).toBe(10);
      expect(matches[matches.length - 1]?.scriptWord.text).toBe('will');
      expect(matches[matches.length - 1]?.globalIndex).toBe(9);
    });

    it('strongly prefers immediate next word (distance = 0) over future occurrences', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'Go to the store and go to the park.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] Go, [1] to, [2] the, [3] store, [4] and, [5] go, [6] to, [7] the, [8] park.

      expect(follower.processSpokenWord('Go')).toBe(true);
      expect(follower.getCursorIndex()).toBe(1);

      expect(follower.processSpokenWord('to')).toBe(true);
      expect(follower.getCursorIndex()).toBe(2);

      expect(follower.processSpokenWord('the')).toBe(true);
      expect(follower.getCursorIndex()).toBe(3);

      expect(follower.processSpokenWord('store')).toBe(true);
      expect(follower.getCursorIndex()).toBe(4);

      expect(follower.processSpokenWord('and')).toBe(true);
      expect(follower.getCursorIndex()).toBe(5);

      // Next expected is [5] "go". It must match [5], not jump to anything else.
      expect(follower.processSpokenWord('go')).toBe(true);
      expect(follower.getCursorIndex()).toBe(6);

      // Next expected is [6] "to". It must match [6] at distance 0.
      expect(follower.processSpokenWord('to')).toBe(true);
      expect(follower.getCursorIndex()).toBe(7);

      expect(follower.processSpokenWord('the')).toBe(true);
      expect(follower.getCursorIndex()).toBe(8);

      expect(follower.processSpokenWord('park')).toBe(true);
      expect(follower.getCursorIndex()).toBe(9);
    });

    it('handles partial transcript updates and finalizations without advancing past identical words', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'Press the button and click the icon.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] Press, [1] the, [2] button, [3] and, [4] click, [5] the, [6] icon.

      // Speechmatics sends partial "Press"
      expect(follower.processSpokenWord('Press', true)).toBe(true);
      expect(follower.getCursorIndex()).toBe(1);

      // Speechmatics sends final "Press"
      expect(follower.processSpokenWord('Press', false)).toBe(true);
      expect(follower.getCursorIndex()).toBe(1); // cursor must stay at 1!

      // Speechmatics sends partial "the"
      expect(follower.processSpokenWord('the', true)).toBe(true);
      expect(follower.getCursorIndex()).toBe(2);

      // Speechmatics sends final "the"
      expect(follower.processSpokenWord('the', false)).toBe(true);
      expect(follower.getCursorIndex()).toBe(2); // must NOT jump to index 5 "the"!

      // Continues with "button"
      expect(follower.processSpokenWord('button', false)).toBe(true);
      expect(follower.getCursorIndex()).toBe(3);
    });

    it('does not jump ahead when real-time streaming re-emits partial clauses across sentences with shared words', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'We will review the first draft today.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'We will discuss the next steps tomorrow.', sectionIndex: 1 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // Partial 1: ["We"]
      expect(follower.processSpokenWord('We', true)).toBe(true);
      expect(follower.getCursorIndex()).toBe(1);

      // Partial 2: ["We", "will"]
      follower.processSpokenWord('We', true);
      expect(follower.processSpokenWord('will', true)).toBe(true);
      expect(follower.getCursorIndex()).toBe(2);

      // Partial 3: ["We", "will", "review"]
      follower.processSpokenWord('We', true);
      follower.processSpokenWord('will', true);
      expect(follower.processSpokenWord('review', true)).toBe(true);
      // The follower must be at word index 3 ("the") on line 1, NOT jumped to line 2 (index 9)!
      expect(follower.getCursorIndex()).toBe(3);
      expect(matches[matches.length - 1]?.lineIndex).toBe(0);
      expect(matches[matches.length - 1]?.scriptWord.text).toBe('review');

      // Now Speechmatics finalizes the utterance with AddTranscript:
      follower.processSpokenWord('We', false);
      follower.processSpokenWord('will', false);
      follower.processSpokenWord('review', false);
      expect(follower.getCursorIndex()).toBe(3);
      expect(matches[matches.length - 1]?.lineIndex).toBe(0);
    });

    it('prefers closer exact candidate with distance penalization over distant identical tokens', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'Click the red button and press the blue button now.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] Click, [1] the, [2] red, [3] button, [4] and, [5] press, [6] the, [7] blue, [8] button, [9] now.
      expect(follower.processSpokenWord('Click')).toBe(true);
      expect(follower.processSpokenWord('the')).toBe(true);
      expect(follower.getCursorIndex()).toBe(2); // cursor at "red"

      // Speaker drops "red" and speaks "button" (which exists at index 3 and index 8)
      // Closer index 3 must be selected for tentative skip (distance 1 vs distance 6)
      expect(follower.processSpokenWord('button')).toBe(false);
      expect(follower.getPendingSkip?.()?.targetIndex).toBe(3);

      // Subsequent word "and" confirms the closer skip
      expect(follower.processSpokenWord('and')).toBe(true);
      expect(follower.getCursorIndex()).toBe(5); // cursor at "press"
      expect(matches[matches.length - 1]?.scriptWord.text).toBe('and');
    });

    it('handles content words repeated 3+ times across multiple lines without leaping ahead', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'This presentation shows new presentation techniques.', sectionIndex: 0 },
        { id: '2', kind: 'text', text: 'Our presentation template helps every presenter.', sectionIndex: 1 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] This, [1] presentation, [2] shows, [3] new, [4] presentation, [5] techniques.
      // [6] Our, [7] presentation, [8] template, [9] helps, [10] every, [11] presenter.

      expect(follower.processSpokenWord('This')).toBe(true);
      expect(follower.processSpokenWord('presentation')).toBe(true);
      expect(follower.getCursorIndex()).toBe(2); // cursor at "shows"

      // Speaker repeats "presentation" (repetition/hesitation)
      follower.processSpokenWord('presentation');
      expect(follower.getCursorIndex()).toBe(2); // must NOT jump to 4 or 7!

      expect(follower.processSpokenWord('shows')).toBe(true);
      expect(follower.processSpokenWord('new')).toBe(true);
      expect(follower.getCursorIndex()).toBe(4); // cursor at 4 ("presentation")

      // Matches second "presentation" on line 1 at distance 0
      expect(follower.processSpokenWord('presentation')).toBe(true);
      expect(follower.getCursorIndex()).toBe(5); // cursor at "techniques"
      expect(matches[matches.length - 1]?.lineIndex).toBe(0);
      expect(matches[matches.length - 1]?.globalIndex).toBe(4);

      expect(follower.processSpokenWord('techniques')).toBe(true);
      expect(follower.getCursorIndex()).toBe(6); // cursor moves to line 2
    });

    it('does not advance prematurely when partial transcript re-emits a word that matches upcoming cursor', () => {
      const lines: DisplayLine[] = [
        { id: '1', kind: 'text', text: 'It is what it is.', sectionIndex: 0 }
      ];

      const matches: WordMatchEvent[] = [];
      const follower = createVoiceSyncFollower({
        lines,
        onMatch: (m) => matches.push(m)
      });

      // [0] It, [1] is, [2] what, [3] it, [4] is.

      // Partial 1: ["It"]
      follower.processSpokenWord('It', true);
      expect(follower.getCursorIndex()).toBe(1);

      // Partial 2: ["It", "is"]
      follower.processSpokenWord('It', true);
      follower.processSpokenWord('is', true);
      expect(follower.getCursorIndex()).toBe(2);

      // Partial 3: ["It", "is", "what"]
      follower.processSpokenWord('It', true);
      follower.processSpokenWord('is', true);
      follower.processSpokenWord('what', true);
      expect(follower.getCursorIndex()).toBe(3); // cursor at index 3 ("it")

      // Now speaker says the 4th word: "... it"
      // Speechmatics emits: ["It", "is", "what", "it"]
      // When word 0 ("It") is processed, cursor is at 3 ("it").
      // Word 0 is from the START of the clause, NOT the newly spoken word at index 3!
      follower.processSpokenWord('It', true);
      // If cursor jumped to 4 here, it prematurely matched word 0 against index 3!
      expect(follower.getCursorIndex()).toBe(3);
    });
  });
});
