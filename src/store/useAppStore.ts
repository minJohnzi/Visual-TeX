import { create } from 'zustand';
import { commandBus } from '../commands/commandBus';
import { compileDocument } from '../core/latex/katexCompiler';
import {
  CanvasBgMode,
  CompileResult,
  ContentBlock,
  DelimiterMode,
  DocMode,
  DocumentModel,
  EditOrigin,
  EditorMode,
  FormulaVersion,
  Transaction,
} from '../core/types';
import {
  createBlockId,
  loadFavorites,
  loadHistoryNotes,
  loadInitialBlocks,
  loadInitialCode,
  loadInitialDelimiterMode,
  loadInitialDocMode,
  loadInitialEditorMode,
  loadInitialPaletteCollapsed,
  loadInitialTheme,
  loadRecentVersions,
  loadSavedHistory,
  MAX_RECENT_VERSIONS,
  MAX_SAVED_HISTORY,
  saveBlocks,
  saveCode,
  saveDelimiterMode,
  saveDocMode,
  saveEditorMode,
  saveFavorites,
  saveHistoryList,
  saveHistoryNotes,
  savePaletteCollapsed,
  saveRecentVersions,
  saveTheme,
} from './persistence';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface DocumentSnapshot {
  docMode: DocMode;
  singleLatex: string;
  blocks: ContentBlock[];
}

const MAX_UNDO_HISTORY = 50;

export interface AppState {
  theme: 'light' | 'dark';
  docMode: DocMode;
  document: DocumentModel;
  activeBlockId: string;
  editorMode: EditorMode;
  delimiterMode: DelimiterMode;
  lastTransaction: Transaction;
  compileResult: CompileResult;
  historyStack: DocumentSnapshot[];
  historyIndex: number;
  recentVersions: FormulaVersion[];
  savedHistory: string[];
  favorites: string[];
  historyNotes: Record<string, string>;
  paletteCollapsed: boolean;
  previewBgMode: CanvasBgMode;
  previewColor: string;
  previewZoom: number;
  modals: {
    examples: boolean;
    history: boolean;
    help: boolean;
    export: boolean;
  };
  toasts: ToastMessage[];

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setEditorMode: (mode: EditorMode) => void;
  setDelimiterMode: (mode: DelimiterMode) => void;
  setDocMode: (mode: DocMode) => void;
  setActiveBlockId: (blockId: string) => void;
  setSingleLatex: (latex: string, origin: EditOrigin, focusOffset?: number | null) => void;
  updateBlockContent: (
    blockId: string,
    patch: { content?: string; latex?: string },
    origin: EditOrigin,
    focusOffset?: number | null
  ) => void;
  addBlock: (type: 'text' | 'math', afterBlockId?: string) => string;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, direction: 'up' | 'down') => void;
  applyFormulaPreset: (latex: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveToHistoryList: (latex: string) => void;
  removeFromHistoryList: (latex: string) => void;
  clearSavedHistory: () => void;
  toggleFavorite: (latex: string) => boolean;
  isFavorite: (latex: string) => boolean;
  setHistoryNote: (latex: string, note: string) => void;
  importMarkdownBlocks: (blocks: ContentBlock[], switchToMixed?: boolean) => void;
  applyRestoredDocument: (payload: {
    mode: DocMode;
    singleLatex: string;
    blocks: ContentBlock[];
    delimiterMode: DelimiterMode;
  }) => void;
  saveVersionSnapshot: (latex?: string) => void;
  restoreVersion: (id: string) => void;
  setPaletteCollapsed: (collapsed: boolean) => void;
  setPreviewBgMode: (bgMode: CanvasBgMode) => void;
  setPreviewColor: (color: string) => void;
  setPreviewZoom: (zoom: number) => void;
  setModalOpen: (modal: keyof AppState['modals'], open: boolean) => void;
  pushToast: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  flushCompile: () => void;
  getActiveMathLatex: () => string;
  setActiveMathLatex: (latex: string, origin?: EditOrigin, focusOffset?: number | null) => void;
}

const initialCode = loadInitialCode();
const initialDocMode = loadInitialDocMode();
const initialBlocks = loadInitialBlocks(initialCode);
const initialDocument: DocumentModel = {
  mode: initialDocMode,
  singleLatex: initialCode,
  blocks: initialBlocks,
};

const initialActiveBlockId =
  initialDocMode === 'mixed'
    ? (initialBlocks.find((b) => b.type === 'math')?.id ?? initialBlocks[0].id)
    : 'single';

const initialSnapshot: DocumentSnapshot = {
  docMode: initialDocMode,
  singleLatex: initialCode,
  blocks: initialBlocks,
};

let compileTimer: ReturnType<typeof setTimeout> | null = null;
let historyCommitTimer: ReturnType<typeof setTimeout> | null = null;
let versionTimer: ReturnType<typeof setTimeout> | null = null;

function snapshotsEqual(a: DocumentSnapshot, b: DocumentSnapshot): boolean {
  if (a.docMode !== b.docMode || a.singleLatex !== b.singleLatex) return false;
  if (a.blocks.length !== b.blocks.length) return false;
  for (let i = 0; i < a.blocks.length; i++) {
    const ba = a.blocks[i];
    const bb = b.blocks[i];
    if (ba.id !== bb.id || ba.type !== bb.type) return false;
    if (ba.type === 'text' && bb.type === 'text' && ba.content !== bb.content) return false;
    if (ba.type === 'math' && bb.type === 'math' && ba.latex !== bb.latex) return false;
  }
  return true;
}

function appendHistorySnapshot(
  stack: DocumentSnapshot[],
  currentIndex: number,
  nextSnapshot: DocumentSnapshot
): { historyStack: DocumentSnapshot[]; historyIndex: number } {
  const truncated = stack.slice(0, currentIndex + 1);
  const top = truncated[truncated.length - 1];
  if (top && snapshotsEqual(top, nextSnapshot)) {
    return { historyStack: stack, historyIndex: currentIndex };
  }
  const appended = [...truncated, nextSnapshot];
  if (appended.length > MAX_UNDO_HISTORY) {
    appended.shift();
  }
  return {
    historyStack: appended,
    historyIndex: appended.length - 1,
  };
}

export const useAppStore = create<AppState>((set, get) => {
  const scheduleCompile = (immediate: boolean) => {
    if (compileTimer !== null) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
    if (immediate) {
      const state = get();
      set({ compileResult: compileDocument(state.document) });
      return;
    }
    compileTimer = setTimeout(() => {
      compileTimer = null;
      const state = get();
      set({ compileResult: compileDocument(state.document) });
    }, 80);
  };

  const scheduleHistoryPush = (immediate: boolean) => {
    if (historyCommitTimer !== null) {
      clearTimeout(historyCommitTimer);
      historyCommitTimer = null;
    }
    const commit = () => {
      const state = get();
      const snapshot: DocumentSnapshot = {
        docMode: state.docMode,
        singleLatex: state.document.singleLatex,
        blocks: state.document.blocks,
      };
      const updated = appendHistorySnapshot(
        state.historyStack,
        state.historyIndex,
        snapshot
      );
      if (
        updated.historyStack !== state.historyStack ||
        updated.historyIndex !== state.historyIndex
      ) {
        set(updated);
      }
    };

    if (immediate) {
      commit();
    } else {
      historyCommitTimer = setTimeout(() => {
        historyCommitTimer = null;
        commit();
      }, 450);
    }
  };

  const scheduleVersionAutoSave = () => {
    if (versionTimer !== null) {
      clearTimeout(versionTimer);
      versionTimer = null;
    }
    versionTimer = setTimeout(() => {
      versionTimer = null;
      const latex = get().getActiveMathLatex();
      if (latex.trim().length >= 3) {
        get().saveVersionSnapshot(latex);
      }
    }, 2500);
  };

  const store: AppState = {
    theme: loadInitialTheme(),
    docMode: initialDocMode,
    document: initialDocument,
    activeBlockId: initialActiveBlockId,
    editorMode: loadInitialEditorMode(),
    delimiterMode: loadInitialDelimiterMode(),
    lastTransaction: { seq: 0, origin: 'external', blockId: initialActiveBlockId },
    compileResult: compileDocument(initialDocument),
    historyStack: [initialSnapshot],
    historyIndex: 0,
    recentVersions: loadRecentVersions(),
    savedHistory: loadSavedHistory(),
    favorites: loadFavorites(),
    historyNotes: loadHistoryNotes(),
    paletteCollapsed: loadInitialPaletteCollapsed(),
    previewBgMode: 'checker',
    previewColor: 'default',
    previewZoom: 1,
    modals: {
      examples: false,
      history: false,
      help: false,
      export: false,
    },
    toasts: [],

    setTheme: (theme) => {
      saveTheme(theme);
      set({ theme });
    },

    toggleTheme: () => {
      const next = get().theme === 'light' ? 'dark' : 'light';
      saveTheme(next);
      set({ theme: next });
    },

    setEditorMode: (mode) => {
      saveEditorMode(mode);
      set({ editorMode: mode });
    },

    setDelimiterMode: (delimiterMode) => {
      saveDelimiterMode(delimiterMode);
      set({ delimiterMode });
    },

    setDocMode: (mode) => {
      const state = get();
      if (state.docMode === mode) return;

      let nextBlocks = state.document.blocks;
      let nextActiveId = 'single';

      if (mode === 'mixed') {
        if (nextBlocks.length === 0) {
          const mathBlock: ContentBlock = {
            id: createBlockId('math'),
            type: 'math',
            latex: state.document.singleLatex,
          };
          nextBlocks = [{ id: createBlockId('txt'), type: 'text', content: '' }, mathBlock];
          nextActiveId = mathBlock.id;
        } else {
          nextActiveId =
            nextBlocks.find((b) => b.type === 'math')?.id ?? nextBlocks[0].id;
        }
      }

      const nextDoc: DocumentModel = {
        mode,
        singleLatex: state.document.singleLatex,
        blocks: nextBlocks,
      };

      saveDocMode(mode);
      saveBlocks(nextBlocks);

      set((s) => ({
        docMode: mode,
        document: nextDoc,
        activeBlockId: nextActiveId,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'external',
          blockId: nextActiveId,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
    },

    setActiveBlockId: (blockId) => {
      if (get().activeBlockId === blockId) return;
      set({ activeBlockId: blockId });
    },

    setSingleLatex: (latex, origin, focusOffset = null) => {
      const state = get();
      const nextDoc: DocumentModel = {
        ...state.document,
        mode: 'single',
        singleLatex: latex,
      };
      saveCode(latex);

      set((s) => ({
        docMode: 'single',
        document: nextDoc,
        activeBlockId: 'single',
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin,
          blockId: 'single',
          focusOffset,
        },
      }));

      const immediate = origin === 'command' || origin === 'history' || origin === 'external';
      scheduleCompile(immediate);
      if (origin !== 'history') {
        scheduleHistoryPush(immediate);
        scheduleVersionAutoSave();
      }
    },

    updateBlockContent: (blockId, patch, origin, focusOffset = null) => {
      const state = get();
      const idx = state.document.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;

      const target = state.document.blocks[idx];
      let updated: ContentBlock;
      if (target.type === 'text') {
        updated = {
          ...target,
          content: patch.content ?? target.content,
        };
      } else {
        updated = {
          ...target,
          latex: patch.latex ?? target.latex,
        };
      }

      const nextBlocks = [...state.document.blocks];
      nextBlocks[idx] = updated;
      const nextDoc: DocumentModel = {
        ...state.document,
        blocks: nextBlocks,
      };
      saveBlocks(nextBlocks);

      set((s) => ({
        document: nextDoc,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin,
          blockId,
          focusOffset,
        },
      }));

      const immediate = origin === 'command' || origin === 'history' || origin === 'external';
      scheduleCompile(immediate);
      if (origin !== 'history') {
        scheduleHistoryPush(immediate);
        scheduleVersionAutoSave();
      }
    },

    addBlock: (type, afterBlockId) => {
      const newBlock: ContentBlock =
        type === 'text'
          ? { id: createBlockId('txt'), type: 'text', content: '' }
          : { id: createBlockId('math'), type: 'math', latex: '' };

      const state = get();
      const nextBlocks = [...state.document.blocks];
      const insertIdx = afterBlockId
        ? nextBlocks.findIndex((b) => b.id === afterBlockId)
        : -1;
      if (insertIdx === -1) {
        nextBlocks.push(newBlock);
      } else {
        nextBlocks.splice(insertIdx + 1, 0, newBlock);
      }

      const nextDoc: DocumentModel = {
        ...state.document,
        blocks: nextBlocks,
      };
      saveBlocks(nextBlocks);

      set((s) => ({
        document: nextDoc,
        activeBlockId: newBlock.id,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'command',
          blockId: newBlock.id,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
      return newBlock.id;
    },

    deleteBlock: (blockId) => {
      const state = get();
      if (state.document.blocks.length <= 1) return;
      const idx = state.document.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;

      const nextBlocks = state.document.blocks.filter((b) => b.id !== blockId);
      const nextActive =
        state.activeBlockId === blockId
          ? nextBlocks[Math.max(0, idx - 1)].id
          : state.activeBlockId;

      const nextDoc: DocumentModel = {
        ...state.document,
        blocks: nextBlocks,
      };
      saveBlocks(nextBlocks);

      set((s) => ({
        document: nextDoc,
        activeBlockId: nextActive,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'command',
          blockId: nextActive,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
    },

    moveBlock: (blockId, direction) => {
      const state = get();
      const idx = state.document.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= state.document.blocks.length) return;

      const nextBlocks = [...state.document.blocks];
      const [item] = nextBlocks.splice(idx, 1);
      nextBlocks.splice(targetIdx, 0, item);

      const nextDoc: DocumentModel = {
        ...state.document,
        blocks: nextBlocks,
      };
      saveBlocks(nextBlocks);

      set((s) => ({
        document: nextDoc,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'command',
          blockId,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
    },

    applyFormulaPreset: (latex) => {
      const state = get();
      if (state.docMode === 'single') {
        state.setSingleLatex(latex, 'command');
        return;
      }
      const active = state.document.blocks.find((b) => b.id === state.activeBlockId);
      if (active && active.type === 'math') {
        state.updateBlockContent(active.id, { latex }, 'command');
        return;
      }
      const firstMath = state.document.blocks.find((b) => b.type === 'math');
      if (firstMath) {
        set({ activeBlockId: firstMath.id });
        state.updateBlockContent(firstMath.id, { latex }, 'command');
      } else {
        const createdId = state.addBlock('math');
        state.updateBlockContent(createdId, { latex }, 'command');
      }
    },

    undo: () => {
      const state = get();
      if (state.historyIndex <= 0) return;
      const nextIndex = state.historyIndex - 1;
      const snap = state.historyStack[nextIndex];
      const nextDoc: DocumentModel = {
        mode: snap.docMode,
        singleLatex: snap.singleLatex,
        blocks: snap.blocks,
      };
      saveDocMode(snap.docMode);
      saveCode(snap.singleLatex);
      saveBlocks(snap.blocks);

      set((s) => ({
        docMode: snap.docMode,
        document: nextDoc,
        historyIndex: nextIndex,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'history',
          blockId: s.activeBlockId,
        },
        compileResult: compileDocument(nextDoc),
      }));
    },

    redo: () => {
      const state = get();
      if (state.historyIndex >= state.historyStack.length - 1) return;
      const nextIndex = state.historyIndex + 1;
      const snap = state.historyStack[nextIndex];
      const nextDoc: DocumentModel = {
        mode: snap.docMode,
        singleLatex: snap.singleLatex,
        blocks: snap.blocks,
      };
      saveDocMode(snap.docMode);
      saveCode(snap.singleLatex);
      saveBlocks(snap.blocks);

      set((s) => ({
        docMode: snap.docMode,
        document: nextDoc,
        historyIndex: nextIndex,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'history',
          blockId: s.activeBlockId,
        },
        compileResult: compileDocument(nextDoc),
      }));
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().historyStack.length - 1,

    saveToHistoryList: (latex) => {
      const trimmed = latex.trim();
      if (trimmed.length < 3) return;
      const prev = get().savedHistory;
      const filtered = prev.filter((item) => item !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_SAVED_HISTORY);
      saveHistoryList(next);
      set({ savedHistory: next });
    },

    removeFromHistoryList: (latex) => {
      const next = get().savedHistory.filter((item) => item !== latex);
      saveHistoryList(next);
      set({ savedHistory: next });
    },

    clearSavedHistory: () => {
      const favSet = new Set(get().favorites);
      const kept = get().savedHistory.filter((item) => favSet.has(item));
      saveHistoryList(kept);
      set({ savedHistory: kept });
    },

    toggleFavorite: (latex) => {
      const trimmed = latex.trim();
      if (!trimmed) return false;
      const prev = get().favorites;
      const exists = prev.includes(trimmed);
      const next = exists ? prev.filter((item) => item !== trimmed) : [trimmed, ...prev];
      saveFavorites(next);
      set({ favorites: next });
      return !exists;
    },

    isFavorite: (latex) => {
      const trimmed = latex.trim();
      return trimmed.length > 0 && get().favorites.includes(trimmed);
    },

    setHistoryNote: (latex, note) => {
      const key = latex.trim();
      if (!key) return;
      const next = { ...get().historyNotes };
      if (note.trim().length === 0) {
        delete next[key];
      } else {
        next[key] = note.trim();
      }
      saveHistoryNotes(next);
      set({ historyNotes: next });
    },

    importMarkdownBlocks: (blocks, switchToMixed = true) => {
      if (blocks.length === 0) return;
      const state = get();
      const nextDocMode: DocMode = switchToMixed ? 'mixed' : state.docMode;
      const firstMath = blocks.find((b) => b.type === 'math');
      const nextActiveBlock = firstMath?.id ?? blocks[0].id;
      const nextDoc: DocumentModel = {
        mode: nextDocMode,
        singleLatex: state.document.singleLatex,
        blocks,
      };
      saveDocMode(nextDocMode);
      saveBlocks(blocks);
      set((s) => ({
        docMode: nextDocMode,
        document: nextDoc,
        activeBlockId: nextActiveBlock,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'external',
          blockId: nextActiveBlock,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
    },

    applyRestoredDocument: (payload) => {
      const nextActiveBlock =
        payload.blocks.find((b) => b.type === 'math')?.id ??
        payload.blocks[0]?.id ??
        get().activeBlockId;
      const nextDoc: DocumentModel = {
        mode: payload.mode,
        singleLatex: payload.singleLatex,
        blocks: payload.blocks,
      };
      saveDocMode(payload.mode);
      saveCode(payload.singleLatex);
      saveBlocks(payload.blocks);
      saveDelimiterMode(payload.delimiterMode);
      set((s) => ({
        docMode: payload.mode,
        delimiterMode: payload.delimiterMode,
        document: nextDoc,
        activeBlockId: nextActiveBlock,
        lastTransaction: {
          seq: s.lastTransaction.seq + 1,
          origin: 'external',
          blockId: nextActiveBlock,
        },
        compileResult: compileDocument(nextDoc),
      }));
      scheduleHistoryPush(true);
    },

    saveVersionSnapshot: (maybeLatex) => {
      const latex = (maybeLatex ?? get().getActiveMathLatex()).trim();
      if (latex.length < 3) return;
      const existing = get().recentVersions;
      if (existing[0]?.latex === latex) return;

      const version: FormulaVersion = {
        id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        latex,
        timestamp: Date.now(),
        charCount: latex.length,
      };
      const next = [
        version,
        ...existing.filter((item) => item.latex !== latex),
      ].slice(0, MAX_RECENT_VERSIONS);
      saveRecentVersions(next);
      set({ recentVersions: next });
    },

    restoreVersion: (id) => {
      const match = get().recentVersions.find((v) => v.id === id);
      if (!match) return;
      get().setActiveMathLatex(match.latex, 'history');
    },

    setPaletteCollapsed: (collapsed) => {
      savePaletteCollapsed(collapsed);
      set({ paletteCollapsed: collapsed });
    },

    setPreviewBgMode: (previewBgMode) => set({ previewBgMode }),
    setPreviewColor: (previewColor) => set({ previewColor }),
    setPreviewZoom: (zoom) => {
      const clamped = Math.max(0.5, Math.min(3.0, Number(zoom.toFixed(2))));
      set({ previewZoom: clamped });
    },

    setModalOpen: (modal, open) => {
      set((s) => ({ modals: { ...s.modals, [modal]: open } }));
    },

    pushToast: (message, type = 'info') => {
      const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((s) => ({
        toasts: [...s.toasts.slice(-3), { id, message, type }],
      }));
      setTimeout(() => {
        get().dismissToast(id);
      }, 2600);
    },

    dismissToast: (id) => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    flushCompile: () => {
      if (compileTimer !== null) {
        clearTimeout(compileTimer);
        compileTimer = null;
      }
      set({ compileResult: compileDocument(get().document) });
    },

    getActiveMathLatex: () => {
      const state = get();
      if (state.docMode === 'single') {
        return state.document.singleLatex;
      }
      const active = state.document.blocks.find((b) => b.id === state.activeBlockId);
      if (active && active.type === 'math') return active.latex;
      const firstMath = state.document.blocks.find((b) => b.type === 'math');
      return firstMath && firstMath.type === 'math' ? firstMath.latex : '';
    },

    setActiveMathLatex: (latex, origin = 'command', focusOffset = null) => {
      const state = get();
      if (state.docMode === 'single') {
        state.setSingleLatex(latex, origin, focusOffset);
        return;
      }
      const active = state.document.blocks.find((b) => b.id === state.activeBlockId);
      if (active && active.type === 'math') {
        state.updateBlockContent(active.id, { latex }, origin, focusOffset);
        return;
      }
      const firstMath = state.document.blocks.find((b) => b.type === 'math');
      if (firstMath) {
        state.setActiveBlockId(firstMath.id);
        state.updateBlockContent(firstMath.id, { latex }, origin, focusOffset);
      }
    },
  };

  return store;
});

// Wire CommandBus <-> Store bridge once at module initialization
commandBus.registerStore({
  getActiveLatex: () => useAppStore.getState().getActiveMathLatex(),
  setActiveLatex: (latex, focusOffset) =>
    useAppStore.getState().setActiveMathLatex(latex, 'command', focusOffset),
  setDelimiterMode: (delimiter) =>
    useAppStore.getState().setDelimiterMode(delimiter),
  setActiveBlock: (blockId) => useAppStore.getState().setActiveBlockId(blockId),
  undo: () => useAppStore.getState().undo(),
  redo: () => useAppStore.getState().redo(),
});
