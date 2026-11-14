import { ContentBlock, DelimiterMode, DocMode, EditorMode, FormulaVersion } from '../core/types';

export const STORAGE_KEYS = {
  code: 'latex_formula_code',
  theme: 'latex_formula_theme',
  history: 'latex_formula_history',
  favorites: 'latex_formula_favorites',
  historyNotes: 'latex_formula_history_notes',
  editorMode: 'latex_formula_editor_mode',
  recentVersions: 'latex_formula_recent_5_versions',
  paletteCollapsed: 'latex_formula_palette_collapsed',
  lang: 'app_lang',
  docMode: 'latex_formula_doc_mode',
  blocks: 'latex_formula_blocks',
  delimiterMode: 'latex_formula_delimiter_mode',
} as const;

export const DEFAULT_FORMULA = String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;

export const MAX_SAVED_HISTORY = 30;
export const MAX_RECENT_VERSIONS = 5;

function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or private-mode access errors
  }
}

export function loadInitialCode(): string {
  const saved = safeGetItem(STORAGE_KEYS.code);
  return saved !== null && saved.length > 0 ? saved : DEFAULT_FORMULA;
}

export function saveCode(code: string): void {
  safeSetItem(STORAGE_KEYS.code, code);
}

export function loadInitialTheme(): 'light' | 'dark' {
  const saved = safeGetItem(STORAGE_KEYS.theme);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'light';
}

export function saveTheme(theme: 'light' | 'dark'): void {
  safeSetItem(STORAGE_KEYS.theme, theme);
}

export function loadInitialEditorMode(): EditorMode {
  const saved = safeGetItem(STORAGE_KEYS.editorMode);
  return saved === 'source' ? 'source' : 'visual';
}

export function saveEditorMode(mode: EditorMode): void {
  safeSetItem(STORAGE_KEYS.editorMode, mode);
}

export function loadInitialDelimiterMode(): DelimiterMode {
  const saved = safeGetItem(STORAGE_KEYS.delimiterMode);
  if (saved === 'inline' || saved === 'display' || saved === 'equation') {
    return saved;
  }
  return 'none';
}

export function saveDelimiterMode(mode: DelimiterMode): void {
  safeSetItem(STORAGE_KEYS.delimiterMode, mode);
}

export function loadInitialPaletteCollapsed(): boolean {
  return safeGetItem(STORAGE_KEYS.paletteCollapsed) === 'true';
}

export function savePaletteCollapsed(collapsed: boolean): void {
  safeSetItem(STORAGE_KEYS.paletteCollapsed, collapsed ? 'true' : 'false');
}

export function loadSavedHistory(): string[] {
  const raw = safeGetItem(STORAGE_KEYS.history);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length >= 3)
      .slice(0, MAX_SAVED_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistoryList(items: string[]): void {
  safeSetItem(STORAGE_KEYS.history, JSON.stringify(items.slice(0, MAX_SAVED_HISTORY)));
}

export function loadRecentVersions(): FormulaVersion[] {
  const raw = safeGetItem(STORAGE_KEYS.recentVersions);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is FormulaVersion =>
          v &&
          typeof v === 'object' &&
          typeof v.id === 'string' &&
          typeof v.latex === 'string' &&
          typeof v.timestamp === 'number' &&
          typeof v.charCount === 'number'
      )
      .slice(0, MAX_RECENT_VERSIONS);
  } catch {
    return [];
  }
}

export function saveRecentVersions(versions: FormulaVersion[]): void {
  safeSetItem(
    STORAGE_KEYS.recentVersions,
    JSON.stringify(versions.slice(0, MAX_RECENT_VERSIONS))
  );
}

export function loadInitialDocMode(): DocMode {
  return safeGetItem(STORAGE_KEYS.docMode) === 'mixed' ? 'mixed' : 'single';
}

export function saveDocMode(mode: DocMode): void {
  safeSetItem(STORAGE_KEYS.docMode, mode);
}

export function createBlockId(prefix = 'blk'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadInitialBlocks(fallbackLatex: string): ContentBlock[] {
  const raw = safeGetItem(STORAGE_KEYS.blocks);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(
          (item): item is ContentBlock =>
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            ((item.type === 'text' && typeof item.content === 'string') ||
              (item.type === 'math' && typeof item.latex === 'string'))
        );
        if (valid.length > 0) return valid;
      }
    } catch {
      // Fallback below
    }
  }

  return [
    { id: createBlockId('txt'), type: 'text', content: '' },
    { id: createBlockId('math'), type: 'math', latex: fallbackLatex },
  ];
}

export function saveBlocks(blocks: ContentBlock[]): void {
  safeSetItem(STORAGE_KEYS.blocks, JSON.stringify(blocks));
}

export function loadFavorites(): string[] {
  const raw = safeGetItem(STORAGE_KEYS.favorites);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim().length > 0 && !seen.has(item)) {
        seen.add(item);
      }
    }
    return Array.from(seen);
  } catch {
    return [];
  }
}

export function saveFavorites(items: string[]): void {
  const deduped = Array.from(
    new Set(items.filter((item) => typeof item === 'string' && item.trim().length > 0))
  );
  safeSetItem(STORAGE_KEYS.favorites, JSON.stringify(deduped));
}

export function loadHistoryNotes(): Record<string, string> {
  const raw = safeGetItem(STORAGE_KEYS.historyNotes);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === 'string' && typeof value === 'string' && value.trim().length > 0) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveHistoryNotes(notes: Record<string, string>): void {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    if (typeof key === 'string' && typeof value === 'string' && value.trim().length > 0) {
      cleaned[key] = value.trim();
    }
  }
  safeSetItem(STORAGE_KEYS.historyNotes, JSON.stringify(cleaned));
}
