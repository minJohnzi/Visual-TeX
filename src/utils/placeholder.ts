/**
 * 占位符统一协议工具模块
 * 统一采用 LaTeX 标准与 MathLive 原生的 \placeholder{} 作为内部占位符规范，
 * 同时兼容旧历史数据中的 \square
 */

export interface PlaceholderRange {
  start: number;
  end: number;
  raw: string;
}

/**
 * 匹配公式中的占位符（\placeholder{...}、\placeholder{} 或 \square）
 */
const PLACEHOLDER_REGEX = /(\\placeholder\{[^}]*\}|\\placeholder|\\square)/g;

/**
 * 获取字符串中所有的占位符位置
 */
export function getAllPlaceholders(text: string): PlaceholderRange[] {
  const matches: PlaceholderRange[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  return matches;
}

/**
 * 向后查找下一个占位符（Tab 导航）
 */
export function findNextPlaceholder(text: string, currentOffset: number): PlaceholderRange | null {
  const all = getAllPlaceholders(text);
  for (const item of all) {
    if (item.start >= currentOffset) {
      return item;
    }
  }
  return null;
}

/**
 * 向前查找上一个占位符（Shift+Tab 导航）
 */
export function findPrevPlaceholder(text: string, currentOffset: number): PlaceholderRange | null {
  const all = getAllPlaceholders(text);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].end <= currentOffset) {
      return all[i];
    }
  }
  return null;
}

/**
 * 清除私有占位符以供导出和复制（转换为 KaTeX/MathJax 识别的 \Box 或空）
 */
export function stripInternalPlaceholders(latex: string): string {
  if (!latex) return '';
  return latex
    .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => inner.trim() || '\\Box')
    .replace(/\\placeholder/g, '\\Box')
    .replace(/\\square/g, '\\Box');
}

/**
 * 统一所有旧占位符格式为 \placeholder{}
 */
export function normalizePlaceholders(latex: string): string {
  if (!latex) return '';
  return latex.replace(/\\square/g, '\\placeholder{}');
}
