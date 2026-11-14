import { CanvasBgMode, DelimiterMode, DocumentModel, ExportPaddingMode, ExportSvgResult } from '../types';
import { exportPaddingToPx } from './domPng';
import type {
  MathJaxWorkerRequest,
  MathJaxWorkerResponse,
} from '../../workers/mathjax.worker';
import { renderTextBlockHtml } from '../markdown/mixedRenderer';
import { escapeHtml } from '../latex/protocol';
import { generateStandaloneOfflineHtml } from './offlineHtml';

let workerInstance: Worker | null = null;
let requestCounter = 0;
const pendingRequests = new Map<
  number,
  { resolve: (value: ExportSvgResult) => void; reject: (err: Error) => void }
>();

function getOrCreateWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    new URL('../../workers/mathjax.worker.ts', import.meta.url),
    { type: 'module' }
  );

  workerInstance.onmessage = (event: MessageEvent<MathJaxWorkerResponse>) => {
    const { id, ...result } = event.data;
    const entry = pendingRequests.get(id);
    if (!entry) return;
    pendingRequests.delete(id);
    entry.resolve(result);
  };

  workerInstance.onerror = (err) => {
    const error = new Error(err.message || 'MathJax Web Worker failed');
    for (const [id, entry] of pendingRequests) {
      pendingRequests.delete(id);
      entry.reject(error);
    }
    workerInstance?.terminate();
    workerInstance = null;
  };

  return workerInstance;
}

export function isColorLight(color: string): boolean {
  const hex = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  // Relative luminance heuristic
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export function resolveExportTextColor(
  textColor: string,
  bgMode: CanvasBgMode
): string {
  if (!textColor || textColor === 'default') {
    return bgMode === 'dark' ? '#f8fafc' : '#0f172a';
  }
  return textColor;
}

/**
 * Compiles LaTeX to standalone vector SVG using the lazy MathJax v4 Web Worker.
 * Falls back to direct module import when Web Workers are unavailable (e.g. Node/Vitest).
 */
export async function compileFormulaSvg(latex: string): Promise<ExportSvgResult> {
  const worker = getOrCreateWorker();
  if (!worker) {
    if (import.meta.env.MODE === 'test') {
      const { compileTexToSvg } = await import('../../workers/mathjaxRenderer');
      return compileTexToSvg(latex);
    }
    throw new Error('Web Worker environment is required for SVG compilation');
  }

  return new Promise<ExportSvgResult>((resolve, reject) => {
    const id = ++requestCounter;
    pendingRequests.set(id, { resolve, reject });
    const req: MathJaxWorkerRequest = { id, type: 'compile-svg', latex };
    worker.postMessage(req);
  });
}

function getSolidBgColor(bgMode: CanvasBgMode): string | null {
  switch (bgMode) {
    case 'white':
      return '#ffffff';
    case 'gray':
      return '#f1f5f9';
    case 'dark':
      return '#0f172a';
    case 'checker':
    default:
      return null;
  }
}

/**
 * Applies explicit fill/stroke hex color and optional solid background rect to a MathJax SVG.
 */
export function styleStandaloneSvg(
  rawSvg: string,
  options: {
    textColor: string;
    bgMode: CanvasBgMode;
    includeBackground?: boolean;
  }
): string {
  const resolvedColor = resolveExportTextColor(options.textColor, options.bgMode);
  let svg = rawSvg.replace(/currentColor/g, resolvedColor);

  // Also ensure root <svg> has explicit color attribute for viewers expecting inheritance
  svg = svg.replace(/<svg\b([^>]*)>/, (_full, attrs: string) => {
    if (/style="/.test(attrs)) {
      return `<svg${attrs.replace(/style="([^"]*)"/, `style="$1 color: ${resolvedColor};"`)}>`;
    }
    return `<svg${attrs} style="color: ${resolvedColor};">`;
  });

  if (options.includeBackground) {
    const bgHex = getSolidBgColor(options.bgMode);
    if (bgHex) {
      const vbMatch = svg.match(/viewBox="([^"]+)"/);
      if (vbMatch) {
        const [minX, minY, width, height] = vbMatch[1].split(/\s+/);
        const pad = 160;
        const x = Number.parseFloat(minX) - pad;
        const y = Number.parseFloat(minY) - pad;
        const w = Number.parseFloat(width) + pad * 2;
        const h = Number.parseFloat(height) + pad * 2;
        svg = svg
          .replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`)
          .replace(/(<svg\b[^>]*>)/, `$1<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgHex}" />`);
      }
    }
  }

  return svg;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode SVG for canvas rasterization'));
    img.src = src;
  });
}

/**
 * Renders MathJax vector SVG directly to a high-DPI transparent or opaque PNG Blob via Canvas 2D.
 * Completely independent of KaTeX DOM layout or stylesheet quirks.
 */
export { exportPaddingToPx } from './domPng';

export async function renderSvgToPngBlob(
  svgResult: ExportSvgResult,
  options: {
    scale: 1 | 2 | 3 | 4 | 5;
    bgMode: CanvasBgMode;
    textColor: string;
    adaptiveHalo: boolean;
    paddingMode?: ExportPaddingMode;
  }
): Promise<Blob> {
  if (!svgResult.ok || !svgResult.svg) {
    throw new Error(svgResult.error || 'No SVG available to export');
  }

  const styledSvg = styleStandaloneSvg(svgResult.svg, {
    textColor: options.textColor,
    bgMode: options.bgMode,
    includeBackground: false,
  });

  // 1ex ≈ 8px baseline at 1x -> multiplied by scale factor * 2 for sharp vector rasterization
  const pxPerEx = 9.5;
  const paddingPx = Math.round(exportPaddingToPx(options.paddingMode) * options.scale);
  const formulaWidthPx = Math.max(32, Math.ceil(svgResult.widthEx * pxPerEx * options.scale));
  const formulaHeightPx = Math.max(24, Math.ceil(svgResult.heightEx * pxPerEx * options.scale));

  // Rewrite SVG explicit width/height in pixels so Canvas scales cleanly without clipping
  const pixelSizedSvg = styledSvg
    .replace(/\bwidth="[^"]+"/, `width="${formulaWidthPx}"`)
    .replace(/\bheight="[^"]+"/, `height="${formulaHeightPx}"`);

  const svgBlob = new Blob([pixelSizedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = formulaWidthPx + paddingPx * 2;
    canvas.height = formulaHeightPx + paddingPx * 2;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    const solidBg = getSolidBgColor(options.bgMode);
    if (solidBg) {
      ctx.fillStyle = solidBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (options.adaptiveHalo) {
      const resolvedColor = resolveExportTextColor(options.textColor, options.bgMode);
      const lightInk = isColorLight(resolvedColor);
      ctx.shadowColor = lightInk ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.88)';
      ctx.shadowBlur = Math.max(2, Math.round(3 * options.scale));
    }

    ctx.drawImage(img, paddingPx, paddingPx, formulaWidthPx, formulaHeightPx);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PNG blob'));
        } else {
          resolve(blob);
        }
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Compiles a DocumentModel (`single` or `mixed`) into a 100% self-contained offline HTML document
 * backed by MathJax v4 vector SVGs.
 */
export async function exportDocumentToOfflineHtml(
  doc: DocumentModel,
  delimiterMode: DelimiterMode = 'none',
  title = 'Visual-TeX Formula Snapshot'
): Promise<string> {
  if (doc.mode === 'single') {
    const svgRes = await compileFormulaSvg(doc.singleLatex);
    return generateStandaloneOfflineHtml({
      title,
      docMode: 'single',
      singleLatex: doc.singleLatex,
      renderedSvg: svgRes.ok ? svgRes.svg : undefined,
      delimiterMode,
    });
  }

  // Compile all math blocks + any inline $...$ inside text blocks via MathJax Worker
  const renderedBlocks: string[] = [];
  for (const block of doc.blocks) {
    if (block.type === 'text') {
      // Pre-compile inline math chunks asynchronously
      const mathChunks = new Map<string, string>();
      const inlineMatches = block.content.match(
        /\$\$([\s\S]*?)\$\$|\$(?!\$)((?:\\.|[^$\\\n])+)\$|\\\(([\s\S]*?)\\\)/g
      );
      if (inlineMatches) {
        for (const raw of inlineMatches) {
          const inner = raw
            .replace(/^\$\$|\$\$$/g, '')
            .replace(/^\$|\$$/g, '')
            .replace(/^\\\(|\\\)$/g, '')
            .trim();
          if (inner && !mathChunks.has(inner)) {
            const svg = await compileFormulaSvg(inner);
            if (svg.ok) {
              mathChunks.set(inner, svg.svg);
            }
          }
        }
      }
      const html = renderTextBlockHtml(block.content, (tex) => {
        const hit = mathChunks.get(tex.trim());
        return hit ?? `<code>${escapeHtml(tex)}</code>`;
      });
      renderedBlocks.push(`<section class="mixed-doc">${html}</section>`);
    } else {
      const svgRes = await compileFormulaSvg(block.latex);
      const inner = svgRes.ok
        ? svgRes.svg
        : `<pre>${escapeHtml(block.latex)}</pre>`;
      renderedBlocks.push(`<div class="mixed-block-math">${inner}</div>`);
    }
  }

  return generateStandaloneOfflineHtml({
    title,
    docMode: 'mixed',
    singleLatex: doc.singleLatex,
    blocks: doc.blocks,
    renderedMixedHtml: renderedBlocks.join('\n'),
    delimiterMode,
  });
}
