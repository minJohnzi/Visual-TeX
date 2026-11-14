import { describe, expect, it } from 'vitest';
import { coalesceShadowSelections, mergeSelectionRects } from './selectionBox';

describe('selectionBox helpers', () => {
  it('merges overlapping main, limit, and superscript boxes on the same row', () => {
    const boxes = [
      // Main formula body
      { left: 10, top: 20, right: 260, bottom: 54 },
      // Integral upper limit \infty (overlaps main top edge)
      { left: 95, top: 4, right: 118, bottom: 24 },
      // Integral lower limit -\infty (overlaps main bottom edge)
      { left: 82, top: 50, right: 120, bottom: 72 },
      // Complex exponent -2\pi i x \xi (overlaps main body)
      { left: 150, top: 10, right: 230, bottom: 36 },
    ];

    expect(mergeSelectionRects(boxes)).toEqual([
      { left: 10, top: 4, right: 260, bottom: 72 },
    ]);
  });

  it('keeps vertically separated multiline selections distinct', () => {
    const boxes = [
      { left: 10, top: 10, right: 180, bottom: 40 },
      { left: 12, top: 60, right: 200, bottom: 90 },
    ];

    expect(mergeSelectionRects(boxes)).toEqual([
      { left: 10, top: 10, right: 180, bottom: 40 },
      { left: 12, top: 60, right: 200, bottom: 90 },
    ]);
  });

  it('coalesces ShadowRoot .ML__selection DOM elements and hides extras without removing nodes', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    const createRectEl = (left: number, top: number, width: number, height: number) => {
      const div = document.createElement('div');
      div.className = 'ML__selection';
      div.style.left = `${left}px`;
      div.style.top = `${top}px`;
      div.style.width = `${width}px`;
      div.style.height = `${height}px`;
      shadow.appendChild(div);
      return div;
    };

    const a = createRectEl(10, 20, 120, 30);
    const b = createRectEl(50, 6, 30, 18);

    coalesceShadowSelections(shadow);

    expect(shadow.querySelector('style[data-visual-tex-selection="1"]')).not.toBeNull();
    expect(a.style.left).toBe('10px');
    expect(a.style.top).toBe('6px');
    expect(a.style.width).toBe('120px');
    expect(a.style.height).toBe('44px');
    expect(a.style.display).toBe('');
    expect(b.style.display).toBe('none');
    expect(a.getAttribute('data-coalesced')).toBe('1');
    expect(b.getAttribute('data-coalesced')).toBe('1');
  });
});
