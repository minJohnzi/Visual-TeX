import React, { createContext, useCallback, useContext, useState } from 'react';
import { STORAGE_KEYS } from '../store/persistence';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { Language, Translations } from './types';

interface I18nContextValue {
  lang: Language;
  t: Translations;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lang);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Ignore storage read errors
  }
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEYS.lang, nextLang);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next: Language = prev === 'zh' ? 'en' : 'zh';
      try {
        localStorage.setItem(STORAGE_KEYS.lang, next);
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const t = lang === 'zh' ? zh : en;

  return (
    <I18nContext.Provider value={{ lang, t, setLang, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
