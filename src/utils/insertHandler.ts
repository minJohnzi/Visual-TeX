import { MathfieldElement } from 'mathlive';
import type { PaletteItem } from '../data/symbols';

/**
 * 将符号模板智能转换为 MathLive 原生占位符与选区捕获语法：
 * - #? : 虚线占位方框 (placeholder)，MathLive 会将虚拟光标直接定位于该方框内
 * - #@ : 捕获当前用户选中的数学内容 (selection)，未选中时自动回退为占位符
 */
export function getMathliveInsertSnippet(item: PaletteItem): string {
  // 1. 若符号项显式指定了 mathliveSnippet，优先返回
  if (item.mathliveSnippet) {
    return item.mathliveSnippet;
  }

  const raw = item.latex.trim();

  // 2. 上标 (幂) -> ^{#?}，确保智能附着在光标前底数上，光标定位于指数方框内
  if (raw === '^{\\square}' || raw === '^{}' || raw === '^\\square') {
    return '^{#?}';
  }

  // 3. 下标 -> _{#?}，智能附着于底数
  if (raw === '_{\\square}' || raw === '_{}' || raw === '_\\square') {
    return '_{#?}';
  }

  // 4. 上下标结合
  if (raw.includes('_{\\square}') && raw.includes('^{\\square}')) {
    return '_{#?}^{#?}';
  }

  // 5. 分式 (分母与分子)
  if (raw.startsWith('\\dfrac{')) {
    return '\\dfrac{#@}{#?}';
  }
  if (raw.startsWith('\\frac{')) {
    return '\\frac{#@}{#?}';
  }

  // 6. 二项式系数 (组合数)
  if (raw.startsWith('\\binom{')) {
    return '\\binom{#@#?}{#?}';
  }

  // 7. 根号与 n 次根号
  if (raw.startsWith('\\sqrt[n]{') || raw.startsWith('\\sqrt[')) {
    return '\\sqrt[#?]{#@#?}';
  }
  if (raw.startsWith('\\sqrt{')) {
    return '\\sqrt{#@#?}';
  }

  // 8. 考研加框
  if (raw.startsWith('\\boxed{')) {
    return '\\boxed{#@#?}';
  }

  // 9. 自适应括号与定界符 (若有选区自动包裹，无选区生成带内部占位符的括号)
  if (raw.startsWith('\\left(')) return '\\left( #@#? \\right)';
  if (raw.startsWith('\\left[')) return '\\left[ #@#? \\right]';
  if (raw.startsWith('\\left\\{')) return '\\left\\{ #@#? \\right\\}';
  if (raw.startsWith('\\left|')) return '\\left| #@#? \\right|';
  if (raw.startsWith('\\left\\|')) return '\\left\\| #@#? \\right\\|';
  if (raw.startsWith('\\langle')) return '\\langle #@#? \\rangle';

  // 10. 常用导数与微分算子
  if (raw.startsWith('\\dot{')) return '\\dot{#@#?}';
  if (raw.startsWith('\\ddot{')) return '\\ddot{#@#?}';
  if (raw.startsWith('\\vec{')) return '\\vec{#@#?}';
  if (raw.startsWith('\\hat{')) return '\\hat{#@#?}';
  if (raw.startsWith('\\bar{')) return '\\bar{#@#?}';
  if (raw.startsWith('\\overline{')) return '\\overline{#@#?}';
  if (raw.startsWith('\\underline{')) return '\\underline{#@#?}';
  if (raw.startsWith('\\tilde{')) return '\\tilde{#@#?}';
  if (raw.startsWith('\\mathbf{')) return '\\mathbf{#@#?}';
  if (raw.startsWith('\\boldsymbol{')) return '\\boldsymbol{#@#?}';

  // 11. 上下大括号
  if (raw.startsWith('\\overbrace{')) return '\\overbrace{#@#?}^{#?}';
  if (raw.startsWith('\\underbrace{')) return '\\underbrace{#@#?}_{#?}';

  // 12. 初等与自控高频函数
  const funcs = ['\\sin', '\\cos', '\\tan', '\\arctan', '\\ln', '\\log', '\\exp'];
  for (const fn of funcs) {
    if (raw.startsWith(`${fn}(`)) {
      return `${fn}(#@#?)`;
    }
  }

  // 13. 指数 e^x
  if (raw === 'e^{\\square}' || raw === 'e^{}') {
    return 'e^{#@#?}';
  }

  // 14. 积分与级数算子
  if (raw.startsWith('\\int_{') || raw.startsWith('\\int_')) {
    return '\\int_{#?}^{#?} #@#? \\, \\mathrm{d}x';
  }
  if (raw.startsWith('\\int')) {
    return '\\int #@#? \\, \\mathrm{d}x';
  }
  if (raw.startsWith('\\iint')) {
    return '\\iint_{#?} #@#? \\, \\mathrm{d}x\\mathrm{d}y';
  }
  if (raw.startsWith('\\iiint')) {
    return '\\iiint_{#?} #@#? \\, \\mathrm{d}V';
  }
  if (raw.startsWith('\\oint')) {
    return '\\oint_{#?} #@#? \\, \\mathrm{d}s';
  }
  if (raw.startsWith('\\sum')) {
    return '\\sum_{#?}^{#?} #@#?';
  }
  if (raw.startsWith('\\prod')) {
    return '\\prod_{#?}^{#?} #@#?';
  }
  if (raw.startsWith('\\lim_')) {
    return '\\lim_{#? \\to #?} #@#?';
  }

  // 15. 若有 wrap 模板，将选区占位符转换为 #@，方框转换为 #?
  if (item.wrap) {
    return item.wrap.replace('${SEL}', '#@').replace(/\\square/g, '#?');
  }

  // 16. 通用方框转换
  if (raw.includes('\\square')) {
    return raw.replace(/\\square/g, '#?');
  }

  return raw;
}

/**
 * MathLive 视觉模式的增量智能插入操作
 */
export function smartInsertIntoMathfield(
  mf: MathfieldElement,
  item: PaletteItem
): string {
  mf.focus();
  const snippet = getMathliveInsertSnippet(item);
  const hasPlaceholder = snippet.includes('#?') || snippet.includes('#@');

  mf.insert(snippet, {
    focus: true,
    scrollIntoView: true,
    selectionMode: hasPlaceholder ? 'placeholder' : 'after',
  });

  return mf.value;
}

/**
 * Raw LaTeX 源码模式 (Textarea) 的上下文感知智能插入
 */
export function smartInsertIntoTextarea(
  ta: HTMLTextAreaElement,
  item: PaletteItem
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const val = ta.value;
  const selectedText = val.substring(start, end);
  const before = val.substring(0, start);
  const after = val.substring(end);

  const rawLatex = item.latex.trim();

  // 检查光标前紧挨的最后一个有效字符（忽略空白）
  const trimmedBefore = before.trimEnd();
  const lastChar = trimmedBefore.length > 0 ? trimmedBefore[trimmedBefore.length - 1] : '';
  const hasPrecedingAtom = /[0-9a-zA-Z\)\]\}]/.test(lastChar);

  // 1. 上标 (幂)
  if (rawLatex === '^{\\square}' || rawLatex === '^{}' || rawLatex === '^\\square') {
    if (selectedText) {
      // 选区自动作为底数
      const inserted = `{${selectedText}}^{}`;
      const nextValue = before + inserted + after;
      const cursor = start + inserted.length - 1; // 光标移至 ^{} 内部
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    if (hasPrecedingAtom) {
      // 光标前已有底数（如 1、x），直接追加 ^{}，并将光标移至 {} 内部，不插入冗余 x
      const inserted = '^{}';
      const nextValue = before + inserted + after;
      const cursor = start + 2;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    // 无底数时插入完整的 ^{} 并定位内部
    const inserted = '^{}';
    const nextValue = before + inserted + after;
    const cursor = start + 2;
    return { nextValue, cursorStart: cursor, cursorEnd: cursor };
  }

  // 2. 下标
  if (rawLatex === '_{\\square}' || rawLatex === '_{}' || rawLatex === '_\\square') {
    if (selectedText) {
      const inserted = `{${selectedText}}_{}`;
      const nextValue = before + inserted + after;
      const cursor = start + inserted.length - 1;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    if (hasPrecedingAtom) {
      const inserted = '_{}';
      const nextValue = before + inserted + after;
      const cursor = start + 2;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    const inserted = '_{}';
    const nextValue = before + inserted + after;
    const cursor = start + 2;
    return { nextValue, cursorStart: cursor, cursorEnd: cursor };
  }

  // 3. 上下标
  if (rawLatex.includes('_{\\square}') && rawLatex.includes('^{\\square}')) {
    if (selectedText) {
      const inserted = `{${selectedText}}_{}^{}`;
      const nextValue = before + inserted + after;
      const cursor = start + `{${selectedText}}_`.length + 1; // 优先定位于下标 {}
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    const inserted = '_{}^{}';
    const nextValue = before + inserted + after;
    const cursor = start + 2; // 下标内部
    return { nextValue, cursorStart: cursor, cursorEnd: cursor };
  }

  // 4. 分式 (\frac 与 \dfrac)
  if (rawLatex.startsWith('\\frac{') || rawLatex.startsWith('\\dfrac{')) {
    const fn = rawLatex.startsWith('\\dfrac{') ? '\\dfrac' : '\\frac';
    if (selectedText) {
      // 选中文本作为分子，选中分母占位符
      const inserted = `${fn}{${selectedText}}{\\square}`;
      const nextValue = before + inserted + after;
      const denomStart = start + `${fn}{${selectedText}}{`.length;
      return { nextValue, cursorStart: denomStart, cursorEnd: denomStart + 7 };
    }
    const inserted = `${fn}{\\square}{\\square}`;
    const nextValue = before + inserted + after;
    // 选中分子占位符
    const numStart = start + `${fn}{`.length;
    return { nextValue, cursorStart: numStart, cursorEnd: numStart + 7 };
  }

  // 5. 根号 (\sqrt)
  if (rawLatex.startsWith('\\sqrt{')) {
    if (selectedText) {
      const inserted = `\\sqrt{${selectedText}}`;
      const nextValue = before + inserted + after;
      const cursor = start + inserted.length;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    const inserted = `\\sqrt{\\square}`;
    const nextValue = before + inserted + after;
    const targetStart = start + `\\sqrt{`.length;
    return { nextValue, cursorStart: targetStart, cursorEnd: targetStart + 7 };
  }

  // 6. n 次根号 (\sqrt[n])
  if (rawLatex.startsWith('\\sqrt[')) {
    if (selectedText) {
      const inserted = `\\sqrt[n]{${selectedText}}`;
      const nextValue = before + inserted + after;
      const cursor = start + inserted.length;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    const inserted = `\\sqrt[n]{\\square}`;
    const nextValue = before + inserted + after;
    const targetStart = start + `\\sqrt[n]{`.length;
    return { nextValue, cursorStart: targetStart, cursorEnd: targetStart + 7 };
  }

  // 7. 加框 (\boxed)
  if (rawLatex.startsWith('\\boxed{')) {
    if (selectedText) {
      const inserted = `\\boxed{${selectedText}}`;
      const nextValue = before + inserted + after;
      const cursor = start + inserted.length;
      return { nextValue, cursorStart: cursor, cursorEnd: cursor };
    }
    const inserted = `\\boxed{\\square}`;
    const nextValue = before + inserted + after;
    const targetStart = start + `\\boxed{`.length;
    return { nextValue, cursorStart: targetStart, cursorEnd: targetStart + 7 };
  }

  // 8. 自适应包裹模板
  if (selectedText && item.wrap) {
    const inserted = item.wrap.replace('${SEL}', selectedText);
    const nextValue = before + inserted + after;
    const cursor = start + inserted.length;
    return { nextValue, cursorStart: cursor, cursorEnd: cursor };
  }

  // 9. 通用带占位符 \square 的符号
  let inserted = item.latex;
  let focusStart = -1;
  let focusEnd = -1;

  if (selectedText && item.wrap) {
    inserted = item.wrap.replace('${SEL}', selectedText);
  }

  const sqIndex = inserted.indexOf('\\square');
  if (sqIndex !== -1) {
    focusStart = start + sqIndex;
    focusEnd = focusStart + 7;
  } else {
    focusStart = start + inserted.length;
    focusEnd = focusStart;
  }

  const nextValue = before + inserted + after;
  return { nextValue, cursorStart: focusStart, cursorEnd: focusEnd };
}

export type MatrixType = 'pmatrix' | 'bmatrix' | 'vmatrix' | 'cases';

/**
 * 动态根据行列数 (m × n) 生成标准 LaTeX 矩阵/方程组模板
 */
export function generateMatrixTemplate(
  type: MatrixType,
  rows: number,
  cols: number
): { latex: string; display: string; mathliveSnippet: string } {
  const safeRows = Math.max(1, Math.min(6, rows));
  const safeCols = Math.max(1, Math.min(6, cols));

  const rowStrings: string[] = [];
  const mathliveRowStrings: string[] = [];

  for (let r = 0; r < safeRows; r++) {
    const cells = Array(safeCols).fill('\\placeholder{}').join(' & ');
    const mlCells = Array(safeCols).fill('#?').join(' & ');
    const isLast = r === safeRows - 1;
    rowStrings.push(`  ${cells}${isLast ? '' : ' \\\\'}`);
    mathliveRowStrings.push(`${mlCells}${isLast ? '' : ' \\\\'}`);
  }

  const inner = rowStrings.join('\n');
  const mlInner = mathliveRowStrings.join(' ');
  const latex = `\\begin{${type}}\n${inner}\n\\end{${type}}`;
  const mathliveSnippet = `\\begin{${type}} ${mlInner} \\end{${type}}`;
  const display = `\\begin{${type}} ${safeRows > 1 ? `\\dots` : `\\Box`} \\end{${type}}`;

  return { latex, display, mathliveSnippet };
}

/**
 * 在现有公式代码中的矩阵或对齐环境中追加一行
 */
export function appendMatrixRow(code: string): string {
  const envRegex = /\\begin\{(pmatrix|bmatrix|vmatrix|matrix|cases|aligned)\}([\s\S]*?)\\end\{\1\}/i;
  const match = code.match(envRegex);

  if (!match) {
    // 若当前公式无环境，检测是否有内容
    const trimmed = code.trim();
    if (!trimmed) {
      return `\\begin{pmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{pmatrix}`;
    }
    return `${trimmed} \\\\\n\\placeholder{}`;
  }

  const fullMatched = match[0];
  const envType = match[1];
  const innerContent = match[2];

  // 估算当前矩阵最后一行的列数（根据 & 数量 + 1）
  const lines = innerContent.trim().split('\\\\');
  const lastLine = lines[lines.length - 1] || '';
  const colCount = Math.max(1, (lastLine.match(/(^|[^\\])&/g) || []).length + 1);

  const newRowCells = Array(colCount).fill('\\placeholder{}').join(' & ');
  const trimmedInner = innerContent.trimEnd();
  const needsBreak = !trimmedInner.endsWith('\\\\');
  const updatedInner = `${trimmedInner}${needsBreak ? ' \\\\\n  ' : '\n  '}${newRowCells}\n`;

  const updatedEnv = `\\begin{${envType}}${updatedInner}\\end{${envType}}`;
  return code.replace(fullMatched, updatedEnv);
}

/**
 * 在现有公式代码中的矩阵或对齐环境中追加一列
 */
export function appendMatrixCol(code: string): string {
  const envRegex = /\\begin\{(pmatrix|bmatrix|vmatrix|matrix|cases|aligned)\}([\s\S]*?)\\end\{\1\}/i;
  const match = code.match(envRegex);

  if (!match) {
    const trimmed = code.trim();
    if (!trimmed) {
      return `\\begin{pmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{pmatrix}`;
    }
    return `${trimmed} & \\placeholder{}`;
  }

  const fullMatched = match[0];
  const envType = match[1];
  const innerContent = match[2];

  // 为每一行末尾添加 " & \placeholder{}"
  const lines = innerContent.split('\n');
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.endsWith('\\\\')) {
      const beforeBreak = trimmed.slice(0, -2).trimEnd();
      return `  ${beforeBreak} & \\placeholder{} \\\\`;
    }
    return `  ${trimmed} & \\placeholder{}`;
  });

  const updatedEnv = `\\begin{${envType}}\n${updatedLines.join('\n')}\n\\end{${envType}}`;
  return code.replace(fullMatched, updatedEnv);
}

