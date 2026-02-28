import { isAppLanguage } from './languages';
import type { AppLanguage, ResolvedLanguage } from './types';

export function resolveLanguage(language: AppLanguage): ResolvedLanguage {
  return language;
}

export function resolveLanguageFromLocale(locale: string | null | undefined): ResolvedLanguage {
  const normalized = (locale ?? '').trim().toLowerCase();
  if (normalized.startsWith('es')) {
    return 'es';
  }

  if (normalized.startsWith('fr')) {
    return 'fr';
  }

  if (normalized.startsWith('pl')) {
    return 'pl';
  }

  if (normalized.startsWith('de')) {
    return 'de';
  }

  return 'en';
}

export function detectSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === 'undefined') {
    return 'en';
  }

  const preferredLocales = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const locale of preferredLocales) {
    const resolved = resolveLanguageFromLocale(locale);
    if (resolved !== 'en') {
      return resolved;
    }
  }

  return 'en';
}

export function normalizeStoredLanguage(value: string | null): AppLanguage | null {
  if (!value) {
    return null;
  }

  return isAppLanguage(value) ? value : null;
}
