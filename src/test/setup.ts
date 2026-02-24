import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
    isTauri: () => true,
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
        onFocusChanged: vi.fn().mockResolvedValue(() => { }),
    }),
}));

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock local storage bounds
window.localStorage.setItem('glance-shortcuts-mac', '{}');
