import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { MathfieldElement } from 'mathlive';
import type { PaletteItem } from '../data/symbols';
import {
  highlightLatexTokens,
  estimateFormulaLineCount,
  renderFormulaSafely,
  sanitizeMathForDisplay,
} from '../utils/latex';
import { copyPlainText } from '../utils/exportPng';
import {
  smartInsertIntoMathfield,
  smartInsertIntoTextarea,
  appendMatrixRow,
  appendMatrixCol,
  deleteMatrixRow,
  deleteMatrixCol,
} from '../utils/insertHandler';
import { findNextPlaceholder, findPrevPlaceholder } from '../utils/placeholder';
import { handleBracketAutoPair, checkCommandCompletion } from '../utils/sourceEditorState';
import { tryExpandShortcut } from '../utils/shortcuts';
import { normalizePastedLatex } from '../utils/pasteNormalize';
import { wrapWithDelimiter, type DelimiterMode } from '../utils/delimiter';
import type { RenderStatus } from '../types/formula';
import { useI18n } from '../i18n/context';

export type EditorMode = 'visual' | 'source';

export interface FormulaEditorHandle {
  insertTemplate: (item: PaletteItem) => void;
  setValue: (val: string) => void;
  focus: () => void;
  getMode: () => EditorMode;
  jumpToPosition: (pos: number, length?: number) => void;
  appendRow: () => void;
  appendColumn: () => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  normalizeFullwidthAndChinese: () => void;
}

interface FormulaEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface VersionItem {
  id: string;
  latex: string;
  timestamp: number;
  charCount: number;
}

const STORAGE_MODE_KEY = 'latex_formula_editor_mode';
const STORAGE_RECENT_VERSIONS_KEY = 'latex_formula_recent_5_versions';

function safeSetMathfieldValue(
  mf: MathfieldElement | null,
  val: string,
  options?: Parameters<MathfieldElement['setValue']>[1]
) {
  if (!mf) return;
  try {
    if (typeof mf.setValue === 'function') {
      mf.setValue(val, options);
    } else {
      mf.value = val;
    }
  } catch (err) {
    console.warn('Failed to set Mathfield value:', err);
  }
}

function safeFocusMathfield(mf: MathfieldElement | null) {
  if (!mf) return;
  try {
    mf.focus?.();
  } catch {
    // ignore
  }
}

export const FormulaEditor = forwardRef<FormulaEditorHandle, FormulaEditorProps>(
  ({ value, onChange, onToast }, ref) => {
    const { t, isZh } = useI18n();

    // 偏好模式记忆（默认所见即所得视觉模式）
    const [mode, setMode] = useState<EditorMode>(() => {
      try {
        const saved = localStorage.getItem(STORAGE_MODE_KEY);
        if (saved === 'source' || saved === 'visual') return saved;
      } catch {
        // ignore
      }
      return 'visual';
    });

    const modeRef = useRef<EditorMode>(mode);
    useEffect(() => {
      modeRef.current = mode;
    }, [mode]);

    // 视觉模式 MathLive 相关 Ref
    const mathfieldContainerRef = useRef<HTMLDivElement | null>(null);
    const mathfieldRef = useRef<MathfieldElement | null>(null);
    const isMathfieldInternalChangeRef = useRef<boolean>(false);
    const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState<boolean>(false);

    // 源码模式 Textarea 相关 Ref
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const isComposingRef = useRef<boolean>(false);
    const lineNumbersRef = useRef<HTMLDivElement | null>(null);
    const highlightPreRef = useRef<HTMLPreElement | null>(null);

    // 定界符与排版状态 (支持 4 种模式：none, inline, display, equation)
    const [delimiterMode, setDelimiterMode] = useState<DelimiterMode>('none');

    // 1. 最近 5 个公式版本历史（下拉菜单）
    const [versionHistory, setVersionHistory] = useState<VersionItem[]>(() => {
      try {
        const saved = localStorage.getItem(STORAGE_RECENT_VERSIONS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed.slice(0, 5);
        }
      } catch {
        // ignore
      }
      return [
        {
          id: 'v-init',
          latex: value,
          timestamp: Date.now(),
          charCount: value.length,
        },
      ];
    });
    const [showVersionDropdown, setShowVersionDropdown] = useState<boolean>(false);
    const versionDropdownRef = useRef<HTMLDivElement | null>(null);

    // 2. 本地编辑历史栈（最多 10 个历史快照，支持超越普通 textarea 的步进步退）
    const [historyStack, setHistoryStack] = useState<string[]>([value]);
    const [historyIndex, setHistoryIndex] = useState<number>(0);
    const isSteppingHistoryRef = useRef<boolean>(false);

    // 3. LaTeX 渲染状态指示器（Ready | Compiling | Error）
    const [renderStatus, setRenderStatus] = useState<RenderStatus>('Ready');
    const [renderErrorMsg, setRenderErrorMsg] = useState<string>('');
    const [lastErrorLocation, setLastErrorLocation] = useState<{
      pos: number;
      length: number;
      line?: number;
      col?: number;
    } | null>(null);

    // 复制状态
    const [copiedLatex, setCopiedLatex] = useState<boolean>(false);

    // 点击外部自动收起下拉菜单
    useEffect(() => {
      const handlePointerDown = (e: MouseEvent) => {
        if (
          versionDropdownRef.current &&
          !versionDropdownRef.current.contains(e.target as Node)
        ) {
          setShowVersionDropdown(false);
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, []);

    // 切换模式并保存至 localStorage
    const handleSwitchMode = useCallback(
      (newMode: EditorMode) => {
        setMode(newMode);
        try {
          localStorage.setItem(STORAGE_MODE_KEY, newMode);
        } catch {
          // ignore
        }

        if (newMode === 'visual') {
          onToast(t.modeSwitchedToVisual, 'info');
          // 切换回视觉模式时，更新 mathfield 内容并聚焦
          setTimeout(() => {
            if (mathfieldRef.current) {
              const visualSnippet = value.replace(/\\square/g, '\\placeholder{}');
              safeSetMathfieldValue(mathfieldRef.current, visualSnippet, { selectionMode: 'item' });
              safeFocusMathfield(mathfieldRef.current);
            }
          }, 50);
        } else {
          onToast(t.modeSwitchedToSource, 'info');
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 50);
        }
      },
      [value, onToast, t]
    );

    // 初始化并挂载 MathLive <math-field> 实例
    useEffect(() => {
      if (typeof window === 'undefined') return;

      // 显式禁用按键音频，避免控制台 404 资源请求报错
      try {
        (MathfieldElement as unknown as { soundsDirectory: string | null }).soundsDirectory = null;
      } catch {
        // ignore
      }

      // 配置虚拟键盘策略，避免小屏幕或桌面端弹出遮挡预览视口
      const win = window as unknown as { mathVirtualKeyboard?: { policy?: string; visible?: boolean } };
      if (win.mathVirtualKeyboard) {
        try {
          win.mathVirtualKeyboard.policy = 'manual';
        } catch {
          // ignore
        }
      }

      const container = mathfieldContainerRef.current;
      if (!container) return;

      // 清空容器，防止 React StrictMode 下重复 append
      container.innerHTML = '';

      // 创建并配置 MathfieldElement
      const mf = new MathfieldElement();
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.smartMode = true;

      // 监听用户在视觉框中的实时编辑，仅在视觉模式激活时同步更新 LaTeX 状态
      const handleInput = () => {
        if (modeRef.current !== 'visual') return;
        isMathfieldInternalChangeRef.current = true;
        const currentLatex = mf.value;
        onChange(currentLatex);
        setTimeout(() => {
          isMathfieldInternalChangeRef.current = false;
        }, 0);
      };

      const handleMfKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          const win = window as unknown as { mathVirtualKeyboard?: { hide?: () => void; visible?: boolean } };
          if (win.mathVirtualKeyboard?.visible) {
            win.mathVirtualKeyboard.hide?.();
            setIsVirtualKeyboardOpen(false);
          }
        }
      };

      mf.addEventListener('input', handleInput);
      mf.addEventListener('keydown', handleMfKeyDown);

      // 关键：必须先将 mf 挂载到 DOM 容器中，触发 connectedCallback
      // 初始化内部 _mathfield，方可安全读取或设置 macros 等属性，避免 "Mathfield not mounted" 错误
      container.appendChild(mf);
      mathfieldRef.current = mf;

      // 初始化显示值
      const initialVisual = value.replace(/\\square/g, '\\placeholder{}');
      safeSetMathfieldValue(mf, initialVisual, { selectionMode: 'after' });

      // 宏保护：防止 MathLive 自作主张将标准 \boldsymbol 改写为 \mathbf，保护科研用户宏定义
      try {
        let existingMacros = {};
        try {
          existingMacros = mf.macros || {};
        } catch {
          existingMacros = {};
        }
        mf.macros = {
          ...existingMacros,
          boldsymbol: { args: 1, def: '\\boldsymbol{#1}' },
          mathbf: { args: 1, def: '\\mathbf{#1}' },
          mathbb: { args: 1, def: '\\mathbb{#1}' },
          mathcal: { args: 1, def: '\\mathcal{#1}' },
          mathrm: { args: 1, def: '\\mathrm{#1}' },
          operatorname: { args: 1, def: '\\operatorname{#1}' },
        };
      } catch (e) {
        console.warn('Failed to configure Mathfield macros:', e);
      }

      return () => {
        mf.removeEventListener('input', handleInput);
        mf.removeEventListener('keydown', handleMfKeyDown);
        mf.remove();
        mathfieldRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 当外部传入的 value 改变时，仅在当前处于视觉模式且非内部自发改变时同步到 mathfield
    // 在源码模式下绝不触碰 mathfield，杜绝多重渲染竞态和快速打字丢字问题
    useEffect(() => {
      if (mode === 'visual' && mathfieldRef.current && !isMathfieldInternalChangeRef.current) {
        const visualLatex = value.replace(/\\square/g, '\\placeholder{}');
        try {
          if (mathfieldRef.current.value !== visualLatex && mathfieldRef.current.value !== value) {
            safeSetMathfieldValue(mathfieldRef.current, visualLatex, { selectionMode: 'after' });
          }
        } catch {
          // ignore
        }
      }
    }, [value, mode]);

    // 计算渲染状态 (Ready / Compiling / Error) 带防抖
    useEffect(() => {
      setRenderStatus('Compiling');
      const timer = window.setTimeout(() => {
        const outcome = renderFormulaSafely(value);
        if (outcome.success || !value.trim()) {
          setRenderStatus('Ready');
          setRenderErrorMsg('');
          setLastErrorLocation(null);
        } else {
          setRenderStatus('Error');
          setRenderErrorMsg(outcome.errorMessage || 'Syntax error in LaTeX');
          if (typeof outcome.errorPosition === 'number') {
            setLastErrorLocation({
              pos: outcome.errorPosition,
              length: outcome.errorLength || 1,
              line: outcome.errorLine,
              col: outcome.errorColumn,
            });
          } else {
            setLastErrorLocation(null);
          }
        }
      }, 140);

      return () => window.clearTimeout(timer);
    }, [value]);

    // 录入 10 级会话历史快照栈 (防抖 450ms)
    useEffect(() => {
      if (isSteppingHistoryRef.current) {
        isSteppingHistoryRef.current = false;
        return;
      }

      const timer = window.setTimeout(() => {
        setHistoryStack((prev) => {
          const currentRecorded = prev[historyIndex];
          if (currentRecorded === value) return prev;

          // 截断重做链，追加新版本
          const sliced = prev.slice(0, historyIndex + 1);
          const nextStack = [...sliced, value];
          const capped = nextStack.length > 10 ? nextStack.slice(nextStack.length - 10) : nextStack;
          setHistoryIndex(capped.length - 1);
          return capped;
        });
      }, 450);

      return () => window.clearTimeout(timer);
    }, [value, historyIndex]);

    // 录入最近 5 个公式历史（防抖 1200ms）
    useEffect(() => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const timer = window.setTimeout(() => {
        setVersionHistory((prev) => {
          if (prev.length > 0 && prev[0].latex === trimmed) return prev;
          const newItem: VersionItem = {
            id: `v-${Date.now()}`,
            latex: trimmed,
            timestamp: Date.now(),
            charCount: trimmed.length,
          };
          const updated = [newItem, ...prev.filter((p) => p.latex !== trimmed)].slice(0, 5);
          try {
            localStorage.setItem(STORAGE_RECENT_VERSIONS_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      }, 1200);

      return () => window.clearTimeout(timer);
    }, [value]);

    // 同步源码模式行号与高亮层滚动
    const syncScroll = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = ta.scrollTop;
      }
      if (highlightPreRef.current) {
        highlightPreRef.current.scrollTop = ta.scrollTop;
        highlightPreRef.current.scrollLeft = ta.scrollLeft;
      }
    }, []);

    // IDE 级精准光标跳转与出错代码选中
    const jumpToPositionInternal = useCallback(
      (pos: number, length = 1) => {
        if (mode !== 'source') {
          handleSwitchMode('source');
        }

        setTimeout(() => {
          const ta = textareaRef.current;
          if (!ta) return;

          const safePos = Math.max(0, Math.min(pos, value.length));
          const safeLen = Math.max(1, length);
          const endPos = Math.min(value.length, safePos + safeLen);

          ta.focus();
          ta.setSelectionRange(safePos, endPos);

          // 计算出错行号并平滑居中滚动
          const textBefore = value.slice(0, safePos);
          const lineNumber = textBefore.split('\n').length;
          const lineHeight = 22;
          const targetScroll = Math.max(0, (lineNumber - 3) * lineHeight);

          ta.scrollTop = targetScroll;
          syncScroll();

          // 触发编辑器闪烁视觉反馈动画
          const wrapper = ta.closest('.editor-code-container') as HTMLElement | null;
          if (wrapper) {
            wrapper.classList.remove('editor-error-pulse');
            void wrapper.offsetWidth;
            wrapper.classList.add('editor-error-pulse');
          }
        }, 50);
      },
      [mode, handleSwitchMode, value, syncScroll]
    );

    // 恢复历史版本
    const handleRestoreVersion = useCallback(
      (latex: string) => {
        if (mode === 'visual' && mathfieldRef.current) {
          const visual = latex.replace(/\\square/g, '\\placeholder{}');
          safeSetMathfieldValue(mathfieldRef.current, visual, { selectionMode: 'item' });
          safeFocusMathfield(mathfieldRef.current);
        } else if (textareaRef.current) {
          textareaRef.current.focus();
        }
        onChange(latex);
        setShowVersionDropdown(false);
        onToast(t.toastRestoredHistory, 'success');
      },
      [mode, onChange, onToast, t]
    );

    // 历史栈步退 (Step Back)
    const handleStepBack = useCallback(() => {
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        const targetVal = historyStack[nextIdx];
        isSteppingHistoryRef.current = true;
        setHistoryIndex(nextIdx);

        if (mode === 'visual' && mathfieldRef.current) {
          const visual = targetVal.replace(/\\square/g, '\\placeholder{}');
          safeSetMathfieldValue(mathfieldRef.current, visual, { selectionMode: 'item' });
          safeFocusMathfield(mathfieldRef.current);
        } else if (textareaRef.current) {
          textareaRef.current.focus();
        }
        onChange(targetVal);
        onToast(`${t.toastRestoredStep} (${nextIdx + 1}/${historyStack.length})`, 'info');
      }
    }, [historyIndex, historyStack, mode, onChange, onToast, t]);

    // 历史栈步进 (Step Forward)
    const handleStepForward = useCallback(() => {
      if (historyIndex < historyStack.length - 1) {
        const nextIdx = historyIndex + 1;
        const targetVal = historyStack[nextIdx];
        isSteppingHistoryRef.current = true;
        setHistoryIndex(nextIdx);

        if (mode === 'visual' && mathfieldRef.current) {
          const visual = targetVal.replace(/\\square/g, '\\placeholder{}');
          safeSetMathfieldValue(mathfieldRef.current, visual, { selectionMode: 'item' });
          safeFocusMathfield(mathfieldRef.current);
        } else if (textareaRef.current) {
          textareaRef.current.focus();
        }
        onChange(targetVal);
        onToast(`${t.toastRestoredStep} (${nextIdx + 1}/${historyStack.length})`, 'info');
      }
    }, [historyIndex, historyStack, mode, onChange, onToast, t]);

    // 统一清空
    const handleClear = useCallback(() => {
      if (!value.trim()) return;
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, '');
        safeFocusMathfield(mathfieldRef.current);
      }
      onChange('');
      onToast(t.toastCleared, 'info');
    }, [value, mode, onChange, onToast, t]);

    // 格式化排版
    const handleFormat = useCallback(() => {
      const formatted = value
        .split('\n')
        .map((l) => l.trimEnd())
        .join('\n')
        .trim();
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, formatted.replace(/\\square/g, '\\placeholder{}'));
      }
      onChange(formatted);
      onToast(t.toastFormatted, 'success');
    }, [value, mode, onChange, onToast, t]);

    // 复制当前 LaTeX 源码 (按当前选定定界符模式安全包装，不破坏内部权威源码)
    const handleCopyLatex = useCallback(async () => {
      const target = value.trim();
      if (!target) {
        onToast(t.toastFormulaEmpty || (isZh ? '公式内容为空' : 'Formula is empty'), 'error');
        return;
      }
      try {
        const wrapped = wrapWithDelimiter(value, delimiterMode);
        await copyPlainText(wrapped);
        setCopiedLatex(true);
        onToast(t.toastCopiedLatex, 'success');
        window.setTimeout(() => {
          setCopiedLatex(false);
        }, 1800);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : (t.toastClipboardUnavailable || '剪贴板访问失败');
        onToast(msg, 'error');
      }
    }, [value, delimiterMode, onToast, t, isZh]);

    // 四种定界符模式循环切换 (none -> inline -> display -> equation -> none)
    const handleToggleDelimiters = useCallback(() => {
      const modes: DelimiterMode[] = ['none', 'inline', 'display', 'equation'];
      const nextIdx = (modes.indexOf(delimiterMode) + 1) % modes.length;
      const nextMode = modes[nextIdx];
      setDelimiterMode(nextMode);

      let label = t.delimitersNone;
      if (nextMode === 'inline') label = '$...$';
      else if (nextMode === 'display') label = '$$...$$';
      else if (nextMode === 'equation') label = '\\begin{equation}';

      onToast(`${t.toastDelimiterSwitched}: ${label}`, 'info');
    }, [delimiterMode, onToast, t]);

    // 虚拟键盘开关切换
    const handleToggleVirtualKeyboard = useCallback(() => {
      const win = window as unknown as {
        mathVirtualKeyboard?: {
          show?: () => void;
          hide?: () => void;
          visible?: boolean;
        };
      };
      if (win.mathVirtualKeyboard) {
        if (win.mathVirtualKeyboard.visible) {
          win.mathVirtualKeyboard.hide?.();
          setIsVirtualKeyboardOpen(false);
        } else {
          win.mathVirtualKeyboard.show?.();
          setIsVirtualKeyboardOpen(true);
        }
      } else {
        onToast(isZh ? '虚拟键盘正在初始化中，请稍候' : 'Virtual keyboard initializing', 'info');
      }
    }, [isZh, onToast]);

    // 剪贴板安全粘贴清洗
    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;

        const { normalized, wasModified } = normalizePastedLatex(text);
        if (wasModified) {
          e.preventDefault();
          const ta = textareaRef.current;
          if (!ta) return;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const nextVal = ta.value.slice(0, start) + normalized + ta.value.slice(end);
          onChange(nextVal);
          const newPos = start + normalized.length;
          setTimeout(() => {
            ta.setSelectionRange(newPos, newPos);
          }, 0);
        }
      },
      [onChange]
    );

    // 源码模式快捷键操作
    const handleSourceKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current;
      if (!ta) return;

      // 中文输入法 IME Composition 期间严禁截断或提前自动补全，杜绝丢拼音和候选词错乱
      if (isComposingRef.current || e.nativeEvent.isComposing) {
        return;
      }

      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      // 撤销与重做
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleStepForward();
        else handleStepBack();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleStepForward();
        return;
      }

      // Tab / Shift+Tab 占位符统一双向导航
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          const prevSlot = findPrevPlaceholder(ta.value, start);
          if (prevSlot) {
            ta.focus();
            ta.setSelectionRange(prevSlot.start, prevSlot.end);
            return;
          }
          // 无占位符时执行向左缩进
          const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
          if (ta.value.substring(lineStart, lineStart + 2) === '  ') {
            const nextVal = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + 2);
            onChange(nextVal);
            setTimeout(() => {
              const newPos = Math.max(lineStart, start - 2);
              ta.setSelectionRange(newPos, newPos);
            }, 0);
          }
        } else {
          const nextSlot = findNextPlaceholder(ta.value, end);
          if (nextSlot) {
            ta.focus();
            ta.setSelectionRange(nextSlot.start, nextSlot.end);
            return;
          }
          // 无占位符时插入 2 个空格缩进
          const nextVal = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
          onChange(nextVal);
          setTimeout(() => {
            ta.setSelectionRange(start + 2, start + 2);
          }, 0);
        }
        return;
      }

      // 括号自动补齐与跳过已有匹配右括号
      const pairRes = handleBracketAutoPair(e.key, {
        value: ta.value,
        selectionStart: start,
        selectionEnd: end,
      });
      if (pairRes.handled && pairRes.nextState) {
        e.preventDefault();
        onChange(pairRes.nextState.value);
        const { selectionStart: sStart, selectionEnd: sEnd } = pairRes.nextState;
        setTimeout(() => {
          ta.setSelectionRange(sStart, sEnd);
        }, 0);
        return;
      }

      // 空格与 Enter：触发快捷扩展与命令补全
      if (e.key === ' ' || e.key === 'Enter') {
        // 命令补全 (例如 \frac -> \frac{\placeholder{}}{\placeholder{}})
        const compRes = checkCommandCompletion({
          value: ta.value,
          selectionStart: start,
          selectionEnd: end,
        });
        if (compRes.handled && compRes.nextState) {
          e.preventDefault();
          onChange(compRes.nextState.value);
          const { selectionStart: sStart, selectionEnd: sEnd } = compRes.nextState;
          setTimeout(() => {
            ta.setSelectionRange(sStart, sEnd);
          }, 0);
          return;
        }

        // 确定性快捷词扩展 (alpha -> \alpha, sin -> \sin, >= -> \ge)
        const shortcutRes = tryExpandShortcut(ta.value, start);
        if (shortcutRes) {
          e.preventDefault();
          onChange(shortcutRes.expandedText);
          setTimeout(() => {
            ta.setSelectionRange(shortcutRes.newCursor, shortcutRes.newCursor);
          }, 0);
          return;
        }
      }
    };

    // 中文全角标点纠错与裸汉字自动包裹
    const handleNormalizePunctuation = useCallback(() => {
      const { sanitized, wasModified } = sanitizeMathForDisplay(value);
      if (wasModified) {
        if (mode === 'visual' && mathfieldRef.current) {
          safeSetMathfieldValue(mathfieldRef.current, sanitized.replace(/\\square/g, '\\placeholder{}'));
        }
        onChange(sanitized);
        onToast(t.toastNormalizedSuccess, 'success');
      } else {
        onToast(isZh ? '公式符号已非常规范，无需替换' : 'Symbols and text are already normalized', 'info');
      }
    }, [value, mode, onChange, onToast, t, isZh]);

    // 追加一行
    const handleAppendRow = useCallback(() => {
      const nextVal = appendMatrixRow(value);
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, nextVal.replace(/\\square/g, '\\placeholder{}'));
      }
      onChange(nextVal);
      onToast(t.matrixAddRow, 'info');
    }, [value, mode, onChange, onToast, t]);

    // 追加一列
    const handleAppendColumn = useCallback(() => {
      const nextVal = appendMatrixCol(value);
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, nextVal.replace(/\\square/g, '\\placeholder{}'));
      }
      onChange(nextVal);
      onToast(t.matrixAddCol, 'info');
    }, [value, mode, onChange, onToast, t]);

    // 删除一行
    const handleDeleteRow = useCallback(() => {
      const nextVal = deleteMatrixRow(value);
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, nextVal.replace(/\\square/g, '\\placeholder{}'));
      }
      onChange(nextVal);
    }, [value, mode, onChange]);

    // 删除一列
    const handleDeleteColumn = useCallback(() => {
      const nextVal = deleteMatrixCol(value);
      if (mode === 'visual' && mathfieldRef.current) {
        safeSetMathfieldValue(mathfieldRef.current, nextVal.replace(/\\square/g, '\\placeholder{}'));
      }
      onChange(nextVal);
    }, [value, mode, onChange]);

    // 暴露给符号面板与父组件的命令式操作
    useImperativeHandle(
      ref,
      () => ({
        insertTemplate: (item: PaletteItem) => {
          if (mode === 'visual') {
            const mf = mathfieldRef.current;
            if (mf) {
              isMathfieldInternalChangeRef.current = true;
              const nextLatex = smartInsertIntoMathfield(mf, item);
              onChange(nextLatex);
              setTimeout(() => {
                isMathfieldInternalChangeRef.current = false;
              }, 150);
            }
          } else {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();

            const { nextValue, cursorStart, cursorEnd } = smartInsertIntoTextarea(ta, item);
            onChange(nextValue);

            setTimeout(() => {
              ta.focus();
              ta.setSelectionRange(cursorStart, cursorEnd);
            }, 0);
          }
        },
        setValue: (val: string) => {
          if (mathfieldRef.current) {
            const visual = val.replace(/\\square/g, '\\placeholder{}');
            safeSetMathfieldValue(mathfieldRef.current, visual, { selectionMode: 'after' });
          }
          onChange(val);
          setTimeout(() => {
            if (mode === 'visual') {
              safeFocusMathfield(mathfieldRef.current);
            } else {
              textareaRef.current?.focus();
            }
          }, 0);
        },
        focus: () => {
          if (mode === 'visual') {
            safeFocusMathfield(mathfieldRef.current);
          } else {
            textareaRef.current?.focus();
          }
        },
        getMode: () => mode,
        jumpToPosition: jumpToPositionInternal,
        appendRow: handleAppendRow,
        appendColumn: handleAppendColumn,
        deleteRow: handleDeleteRow,
        deleteColumn: handleDeleteColumn,
        normalizeFullwidthAndChinese: handleNormalizePunctuation,
      }),
      [mode, onChange, jumpToPositionInternal, handleAppendRow, handleAppendColumn, handleDeleteRow, handleDeleteColumn, handleNormalizePunctuation]
    );

    useEffect(() => {
      syncScroll();
    }, [value, syncScroll]);

    // 计算统计数据
    const lines = value.split('\n').length;
    const lineNumbersText = Array.from({ length: lines }, (_, i) => i + 1).join('\n') + '\n';
    const highlightedHtml = highlightLatexTokens(value);
    const lineStats = estimateFormulaLineCount(value);

    return (
      <section className="card-panel editor-panel" aria-label={t.editorTitle}>
        {/* 工具栏：包含模式切换 Segmented Control、历史版本下拉、步进后退与清空 */}
        <div className="card-header editor-toolbar">
          <div className="toolbar-group">
            {/* 模式切换开关（Segmented Control） */}
            <div
              role="tablist"
              aria-label={t.editorTitle}
              className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'visual'}
                onClick={() => handleSwitchMode('visual')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'visual'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>{t.modeVisual}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mode === 'source'}
                onClick={() => handleSwitchMode('source')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  mode === 'source'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                <span>{t.modeSource}</span>
              </button>
            </div>
          </div>

          {/* 右侧常用操作：版本历史下拉 (5)、10 级步退步进、定界符、排版、清空 */}
          <div className="toolbar-group">
            {/* 最近 5 个公式版本历史下拉菜单 */}
            <div className="relative" ref={versionDropdownRef}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowVersionDropdown((prev) => !prev)}
                title={t.versionHistoryTitle}
                aria-expanded={showVersionDropdown}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="hidden sm:inline">{t.versionHistoryBtn}</span>
                <span>({versionHistory.length})</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {showVersionDropdown && (
                <div className="version-dropdown-menu">
                  <div className="version-dropdown-header">
                    <span>{t.versionHistoryTitle}</span>
                    <span className="text-[11px] text-slate-400 font-normal">{t.versionHistorySubtitle}</span>
                  </div>
                  <div className="version-dropdown-list">
                    {versionHistory.map((item, index) => {
                      const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      });
                      return (
                        <div
                          key={item.id || index}
                          className="version-dropdown-item"
                          onClick={() => handleRestoreVersion(item.latex)}
                        >
                          <div className="version-item-top">
                            <span className="version-tag">{t.versionTag} #{index + 1}</span>
                            <span className="version-time">{timeStr} · {item.charCount} {t.versionChars}</span>
                          </div>
                          <div className="version-item-code">{item.latex}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 10 级会话历史步退与步进按钮 */}
            <div className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-0.5">
              <button
                type="button"
                className="px-2 py-1 text-xs rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35 disabled:hover:bg-transparent flex items-center gap-1 cursor-pointer transition-colors"
                onClick={handleStepBack}
                disabled={historyIndex <= 0}
                title={`${t.historyStepBackTooltip} (${historyIndex + 1}/${historyStack.length})`}
                aria-label={t.historyStepBack}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                <span className="hidden md:inline">{t.historyStepBack}</span>
              </button>

              <span className="px-1.5 text-[11px] text-slate-400 font-mono select-none">
                {historyIndex + 1}/{historyStack.length}
              </span>

              <button
                type="button"
                className="px-2 py-1 text-xs rounded hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35 disabled:hover:bg-transparent flex items-center gap-1 cursor-pointer transition-colors"
                onClick={handleStepForward}
                disabled={historyIndex >= historyStack.length - 1}
                title={`${t.historyStepForwardTooltip} (${historyIndex + 1}/${historyStack.length})`}
                aria-label={t.historyStepForward}
              >
                <span className="hidden md:inline">{t.historyStepForward}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* 复制 LaTeX 源码按钮 */}
            <button
              type="button"
              className={`btn btn-sm ${
                copiedLatex
                  ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                  : ''
              }`}
              onClick={handleCopyLatex}
              title={t.copyLatexTooltip}
              aria-label={t.copyLatex}
              disabled={!value.trim()}
              style={{ opacity: !value.trim() ? 0.45 : 1 }}
            >
              {copiedLatex ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
              <span className="hidden sm:inline">{copiedLatex ? (isZh ? '已复制' : 'Copied!') : t.copyLatex}</span>
            </button>

            {/* 屏幕数学虚拟键盘开关按钮 */}
            <button
              type="button"
              className={`btn btn-sm ${isVirtualKeyboardOpen ? 'btn-primary' : ''}`}
              onClick={handleToggleVirtualKeyboard}
              title={t.virtualKeyboardTooltip}
              aria-label={t.virtualKeyboardToggle}
              aria-pressed={isVirtualKeyboardOpen}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M6 12h.001M10 12h.001M14 12h.001M18 12h.001M7 16h10" />
              </svg>
              <span className="hidden sm:inline">{t.virtualKeyboardToggle}</span>
            </button>

            {/* 定界符切换 (四种模式) */}
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleToggleDelimiters}
              title="切换外层数学定界符模式"
              aria-label="切换外层数学定界符模式"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="2" x2="12" y2="22" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span className="hidden md:inline">
                {delimiterMode === 'none'
                  ? t.delimitersNone
                  : delimiterMode === 'inline'
                  ? t.delimitersInline
                  : delimiterMode === 'display'
                  ? t.delimitersDisplay
                  : t.delimitersEquation}
              </span>
            </button>

            {/* 中文全角标点纠正与汉字规范化按钮 */}
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleNormalizePunctuation}
              title={t.normalizePunctuationTooltip}
              aria-label={t.normalizePunctuation}
              disabled={!value.trim()}
              style={{ opacity: !value.trim() ? 0.45 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
              </svg>
              <span className="hidden sm:inline">{t.normalizePunctuation}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={handleFormat}
              title="清除行末多余空格"
              aria-label={t.formatCode}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="21" y1="10" x2="7" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="21" y1="18" x2="7" y2="18" />
              </svg>
              <span className="hidden sm:inline">{t.formatCode}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={handleClear}
              title="清空当前输入区"
              aria-label={t.clearCode}
              disabled={!value}
              style={{ opacity: !value ? 0.45 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span className="hidden sm:inline">{t.clearCode}</span>
            </button>
          </div>
        </div>

        {/* 模式一：【所见即所得 (Symbolab 视觉模式)】 */}
        <div
          style={{ display: mode === 'visual' ? 'block' : 'none' }}
          className="visual-editor-container"
          onClick={() => safeFocusMathfield(mathfieldRef.current)}
        >
          <div
            ref={mathfieldContainerRef}
            style={{ width: '100%', minHeight: '160px' }}
          />
        </div>

        {/* 模式二：【LaTeX 源码模式】（行号 + 语法高亮底层 + 透明文本域） */}
        <div
          style={{ display: mode === 'source' ? 'flex' : 'none' }}
          className="editor-wrapper"
        >
          <div ref={lineNumbersRef} className="line-numbers">
            {lineNumbersText}
          </div>
          <div className="editor-code-container">
            <pre ref={highlightPreRef} className="editor-highlight-layer" aria-hidden="true">
              <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
            </pre>
            <textarea
              ref={textareaRef}
              className="latex-textarea"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleSourceKeyDown}
              onScroll={syncScroll}
              placeholder={t.editorPlaceholder}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        </div>

        {/* 状态底栏：字符计数、估算行数、LaTeX 渲染状态指示器 (Ready/Compiling/Error) 与当前模式专属提示 */}
        <div className="editor-statusbar">
          <div className="status-counters">
            <span>{t.charCount}: <strong>{value.length}</strong></span>
            <span>{t.estLineCount}: <strong>{lineStats.estimatedLines}</strong></span>

            {/* LaTeX 渲染状态指示徽章 */}
            <div className="status-render-badge" title={renderErrorMsg ? `Error: ${renderErrorMsg}` : undefined}>
              <span className="status-badge-label">{t.compilerStatus}:</span>
              {renderStatus === 'Compiling' && (
                <span className="badge-compiling">
                  <span className="status-dot compiling" />
                  {t.statusCompiling}
                </span>
              )}
              {renderStatus === 'Ready' && (
                <span className="badge-ready">
                  <span className="status-dot ready" />
                  {t.statusReady}
                </span>
              )}
              {renderStatus === 'Error' && (
                <button
                  type="button"
                  className="badge-error cursor-pointer hover:opacity-90 transition-opacity bg-transparent border-0 p-0 text-left inline-flex items-center gap-1"
                  onClick={() => {
                    if (lastErrorLocation) {
                      jumpToPositionInternal(lastErrorLocation.pos, lastErrorLocation.length);
                      if (lastErrorLocation.line) {
                        onToast(
                          t.toastJumpedToError.replace('{line}', String(lastErrorLocation.line)),
                          'info'
                        );
                      }
                    }
                  }}
                  title={t.clickToJumpError}
                >
                  <span className="status-dot error" />
                  <span>{t.statusError}</span>
                  {lastErrorLocation && (
                    <span className="underline font-semibold text-[11px] ml-0.5">
                      {t.jumpToError}
                      {lastErrorLocation.line ? ` (${lastErrorLocation.line}:${lastErrorLocation.col})` : ''}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="status-hint">
            {mode === 'visual' ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M2 12h20" />
                </svg>
                <span>
                  <strong>{isZh ? '视觉模式' : 'Visual Mode'}</strong>：
                  {isZh
                    ? '支持键盘方向键 ← → ↑ ↓ 在分子分母间游走，Tab 切换占位框'
                    : 'Use arrow keys ← → ↑ ↓ to navigate fractions & radicals, Tab to jump placeholders'}
                </span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span>
                  <strong>{isZh ? 'LaTeX 源码模式' : 'LaTeX Source Mode'}</strong>：
                  {isZh ? '按 Tab 键跳至下一个 \\square 占位符' : 'Press Tab to jump to the next \\square placeholder'}
                </span>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }
);

FormulaEditor.displayName = 'FormulaEditor';
