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
            <a
              href="https://github.com/minJohnzi/Visual-TeX"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
              title={t.navGithub}
              aria-label={t.navGithub}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
              </svg>
              <span className="nav-btn-label">GitHub</span>
            </a>
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
