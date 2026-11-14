import {
  formatMultilineLatex,
  autoFixLatexSyntax,
  deriveNextStepLatex,
} from '../core/latex/bridge';
import {
  appendMatrixCol,
  appendMatrixRow,
  deleteMatrixCol,
  deleteMatrixRow,
  generateMatrixTemplate,
} from '../core/latex/matrix';
import {
  normalizeCjkAndPunctuation,
} from '../core/latex/protocol';
import { ActiveEditorAdapter, AppCommand } from './types';

export interface CommandStoreBridge {
  getActiveLatex: () => string;
  setActiveLatex: (latex: string, focusOffset?: number | null) => void;
  setDelimiterMode: (delimiter: AppCommand extends never ? never : any) => void;
  setActiveBlock: (blockId: string) => void;
  undo: () => void;
  redo: () => void;
}

class CommandBusImpl {
  private adapter: ActiveEditorAdapter | null = null;
  private storeBridge: CommandStoreBridge | null = null;

  registerAdapter(adapter: ActiveEditorAdapter | null): void {
    this.adapter = adapter;
  }

  registerStore(bridge: CommandStoreBridge): void {
    this.storeBridge = bridge;
  }

  dispatch(cmd: AppCommand): boolean {
    switch (cmd.type) {
      case 'insert-template': {
        if (this.adapter) {
          const mode = cmd.mode ?? 'wrap-or-insert';
          if (cmd.wrapLatex) {
            this.adapter.insertTemplate(cmd.latex, mode, cmd.wrapLatex);
          } else {
            this.adapter.insertTemplate(cmd.latex, mode);
          }
          return true;
        }
        if (this.storeBridge) {
          const current = this.storeBridge.getActiveLatex();
          const next = current ? `${current} ${cmd.latex}` : cmd.latex;
          this.storeBridge.setActiveLatex(next);
          return true;
        }
        return false;
      }

      case 'insert-newline': {
        if (this.adapter) {
          this.adapter.insertNewline();
          return true;
        }
        if (this.storeBridge) {
          const current = this.storeBridge.getActiveLatex();
          const next = current ? `${current} \\\\\n` : '\\\\\n';
          this.storeBridge.setActiveLatex(next);
          return true;
        }
        return false;
      }

      case 'insert-matrix': {
        const tpl = generateMatrixTemplate(cmd.env, cmd.rows, cmd.cols);
        if (this.adapter) {
          this.adapter.insertTemplate(tpl, 'wrap-or-insert');
          return true;
        }
        if (this.storeBridge) {
          const current = this.storeBridge.getActiveLatex();
          this.storeBridge.setActiveLatex(current ? `${current}\n${tpl}` : tpl);
          return true;
        }
        return false;
      }

      case 'matrix-edit': {
        if (!this.storeBridge) return false;
        const current = this.storeBridge.getActiveLatex();
        const cursorPos = this.adapter?.getSelectionRange().start;
        let res: { latex: string; changed: boolean };
        switch (cmd.op) {
          case 'append-row':
            res = appendMatrixRow(current, cursorPos);
            break;
          case 'append-col':
            res = appendMatrixCol(current, cursorPos);
            break;
          case 'delete-row':
            res = deleteMatrixRow(current, cursorPos);
            break;
          case 'delete-col':
            res = deleteMatrixCol(current, cursorPos);
            break;
        }
        if (res.changed) {
          this.storeBridge.setActiveLatex(res.latex);
        }
        return res.changed;
      }

      case 'insert-format-macro': {
        const macroMap: Record<typeof cmd.macro, string> = {
          text: '\\text{\\placeholder{}}',
          mathrm: '\\mathrm{\\placeholder{}}',
          operatorname: '\\operatorname{\\placeholder{}}',
          thinspace: '\\,',
          cdot: '\\cdot ',
        };
        const latex = macroMap[cmd.macro];
        if (this.adapter) {
          this.adapter.insertTemplate(latex, cmd.macro === 'thinspace' || cmd.macro === 'cdot' ? 'replace' : 'wrap-or-insert');
          return true;
        }
        if (this.storeBridge) {
          const current = this.storeBridge.getActiveLatex();
          this.storeBridge.setActiveLatex(`${current}${latex}`);
          return true;
        }
        return false;
      }

      case 'jump-placeholder': {
        return this.adapter ? this.adapter.jumpPlaceholder(cmd.direction ?? 'next') : false;
      }

      case 'set-delimiter': {
        if (!this.storeBridge) return false;
        this.storeBridge.setDelimiterMode(cmd.delimiter);
        return true;
      }

      case 'format-source': {
        if (!this.storeBridge) return false;
        const current = this.storeBridge.getActiveLatex();
        const formatted = formatMultilineLatex(current);
        if (formatted !== current) {
          this.storeBridge.setActiveLatex(formatted);
        }
        return true;
      }

      case 'auto-fix': {
        if (!this.storeBridge) return false;
        const current = this.storeBridge.getActiveLatex();
        const fixed = autoFixLatexSyntax(current);
        if (fixed !== current) {
          this.storeBridge.setActiveLatex(fixed);
        }
        return fixed !== current;
      }

      case 'normalize-punctuation': {
        if (!this.storeBridge) return false;
        const current = this.storeBridge.getActiveLatex();
        const normalized = normalizeCjkAndPunctuation(current);
        if (normalized !== current) {
          this.storeBridge.setActiveLatex(normalized);
        }
        return normalized !== current;
      }

      case 'derive-next-step': {
        if (!this.storeBridge) return false;
        const current = this.storeBridge.getActiveLatex();
        const nextLatex = deriveNextStepLatex(current);
        this.storeBridge.setActiveLatex(nextLatex);
        return true;
      }

      case 'undo': {
        this.storeBridge?.undo();
        return true;
      }

      case 'redo': {
        this.storeBridge?.redo();
        return true;
      }

      case 'jump-to-error': {
        if (cmd.blockId && this.storeBridge) {
          this.storeBridge.setActiveBlock(cmd.blockId);
        }
        if (this.adapter) {
          this.adapter.focusAt(cmd.index, cmd.tokenLength);
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }
}

export const commandBus = new CommandBusImpl();
