import { useAppStore } from '../store/use-app-store';
import { defaultTranslationCatalog, translationCatalogs } from './catalog';
import type { ResolvedLanguage, TranslationCatalog, TranslationKey, TranslationKeyParams } from './types';

const warnedMessages = new Set<string>();
const isDevelopment = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

function readTranslationValue(catalog: TranslationCatalog, key: TranslationKey): unknown {
  return key
    .split('.')
    .reduce<unknown>((value, segment) => {
      if (!value || typeof value !== 'object') {
        return undefined;
      }

      const nextValue = (value as Record<string, unknown>)[segment];
      return nextValue;
    }, catalog);
}

function warnMissingTranslation(message: string): void {
  if (!isDevelopment || warnedMessages.has(message)) {
    return;
  }

  warnedMessages.add(message);
  console.warn(message);
}

export function translateForLanguage<K extends TranslationKey>(options: {
  readonly language: ResolvedLanguage;
  readonly key: K;
  readonly params?: TranslationKeyParams<K>;
}): string {
  const { language, key, params } = options;
  const selectedCatalog = translationCatalogs[language];
  const selectedValue = readTranslationValue(selectedCatalog, key);

  if (selectedValue !== undefined) {
    return typeof selectedValue === 'function'
      ? (selectedValue as (input?: TranslationKeyParams<K>) => string)(params)
      : String(selectedValue);
  }

  const fallbackValue = readTranslationValue(defaultTranslationCatalog, key);
  if (fallbackValue !== undefined) {
    warnMissingTranslation(`[i18n] Missing "${key}" in "${language}". Falling back to English.`);
    return typeof fallbackValue === 'function'
      ? (fallbackValue as (input?: TranslationKeyParams<K>) => string)(params)
      : String(fallbackValue);
  }

  warnMissingTranslation(`[i18n] Missing translation key "${key}" in both "${language}" and "en".`);
  return key;
}

export function useI18n() {
  const resolvedLanguage = useAppStore((state) => state.resolvedLanguage);

  const t = <K extends TranslationKey>(key: K, params?: TranslationKeyParams<K>): string => {
    return translateForLanguage({ language: resolvedLanguage, key, params });
  };

  return {
    language: resolvedLanguage,
    t
  };
}
