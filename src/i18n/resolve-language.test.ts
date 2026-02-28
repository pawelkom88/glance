import { describe, expect, it } from 'vitest';
import {
  detectSystemLanguage,
  normalizeStoredLanguage,
  resolveLanguage,
  resolveLanguageFromLocale
} from './resolve-language';

function setNavigatorLanguages(primary: string, languages: readonly string[] = [primary]): void {
  Object.defineProperty(window.navigator, 'language', {
    value: primary,
    configurable: true
  });
  Object.defineProperty(window.navigator, 'languages', {
    value: [...languages],
    configurable: true
  });
}

describe('resolve-language', () => {
  it('maps locale variants to supported languages', () => {
    expect(resolveLanguageFromLocale('fr-CA')).toBe('fr');
    expect(resolveLanguageFromLocale('fr')).toBe('fr');
    expect(resolveLanguageFromLocale('es-ES')).toBe('es');
    expect(resolveLanguageFromLocale('es')).toBe('es');
    expect(resolveLanguageFromLocale('pl-PL')).toBe('pl');
    expect(resolveLanguageFromLocale('pl')).toBe('pl');
    expect(resolveLanguageFromLocale('de-DE')).toBe('de');
    expect(resolveLanguageFromLocale('de')).toBe('de');
    expect(resolveLanguageFromLocale('en-US')).toBe('en');
    expect(resolveLanguageFromLocale(undefined)).toBe('en');
  });

  it('detects preferred language from navigator list', () => {
    setNavigatorLanguages('en-US', ['en-US', 'fr-FR']);
    expect(detectSystemLanguage()).toBe('fr');

    setNavigatorLanguages('es-ES', ['es-ES']);
    expect(detectSystemLanguage()).toBe('es');
  });

  it('normalizes persisted language values', () => {
    expect(normalizeStoredLanguage('en')).toBe('en');
    expect(normalizeStoredLanguage('fr')).toBe('fr');
    expect(normalizeStoredLanguage('es')).toBe('es');
    expect(normalizeStoredLanguage('pl')).toBe('pl');
    expect(normalizeStoredLanguage('de')).toBe('de');
    expect(normalizeStoredLanguage(null)).toBeNull();
  });

  it('resolves app language as a supported runtime language', () => {
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage('es')).toBe('es');
    expect(resolveLanguage('pl')).toBe('pl');
    expect(resolveLanguage('de')).toBe('de');
  });
});
