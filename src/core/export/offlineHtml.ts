import { escapeHtml, wrapWithDelimiter } from '../latex/protocol';
import { ContentBlock, DelimiterMode, DocMode } from '../types';

export function sanitizeFilename(rawName: string, fallback = 'formula'): string {
  const withoutTags = rawName.replace(/<[^>]*>/g, '');
  const withoutControl = withoutTags.replace(/[\u0000-\u001F\u007F]/g, '');
  const withoutTraversal = withoutControl.replace(/\.{2,}/g, '').replace(/[\\/]+/g, '');
  const cleaned = withoutTraversal
    .replace(/[<>:"|?*]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return cleaned.length > 0 ? cleaned : fallback;
}

export function escapeJsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export interface OfflineHtmlPayload {
  title?: string;
  docMode?: DocMode;
  singleLatex: string;
  blocks?: ContentBlock[];
  renderedSvg?: string;
  renderedMixedHtml?: string;
  delimiterMode?: DelimiterMode;
}

/**
 * Generates a 100% offline, standalone HTML5 export containing vector SVG(s),
 * structured metadata JSON, and an interactive copy/download viewer script.
 * Contains zero external CDN requests (only the Visual-TeX footer attribution URL).
 */
export function generateStandaloneOfflineHtml(payload: OfflineHtmlPayload): string {
  const title = payload.title?.trim() || 'Visual-TeX Formula Snapshot';
  const safeTitle = escapeHtml(title);
  const docMode = payload.docMode ?? 'single';
  const delimiterMode = payload.delimiterMode ?? 'none';
  const formattedSource =
    docMode === 'single'
      ? wrapWithDelimiter(payload.singleLatex, delimiterMode)
      : (payload.blocks ?? [])
          .map((b) =>
            b.type === 'text' ? b.content : wrapWithDelimiter(b.latex, delimiterMode)
          )
          .join('\n\n');

  const safeDataJson = escapeJsonForScript({
    generator: 'Visual-TeX',
    docMode,
    singleLatex: payload.singleLatex,
    blocks: payload.blocks ?? [],
    formattedSource,
    exportedAt: new Date().toISOString(),
  });

  const bodyVisualHtml =
    docMode === 'mixed' && payload.renderedMixedHtml
      ? payload.renderedMixedHtml
      : payload.renderedSvg ||
        `<pre class="raw-latex-fallback">${escapeHtml(formattedSource)}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f8fafc;
      --surface: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0f19;
        --surface: #111827;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #1e293b;
        --accent: #3b82f6;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .sheet {
      max-width: 860px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 22px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    h1 { margin: 0; font-size: 1rem; font-weight: 700; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: transparent;
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    main {
      padding: 36px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      overflow-x: auto;
    }
    main svg { max-width: 100%; height: auto; color: var(--text); }
    .mixed-doc { width: 100%; line-height: 1.65; }
    .mixed-block-math { text-align: center; margin: 16px 0; overflow-x: auto; }
    pre.source-box {
      margin: 0;
      padding: 16px 22px;
      background: rgba(100, 116, 139, 0.08);
      border-top: 1px solid var(--border);
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 0.86rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    footer {
      padding: 10px 22px;
      border-top: 1px solid var(--border);
      font-size: 0.76rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      <h1>${safeTitle}</h1>
      <div class="actions">
        <button id="copy-latex-btn" class="primary" type="button">Copy LaTeX</button>
        <button id="toggle-source-btn" type="button">Toggle Source</button>
      </div>
    </header>
    <main id="render-stage">${bodyVisualHtml}</main>
    <pre id="source-box" class="source-box" hidden>${escapeHtml(formattedSource)}</pre>
    <footer>
      <span>100% Offline Standalone Export</span>
      <a href="https://visual-tex.ai.studio" target="_blank" rel="noopener noreferrer">Visual-TeX</a>
    </footer>
  </div>
  <script id="formula-data" type="application/json">${safeDataJson}</script>
  <script>
    (function () {
      var dataEl = document.getElementById('formula-data');
      var payload = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
      var copyBtn = document.getElementById('copy-latex-btn');
      var toggleBtn = document.getElementById('toggle-source-btn');
      var sourceBox = document.getElementById('source-box');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var text = payload.formattedSource || payload.singleLatex || '';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              copyBtn.textContent = 'Copied!';
              setTimeout(function () { copyBtn.textContent = 'Copy LaTeX'; }, 1500);
            });
          }
        });
      }
      if (toggleBtn && sourceBox) {
        toggleBtn.addEventListener('click', function () {
          sourceBox.hidden = !sourceBox.hidden;
        });
      }
    })();
  </script>
</body>
</html>`;
}
