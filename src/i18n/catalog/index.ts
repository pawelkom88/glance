import type { AppLanguage, TranslationCatalog } from '../types';
import { enCatalog } from './en';
import { esCatalog } from './es';
import { frCatalog } from './fr';
import { plCatalog } from './pl';
import { deCatalog } from './de';

export const translationCatalogs: Record<AppLanguage, TranslationCatalog> = {
  en: enCatalog,
  es: esCatalog,
  fr: frCatalog,
  pl: plCatalog,
  de: deCatalog
};

export const defaultTranslationCatalog = enCatalog;
