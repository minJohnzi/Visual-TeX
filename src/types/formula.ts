export type SymbolCategoryId =
  | 'algebra'
  | 'calculus'
  | 'greek'
  | 'matrix'
  | 'relations'
  | 'modifiers';

export interface SymbolItem {
  id: string;
  label: string;
  previewLatex: string;
  insertTemplate: string;
  description: string;
}

export interface SymbolCategory {
  id: SymbolCategoryId;
  name: string;
  shortDesc: string;
  items: SymbolItem[];
}

export interface FormulaExample {
  id: string;
  name: string;
  category: string;
  latex: string;
  description: string;
}

export type PreviewScale = 1 | 1.5 | 2 | 3;

export type PreviewBackground = 'transparent' | 'white' | 'dark';

export type RenderStatus = 'Ready' | 'Compiling' | 'Error';

export interface FormulaEditorHandle {
  getSelectionRange: () => { start: number; end: number; selectedText: string };
  insertTemplate: (template: string) => void;
  focus: () => void;
}

export interface RenderOutcome {
  success: boolean;
  html: string;
  cleanedLatex: string;
  wasStripped: boolean;
  strippedDelimiter?: string;
  errorMessage?: string;
  errorPosition?: number;
  errorLine?: number;
  errorColumn?: number;
}

export interface FeedbackMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
}

export interface FormulaVersionItem {
  id: string;
  latex: string;
  timestamp: number;
  charCount: number;
  title: string;
}

export interface HistoryStep {
  latex: string;
  cursorStart: number;
  cursorEnd: number;
  timestamp: number;
}
