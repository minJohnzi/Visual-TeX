import { CanvasBgMode, ExportPaddingMode } from '../types';

export function exportPaddingToPx(mode?: ExportPaddingMode): number {
  switch (mode) {
    case 'compact':
      return 8;
    case 'normal':
      return 16;
    case 'relaxed':
      return 32;
    default:
      return 24;
  }
}
import { copyBlobToClipboard } from './clipboard';

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function triggerTextDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
}

export async function deliverPngBlob(
  blob: Blob,
  action: 'copy' | 'download',
  filename = 'formula.png'
): Promise<'copied' | 'downloaded' | 'unsupported'> {
  if (action === 'download') {
    triggerBlobDownload(blob, filename);
    return 'downloaded';
  }
  const copied = await copyBlobToClipboard(blob, 'image/png');
  return copied ? 'copied' : 'unsupported';
}

function bgModeToCss(bgMode: CanvasBgMode): string | undefined {
  switch (bgMode) {
    case 'white':
      return '#ffffff';
    case 'gray':
      return '#f1f5f9';
    case 'dark':
      return '#0f172a';
    case 'checker':
    default:
      return undefined;
  }
}

/**
 * Dynamically loads `html-to-image` ONLY when capturing multi-block `mixed` DOM trees as PNG.
 * Single-formula PNG exports go exclusively through the pure MathJax SVG -> Canvas pipeline.
 */
export async function renderDomElementToPngBlob(
  element: HTMLElement,
  options: {
    scale: number;
    bgMode: CanvasBgMode;
    padding?: number;
    paddingMode?: ExportPaddingMode;
  }
): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  const padding = options.padding ?? exportPaddingToPx(options.paddingMode);
  const backgroundColor = bgModeToCss(options.bgMode);

  const blob = await toBlob(element, {
    pixelRatio: options.scale,
    backgroundColor,
    cacheBust: false,
    style: {
      padding: `${padding}px`,
      margin: '0',
    },
  });

  if (!blob) {
    throw new Error('Failed to generate PNG image from mixed document container');
  }
  return blob;
}
