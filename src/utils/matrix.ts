/**
 * 矩阵与方程组环境深度解析与二维行列操作工具
 * 严格支持大括号嵌套检测与顶层 \\ / & 分割，防止单行公式拆分长度不一致
 */

export type SupportedMatrixEnv =
  | 'matrix'
  | 'pmatrix'
  | 'bmatrix'
  | 'Bmatrix'
  | 'vmatrix'
  | 'Vmatrix'
  | 'cases'
  | 'aligned';

export interface ParsedMatrix {
  matched: boolean;
  envType: SupportedMatrixEnv | '';
  grid: string[][];
  prefix: string;
  suffix: string;
  rawEnvText: string;
}

const SUPPORTED_ENVS = ['pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix', 'Vmatrix', 'matrix', 'cases', 'aligned'];

/**
 * 分割顶层标记（忽略处于 {...}、[...] 或嵌套 \begin{}...\end{} 内部的字符）
 */
export function splitTopLevel(text: string, delimiter: string): string[] {
  const tokens: string[] = [];
  let braceDepth = 0;
  let bracketDepth = 0;
  let envDepth = 0;
  let currentStart = 0;
  const len = text.length;
  const delimLen = delimiter.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';

    // 转义反斜杠处理
    if (char === '\\' && prevChar !== '\\') {
      const rest = text.slice(i);
      if (rest.startsWith('\\begin{')) {
        envDepth++;
      } else if (rest.startsWith('\\end{')) {
        envDepth = Math.max(0, envDepth - 1);
      }
    }

    if (char === '{' && prevChar !== '\\') {
      braceDepth++;
    } else if (char === '}' && prevChar !== '\\') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (char === '[' && prevChar !== '\\') {
      bracketDepth++;
    } else if (char === ']' && prevChar !== '\\') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    }

    if (braceDepth === 0 && bracketDepth === 0 && envDepth === 0) {
      if (text.slice(i, i + delimLen) === delimiter) {
        tokens.push(text.slice(currentStart, i));
        currentStart = i + delimLen;
        i += delimLen - 1;
      }
    }
  }

  tokens.push(text.slice(currentStart));
  return tokens;
}

/**
 * 解析公式中的目标矩阵环境为统一规范的二维网格数据结构
 */
export function parseMatrix(code: string): ParsedMatrix {
  // 查找最外层的匹配矩阵环境
  const envPattern = new RegExp(
    `\\\\begin\\{(${SUPPORTED_ENVS.join('|')})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
    'i'
  );
  const match = code.match(envPattern);

  if (!match || match.index === undefined) {
    return {
      matched: false,
      envType: '',
      grid: [],
      prefix: code,
      suffix: '',
      rawEnvText: '',
    };
  }

  const rawEnvText = match[0];
  const envType = match[1] as SupportedMatrixEnv;
  const innerContent = match[2];
  const prefix = code.slice(0, match.index);
  const suffix = code.slice(match.index + rawEnvText.length);

  // 1. 按顶层 \\ 分解为行
  const rawRows = splitTopLevel(innerContent.trim(), '\\\\');
  const validRows = rawRows
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  if (validRows.length === 0) {
    return {
      matched: true,
      envType,
      grid: [['\\placeholder{}']],
      prefix,
      suffix,
      rawEnvText,
    };
  }

  // 2. 按顶层 & 分解为单元格
  const parsedGrid = validRows.map((rowStr) => {
    const rawCells = splitTopLevel(rowStr, '&');
    return rawCells.map((cell) => cell.trim() || '\\placeholder{}');
  });

  // 3. 统计最大列数，补齐各行缺失单元格以保证严格矩形结构
  const maxCols = Math.max(...parsedGrid.map((row) => row.length), 1);
  const normalizedGrid = parsedGrid.map((row) => {
    const nextRow = [...row];
    while (nextRow.length < maxCols) {
      nextRow.push('\\placeholder{}');
    }
    return nextRow;
  });

  return {
    matched: true,
    envType,
    grid: normalizedGrid,
    prefix,
    suffix,
    rawEnvText,
  };
}

/**
 * 将二维单元格网格序列化为优雅格式化的 LaTeX 矩阵字符串
 */
export function serializeMatrix(envType: SupportedMatrixEnv, grid: string[][]): string {
  if (grid.length === 0 || grid[0].length === 0) {
    return `\\begin{${envType}}\n  \\placeholder{}\n\\end{${envType}}`;
  }

  const rowStrings = grid.map((row, idx) => {
    const isLast = idx === grid.length - 1;
    const cells = row.join(' & ');
    return `  ${cells}${isLast ? '' : ' \\\\'}`;
  });

  return `\\begin{${envType}}\n${rowStrings.join('\n')}\n\\end{${envType}}`;
}

/**
 * 矩阵追加一行
 */
export function appendMatrixRow(code: string): string {
  const parsed = parseMatrix(code);

  if (!parsed.matched) {
    const trimmed = code.trim();
    if (!trimmed) {
      return `\\begin{bmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{bmatrix}`;
    }
    return `${trimmed} \\\\\n\\placeholder{}`;
  }

  const colCount = Math.max(1, parsed.grid[0]?.length || 2);
  const newRow = Array(colCount).fill('\\placeholder{}');
  const newGrid = [...parsed.grid, newRow];
  const newEnvStr = serializeMatrix(parsed.envType as SupportedMatrixEnv, newGrid);

  return parsed.prefix + newEnvStr + parsed.suffix;
}

/**
 * 矩阵删除末行
 */
export function deleteMatrixRow(code: string): string {
  const parsed = parseMatrix(code);
  if (!parsed.matched || parsed.grid.length <= 1) {
    return code;
  }

  const newGrid = parsed.grid.slice(0, -1);
  const newEnvStr = serializeMatrix(parsed.envType as SupportedMatrixEnv, newGrid);
  return parsed.prefix + newEnvStr + parsed.suffix;
}

/**
 * 矩阵追加一列
 */
export function appendMatrixCol(code: string): string {
  const parsed = parseMatrix(code);

  if (!parsed.matched) {
    const trimmed = code.trim();
    if (!trimmed) {
      return `\\begin{bmatrix}\n  \\placeholder{} & \\placeholder{} \\\\\n  \\placeholder{} & \\placeholder{}\n\\end{bmatrix}`;
    }
    return `${trimmed} & \\placeholder{}`;
  }

  const newGrid = parsed.grid.map((row) => [...row, '\\placeholder{}']);
  const newEnvStr = serializeMatrix(parsed.envType as SupportedMatrixEnv, newGrid);

  return parsed.prefix + newEnvStr + parsed.suffix;
}

/**
 * 矩阵删除末列
 */
export function deleteMatrixCol(code: string): string {
  const parsed = parseMatrix(code);
  if (!parsed.matched || (parsed.grid[0] && parsed.grid[0].length <= 1)) {
    return code;
  }

  const newGrid = parsed.grid.map((row) => row.slice(0, -1));
  const newEnvStr = serializeMatrix(parsed.envType as SupportedMatrixEnv, newGrid);
  return parsed.prefix + newEnvStr + parsed.suffix;
}
