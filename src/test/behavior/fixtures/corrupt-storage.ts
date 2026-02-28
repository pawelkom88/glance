export function seedCorruptStorage(): void {
  window.localStorage.setItem('glance-overlay-state-v1', '{bad-json');
  window.localStorage.setItem('glance-overlay-timer-prefs-v1', '{bad-json');
  window.localStorage.setItem(`glance-shortcuts-${navigator.platform.toLowerCase()}`, '{bad-json');
}
