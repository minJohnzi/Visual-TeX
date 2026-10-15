import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  escapeHtml,
  escapeJsonForScript,
  generateStandaloneOfflineHtml,
} from './exportHtml';

describe('exportHtml Security & Offline Sanitization', () => {
  describe('sanitizeFilename', () => {
    it('prevents path traversal (../../etc/passwd)', () => {
      const fn = sanitizeFilename('../../etc/passwd');
      expect(fn).not.toContain('/');
      expect(fn).not.toContain('..');
      expect(fn).not.toContain('\\');
    });

    it('filters HTML tags and dangerous characters', () => {
      const fn = sanitizeFilename('<script>alert("xss")</script>');
      expect(fn).not.toContain('<');
      expect(fn).not.toContain('>');
      expect(fn).not.toContain('"');
    });

    it('filters control characters and illegal symbols', () => {
      const fn = sanitizeFilename('   \u0000\u001f test: * ? file | name   ');
      expect(/[\u0000-\u001f]/.test(fn)).toBe(false);
      expect(/[*?:|]/.test(fn)).toBe(false);
    });

    it('falls back to formula for empty or whitespace inputs', () => {
      expect(sanitizeFilename('')).toBe('formula');
      expect(sanitizeFilename('   ')).toBe('formula');
      expect(sanitizeFilename('///')).toBe('formula');
    });
  });

  describe('escapeHtml', () => {
    it('escapes <, >, &, ", and \'', () => {
      const escaped = escapeHtml('<div class="box">&\'hello\'</div>');
      expect(escaped).toBe('&lt;div class=&quot;box&quot;&gt;&amp;&#39;hello&#39;&lt;/div&gt;');
    });
  });

  describe('Script injection defense in standalone HTML', () => {
    it('prevents </script><script>alert(1)</script> from closing the script tag', () => {
      const xssInput = '</script><script>alert(1)</script>';
      const html = generateStandaloneOfflineHtml({ latex: xssInput, isZh: true });
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const rawInside = scriptMatch![1];
      expect(rawInside.toLowerCase()).not.toContain('</script>');
      expect(rawInside).toContain('\\u003c/script\\u003e');
      // Must not create an unescaped malicious script tag
      const allScripts = html.match(/<script/gi) || [];
      // Exactly 2 scripts: #formula-data and the inline copy logic
      expect(allScripts.length).toBe(2);
    });

    it('handles mixed-case tags like </ScRiPt><img src=x onerror=alert(1)>', () => {
      const mixedCaseInput = '</ScRiPt><img src=x onerror=alert(1)>';
      const html = generateStandaloneOfflineHtml({ latex: mixedCaseInput, isZh: true });
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      expect(scriptMatch![1]).not.toContain('<img');
      expect(scriptMatch![1]).toContain('\\u003cimg');
    });

    it('handles multiple consecutive </script> tags', () => {
      const multiScript = '</script></script></script><script>alert(2)</script>';
      const html = generateStandaloneOfflineHtml({ latex: multiScript, isZh: true });
      const allScripts = html.match(/<script/gi) || [];
      expect(allScripts.length).toBe(2);
    });

    it('safely handles double quotes, single quotes, and backslashes', () => {
      const quoteInput = '\\text{"quoted"} + \'single\' + \\alpha\\beta\\\\gamma';
      const html = generateStandaloneOfflineHtml({ latex: quoteInput, isZh: false });
      expect(html).toContain('&quot;quoted&quot;');
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const parsed = JSON.parse(scriptMatch![1]);
      expect(parsed).toBe(quoteInput);
    });

    it('safely preserves multiline formulas without script corruption', () => {
      const multiline = `\\begin{aligned}
  f(x) &= \\int_0^1 x^2 dx \\\\
       &= \\left[ \\frac{x^3}{3} \\right]_0^1
\\end{aligned}`;
      const html = generateStandaloneOfflineHtml({ latex: multiline, isZh: true });
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const parsed = JSON.parse(scriptMatch![1]);
      expect(parsed).toBe(multiline);
    });

    it('safely handles Chinese characters and Emoji', () => {
      const emojiInput = '\\text{质能方程 } ❤️ 🚀 E = mc^2';
      const html = generateStandaloneOfflineHtml({ latex: emojiInput, isZh: true });
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const parsed = JSON.parse(scriptMatch![1]);
      expect(parsed).toBe(emojiInput);
    });

    it('safely roundtrips <, >, and & symbols', () => {
      const text = 'a < b \\text{ and } c > d \\& e';
      const html = generateStandaloneOfflineHtml({ latex: text, isZh: true });
      const scriptMatch = html.match(/<script id="formula-data"[^>]*>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const parsed = JSON.parse(scriptMatch![1]);
      expect(parsed).toBe(text);
    });

    it('safely handles \\href{javascript:...}{x}', () => {
      const jsUrl = '\\href{javascript:alert(1)}{click}';
      const html = generateStandaloneOfflineHtml({ latex: jsUrl, isZh: true });
      // Must never generate an active executable anchor tag with javascript:
      expect(html).not.toMatch(/<a\s+[^>]*href=["']?javascript:/i);
    });
  });

  describe('Zero external network dependencies', () => {
    it('does not contain any external CDN or font links', () => {
      const html = generateStandaloneOfflineHtml({ latex: 'x^2 + y^2 = z^2', isZh: true });
      expect(html).not.toContain('jsdelivr.net');
      expect(html).not.toContain('cdnjs.cloudflare.com');
      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('http://');
      // The only URL allowed is the safe visual-tex link in the footer
      const httpMatches = html.match(/https?:\/\/[^\s"']+/g) || [];
      for (const url of httpMatches) {
        expect(url).toBe('https://visual-tex.ai.studio');
      }
    });
  });
});
