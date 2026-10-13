import React, { useState, useEffect, useRef, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import { SymbolPalette } from './components/SymbolPalette';
import { FormulaEditor, type FormulaEditorHandle } from './components/FormulaEditor';
import { FormulaPreview } from './components/FormulaPreview';
import { CLASSIC_FORMULAS, type PaletteItem, type ClassicFormula } from './data/symbols';
import { stripOuterMathDelimiters } from './utils/latex';
import { useI18n } from './i18n/context';

const STORAGE_KEYS = {
  CODE: 'latex_formula_code',
  THEME: 'latex_formula_theme',
  HISTORY: 'latex_formula_history',
};

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function App() {
  const { lang, toggleLang, t, isZh } = useI18n();

  const [code, setCode] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE) || String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
    } catch {
      return String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [saveStatusVisible, setSaveStatusVisible] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Modals
  const [showExamplesModal, setShowExamplesModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  const editorRef = useRef<FormulaEditorHandle | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  // 初始化主题
  useEffect(() => {
    let initialTheme: 'light' | 'dark' = 'dark';
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored === 'light' || stored === 'dark') {
        initialTheme = stored;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        initialTheme = 'light';
      }
    } catch {
      // ignore
    }
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_KEYS.THEME, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Toast 消息
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  // 自动保存与通知
  const notifySaved = useCallback(() => {
    setSaveStatusVisible(true);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaveStatusVisible(false);
    }, 2200);
  }, []);

  // 保存代码
  const handleCodeChange = useCallback(
    (newVal: string) => {
      setCode(newVal);
      try {
        localStorage.setItem(STORAGE_KEYS.CODE, newVal);
        // 添加到本地历史
        if (newVal.trim().length >= 3) {
          const trimmed = newVal.trim();
          let list: string[] = [];
          try {
            list = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
          } catch {
            list = [];
          }
          list = list.filter((item) => item !== trimmed);
          list.unshift(trimmed);
          if (list.length > 25) list = list.slice(0, 25);
          localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
        }
      } catch {
        // ignore
      }
      notifySaved();
    },
    [notifySaved]
  );

  // 符号面板点选插入
  const handleSelectPaletteItem = useCallback((item: PaletteItem) => {
    if (editorRef.current) {
      editorRef.current.insertTemplate(item);
    }
  }, []);

  // 下载独立单文件 index.html
  const handleDownloadSingleHtml = useCallback(() => {
    const { cleaned } = stripOuterMathDelimiters(code);
    const safeTitle =
      cleaned
        .slice(0, 20)
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'formula';

    const htmlContent = `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LaTeX Formula - ${safeTitle}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 36px 28px;
      max-width: 860px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      text-align: center;
      box-sizing: border-box;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 9999px;
      padding: 2px 10px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 17px;
      color: #e2e8f0;
      margin: 0 0 12px 0;
      font-weight: 600;
    }
    .math-stage {
      font-size: 2.25rem;
      margin: 28px 0;
      overflow-x: auto;
      padding: 20px 10px;
    }
    pre {
      background: #0b0f19;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
      font-family: monospace;
      font-size: 13px;
      color: #93c5fd;
      text-align: left;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${isZh ? 'LaTeX 离线单文件展示' : 'LaTeX Standalone Offline View'}</div>
    <h1>LaTeX Formula Editor ${isZh ? '导出文件' : 'Exported File'}</h1>
    <div id="math-output" class="math-stage"></div>
    <pre><code>${cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
  </div>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      var el = document.getElementById("math-output");
      var raw = ${JSON.stringify(cleaned)};
      if (window.katex) {
        window.katex.render(raw.replace(/\\\\placeholder\\{[^}]*\\}/g, '\\\\Box').replace(/\\\\placeholder/g, '\\\\Box').replace(/\\\\square/g, '\\\\Box'), el, { displayMode: true, throwOnError: false });
      } else {
        el.textContent = raw;
      }
    });
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `latex-offline-${safeTitle}-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t.toastDownloadedHtml, 'success');
  }, [code, isZh, showToast, t.toastDownloadedHtml]);

  // 读取历史记录
  const getHistoryList = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
    } catch {
      return [];
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch {
      // ignore
    }
    showToast(t.toastClearedHistory, 'info');
  }, [showToast, t.toastClearedHistory]);

  return (
    <>
      {/* ==========================================================================
          Top Navigation Bar (Glassmorphism Navbar)
          ========================================================================== */}
      <header className="top-navbar">
        <div className="brand-section">
          <div className="brand-logo-badge" title="LaTeX Formula Studio">
            &int;
          </div>
          <div className="brand-info">
            <h1>
              <span>{t.appName}</span>
            </h1>
          </div>
        </div>

        <div className="top-actions">
          {/* 自动保存状态指示徽章 */}
          <div
            className={`save-status-badge ${saveStatusVisible ? 'visible' : ''}`}
            title={t.draftSavedTooltip}
          >
            <span className="save-status-dot" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{t.draftSaved}</span>
          </div>

          {/* 经典示例按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowExamplesModal(true)}
            title={t.classicExamplesTooltip}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
            <span>{t.classicExamples}</span>
          </button>

          {/* 历史记录按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowHistoryModal(true)}
            title={t.historyTooltip}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{t.history}</span>
          </button>

          {/* 帮助按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowHelpModal(true)}
            title={t.helpTooltip}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{t.help}</span>
          </button>

          {/* 下载独立 HTML */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleDownloadSingleHtml}
            title={t.offlineHtmlTooltip}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t.offlineHtml}</span>
          </button>

          {/* 国际化双语切换按钮 (ZH / EN) */}
          <button
            type="button"
            className="btn btn-sm lang-toggle-btn"
            onClick={toggleLang}
            title={t.langSwitchTooltip}
            aria-label={t.langSwitchTooltip}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span style={{ fontWeight: 600 }}>{lang === 'zh' ? 'EN' : '中文'}</span>
          </button>

          {/* 主题切换按钮 */}
          <button
            type="button"
            className="btn btn-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? t.themeToggleLight : t.themeToggleDark}
            aria-label={theme === 'dark' ? t.themeToggleLight : t.themeToggleDark}
          >
            {theme === 'dark' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ==========================================================================
          Main Workspace Layout (Vertical Streamlined Flow)
          ========================================================================== */}
      <main className="workspace-container">
        {/* SECTION 1: 符号与模板选择器面板 */}
        <SymbolPalette onSelectItem={handleSelectPaletteItem} />

        {/* SECTION 2: LaTeX 源码编辑器 */}
        <FormulaEditor
          ref={editorRef}
          value={code}
          onChange={handleCodeChange}
          onToast={showToast}
        />

        {/* SECTION 3: 实时预览与导出区 */}
        <FormulaPreview latex={code} onToast={showToast} />
      </main>

      {/* ==========================================================================
          Modals
          ========================================================================== */}

      {/* 经典示例弹窗 */}
      {showExamplesModal ? (
        <div
          className="modal-backdrop"
          style={{ display: 'flex' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowExamplesModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h3>{t.classicModalTitle}</h3>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                style={{ border: 'none' }}
                onClick={() => setShowExamplesModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="history-list">
                {CLASSIC_FORMULAS.map((item: ClassicFormula) => {
                  const formulaName = isZh ? item.name : item.nameEn;
                  return (
                    <div
                      key={item.name}
                      className="history-item"
                      onClick={() => {
                        if (editorRef.current) {
                          editorRef.current.setValue(item.code);
                        } else {
                          handleCodeChange(item.code);
                        }
                        setShowExamplesModal(false);
                        showToast(`${t.toastLoadedExample}: ${formulaName}`, 'success');
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                          {formulaName}
                        </strong>
                        <div className="history-code">{item.code}</div>
                      </div>
                      <button type="button" className="btn btn-sm btn-primary">
                        {t.loadFormula}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 历史记录弹窗 */}
      {showHistoryModal ? (
        <div
          className="modal-backdrop"
          style={{ display: 'flex' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h3>{t.historyModalTitle}</h3>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                style={{ border: 'none' }}
                onClick={() => setShowHistoryModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button type="button" className="btn btn-sm" onClick={handleClearHistory}>
                  {t.clearHistory}
                </button>
              </div>
              <div className="history-list">
                {(() => {
                  const history = getHistoryList();
                  if (history.length === 0) {
                    return (
                      <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
                        {t.noHistory}
                      </div>
                    );
                  }
                  return history.map((item, idx) => (
                    <div
                      key={idx}
                      className="history-item"
                      onClick={() => {
                        if (editorRef.current) {
                          editorRef.current.setValue(item);
                        } else {
                          handleCodeChange(item);
                        }
                        setShowHistoryModal(false);
                        showToast(t.toastRestoredHistory, 'success');
                      }}
                    >
                      <div className="history-code">{item}</div>
                      <button type="button" className="btn btn-sm">
                        {t.restoreFormula}
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 帮助与快捷键弹窗 */}
      {showHelpModal ? (
        <div
          className="modal-backdrop"
          style={{ display: 'flex' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelpModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-head">
              <h3>{t.helpModalTitle}</h3>
              <button
                type="button"
                className="btn btn-sm btn-icon"
                style={{ border: 'none' }}
                onClick={() => setShowHelpModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                {t.helpIntro}
              </p>
              <h4 style={{ fontWeight: 600, margin: '0.85rem 0 0.4rem' }}>{t.shortcutsTitle}</h4>
              <table className="shortcut-table">
                <thead>
                  <tr>
                    <th>{t.colShortcut}</th>
                    <th>{t.colFunction}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><kbd>Tab</kbd></td>
                    <td>{t.shortcutTabDesc}</td>
                  </tr>
                  <tr>
                    <td><kbd>Shift + Tab</kbd></td>
                    <td>{t.shortcutShiftTabDesc}</td>
                  </tr>
                  <tr>
                    <td><kbd>Ctrl + Z</kbd> / <kbd>Cmd + Z</kbd></td>
                    <td>{t.shortcutUndoDesc}</td>
                  </tr>
                  <tr>
                    <td><kbd>Ctrl + Y</kbd> / <kbd>Shift + Cmd + Z</kbd></td>
                    <td>{t.shortcutRedoDesc}</td>
                  </tr>
                  <tr>
                    <td><code>(</code> / <code>{'{'}</code> / <code>[</code> / <code>$</code></td>
                    <td>{t.shortcutWrapDesc}</td>
                  </tr>
                </tbody>
              </table>

              <h4 style={{ fontWeight: 600, margin: '1rem 0 0.4rem' }}>{t.exportTipsTitle}</h4>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <li><strong>{isZh ? '复制高清 PNG' : 'Copy High-Res PNG'}</strong>: {t.tipPng}</li>
                <li><strong>{isZh ? '复制 MathML (Word)' : 'Copy MathML (Word)'}</strong>: {t.tipMathMl}</li>
                <li><strong>{isZh ? '复制 / 下载 SVG' : 'Copy / Download SVG'}</strong>: {t.tipSvg}</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* 浮动 Toast 通知容器 */}
      <div className="toast-container">
        {toasts.map((toastItem) => (
          <div key={toastItem.id} className={`toast-msg ${toastItem.type}`}>
            {toastItem.type === 'success' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {toastItem.type === 'error' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {toastItem.type === 'info' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            <span>{toastItem.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
