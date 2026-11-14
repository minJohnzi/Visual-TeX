import React, { useEffect, useRef, useState } from 'react';
import { defaultKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { tagHighlighter, tags } from '@lezer/highlight';
import { commandBus } from '../../commands/commandBus';
import { findNextPlaceholder, normalizePastedLatex } from '../../core/latex/protocol';
import {
  CommandCompletionMatch,
  getCommandCompletionsAtCursor,
  tryExpandShortcut,
} from '../../core/latex/shortcuts';
import { useI18n } from '../../i18n/context';
import { useAppStore } from '../../store/useAppStore';

interface SourceEditorProps {
  blockId: string;
  value: string;
  onChange: (nextLatex: string) => void;
}

const latexStreamLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^%.*/)) {
      return 'comment';
    }
    if (stream.match(/^\\placeholder\{[^}]*\}/)) {
      return 'atom';
    }
    if (stream.match(/^\\\\/)) {
      return 'operator';
    }
    if (stream.match(/^\\[A-Za-z*]+/)) {
      return 'keyword';
    }
    if (stream.match(/^\\./)) {
      return 'keyword';
    }
    if (stream.match(/^[{}[\]()]/)) {
      return 'bracket';
    }
    if (stream.match(/^[+\-*/=<>!&^_|~]+/)) {
      return 'operator';
    }
    if (stream.match(/^\d+(?:\.\d+)?/)) {
      return 'number';
    }
    stream.next();
    return null;
  },
});

const latexTagHighlighter = tagHighlighter([
  { tag: tags.keyword, class: 'tok-cmd' },
  { tag: tags.atom, class: 'tok-square' },
  { tag: tags.bracket, class: 'tok-brace' },
  { tag: tags.operator, class: 'tok-op' },
  { tag: tags.comment, class: 'tok-comment' },
  { tag: tags.number, class: 'tok-num' },
]);

const AUTO_PAIR_MAP: Record<string, string> = {
  '{': '}',
  '(': ')',
  '[': ']',
};

export const SourceEditor: React.FC<SourceEditorProps> = ({
  blockId,
  value,
  onChange,
}) => {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastTx = useAppStore((s) => s.lastTransaction);
  const syncedSeqRef = useRef<number>(-1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [completion, setCompletion] = useState<CommandCompletionMatch | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const completionRef = useRef<CommandCompletionMatch | null>(null);
  const selectedIdxRef = useRef<number>(0);
  completionRef.current = completion;
  selectedIdxRef.current = selectedIdx;

  const applyCompletionItem = (itemInsert: string) => {
    const view = viewRef.current;
    const match = completionRef.current;
    if (!view || !match) return;

    const firstSlot = findNextPlaceholder(itemInsert, 0);
    const anchorOffset = firstSlot ? match.startIndex + firstSlot.start : match.startIndex + itemInsert.length;
    const headOffset = firstSlot ? match.startIndex + firstSlot.end : anchorOffset;

    view.dispatch({
      changes: { from: match.startIndex, to: match.endIndex, insert: itemInsert },
      selection: { anchor: anchorOffset, head: headOffset },
    });
    setCompletion(null);
    view.focus();
  };

  const jumpPlaceholderInView = (direction: 'next' | 'prev'): boolean => {
    const view = viewRef.current;
    if (!view) return false;
    const doc = view.state.doc.toString();
    const sel = view.state.selection.main;

    if (direction === 'next') {
      const range = findNextPlaceholder(doc, sel.to);
      if (!range) return false;
      view.dispatch({
        selection: { anchor: range.start, head: range.end },
        scrollIntoView: true,
      });
      return true;
    }

    // Previous placeholder search from cursor backwards
    const beforeCursor = doc.slice(0, sel.from);
    const lastIdx = beforeCursor.lastIndexOf('\\placeholder{');
    if (lastIdx !== -1) {
      const range = findNextPlaceholder(doc, lastIdx);
      if (range) {
        view.dispatch({
          selection: { anchor: range.start, head: range.end },
          scrollIntoView: true,
        });
        return true;
      }
    }
    const wrapRange = findNextPlaceholder(doc, 0);
    if (!wrapRange) return false;
    view.dispatch({
      selection: { anchor: wrapRange.start, head: wrapRange.end },
      scrollIntoView: true,
    });
    return true;
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const editorKeymap = Prec.highest(
      keymap.of([
        {
          key: 'Mod-z',
          run: () => {
            commandBus.dispatch({ type: 'undo' });
            return true;
          },
        },
        {
          key: 'Mod-Shift-z',
          run: () => {
            commandBus.dispatch({ type: 'redo' });
            return true;
          },
        },
        {
          key: 'Mod-y',
          run: () => {
            commandBus.dispatch({ type: 'redo' });
            return true;
          },
        },
        {
          key: 'ArrowDown',
          run: () => {
            const c = completionRef.current;
            if (!c) return false;
            setSelectedIdx((prev) => (prev + 1) % c.items.length);
            return true;
          },
        },
        {
          key: 'ArrowUp',
          run: () => {
            const c = completionRef.current;
            if (!c) return false;
            setSelectedIdx((prev) => (prev - 1 + c.items.length) % c.items.length);
            return true;
          },
        },
        {
          key: 'Enter',
          run: () => {
            const c = completionRef.current;
            if (!c) return false;
            const picked = c.items[selectedIdxRef.current] ?? c.items[0];
            if (picked) {
              applyCompletionItem(picked.insert);
              return true;
            }
            return false;
          },
        },
        {
          key: 'Escape',
          run: () => {
            if (!completionRef.current) return false;
            setCompletion(null);
            return true;
          },
        },
        {
          key: 'Tab',
          run: () => jumpPlaceholderInView('next'),
        },
        {
          key: 'Shift-Tab',
          run: () => jumpPlaceholderInView('prev'),
        },
        {
          key: 'Space',
          run: (view) => {
            const sel = view.state.selection.main;
            if (!sel.empty) return false;
            const docStr = view.state.doc.toString();
            const expanded = tryExpandShortcut(docStr, sel.head);
            if (!expanded) return false;

            view.dispatch({
              changes: { from: 0, to: docStr.length, insert: expanded.nextValue },
              selection: { anchor: expanded.nextCursor },
            });
            return true;
          },
        },
      ])
    );

    const compileError = useAppStore.getState().compileResult.error;
    const initialAnchor =
      typeof lastTx.focusOffset === 'number'
        ? Math.max(0, Math.min(value.length, lastTx.focusOffset))
        : 0;
    const initialHead =
      typeof lastTx.focusOffset === 'number' && compileError
        ? Math.max(
            initialAnchor,
            Math.min(value.length, initialAnchor + compileError.tokenLength)
          )
        : initialAnchor;

    const state = EditorState.create({
      doc: value,
      selection:
        typeof lastTx.focusOffset === 'number'
          ? { anchor: initialAnchor, head: initialHead }
          : undefined,
      extensions: [
        lineNumbers(),
        bracketMatching(),
        latexStreamLanguage,
        syntaxHighlighting(latexTagHighlighter),
        cmPlaceholder(t.sourcePlaceholder),
        editorKeymap,
        keymap.of(defaultKeymap),
        EditorView.lineWrapping,
        EditorView.inputHandler.of((view, from, to, text) => {
          if (from === to && text in AUTO_PAIR_MAP) {
            const closeChar = AUTO_PAIR_MAP[text];
            view.dispatch({
              changes: { from, to, insert: `${text}${closeChar}` },
              selection: { anchor: from + 1 },
            });
            return true;
          }
          return false;
        }),
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const raw = event.clipboardData?.getData('text/plain');
            if (!raw) return false;
            const normalized = normalizePastedLatex(raw);
            if (normalized !== raw) {
              event.preventDefault();
              const sel = view.state.selection.main;
              view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: normalized },
                selection: { anchor: sel.from + normalized.length },
              });
              return true;
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextDoc = update.state.doc.toString();
            onChangeRef.current(nextDoc);
          }
          if (update.docChanged || update.selectionSet) {
            const cursor = update.state.selection.main.head;
            const nextDoc = update.state.doc.toString();
            const match = getCommandCompletionsAtCursor(nextDoc, cursor);
            setCompletion(match);
            setSelectedIdx(0);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount cleanly per active blockId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  // One-way store -> CodeMirror sync on non-source transactions
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (lastTx.seq === syncedSeqRef.current) return;
    syncedSeqRef.current = lastTx.seq;

    if (lastTx.origin === 'source') return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      const clampedOffset =
        typeof lastTx.focusOffset === 'number'
          ? Math.max(0, Math.min(value.length, lastTx.focusOffset))
          : Math.min(view.state.selection.main.head, value.length);
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        selection: { anchor: clampedOffset },
      });
    }
  }, [lastTx, value]);

  // Register CommandBus adapter for active SourceEditor
  useEffect(() => {
    commandBus.registerAdapter({
      insertTemplate: (latex, mode = 'wrap-or-insert', wrapLatex) => {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        const selected = view.state.doc.sliceString(sel.from, sel.to);
        let toInsert = latex;
        if (mode === 'wrap-or-insert' && selected.length > 0) {
          if (wrapLatex && wrapLatex.includes('${SEL}')) {
            toInsert = wrapLatex.replace('${SEL}', selected);
          } else if (latex.includes('\\placeholder{}')) {
            toInsert = latex.replace('\\placeholder{}', selected);
          }
        }
        const firstPh = findNextPlaceholder(toInsert, 0);
        const anchor = firstPh ? sel.from + firstPh.start : sel.from + toInsert.length;
        const head = firstPh ? sel.from + firstPh.end : anchor;

        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: toInsert },
          selection: { anchor, head },
          scrollIntoView: true,
        });
        view.focus();
      },
      insertNewline: () => {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        const insert = ' \\\\\n';
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert },
          selection: { anchor: sel.from + insert.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      jumpPlaceholder: (direction = 'next') => jumpPlaceholderInView(direction),
      focusAt: (offset, length = 1) => {
        const view = viewRef.current;
        if (!view) return;
        const maxLen = view.state.doc.length;
        const from = Math.max(0, Math.min(offset, maxLen));
        const to = Math.max(from, Math.min(offset + length, maxLen));
        view.dispatch({
          selection: { anchor: from, head: to },
          scrollIntoView: true,
        });
        view.focus();
      },
      getSelectionRange: () => {
        const view = viewRef.current;
        if (!view) return { start: 0, end: 0 };
        const sel = view.state.selection.main;
        return { start: sel.from, end: sel.to };
      },
    });

    return () => {
      commandBus.registerAdapter(null);
    };
  }, [blockId]);

  return (
    <div className="source-editor-shell">
      <div
        ref={hostRef}
        className="source-editor-host"
        aria-label={t.modeSource}
      />
      {completion && (
        <div className="source-completion-popup" role="listbox" aria-label="LaTeX Completions">
          {completion.items.map((item, idx) => (
            <button
              key={item.cmd}
              type="button"
              role="option"
              aria-selected={idx === selectedIdx}
              className={`source-completion-item ${idx === selectedIdx ? 'is-selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applyCompletionItem(item.insert);
              }}
            >
              <span className="source-completion-cmd">{item.cmd}</span>
              <span className="source-completion-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
