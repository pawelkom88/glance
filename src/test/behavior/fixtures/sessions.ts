import type { SessionMeta, SessionSummary } from '../../../types';

export const validSessionSummary: SessionSummary = {
  id: 'session-valid',
  title: 'Quarterly Script',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  lastOpenedAt: '2025-01-01T00:00:00Z',
  folderId: null,
  wordCount: 120
};

export const validMarkdown = '# Intro\n\nWelcome\n\n# Agenda\n\nPoint one';
export const invalidMarkdown = 'Just plain text without headings';

export const restoredMeta: SessionMeta = {
  id: 'session-valid',
  title: 'Quarterly Script',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  lastOpenedAt: '2025-01-02T00:00:00Z',
  scroll: {
    position: 270,
    speed: 1.35,
    running: true
  },
  overlay: {
    fontScale: 1.25,
    showReadingRuler: false
  },
  folderId: null,
  wordCount: 120
};
