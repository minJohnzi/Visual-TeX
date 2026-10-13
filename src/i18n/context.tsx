import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Language, Translations } from './types';
import { zh } from './locales/zh';
import { en } from './locales/en';

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
  isZh: boolean;
}

const STORAGE_LANG_KEY = 'app_lang';

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    if (saved === 'zh' || saved === 'en') {
      return saved;
    }
  } catch {
    // ignore
  }

  if (typeof navigator !== 'undefined') {
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('zh')) {
      return 'zh';
    }
  }

  return 'zh';
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_LANG_KEY, nextLang);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang === 'zh' ? 'zh-CN' : 'en';
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  }, [lang, setLang]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    }
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang,
      toggleLang,
      t: lang === 'zh' ? zh : en,
      isZh: lang === 'zh',
    };
  }, [lang, setLang, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
