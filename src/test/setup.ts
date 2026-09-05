import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
    isTauri: () => true,
}));

vi.mock('@tauri-apps/api/window', () => ({
    availableMonitors: vi.fn().mockResolvedValue([
        {
            name: 'Test Monitor',
            size: { width: 1920, height: 1080 },
            position: { x: 0, y: 0 },
            scaleFactor: 1,
            workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }
        }
    ]),
    currentMonitor: vi.fn().mockResolvedValue({
        name: 'Test Monitor',
        size: { width: 1920, height: 1080 },
        position: { x: 0, y: 0 },
        scaleFactor: 1,
        workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }
    }),
    primaryMonitor: vi.fn().mockResolvedValue({
        name: 'Test Monitor',
        size: { width: 1920, height: 1080 },
        position: { x: 0, y: 0 },
        scaleFactor: 1,
        workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }
    }),
    getCurrentWindow: () => ({
        isFocused: vi.fn().mockResolvedValue(true),
        outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
        outerSize: vi.fn().mockResolvedValue({ width: 1120, height: 400 }),
        currentMonitor: vi.fn().mockResolvedValue({
            size: { width: 1920, height: 1080 },
            position: { x: 0, y: 0 },
            scaleFactor: 1,
            name: 'Test Monitor',
        }),
        onMoved: vi.fn().mockResolvedValue(() => { }),
        onResized: vi.fn().mockResolvedValue(() => { }),
        onFocusChanged: vi.fn().mockResolvedValue(() => { }),
        setPosition: vi.fn().mockResolvedValue(undefined),
        setFocus: vi.fn().mockResolvedValue(undefined),
    }),
}));

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock local storage bounds
const storage = new Map<string, string>();
const localStorageMock: Storage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => { storage.clear(); },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; }
};

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true
    });
}

window.localStorage.setItem('glance-shortcuts-mac', '{}');

