import katex from 'katex';
import { stripOuterMathDelimiters } from './latex';

declare global {
  interface Window {
    MathJax?: {
      tex2svg?: (latex: string, options?: { display: boolean }) => HTMLElement;
    };
  }
}

export type CanvasBgMode = 'checker' | 'white' | 'gray' | 'dark';

export async function getFormulaSvgElement(latex: string, color: string = 'default'): Promise<SVGElement> {
  const { cleaned } = stripOuterMathDelimiters(latex);
  if (!cleaned.trim()) {
    throw new Error('公式内容为空');
  }

  // 1. 尝试使用 MathJax 3 生成纯净矢量路径 SVG
  if (typeof window !== 'undefined' && window.MathJax && typeof window.MathJax.tex2svg === 'function') {
    try {
      const wrapper = window.MathJax.tex2svg(cleaned, { display: true });
      const svg = wrapper.querySelector('svg');
      if (svg) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (color !== 'default') {
          svg.style.color = color;
        }
        return svg as unknown as SVGElement;
      }
    } catch {
      // fallback to KaTeX
    }
  }

  // 2. 降级方案：从 KaTeX HTML 渲染生成 SVG
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '-9999px';
  div.style.left = '-9999px';
  document.body.appendChild(div);
  try {
    const displayCode = cleaned
      .replace(/\\placeholder\{([^}]*)\}/g, (_m, inner) => (inner ? inner : '\\Box'))
      .replace(/\\placeholder/g, '\\Box')
      .replace(/\\square/g, '\\Box')
      .replace(/#\?/g, '\\Box')
      .replace(/#@/g, '');

    katex.render(displayCode, div, {
      displayMode: true,
      throwOnError: false,
      output: 'htmlAndMathml',
      macros: {
        '\\placeholder': '\\Box',
        '\\square': '\\Box',
      },
    });

    const renderedEl = div.querySelector('.katex');
    const rect = renderedEl ? renderedEl.getBoundingClientRect() : { width: 300, height: 100 };
    const width = Math.max(Math.ceil(rect.width) + 40, 200);
    const height = Math.max(Math.ceil(rect.height) + 40, 100);

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('xmlns', svgNs);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObj = document.createElementNS(svgNs, 'foreignObject');
    foreignObj.setAttribute('width', '100%');
    foreignObj.setAttribute('height', '100%');

    const innerDiv = document.createElement('div');
    innerDiv.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    innerDiv.style.display = 'flex';
    innerDiv.style.alignItems = 'center';
    innerDiv.style.justifyContent = 'center';
    innerDiv.style.width = '100%';
    innerDiv.style.height = '100%';
    if (color !== 'default') {
      innerDiv.style.color = color;
    }
    innerDiv.innerHTML = div.innerHTML;

    foreignObj.appendChild(innerDiv);
    svg.appendChild(foreignObj);
    return svg;
  } finally {
    document.body.removeChild(div);
  }
}

export async function exportSvg(
  latex: string,
  toClipboard: boolean,
  color: string = 'default'
): Promise<string> {
  const svg = await getFormulaSvgElement(latex, color);
  const svgString = new XMLSerializer().serializeToString(svg);

  if (toClipboard) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(svgString);
      return '已复制矢量 SVG 源码到剪贴板';
    }
    throw new Error('剪贴板不可用');
  } else {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formula-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return '已下载 SVG 矢量文件';
  }
}

export async function exportPng(
  latex: string,
  bgMode: CanvasBgMode,
  color: string,
  toClipboard: boolean
): Promise<{ success: boolean; message: string }> {
  const svg = await getFormulaSvgElement(latex, color);
  const svgString = new XMLSerializer().serializeToString(svg);

  const viewBox = svg.getAttribute('viewBox');
  let svgWidth = 600;
  let svgHeight = 200;

  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      svgWidth = parts[2];
      svgHeight = parts[3];
    }
  } else {
    const wAttr = parseFloat(svg.getAttribute('width') || '');
    const hAttr = parseFloat(svg.getAttribute('height') || '');
    if (wAttr && hAttr) {
      svgWidth = wAttr;
      svgHeight = hAttr;
    }
  }

  // 3.5x 超清高分采样率
  const scale = 3.5;
  const canvasWidth = Math.max(Math.round(svgWidth * scale) + 80, 400);
  const canvasHeight = Math.max(Math.round(svgHeight * scale) + 60, 200);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法初始化 Canvas 绘图上下文');

  // 背景色处理
  if (bgMode === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } else if (bgMode === 'gray') {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } else if (bgMode === 'dark') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  } // 'checker' 保持透明画布

  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      const drawW = svgWidth * scale;
      const drawH = svgHeight * scale;
      const drawX = (canvasWidth - drawW) / 2;
      const drawY = (canvasHeight - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('SVG 栅格化为图片时失败'));
    };
    img.src = blobUrl;
  });

  return new Promise<{ success: boolean; message: string }>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('生成 PNG 二进制数据失败'));
        return;
      }

      if (toClipboard) {
        try {
          if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            resolve({
              success: true,
              message: '已复制 3.5x 高清 PNG 到剪贴板（可直接粘贴至 Word、PPT、飞书）',
            });
            return;
          }
        } catch {
          // fallback to download
        }

        // 剪贴板不可用时降级为下载
        triggerBlobDownload(blob, `formula-${Date.now()}.png`);
        resolve({
          success: true,
          message: '浏览器不支持直接写图片剪贴板，已为您自动触发下载 PNG 文件',
        });
      } else {
        triggerBlobDownload(blob, `formula-${Date.now()}.png`);
        resolve({
          success: true,
          message: '已成功下载 3.5x 超清 PNG 文件',
        });
      }
    }, 'image/png');
  });
}

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

export function copyMathMl(latex: string): string {
  const { cleaned } = stripOuterMathDelimiters(latex);
  if (!cleaned.trim()) throw new Error('公式内容为空');

  const mathml = katex.renderToString(cleaned.replace(/\\square/g, '\\Box'), {
    output: 'mathml',
    throwOnError: false,
  });

  navigator.clipboard.writeText(mathml);
  return '已复制标准 MathML 代码（在 Word 中直接粘贴即可转换为原生公式）';
}

export async function copyPlainText(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
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
