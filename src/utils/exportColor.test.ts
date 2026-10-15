import { describe, it, expect } from 'vitest';
import { resolveExportTextColor } from './exportPng';

describe('Export text color resolution', () => {
  it('defaults transparent (checker) PNG/SVG to deep dark text (#0f172a)', () => {
    // Even if color is 'default', transparent export MUST be dark text for Word/PPT white paper
    const resolved = resolveExportTextColor('default', 'checker');
    expect(resolved).toBe('#0f172a');
    expect(resolved).not.toBe('#ffffff');
    expect(resolved).not.toBe('#f8fafc');
  });

  it('defaults dark background (bgMode === dark) to light text (#f8fafc)', () => {
    const resolved = resolveExportTextColor('default', 'dark');
    expect(resolved).toBe('#f8fafc');
  });

  it('defaults white or gray background to dark text (#0f172a)', () => {
    expect(resolveExportTextColor('default', 'white')).toBe('#0f172a');
    expect(resolveExportTextColor('default', 'gray')).toBe('#0f172a');
  });

  it('respects explicitly user-selected colors', () => {
    expect(resolveExportTextColor('#ffffff', 'checker')).toBe('#ffffff');
    expect(resolveExportTextColor('#1e3a8a', 'checker')).toBe('#1e3a8a');
    expect(resolveExportTextColor('#000000', 'checker')).toBe('#000000');
  });
});
