import type { AppLanguage, LanguageOption } from './types';

export const languageOptions = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    localeTag: 'en'
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    localeTag: 'es'
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    localeTag: 'fr'
  },
  {
    code: 'pl',
    englishName: 'Polish',
    nativeName: 'Polski',
    localeTag: 'pl'
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    localeTag: 'de'
  }
] as const satisfies readonly LanguageOption[];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'fr' || value === 'es' || value === 'pl' || value === 'de';
}

export function getLanguageOption(language: AppLanguage): LanguageOption {
  return languageOptions.find((option) => option.code === language) ?? languageOptions[0];
}

export function toLanguageOptionLabel(option: LanguageOption): string {
  return `${option.englishName} — ${option.nativeName} (${option.localeTag})`;
}
