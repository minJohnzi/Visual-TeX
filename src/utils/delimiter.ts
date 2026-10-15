import { stripOuterDelimitersIfEnclosed } from './pasteNormalize';

export type DelimiterMode = 'none' | 'inline' | 'display' | 'equation';

/**
 * 根据所选定界符模式包装公式源码用于复制或导出
 * 保证内部权威 LaTeX 保持纯净无嵌套
 */
export function wrapWithDelimiter(latex: string, mode: DelimiterMode): string {
  // 先剥离已有的一层外层包装，防止出现重复嵌套
  const { stripped } = stripOuterDelimitersIfEnclosed(latex);
  const trimmed = stripped.trim();
  if (!trimmed) return '';

  switch (mode) {
    case 'inline':
      return `$${trimmed}$`;
    case 'display':
      return `$$\n${trimmed}\n$$`;
    case 'equation':
      return `\\begin{equation}\n${trimmed}\n\\end{equation}`;
    case 'none':
    default:
      return trimmed;
  }
}
