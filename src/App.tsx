import React, { useState, useEffect, useRef, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import { SymbolPalette } from './components/SymbolPalette';
import { FormulaEditor, type FormulaEditorHandle } from './components/FormulaEditor';
import { FormulaPreview } from './components/FormulaPreview';
import { CLASSIC_FORMULAS, type PaletteItem, type ClassicFormula } from './data/symbols';
import { stripOuterMathDelimiters, computeLineAndColumn, renderFormulaSafely } from './utils/latex';
import { generateStandaloneOfflineHtml, sanitizeFilename } from './utils/exportHtml';
import { getFormulaSvgElement } from './utils/exportPng';
import { copyTextToClipboard } from './utils/clipboard';
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
  const [historyItems, setHistoryItems] = useState<string[]>([]);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  const editorRef = useRef<FormulaEditorHandle | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const historyTimerRef = useRef<number | null>(null);

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

  // 写入本地历史记录（防抖调用）
  const saveToHistory = useCallback((val: string) => {
    const trimmed = val.trim();
    if (trimmed.length < 3) return;
    try {
      let list: string[] = [];
      try {
        list = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
      } catch {
        list = [];
      }
      list = list.filter((item) => item !== trimmed);
      list.unshift(trimmed);
      if (list.length > 30) list = list.slice(0, 30);
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }, []);

  // 保存代码
  const handleCodeChange = useCallback(
    (newVal: string) => {
      setCode(newVal);
      try {
        localStorage.setItem(STORAGE_KEYS.CODE, newVal);
      } catch {
        // ignore
      }

      // 防抖存储历史记录，避免打字过程产生大量破碎片段
      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current);
      }
      historyTimerRef.current = window.setTimeout(() => {
        saveToHistory(newVal);
      }, 1200);

      notifySaved();
    },
    [notifySaved, saveToHistory]
  );

  // 符号面板点选插入
  const handleSelectPaletteItem = useCallback((item: PaletteItem) => {
    if (editorRef.current) {
      editorRef.current.insertTemplate(item);
    }
  }, []);

  // 下载 100% 独立离线单文件 HTML（彻底消除外部 CDN 依赖与脚本注入风险）
  const handleDownloadSingleHtml = useCallback(async () => {
    try {
      const { cleaned } = stripOuterMathDelimiters(code);
      if (!cleaned.trim()) {
        showToast(isZh ? '公式内容为空，无法导出' : 'Formula is empty', 'error');
        return;
      }

      let svgHtml = '';
      let katexHtml = '';

      // 1. 首选提取自包含矢量 SVG 标签字符串
      try {
        const svgRes = await getFormulaSvgElement(cleaned, '#f1f5f9', 'dark');
        svgHtml = svgRes.svg.outerHTML;
      } catch {
        // 2. 降级采用 KaTeX 本地静态渲染 HTML
        try {
          const rendered = renderFormulaSafely(cleaned);
          katexHtml = rendered.html;
        } catch {
          // ignore
        }
      }

      const htmlContent = generateStandaloneOfflineHtml({
        latex: cleaned,
        isZh,
        svgHtml,
        katexHtml,
      });

      const safeTitle = sanitizeFilename(cleaned);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `latex-offline-${safeTitle}-${Date.now()}.html`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 异步延迟回收 Blob URL，防止过早释放
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);

      showToast(t.toastDownloadedHtml, 'success');
    } catch (err) {
      console.error('Failed to generate offline standalone HTML:', err);
      showToast(isZh ? '导出离线单文件失败，请重试' : 'Failed to export offline HTML', 'error');
    }
  }, [code, isZh, showToast, t.toastDownloadedHtml]);

  // 读取历史记录
  const getHistoryList = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
    } catch {
      return [];
    }
  }, []);

  // 删除单条历史记录
  const handleDeleteHistoryItem = useCallback(
    (index: number) => {
      try {
        const list = getHistoryList();
        list.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
        setHistoryItems(list);
      } catch {
        // ignore
      }
    },
    [getHistoryList]
  );

  const handleClearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
    } catch {
      // ignore
    }
    setHistoryItems([]);
    showToast(t.toastClearedHistory, 'info');
  }, [showToast, t.toastClearedHistory]);

  // IDE 错误精确定位跳转
  const handleJumpToError = useCallback(
    (pos: number, length = 1) => {
      if (editorRef.current) {
        editorRef.current.jumpToPosition(pos, length);
        const loc = computeLineAndColumn(code, pos);
        if (loc) {
          showToast(
            t.toastJumpedToError.replace('{line}', String(loc.line)),
            'info'
          );
        }
      }
    },
    [code, showToast, t]
  );

  const handleAutoFix = useCallback(
    (fixedLatex: string) => {
      setCode(fixedLatex);
      if (editorRef.current) {
        editorRef.current.setValue(fixedLatex);
      }
    },
    []
  );

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
            <span className="hidden md:inline">{t.draftSaved}</span>
          </div>

          {/* 经典示例按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowExamplesModal(true)}
            title={t.classicExamplesTooltip}
            aria-label={t.classicExamples}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
            <span className="hidden sm:inline">{t.classicExamples}</span>
          </button>

          {/* 历史记录按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setHistoryItems(getHistoryList());
              setShowHistoryModal(true);
            }}
            title={t.historyTooltip}
            aria-label={t.history}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="hidden sm:inline">{t.history}</span>
          </button>

          {/* 帮助按钮 */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowHelpModal(true)}
            title={t.helpTooltip}
            aria-label={t.help}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="hidden sm:inline">{t.help}</span>
          </button>

          {/* 下载独立 HTML */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDownloadSingleHtml();
            }}
            title={t.offlineHtmlTooltip}
            aria-label={t.offlineHtml}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden md:inline">{t.offlineHtml}</span>
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
          2K/4K max-width constraint + mobile padding
          ========================================================================== */}
      <main className="workspace-container max-w-5xl xl:max-w-6xl mx-auto w-full px-3 sm:px-6 py-4">
        {/* SECTION 1: 符号与模板选择器面板 */}
        <SymbolPalette
          onSelectItem={handleSelectPaletteItem}
          onAppendRow={() => editorRef.current?.appendRow()}
          onAppendColumn={() => editorRef.current?.appendColumn()}
        />

        {/* SECTION 2: LaTeX 源码编辑器 */}
        <FormulaEditor
          ref={editorRef}
          value={code}
          onChange={handleCodeChange}
          onToast={showToast}
        />

        {/* SECTION 3: 实时预览与导出区 */}
        <FormulaPreview
          latex={code}
          onToast={showToast}
          onJumpToError={handleJumpToError}
          onAutoFix={handleAutoFix}
        />
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
                {historyItems.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>
                    {t.noHistory}
                  </div>
                ) : (
                  historyItems.map((item, idx) => (
                    <div key={idx} className="history-item">
                      <div
                        className="history-code"
                        title={item}
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
                        {item}
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          title={t.restoreFormula}
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
                          {t.restoreFormula}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          title={t.copyLatex}
                          onClick={async () => {
                            const ok = await copyTextToClipboard(item);
                            if (ok) {
                              showToast(t.toastCopiedLatex, 'success');
                            }
                          }}
                        >
                          {t.copyCode}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ color: '#ef4444', padding: '0.2rem 0.5rem' }}
                          title={t.deleteHistoryItem}
                          aria-label={t.deleteHistoryItem}
                          onClick={() => handleDeleteHistoryItem(idx)}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                )}
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

              <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{isZh ? '在线访问发布地址' : 'Official Online URL'}:</span>
                <a
                  href="https://visual-tex.ai.studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}
                >
                  https://visual-tex.ai.studio
                </a>
              </div>
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
