import { SymbolCategoryId } from '../core/types';

export type Language = 'zh' | 'en';

export interface Translations {
  appName: string;
  appSubtitle: string;
  navExamples: string;
  navHistory: string;
  navHelp: string;
  navLang: string;
  navGithub: string;
  themeToDark: string;
  themeToLight: string;

  // Symbol palette
  paletteTitle: string;
  paletteCollapse: string;
  paletteExpand: string;
  paletteMoreSymbols: string;
  paletteLessSymbols: string;
  pinnedCoreLabel: string;
  compactKeycapsBtn: string;
  labeledKeycapsBtn: string;
  searchPlaceholder: string;
  clearSearch: string;
  searchResultsCount: string;
  pressEnterToInsert: string;
  noSearchResults: string;
  favoritesEmpty: string;
  customMatrixBtn: string;
  matrixDimensions: string;
  categories: Record<SymbolCategoryId, string>;

  // Editor & Workspace
  editorTitle: string;
  modeVisual: string;
  modeSource: string;
  docModeSingle: string;
  docModeMixed: string;
  visualPlaceholder: string;
  sourcePlaceholder: string;
  textBlockPlaceholder: string;
  visualActiveHint: string;
  liveLatexBarLabel: string;
  liveLatexBarPlaceholder: string;
  moreToolsBtn: string;
  lessToolsBtn: string;
  undo: string;
  redo: string;
  formatSource: string;
  autoFix: string;
  normalizePunctuation: string;
  deriveNextStep: string;
  shareLink: string;
  favoriteCurrent: string;
  unfavoriteCurrent: string;
  insertNewline: string;
  jumpPlaceholder: string;
  clearFormula: string;
  copyLatex: string;
  delimiterLabel: string;
  delimiterNone: string;
  delimiterInline: string;
  delimiterDisplay: string;
  delimiterEquation: string;
  statusReady: string;
  statusAutoAligned: string;
  statusError: string;
  charCountLabel: string;
  lineCountLabel: string;

  // Contextual Matrix & Format Bar
  matrixContext: string;
  appendRow: string;
  appendCol: string;
  deleteRow: string;
  deleteCol: string;
  formatText: string;
  formatMathrm: string;
  formatOperatorname: string;
  formatThinspace: string;
  formatCdot: string;

  // Mixed Blocks
  blockTextBadge: string;
  blockMathBadge: string;
  addTextBlock: string;
  addMathBlock: string;
  moveUp: string;
  moveDown: string;
  deleteBlock: string;
  emptyTextBlock: string;
  emptyMathBlock: string;
  recentVersions: string;
  versionChars: string;
  importMarkdownBtn: string;
  importMarkdownTitle: string;
  importMarkdownPlaceholder: string;
  importMarkdownApply: string;
  importMarkdownCancel: string;
  importMarkdownUpload: string;
  copyMarkdownBtn: string;
  exportMarkdownBtn: string;

  // Preview & Export
  previewTitle: string;
  previewEmpty: string;
  bgChecker: string;
  bgWhite: string;
  bgGray: string;
  bgDark: string;
  colorDefault: string;
  zoomOut: string;
  zoomIn: string;
  zoomReset: string;
  fitToWidth: string;
  syntaxErrorTitle: string;
  jumpToError: string;
  quickCopyPng: string;
  quickCopySvg: string;
  copyMathMl: string;
  exportOfflineHtml: string;
  openExportModal: string;

  // Export Modal
  exportModalTitle: string;
  exportFormat: string;
  exportScale: string;
  exportPadding: string;
  paddingCompact: string;
  paddingNormal: string;
  paddingRelaxed: string;
  exportBg: string;
  exportTextColor: string;
  exportAdaptiveHalo: string;
  exportHaloHint: string;
  exportMixedPngNotice: string;
  exportPreviewLabel: string;
  exportCopyBtn: string;
  exportDownloadBtn: string;
  exportRendering: string;

  // Modals: Examples, History, Help
  examplesModalTitle: string;
  tabClassic: string;
  tabFavorites: string;
  historyModalTitle: string;
  historyEmpty: string;
  clearHistory: string;
  saveCurrentToHistory: string;
  allHistory: string;
  starredOnly: string;
  addNote: string;
  editNote: string;
  notePlaceholder: string;
  saveNote: string;
  cancelNote: string;
  deleteItem: string;
  helpModalTitle: string;
  helpShortcutsTitle: string;
  helpTipsTitle: string;
  closeModal: string;

  // Toasts
  toastLatexCopied: string;
  toastMathMlCopied: string;
  toastImageCopied: string;
  toastImageDownloaded: string;
  toastSvgCopied: string;
  toastSvgDownloaded: string;
  toastHtmlDownloaded: string;
  toastSavedToHistory: string;
  toastCleared: string;
  toastAutoFixed: string;
  toastFormatted: string;
  toastNoFixNeeded: string;
  toastActionFailed: string;
  toastShareLinkCopied: string;
  toastDerivedStep: string;
  toastMarkdownImported: string;
  toastMarkdownCopied: string;
  toastMarkdownDownloaded: string;
  toastFavoriteAdded: string;
  toastFavoriteRemoved: string;
  toastUrlRestored: string;
  toastNormalizedPunctuation: string;

  // Classic Formulas
  examples: {
    quadratic: string;
    euler: string;
    gaussian: string;
    bayes: string;
    maxwell: string;
    schrodinger: string;
    fourier: string;
    taylor: string;
    eigenvalue: string;
    piecewise: string;
    energyMomentum: string;
    catAlgebra: string;
    catCalculus: string;
    catPhysics: string;
    catProbability: string;
    catMatrix: string;
  };

  // Help entries
  shortcuts: Array<{ keys: string; desc: string }>;
  tips: string[];
}
