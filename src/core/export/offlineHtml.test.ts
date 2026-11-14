import { describe, expect, it } from 'vitest';
import { isColorLight, resolveExportTextColor } from './mathjaxClient';
import {
  escapeJsonForScript,
  generateStandaloneOfflineHtml,
  sanitizeFilename,
} from './offlineHtml';

describe('export colors and standalone offline HTML', () => {
  it('resolves export ink colors for dark vs light/checker backgrounds', () => {
    expect(resolveExportTextColor('default', 'checker')).toBe('#0f172a');
    expect(resolveExportTextColor('default', 'white')).toBe('#0f172a');
    expect(resolveExportTextColor('default', 'dark')).toBe('#f8fafc');
    expect(resolveExportTextColor('#2563eb', 'dark')).toBe('#2563eb');

    expect(isColorLight('#ffffff')).toBe(true);
    expect(isColorLight('#0f172a')).toBe(false);
  });

  it('sanitizes filenames safely and blocks traversal/control/HTML characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFilename('<script>bad</script>\u0007test')).toBe('badtest');
    expect(sanitizeFilename('.../../<>')).toBe('formula');
  });

  it('escapes HTML-sensitive sequences inside JSON script tags so roundtrip stays safe', () => {
    const payload = { raw: '</script><img src=x>&\u2028\u2029' };
    const escaped = escapeJsonForScript(payload);
    expect(escaped).not.toContain('</script>');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('&');
    expect(JSON.parse(escaped)).toEqual(payload);
  });

  it('generates self-contained offline HTML with zero external CDN scripts and exactly two script tags', () => {
    const html = generateStandaloneOfflineHtml({
      title: 'Test <Title>',
      docMode: 'single',
      singleLatex: '\\frac{a}{b}',
      renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
      delimiterMode: 'display',
    });

    const scriptTags = html.match(/<script\b/gi) || [];
    expect(scriptTags).toHaveLength(2);
    expect(html).toContain('<script id="formula-data" type="application/json">');

    // No external CDN URLs or asset fetches allowed (only W3C SVG namespace & attribution link)
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const url of urls) {
      const allowed =
        url.startsWith('https://visual-tex.ai.studio') ||
        url === 'http://www.w3.org/2000/svg';
      expect(allowed).toBe(true);
    }
  });
});
