export type EditOrigin = 'visual' | 'source' | 'command' | 'history' | 'external';

export type EditorMode = 'visual' | 'source';

export type DocMode = 'single' | 'mixed';

export type DelimiterMode = 'none' | 'inline' | 'display' | 'equation';

export type CanvasBgMode = 'checker' | 'white' | 'gray' | 'dark';

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export interface MathBlock {
  id: string;
  type: 'math';
  latex: string;
}

export type ContentBlock = TextBlock | MathBlock;

export interface DocumentModel {
  mode: DocMode;
  singleLatex: string;
  blocks: ContentBlock[];
}

export interface CompileError {
  blockId?: string;
  message: string;
  index: number;
  tokenLength: number;
  line: number;
  column: number;
  rawLine?: string;
}

export interface BlockCompileResult {
  blockId: string;
  type: 'text' | 'math';
  html: string;
  mathml?: string;
  error?: CompileError;
}

export interface CompileResult {
  html: string;
  mathml: string;
  error: CompileError | null;
  blockResults: BlockCompileResult[];
  hasError: boolean;
  isEmpty: boolean;
}

export interface FormulaVersion {
  id: string;
  latex: string;
  timestamp: number;
  charCount: number;
}

export interface Transaction {
  seq: number;
  origin: EditOrigin;
  blockId?: string;
  focusOffset?: number | null;
}

export type MatrixEnv = 'pmatrix' | 'bmatrix' | 'vmatrix' | 'cases';

export type SymbolCategoryId =
  | 'favorites'
  | 'algebra'
  | 'calculus'
  | 'greek'
  | 'matrix'
  | 'relations'
  | 'accents';

export interface SymbolTemplate {
  id?: string;
  label: string;
  labelZh?: string;
  labelEn?: string;
  tooltipZh?: string;
  tooltipEn?: string;
  latex: string;
  wrapLatex?: string;
  previewLatex?: string;
  keywords?: string[];
  isMatrix?: boolean;
  matrixEnv?: MatrixEnv;
  isWide?: boolean;
}

export type EditorInsertRole = 'cursor' | 'block' | 'placeholder';

export interface EditorInsertPayload {
  latex: string;
  selectionMode?: 'replace' | 'wrap-or-insert';
}

export interface ExportSvgResult {
  ok: boolean;
  svg: string;
  widthEx: number;
  heightEx: number;
  viewBox: string;
  error?: string;
}

export type ExportPaddingMode = 'compact' | 'normal' | 'relaxed';

export interface ExportOptions {
  format: 'png' | 'svg' | 'mathml';
  scale: 1 | 2 | 3 | 4 | 5;
  bgMode: CanvasBgMode;
  textColor: string;
  adaptiveHalo: boolean;
  padding?: ExportPaddingMode;
}
