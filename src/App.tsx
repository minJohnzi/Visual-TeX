import React, { useEffect } from 'react';
import { BookOpen, History, Keyboard, Languages, Moon, Sun } from 'lucide-react';
import { parseFormulaFromLocation } from './core/export/urlShare';
import { BlockWorkspace } from './components/editor/BlockWorkspace';
import { ExportModal } from './components/ExportModal';
import { FormulaPreview } from './components/FormulaPreview';
import { ExamplesModal } from './components/modals/ExamplesModal';
import { HelpModal } from './components/modals/HelpModal';
import { HistoryModal } from './components/modals/HistoryModal';
import { ToastContainer } from './components/modals/ToastContainer';
import { SymbolPalette } from './components/SymbolPalette';
import { useI18n } from './i18n/context';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const { t, toggleLang } = useI18n();
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const applyRestoredDocument = useAppStore((s) => s.applyRestoredDocument);
  const pushToast = useAppStore((s) => s.pushToast);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const restored = parseFormulaFromLocation(window.location);
    if (restored) {
      applyRestoredDocument(restored);
      pushToast(t.toastUrlRestored, 'info');
    }
    // Run once on initial startup to restore shared URL hash if present
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const { modals } = useAppStore.getState();
        if (modals.export) setModalOpen('export', false);
        else if (modals.examples) setModalOpen('examples', false);
        else if (modals.history) setModalOpen('history', false);
        else if (modals.help) setModalOpen('help', false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setModalOpen]);

  return (
    <div className="app-shell">
      <header className="app-navbar">
        <div className="navbar-inner">
          <div className="brand-group">
            <div className="brand-logo" aria-hidden="true">
              ∑
            </div>
            <div>
              <h1 className="brand-title">{t.appName}</h1>
              <p className="brand-subtitle">{t.appSubtitle}</p>
            </div>
          </div>

          <nav className="nav-actions" aria-label="Main navigation">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModalOpen('examples', true)}
              title={t.navExamples}
              aria-label={t.navExamples}
            >
              <BookOpen size={14} />
              <span className="nav-btn-label">{t.navExamples}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModalOpen('history', true)}
              title={t.navHistory}
              aria-label={t.navHistory}
            >
              <History size={14} />
              <span className="nav-btn-label">{t.navHistory}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setModalOpen('help', true)}
              title={t.navHelp}
              aria-label={t.navHelp}
            >
              <Keyboard size={14} />
              <span className="nav-btn-label">{t.navHelp}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={toggleLang}
              aria-label="Toggle language"
            >
              <Languages size={14} />
              <span>{t.navLang}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={toggleTheme}
              title={theme === 'light' ? t.themeToDark : t.themeToLight}
              aria-label={theme === 'light' ? t.themeToDark : t.themeToLight}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <SymbolPalette />
        <div className="workspace-grid">
          <BlockWorkspace />
          <FormulaPreview />
        </div>
      </main>

      <ExamplesModal />
      <HistoryModal />
      <HelpModal />
      <ExportModal />
      <ToastContainer />
    </div>
  );
}
