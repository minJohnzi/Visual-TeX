import katex from 'katex';
import { stripOuterMathDelimiters } from './latex';
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

/**
 * 规范化 LaTeX 代码，去除多余定界符并转义输入占位符
 */
export function prepareFormulaForRender(rawLatex: string): string {
  const { cleaned } = stripOuterMathDelimiters(rawLatex);
  if (!cleaned.trim()) return '';
  return cleaned
    .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
    .replace(/\\placeholder/g, '\\Box')
    .replace(/\\square/g, '\\Box')
    .replace(/#\?/g, '\\Box')
    .replace(/#@/g, '');
}

/**
 * 获取公式的纯矢量 SVG 元素及 CSS 像素宽高
 * 优先采用 MathJax 3 生成纯 Path 路径（无需嵌入任何外部 WebFont 字体），
 * 若不可用则降级采用 KaTeX HTML 容器。
 */
export async function getFormulaSvgElement(
  latex: string,
  color: string = 'default',
  bgMode: CanvasBgMode = 'checker'
): Promise<SvgRenderResult> {
  const displayCode = prepareFormulaForRender(latex);
  if (!displayCode.trim()) {
    throw new Error('公式内容为空');
  }

  // 1. 首选：使用 MathJax 3 渲染纯矢量路径 SVG (无外部字体依赖，无限缩放不失真)
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
        // 检查 MathJax 是否返回了语法错误
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

            // 计算合理的 CSS 像素尺寸 (标准 display math 基准字体大小约 22px)
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

            // 补充必须的 XML 命名空间及尺寸
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            svg.setAttribute('width', `${cssWidth}`);
            svg.setAttribute('height', `${cssHeight}`);
            if (vbWidth > 0 && vbHeight > 0) {
              svg.setAttribute('viewBox', `${minX} ${minY} ${vbWidth} ${vbHeight}`);
            }

            // 颜色处理：深色背景下默认为明亮白，亮色/透明下默认为深色
            let resolvedColor = color;
            if (color === 'default') {
              resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
            }
            svg.style.color = resolvedColor;
            svg.setAttribute('color', resolvedColor);
            svg.setAttribute('fill', 'currentColor');

            // 确保全局缓存中的 defs 被打包进当前 svg，保证独立性
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
    } catch {
      // fallback to KaTeX
    }
  }

  // 2. 降级方案：使用 KaTeX 渲染 HTML 结构转换为 SVG foreignObject
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '-9999px';
  div.style.left = '-9999px';
  document.body.appendChild(div);
  try {
    katex.render(displayCode, div, {
      displayMode: true,
      throwOnError: false,
      output: 'html',
      macros: {
        '\\placeholder': '\\Box',
        '\\square': '\\Box',
      },
    });

    const renderedEl = div.querySelector('.katex');
    const rect = renderedEl ? renderedEl.getBoundingClientRect() : { width: 300, height: 100 };
    const width = Math.max(Math.ceil(rect.width) + 24, 120);
    const height = Math.max(Math.ceil(rect.height) + 24, 60);

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('xmlns', svgNs);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObj = document.createElementNS(svgNs, 'foreignObject');
    foreignObj.setAttribute('width', '100%');
    foreignObj.setAttribute('height', '100%');

    let resolvedColor = color;
    if (color === 'default') {
      resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
    }

    const innerDiv = document.createElement('div');
    innerDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    innerDiv.style.display = 'flex';
    innerDiv.style.alignItems = 'center';
    innerDiv.style.justifyContent = 'center';
    innerDiv.style.width = '100%';
    innerDiv.style.height = '100%';
    innerDiv.style.color = resolvedColor;
    innerDiv.innerHTML = div.innerHTML;

    foreignObj.appendChild(innerDiv);
    svg.appendChild(foreignObj);

    return { svg, cssWidth: width, cssHeight: height };
  } finally {
    document.body.removeChild(div);
  }
}

/**
 * 导出 SVG 矢量图（复制源码或触发下载）
 */
export async function exportSvg(
  latex: string,
  toClipboard: boolean,
  color: string = 'default'
): Promise<string> {
  const { svg } = await getFormulaSvgElement(latex, color, 'checker');
  const svgString = new XMLSerializer().serializeToString(svg);

  if (toClipboard) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(svgString);
      return '已复制矢量 SVG 源码到剪贴板';
    }
    throw new Error('剪贴板不可用');
  } else {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, `formula-${Date.now()}.svg`);
    return '已下载 SVG 矢量文件';
  }
}

/**
 * 导出高清 PNG 图片（复制到系统剪贴板或下载）
 * - 针对复杂长公式、分式、积分方程组智能缩放，杜绝超过浏览器 Canvas 尺寸上限 (16384px)
 * - 默认采用 3.0x 超高清采样，清晰锐利满足论文/PPT/出版需求
 * - 双重引擎保障：MathJax 矢量路径优先，KaTeX + html-to-image 真实 DOM 无缝降级
 */
export async function exportPng(
  latex: string,
  bgMode: CanvasBgMode,
  color: string,
  toClipboard: boolean
): Promise<{ success: boolean; message: string }> {
  const displayCode = prepareFormulaForRender(latex);
  if (!displayCode.trim()) {
    throw new Error('公式内容为空');
  }

  // 1. 优先尝试 MathJax 纯路径矢量栅格化
  try {
    const { svg, cssWidth, cssHeight } = await getFormulaSvgElement(latex, color, bgMode);

    // 设定 3.0x 高分超清采样率
    const dpr = 3.0;
    let drawW = Math.round(cssWidth * dpr);
    let drawH = Math.round(cssHeight * dpr);

    // 舒适边距 (Canvas 像素)
    const padX = 40;
    const padY = 32;

    let canvasWidth = drawW + padX * 2;
    let canvasHeight = drawH + padY * 2;

    // 核心安全防护：严格限制 Canvas 尺寸在安全上限内 (4096px，兼容所有 Safari/iOS 及 Chrome)
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
    } // 'checker' 透明画布保留空白

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
      return await deliverPngBlob(blob, toClipboard);
    }
  } catch (err) {
    console.warn('MathJax 矢量生成 PNG 出现异常，无缝启用 KaTeX DOM 备用渲染:', err);
  }

  // 2. 备用保障方案：使用 html-to-image 截取真实 KaTeX DOM 元素
  return await exportPngViaDom(displayCode, bgMode, color, toClipboard);
}

/**
 * 备用降级方案：使用 html-to-image 捕获真实 DOM
 */
async function exportPngViaDom(
  displayCode: string,
  bgMode: CanvasBgMode,
  color: string,
  toClipboard: boolean
): Promise<{ success: boolean; message: string }> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.padding = '28px 40px';
  host.style.display = 'inline-block';
  host.style.fontSize = '24px';
  host.style.lineHeight = '1.4';

  if (bgMode === 'white') host.style.backgroundColor = '#ffffff';
  else if (bgMode === 'gray') host.style.backgroundColor = '#f1f5f9';
  else if (bgMode === 'dark') host.style.backgroundColor = '#0f172a';
  else host.style.backgroundColor = 'transparent';

  let resolvedColor = color;
  if (color === 'default') {
    resolvedColor = bgMode === 'dark' ? '#f8fafc' : '#0f172a';
  }
  host.style.color = resolvedColor;

  katex.render(displayCode, host, {
    displayMode: true,
    throwOnError: false,
    output: 'html',
    macros: {
      '\\placeholder': '\\Box',
      '\\square': '\\Box',
    },
  });

  document.body.appendChild(host);
  try {
    const blob = await htmlToImageToBlob(host, {
      pixelRatio: 3,
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

    return await deliverPngBlob(blob, toClipboard);
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * 将生成的 PNG Blob 派发到剪贴板或下载
 */
async function deliverPngBlob(
  blob: Blob,
  toClipboard: boolean
): Promise<{ success: boolean; message: string }> {
  if (toClipboard) {
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return {
          success: true,
          message: '已复制 3x 高清 PNG 到剪贴板（可直接粘贴至 Word、PPT、飞书）',
        };
      }
    } catch {
      // fallback to download
    }

    // 剪贴板受 iframe 或安全策略限制时降级为直接下载
    triggerBlobDownload(blob, `formula-${Date.now()}.png`);
    return {
      success: true,
      message: '剪贴板访问受限，已自动为您下载超清 PNG 文件',
    };
  } else {
    triggerBlobDownload(blob, `formula-${Date.now()}.png`);
    return {
      success: true,
      message: '已成功下载 3x 超清 PNG 文件',
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
 * 复制 MathML 代码（直接粘贴至 Word 原生公式）
 */
export function copyMathMl(latex: string): string {
  const displayCode = prepareFormulaForRender(latex);
  if (!displayCode.trim()) throw new Error('公式内容为空');

  const mathml = katex.renderToString(displayCode, {
    output: 'mathml',
    throwOnError: false,
  });

  copyPlainText(mathml);
  return '已复制标准 MathML 代码（在 Word 中直接粘贴即可转换为原生公式）';
}

/**
 * 复制纯文本
 */
export async function copyPlainText(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
