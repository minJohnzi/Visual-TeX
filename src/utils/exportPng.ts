import katex from 'katex';
import {
  detectFormulaMode,
  normalizePureMathForRender,
  renderFormulaSafely,
} from './latex';
import { toBlob as htmlToImageToBlob } from 'html-to-image';

declare global {
  interface Window {
    MathJax?: {
      startup?: {
        promise?: Promise<void>;
        ready?: () => void;
      };
      tex2svgPromise?: (latex: string, options?: { display?: boolean }) => Promise<HTMLElement>;
      tex2svg?: (latex: string, options?: { display?: boolean }) => HTMLElement;
    };
  }
}

export type CanvasBgMode = 'checker' | 'white' | 'gray' | 'dark';

export interface SvgRenderResult {
  svg: SVGElement;
  cssWidth: number;
  cssHeight: number;
}

export interface ExportOptions {
  scale?: number; // 1, 2, 3, 4
  adaptiveHalo?: boolean; // 微发光描边保护
  textColor?: string; // 显式文本前景色
}

export function isColorLight(hexOrName: string): boolean {
  if (hexOrName === '#ffffff' || hexOrName === 'white') return true;
  if (hexOrName.startsWith('#') && hexOrName.length === 7) {
    const r = parseInt(hexOrName.slice(1, 3), 16);
    const g = parseInt(hexOrName.slice(3, 5), 16);
    const b = parseInt(hexOrName.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128;
  }
  return false;
}

/**
 * 规范化 LaTeX 代码，去除多余定界符并转义输入占位符
 */
export function prepareFormulaForRender(rawLatex: string): string {
  const modeDetect = detectFormulaMode(rawLatex);
  if (modeDetect.mode === 'mixed-content') {
    return rawLatex;
  }
  const { normalized } = normalizePureMathForRender(modeDetect.cleanedText);
  return normalized;
}

/**
 * 获取公式的纯矢量 SVG 元素及 CSS 像素宽高
 * 优先采用 MathJax 3 生成纯 Path 路径（无需嵌入任何外部 WebFont 字体），
 * 若处于图文混排模式或 MathJax 不可用，则降级采用 KaTeX HTML 容器。
 */
export async function getFormulaSvgElement(
  latex: string,
  color: string = 'default',
  bgMode: CanvasBgMode = 'checker',
  options?: ExportOptions
): Promise<SvgRenderResult> {
  const effectiveColor = options?.textColor || color;
  const modeDetect = detectFormulaMode(latex);

  // 1. 若为纯公式模式，首选尝试 MathJax 3 渲染纯矢量路径 SVG (无外部字体依赖，无限缩放不失真)
  if (modeDetect.mode === 'pure-math') {
    const displayCode = prepareFormulaForRender(latex);
    if (!displayCode.trim()) {
      throw new Error('公式内容为空');
    }

    if (typeof window !== 'undefined' && window.MathJax) {
      try {
        if (window.MathJax.startup?.promise) {
          await window.MathJax.startup.promise;
        }

        let wrapper: HTMLElement | null = null;
        if (typeof window.MathJax.tex2svgPromise === 'function') {
          wrapper = await window.MathJax.tex2svgPromise(displayCode, { display: true });
        } else if (typeof window.MathJax.tex2svg === 'function') {
          wrapper = window.MathJax.tex2svg(displayCode, { display: true });
        }

        if (wrapper) {
          const errorEl = wrapper.querySelector('merror, [data-mjx-error]');
          if (!errorEl) {
            const rawSvg = wrapper.querySelector('svg');
            if (rawSvg) {
              const svg = rawSvg.cloneNode(true) as SVGElement;

              // 临时挂载到隐藏容器以让浏览器精确计算真实 CSS 渲染宽高
              const host = document.createElement('div');
              host.style.position = 'fixed';
              host.style.left = '-9999px';
              host.style.top = '-9999px';
              host.style.visibility = 'hidden';
              host.style.display = 'block';
              host.appendChild(wrapper);
              document.body.appendChild(host);

              let rectWidth = 0;
              let rectHeight = 0;
              try {
                const rect = rawSvg.getBoundingClientRect();
                rectWidth = rect.width;
                rectHeight = rect.height;
              } finally {
                document.body.removeChild(host);
              }

              // 读取并解析 viewBox 尺寸 (MathJax 内部字体单位：1000 units = 1 em)
              let minX = 0;
              let minY = 0;
              let vbWidth = 0;
              let vbHeight = 0;
              const vbAttr = svg.getAttribute('viewBox');
              if (vbAttr) {
                const parts = vbAttr.trim().split(/\s+/).map(Number);
                if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
                  [minX, minY, vbWidth, vbHeight] = parts;
                }
              }

              // 计算合理的 CSS 像素尺寸
              let cssWidth = rectWidth;
              let cssHeight = rectHeight;

              if (!cssWidth || cssWidth < 10) {
                cssWidth = vbWidth > 0 ? (vbWidth / 1000) * 22 : 400;
              }
              if (!cssHeight || cssHeight < 10) {
                cssHeight = vbHeight > 0 ? (vbHeight / 1000) * 22 : 100;
              }

              cssWidth = Math.max(Math.round(cssWidth), 40);
              cssHeight = Math.max(Math.round(cssHeight), 24);

              svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
              svg.setAttribute('width', `${cssWidth}`);
              svg.setAttribute('height', `${cssHeight}`);
              if (vbWidth > 0 && vbHeight > 0) {
                svg.setAttribute('viewBox', `${minX} ${minY} ${vbWidth} ${vbHeight}`);
              }

              // 颜色处理
              let resolvedColor = effectiveColor;
              if (effectiveColor === 'default') {
                resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
              }
              svg.style.color = resolvedColor;
              svg.setAttribute('color', resolvedColor);
              svg.setAttribute('fill', 'currentColor');

              if (!svg.querySelector('defs')) {
                const globalCache = document.getElementById('MJX-SVG-global-cache');
                if (globalCache) {
                  const defs = globalCache.querySelector('defs') || globalCache;
                  svg.insertBefore(defs.cloneNode(true), svg.firstChild);
                }
              }

              return { svg, cssWidth, cssHeight };
            }
          }
        }
      } catch (e) {
        console.warn('MathJax SVG 渲染异常，启动 KaTeX 备用机制:', e);
      }
    }
  }

  // 2. 备用保障方案：使用 KaTeX 生成包含 foreignObject 的高兼容标准 SVG 容器
  const outcome = renderFormulaSafely(latex);
  if (!outcome.html.trim()) {
    throw new Error('公式渲染输出为空');
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.padding = '16px 24px';
  host.style.display = 'inline-block';
  host.style.maxWidth = '900px';

  let resolvedColor = effectiveColor;
  if (effectiveColor === 'default') {
    resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
  }
  host.style.color = resolvedColor;
  host.innerHTML = outcome.html;

  document.body.appendChild(host);
  let cssWidth = 320;
  let cssHeight = 100;
  try {
    const rect = host.getBoundingClientRect();
    cssWidth = Math.max(Math.round(rect.width), 40);
    cssHeight = Math.max(Math.round(rect.height), 24);
  } finally {
    document.body.removeChild(host);
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('xmlns', svgNS);
  svg.setAttribute('width', `${cssWidth}`);
  svg.setAttribute('height', `${cssHeight}`);
  svg.setAttribute('viewBox', `0 0 ${cssWidth} ${cssHeight}`);

  const styleEl = document.createElementNS(svgNS, 'style');
  styleEl.textContent = `
    .katex { font-size: 1.15em; color: ${resolvedColor}; }
    .katex-display { margin: 0; }
    .mixed-content-rendered { color: ${resolvedColor}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  `;
  svg.appendChild(styleEl);

  const foreignObject = document.createElementNS(svgNS, 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');

  const xhtmlDiv = document.createElement('div');
  xhtmlDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  xhtmlDiv.style.color = resolvedColor;
  xhtmlDiv.style.padding = '8px 12px';
  xhtmlDiv.innerHTML = outcome.html;

  foreignObject.appendChild(xhtmlDiv);
  svg.appendChild(foreignObject);

  return { svg, cssWidth, cssHeight };
}

/**
 * 导出公式为独立标准矢量 SVG 文件或复制 SVG 源码
 */
export async function exportSvg(
  latex: string,
  toClipboard: boolean,
  color: string = 'default',
  options?: ExportOptions
): Promise<void> {
  const { svg } = await getFormulaSvgElement(latex, color, 'checker', options);
  const svgString = new XMLSerializer().serializeToString(svg);

  if (toClipboard) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(svgString);
    } else {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      triggerBlobDownload(blob, `formula-${Date.now()}.svg`);
    }
  } else {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, `formula-${Date.now()}.svg`);
  }
}

/**
 * 导出公式为超高清无锯齿 PNG 图片
 * 支持独立前景色、采样倍率 (1x~4x) 与透明底色反差描边保护 (Adaptive Halo)
 */
export async function exportPng(
  latex: string,
  bgMode: CanvasBgMode,
  color: string,
  toClipboard: boolean,
  options?: ExportOptions
): Promise<{ success: boolean; message: string }> {
  const modeDetect = detectFormulaMode(latex);
  const effectiveColor = options?.textColor || color;

  // 1. 若为图文混排模式，直接走高保真 DOM 截取
  if (modeDetect.mode === 'mixed-content') {
    return await exportPngViaDom(latex, bgMode, effectiveColor, toClipboard, options);
  }

  // 2. 纯公式模式下，优先尝试 MathJax 纯路径矢量栅格化
  try {
    const { svg, cssWidth, cssHeight } = await getFormulaSvgElement(latex, effectiveColor, bgMode, options);

    // 动态倍率计算
    const targetScale = options?.scale || 3.0;
    const dpr = Math.max(1, targetScale);
    let drawW = Math.round(cssWidth * dpr);
    let drawH = Math.round(cssHeight * dpr);

    const padX = Math.round(36 * (dpr / 3));
    const padY = Math.round(28 * (dpr / 3));

    let canvasWidth = drawW + padX * 2;
    let canvasHeight = drawH + padY * 2;

    const MAX_CANVAS_DIM = 4096;
    if (canvasWidth > MAX_CANVAS_DIM || canvasHeight > MAX_CANVAS_DIM) {
      const shrink = Math.min(
        (MAX_CANVAS_DIM - padX * 2) / drawW,
        (MAX_CANVAS_DIM - padY * 2) / drawH
      );
      drawW = Math.max(Math.round(drawW * shrink), 100);
      drawH = Math.max(Math.round(drawH * shrink), 40);
      canvasWidth = drawW + padX * 2;
      canvasHeight = drawH + padY * 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化 Canvas 绘图上下文');

    // 底色填充
    if (bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (bgMode === 'gray') {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (bgMode === 'dark') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    const svgString = new XMLSerializer().serializeToString(svg);
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('图片栅格化渲染超时'));
      }, 5000);

      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const drawX = (canvasWidth - drawW) / 2;
          const drawY = (canvasHeight - drawH) / 2;

          // 若开启了透明背景微发光描边保护
          if (bgMode === 'checker' && options?.adaptiveHalo) {
            let resolvedCol = effectiveColor;
            if (effectiveColor === 'default') {
              resolvedCol = '#0f172a';
            }
            const isLight = isColorLight(resolvedCol);
            const haloColor = isLight ? 'rgba(15, 23, 42, 0.9)' : '#ffffff';

            ctx.save();
            ctx.shadowColor = haloColor;
            ctx.shadowBlur = 3 * dpr;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.shadowBlur = 1.5 * dpr;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.restore();
          }

          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('SVG 栅格化为图片时失败'));
      };

      img.src = dataUrl;
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    if (blob) {
      return await deliverPngBlob(blob, toClipboard, targetScale);
    }
  } catch (err) {
    console.warn('MathJax 矢量生成 PNG 出现异常，无缝启用 KaTeX DOM 备用渲染:', err);
  }

  // 3. 备用保障方案：使用 html-to-image 截取真实 KaTeX DOM 元素
  return await exportPngViaDom(latex, bgMode, effectiveColor, toClipboard, options);
}

/**
 * 备用降级方案 / 混排图文截取：使用 html-to-image 捕获真实 DOM
 */
async function exportPngViaDom(
  latex: string,
  bgMode: CanvasBgMode,
  color: string,
  toClipboard: boolean,
  options?: ExportOptions
): Promise<{ success: boolean; message: string }> {
  const outcome = renderFormulaSafely(latex);
  if (!outcome.html.trim()) {
    throw new Error('公式或混排内容为空');
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.padding = '28px 40px';
  host.style.display = 'inline-block';
  host.style.fontSize = '24px';
  host.style.lineHeight = '1.6';
  host.style.maxWidth = '900px';

  if (bgMode === 'white') host.style.backgroundColor = '#ffffff';
  else if (bgMode === 'gray') host.style.backgroundColor = '#f1f5f9';
  else if (bgMode === 'dark') host.style.backgroundColor = '#0f172a';
  else host.style.backgroundColor = 'transparent';

  let resolvedColor = options?.textColor || color;
  if (resolvedColor === 'default') {
    resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
  }
  host.style.color = resolvedColor;

  // 透明背景下的微发光反差描边 (Adaptive Halo)
  if (bgMode === 'checker' && options?.adaptiveHalo) {
    const isLight = isColorLight(resolvedColor);
    const haloColor = isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)';
    host.style.filter = `drop-shadow(0 0 2px ${haloColor}) drop-shadow(0 0 1px ${haloColor})`;
  }

  host.innerHTML = outcome.html;

  document.body.appendChild(host);
  try {
    const targetScale = options?.scale || 3.0;
    const dpr = Math.max(1, targetScale);
    const blob = await htmlToImageToBlob(host, {
      pixelRatio: dpr,
      backgroundColor:
        bgMode === 'white'
          ? '#ffffff'
          : bgMode === 'gray'
          ? '#f1f5f9'
          : bgMode === 'dark'
          ? '#0f172a'
          : undefined,
    });

    if (!blob) {
      throw new Error('生成 PNG 二进制数据失败');
    }

    return await deliverPngBlob(blob, toClipboard, targetScale);
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * 将生成的 PNG Blob 派发到剪贴板或下载
 */
async function deliverPngBlob(
  blob: Blob,
  toClipboard: boolean,
  scale: number = 3
): Promise<{ success: boolean; message: string }> {
  if (toClipboard) {
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return {
          success: true,
          message: `已复制 ${scale}x 高清 PNG 到剪贴板（可直接粘贴至 Word、PPT、飞书）`,
        };
      }
    } catch {
      // fallback to download
    }

    triggerBlobDownload(blob, `formula-${scale}x-${Date.now()}.png`);
    return {
      success: true,
      message: `剪贴板访问受限，已自动为您下载 ${scale}x 超清 PNG 文件`,
    };
  } else {
    triggerBlobDownload(blob, `formula-${scale}x-${Date.now()}.png`);
    return {
      success: true,
      message: `已成功下载 ${scale}x 超清 PNG 文件`,
    };
  }
}

/**
 * 触发浏览器文件直接下载
 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成并复制适用于 Word 的 Office 原生 MathML 代码
 */
export function copyMathMl(latex: string): string {
  const modeDetect = detectFormulaMode(latex);
  let mathForRender = modeDetect.cleanedText;

  if (modeDetect.mode === 'pure-math') {
    const { normalized } = normalizePureMathForRender(modeDetect.cleanedText);
    mathForRender = normalized;
  }

  const mathml = katex.renderToString(mathForRender, {
    output: 'mathml',
    displayMode: true,
    throwOnError: false,
    strict: 'ignore',
  });

  const cleanedXml = mathml
    .replace(/^<span[^>]*>/i, '')
    .replace(/<\/span>$/i, '')
    .trim();

  if (navigator.clipboard && window.isSecureContext) {
    void navigator.clipboard.writeText(cleanedXml);
  } else {
    copyFallback(cleanedXml);
  }

  return cleanedXml;
}

/**
 * 复制纯文本
 */
export async function copyPlainText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }
  return copyFallback(text);
}

function copyFallback(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
