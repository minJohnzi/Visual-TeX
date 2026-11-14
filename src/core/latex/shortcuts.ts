import { isInsideTextCommand } from './scanner';

export const SYMBOL_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['>=', '\\geq'],
  ['<=', '\\leq'],
  ['!=', '\\neq'],
  ['->', '\\to'],
  ['<-', '\\leftarrow'],
  ['oo', '\\infty'],
];

export const WORD_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['approx', '\\approx'],
  ['alpha', '\\alpha'],
  ['beta', '\\beta'],
  ['gamma', '\\gamma'],
  ['delta', '\\delta'],
  ['theta', '\\theta'],
  ['lambda', '\\lambda'],
  ['sigma', '\\sigma'],
  ['omega', '\\omega'],
  ['sinh', '\\sinh'],
  ['sin', '\\sin'],
  ['cosh', '\\cosh'],
  ['cos', '\\cos'],
  ['tanh', '\\tanh'],
  ['tan', '\\tan'],
  ['infty', '\\infty'],
];

export interface CommandCompletionItem {
  cmd: string;
  insert: string;
  hint: string;
}

export const COMMAND_COMPLETIONS: readonly CommandCompletionItem[] = [
  { cmd: '\\frac', insert: '\\frac{\\placeholder{}}{\\placeholder{}}', hint: 'a / b' },
  { cmd: '\\dfrac', insert: '\\dfrac{\\placeholder{}}{\\placeholder{}}', hint: 'display a/b' },
  { cmd: '\\sqrt', insert: '\\sqrt{\\placeholder{}}', hint: '√x' },
  { cmd: '\\sum', insert: '\\sum_{i=1}^{n}', hint: 'Σ' },
  { cmd: '\\prod', insert: '\\prod_{i=1}^{n}', hint: 'Π' },
  { cmd: '\\int', insert: '\\int_{a}^{b}', hint: '∫' },
  { cmd: '\\lim', insert: '\\lim_{x \\to \\infty}', hint: 'lim' },
  { cmd: '\\alpha', insert: '\\alpha', hint: 'α' },
  { cmd: '\\beta', insert: '\\beta', hint: 'β' },
  { cmd: '\\gamma', insert: '\\gamma', hint: 'γ' },
  { cmd: '\\theta', insert: '\\theta', hint: 'θ' },
  { cmd: '\\lambda', insert: '\\lambda', hint: 'λ' },
  { cmd: '\\sigma', insert: '\\sigma', hint: 'σ' },
  { cmd: '\\infty', insert: '\\infty', hint: '∞' },
  { cmd: '\\partial', insert: '\\partial', hint: '∂' },
  { cmd: '\\nabla', insert: '\\nabla', hint: '∇' },
  { cmd: '\\mathbb', insert: '\\mathbb{\\placeholder{}}', hint: 'ℝ, ℤ' },
  { cmd: '\\mathcal', insert: '\\mathcal{\\placeholder{}}', hint: '𝓛, ℱ' },
  { cmd: '\\mathbf', insert: '\\mathbf{\\placeholder{}}', hint: 'bold' },
  { cmd: '\\mathrm', insert: '\\mathrm{\\placeholder{}}', hint: 'roman' },
  { cmd: '\\text', insert: '\\text{\\placeholder{}}', hint: 'text' },
  { cmd: '\\operatorname', insert: '\\operatorname{\\placeholder{}}', hint: 'op' },
  { cmd: '\\begin{cases}', insert: '\\begin{cases}\n  \\placeholder{} \\\\\n  \\placeholder{}\n\\end{cases}', hint: 'cases' },
  { cmd: '\\begin{aligned}', insert: '\\begin{aligned}\n  \\placeholder{} &= \\placeholder{} \\\\\n  &= \\placeholder{}\n\\end{aligned}', hint: 'aligned' },
  { cmd: '\\begin{pmatrix}', insert: '\\begin{pmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{pmatrix}', hint: '(matrix)' },
  { cmd: '\\begin{bmatrix}', insert: '\\begin{bmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{bmatrix}', hint: '[matrix]' },
];

export interface ShortcutExpansionResult {
  nextValue: string;
  nextCursor: number;
  expandedFrom: string;
  expandedTo: string;
}

/**
 * Checks whether typing a Space right after a shortcut trigger at `cursorPos`
 * should expand to the corresponding LaTeX macro.
 * Skips inside `\text{}`, `\mbox{}`, `\mathrm{}`, etc., or when preceded by `\`.
 */
export function tryExpandShortcut(
  value: string,
  cursorPos: number
): ShortcutExpansionResult | null {
  if (cursorPos <= 0 || cursorPos > value.length) return null;
  if (isInsideTextCommand(value, cursorPos)) return null;

  const beforeCursor = value.slice(0, cursorPos);
  const afterCursor = value.slice(cursorPos);

  for (const [trigger, macro] of SYMBOL_SHORTCUTS) {
    if (!beforeCursor.endsWith(trigger)) continue;
    const startIdx = beforeCursor.length - trigger.length;
    if (startIdx > 0 && beforeCursor[startIdx - 1] === '\\') continue;
    if (trigger === 'oo' && startIdx > 0 && /[A-Za-z]/.test(beforeCursor[startIdx - 1])) {
      continue;
    }
    const replacement = `${macro} `;
    const nextValue = beforeCursor.slice(0, startIdx) + replacement + afterCursor;
    return {
      nextValue,
      nextCursor: startIdx + replacement.length,
      expandedFrom: trigger,
      expandedTo: macro,
    };
  }

  for (const [trigger, macro] of WORD_SHORTCUTS) {
    if (!beforeCursor.endsWith(trigger)) continue;
    const startIdx = beforeCursor.length - trigger.length;
    if (startIdx > 0) {
      const prevChar = beforeCursor[startIdx - 1];
      if (prevChar === '\\' || /[A-Za-z]/.test(prevChar)) {
        continue;
      }
    }
    const replacement = `${macro} `;
    const nextValue = beforeCursor.slice(0, startIdx) + replacement + afterCursor;
    return {
      nextValue,
      nextCursor: startIdx + replacement.length,
      expandedFrom: trigger,
      expandedTo: macro,
    };
  }

  return null;
}

export interface CommandCompletionMatch {
  prefix: string;
  startIndex: number;
  endIndex: number;
  items: CommandCompletionItem[];
}

/**
 * Finds trailing `\command` prefix at `cursor` for inline autocomplete suggestions.
 */
export function getCommandCompletionsAtCursor(
  source: string,
  cursor: number
): CommandCompletionMatch | null {
  const before = source.slice(0, cursor);
  const match = before.match(/(\\[A-Za-z{]*)$/);
  if (!match) return null;
  const prefix = match[1];
  if (prefix.length < 2) return null;

  const lower = prefix.toLowerCase();
  const items = COMMAND_COMPLETIONS.filter((item) =>
    item.cmd.toLowerCase().startsWith(lower)
  ).slice(0, 8);

  if (items.length === 0) return null;
  return {
    prefix,
    startIndex: cursor - prefix.length,
    endIndex: cursor,
    items,
  };
}
