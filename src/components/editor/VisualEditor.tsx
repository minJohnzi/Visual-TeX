import React, { useEffect, useRef } from 'react';
import { commandBus } from '../../commands/commandBus';
import { mathfieldToSourceLatex, sourceToMathfieldLatex } from '../../core/latex/bridge';
import { findNextPlaceholder, normalizePastedLatex } from '../../core/latex/protocol';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

interface MathfieldDomElement extends HTMLElement {
  value: string;
  getValue: (format?: string) => string;
  setValue: (value: string, options?: { silenceNotifications?: boolean }) => void;
  insert: (latex: string, options?: { insertionMode?: string; selectionMode?: string; format?: string }) => boolean;
  executeCommand: (command: string | [string, ...unknown[]]) => boolean;
  mathVirtualKeyboardPolicy: string;
  smartMode: boolean;
  mathModeSpace: string;
  keybindings: Array<{ key: string; command: string | [string, ...unknown[]] }>;
  inlineShortcuts?: Record<string, string | { value: string; after?: string; mode?: string }>;
  selectionIsCollapsed?: boolean;
}

interface VisualEditorProps {
  blockId: string;
  value: string;
  onChange: (nextLatex: string) => void;
}

let mathliveInitPromise: Promise<typeof import('mathlive')> | null = null;

function loadMathLive(): Promise<typeof import('mathlive')> {
  if (!mathliveInitPromise) {
    mathliveInitPromise = import('mathlive').then((mod) => {
      if (mod.MathfieldElement) {
        mod.MathfieldElement.soundsDirectory = null;
      }
      return mod;
    });
  }
  return mathliveInitPromise;
}

export const VisualEditor: React.FC<VisualEditorProps> = ({
  blockId,
  value,
  onChange,
}) => {
  const { t } = useI18n();
  const fieldRef = useRef<MathfieldDomElement | null>(null);
  const lastTx = useAppStore((s) => s.lastTransaction);
  const syncedSeqRef = useRef<number>(-1);
  const readyRef = useRef<boolean>(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Lazy-register <math-field> custom element once and configure listeners
  useEffect(() => {
    let disposed = false;

    loadMathLive().then(() => {
      if (disposed || !fieldRef.current) return;
      const mf = fieldRef.current;

      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.smartMode = false;
      mf.mathModeSpace = '\\,';

      const baseBindings = Array.isArray(mf.keybindings) ? mf.keybindings : [];
      mf.keybindings = [
        ...baseBindings.filter((kb) => kb.key !== 'enter'),
        { key: 'enter', command: 'addRowAfter' },
        { key: '[Shift]enter', command: 'moveAfterParent' },
      ];

      mf.inlineShortcuts = {
        ...(mf.inlineShortcuts ?? {}),
        sqrt: '\\sqrt{\\placeholder{}}',
        nthroot: '\\sqrt[\\placeholder{}]{\\placeholder{}}',
        int: '\\int_{\\placeholder{}}^{\\placeholder{}} \\placeholder{} \\, \\mathrm{d}x',
        sum: '\\sum_{\\placeholder{}=\\placeholder{}}^{\\placeholder{}} \\placeholder{}',
        prod: '\\prod_{\\placeholder{}=\\placeholder{}}^{\\placeholder{}} \\placeholder{}',
        lim: '\\lim_{x \\to \\placeholder{}} \\placeholder{}',
        inf: '\\infty',
        oo: '\\infty',
        infty: '\\infty',
        pi: '\\pi',
        alpha: '\\alpha',
        beta: '\\beta',
        gamma: '\\gamma',
        delta: '\\delta',
        theta: '\\theta',
        lambda: '\\lambda',
        sigma: '\\sigma',
        omega: '\\omega',
        pm: '\\pm',
        mp: '\\mp',
        '>=': '\\ge',
        '<=': '\\le',
        '!=': '\\ne',
        '->': '\\to',
        '=>': '\\implies',
        part: '\\partial',
      };

      mf.setValue(sourceToMathfieldLatex(value), { silenceNotifications: true });
      readyRef.current = true;
    });

    const mf = fieldRef.current;
    if (!mf) return;

    const handleInput = () => {
      if (!readyRef.current) return;
      const raw = mf.getValue('latex');
      const next = mathfieldToSourceLatex(raw);
      onChangeRef.current(next);
    };

    const handlePaste = (e: ClipboardEvent) => {
      const plain = e.clipboardData?.getData('text/plain');
      if (!plain) return;
      const cleaned = normalizePastedLatex(plain);
      if (cleaned !== plain.trim()) {
        e.preventDefault();
        mf.insert(sourceToMathfieldLatex(cleaned), {
          insertionMode: 'replaceSelection',
          selectionMode: 'placeholder',
        });
        handleInput();
      }
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('paste', handlePaste as EventListener);

    return () => {
      disposed = true;
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('paste', handlePaste as EventListener);
    };
    // Run mount setup once per active block instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  // One-way store -> MathLive synchronization whenever non-visual transaction arrives
  useEffect(() => {
    const mf = fieldRef.current;
    if (!mf || !readyRef.current) return;
    if (lastTx.seq === syncedSeqRef.current) return;
    syncedSeqRef.current = lastTx.seq;

    if (lastTx.origin === 'visual') return;
    const expected = sourceToMathfieldLatex(value);
    if (mf.getValue('latex') !== expected) {
      mf.setValue(expected, { silenceNotifications: true });
    }
  }, [lastTx, value]);

  // Register CommandBus adapter for active VisualEditor
  useEffect(() => {
    commandBus.registerAdapter({
      insertTemplate: (latex, mode = 'wrap-or-insert', wrapLatex) => {
        const mf = fieldRef.current;
        if (!mf) return;
        const hasSelection = mf.selectionIsCollapsed === false;
        const shouldWrap =
          mode === 'wrap-or-insert' && hasSelection && Boolean(wrapLatex?.includes('${SEL}'));
        const rawTemplate =
          shouldWrap && wrapLatex ? wrapLatex.replace('${SEL}', '#@') : latex;
        const normalized = sourceToMathfieldLatex(rawTemplate);
        mf.focus();
        mf.insert(normalized, {
          insertionMode: mode === 'replace' || shouldWrap ? 'replaceSelection' : 'insertAfter',
          selectionMode: 'placeholder',
        });
        const updated = mathfieldToSourceLatex(mf.getValue('latex'));
        onChangeRef.current(updated);
      },
      insertNewline: () => {
        const mf = fieldRef.current;
        if (!mf) return;
        mf.focus();
        mf.executeCommand('addRowAfter');
        const updated = mathfieldToSourceLatex(mf.getValue('latex'));
        onChangeRef.current(updated);
      },
      jumpPlaceholder: (direction = 'next') => {
        const mf = fieldRef.current;
        if (!mf) return false;
        mf.focus();
        return mf.executeCommand(
          direction === 'prev' ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder'
        );
      },
      focusAt: () => {
        fieldRef.current?.focus();
      },
      getSelectionRange: () => {
        const firstPh = findNextPlaceholder(value, 0);
        return firstPh
          ? { start: firstPh.start, end: firstPh.end }
          : { start: value.length, end: value.length };
      },
    });

    return () => {
      commandBus.registerAdapter(null);
    };
  }, [blockId, value]);

  const handleLiveLatexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextLatex = e.target.value;
    const mf = fieldRef.current;
    if (mf && readyRef.current) {
      try {
        mf.setValue(sourceToMathfieldLatex(nextLatex), { silenceNotifications: true });
      } catch {
        // Ignore transient parse issues while typing incomplete LaTeX commands
      }
    }
    onChangeRef.current(nextLatex);
  };

  return (
    <div className="visual-editor-shell">
      {/* Custom Element rendered via MathLive */}
      <math-field
        ref={fieldRef as React.RefObject<never>}
        class="visual-mathfield"
        aria-label={t.modeVisual}
        placeholder={t.visualPlaceholder}
      />
      <div className="visual-editor-footer">
        <span>{t.visualActiveHint}</span>
      </div>
      <div className="visual-source-mirror">
        <span className="visual-source-badge">{t.liveLatexBarLabel}</span>
        <input
          type="text"
          className="visual-source-input"
          value={value}
          placeholder={t.liveLatexBarPlaceholder}
          aria-label={t.liveLatexBarLabel}
          spellCheck={false}
          onChange={handleLiveLatexInputChange}
        />
      </div>
    </div>
  );
};
