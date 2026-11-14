import { DelimiterMode, MatrixEnv } from '../core/types';

export interface ActiveEditorAdapter {
  insertTemplate: (
    latex: string,
    mode?: 'wrap-or-insert' | 'replace',
    wrapLatex?: string
  ) => void;
  insertNewline: () => void;
  jumpPlaceholder: (direction?: 'next' | 'prev') => boolean;
  focusAt: (offset: number, length?: number) => void;
  getSelectionRange: () => { start: number; end: number };
}

export type AppCommand =
  | {
      type: 'insert-template';
      latex: string;
      mode?: 'wrap-or-insert' | 'replace';
      wrapLatex?: string;
    }
  | { type: 'insert-newline' }
  | { type: 'insert-matrix'; env: MatrixEnv; rows: number; cols: number }
  | { type: 'matrix-edit'; op: 'append-row' | 'append-col' | 'delete-row' | 'delete-col' }
  | { type: 'insert-format-macro'; macro: 'text' | 'mathrm' | 'operatorname' | 'thinspace' | 'cdot' }
  | { type: 'jump-placeholder'; direction?: 'next' | 'prev' }
  | { type: 'set-delimiter'; delimiter: DelimiterMode }
  | { type: 'format-source' }
  | { type: 'auto-fix' }
  | { type: 'normalize-punctuation' }
  | { type: 'derive-next-step' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'jump-to-error'; blockId?: string; index: number; tokenLength: number };
