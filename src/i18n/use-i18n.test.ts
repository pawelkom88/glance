import { afterEach, describe, expect, it, vi } from 'vitest';
import { enCatalog } from './catalog/en';
import { esCatalog } from './catalog/es';
import { frCatalog } from './catalog/fr';
import { plCatalog } from './catalog/pl';
import { deCatalog } from './catalog/de';
import { translateForLanguage } from './use-i18n';
import type { TranslationKey } from './types';

describe('use-i18n translation behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns value from selected language when key exists', () => {
    expect(
      translateForLanguage({
        language: 'fr',
        key: 'settings.general.interfaceLanguageLabel'
      })
    ).toBe('Langue de l’interface');

    expect(
      translateForLanguage({
        language: 'es',
        key: 'settings.general.interfaceLanguageLabel'
      })
    ).toBe(esCatalog.settings.general.interfaceLanguageLabel);

    expect(
      translateForLanguage({
        language: 'pl',
        key: 'settings.general.interfaceLanguageLabel'
      })
    ).toBe(plCatalog.settings.general.interfaceLanguageLabel);

    expect(
      translateForLanguage({
        language: 'de',
        key: 'settings.general.interfaceLanguageLabel'
      })
    ).toBe(deCatalog.settings.general.interfaceLanguageLabel);
  });

  it('falls back to english when selected language key is missing', () => {
    const mutableFr = frCatalog as unknown as {
      settings: { general: Record<string, string | undefined> };
    };
    const originalValue = mutableFr.settings.general.interfaceLanguageHint;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    delete mutableFr.settings.general.interfaceLanguageHint;
    try {
      const translated = translateForLanguage({
        language: 'fr',
        key: 'settings.general.interfaceLanguageHint'
      });
      expect(translated).toBe(enCatalog.settings.general.interfaceLanguageHint);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      mutableFr.settings.general.interfaceLanguageHint = originalValue;
    }
  });

  it('returns key when translation is missing in both selected and fallback catalogs', () => {
    const missingKey = 'settings.general.__missing_key__' as unknown as TranslationKey;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const translated = translateForLanguage({
      language: 'en',
      key: missingKey
    });

    expect(translated).toBe(missingKey);
    expect(warnSpy).toHaveBeenCalled();
  });
});
