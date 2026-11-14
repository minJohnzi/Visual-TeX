import { describe, it, expect, vi } from 'vitest';
import {
  injectSymbolabShadowStyles,
  updateSymbolabActiveSlot,
  clearSymbolabActiveSlot,
  configureSymbolabMathfieldBehavior,
  unifySymbolabSelectionBoxes,
} from './symbolabVisualStyle';

describe('Symbolab Visual Input Box UI & Interaction Logic', () => {
  it('configures defaultMode=inline-math, smartSuperscript=true (for continuous r^2=a^2ac input) and Symbolab inline shortcuts', () => {
    const mockMf = {
      defaultMode: 'math',
      smartSuperscript: false,
      smartFence: false,
      inlineShortcuts: {
        alpha: '\\alpha',
        ii: '\\imaginaryI',
        ee: '\\exponentialE',
      },
    } as unknown as import('mathlive').MathfieldElement;

    configureSymbolabMathfieldBehavior(mockMf);

    expect(mockMf.defaultMode).toBe('inline-math');
    expect(mockMf.smartSuperscript).toBe(true);
    expect(mockMf.smartFence).toBe(true);
    expect(mockMf.inlineShortcuts['+-']).toBe('\\pm');
    expect(mockMf.inlineShortcuts['sqrt']).toBe('\\sqrt{#?}');
    expect(mockMf.inlineShortcuts['dx']).toBe('\\mathrm{d}x');
    expect(mockMf.inlineShortcuts['ii']).toBeUndefined();
    expect(mockMf.inlineShortcuts['ee']).toBeUndefined();
  });

  it('merges fragmented multi-branch .ML__selection boxes into a single unified Symbolab rectangle', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const field = document.createElement('div');
    field.className = 'ML__content ML__focused';
    shadow.appendChild(field);

    // 模拟 \sum_{k=0}^n \frac{f^{(k)}(0)}{k!} x^k + R_n(x) 全选时 MathLive 产生的 6 个碎片化 .ML__selection
    const fragmentedBoxes = [
      { left: 10, top: 14, width: 220, height: 42 }, // 主干行
      { left: 18, top: 2, width: 12, height: 14 },   // 求和上限 n
      { left: 12, top: 54, width: 28, height: 16 },  // 求和下限 k=0
      { left: 48, top: 6, width: 64, height: 28 },   // 分子 f^{(k)}(0)
      { left: 60, top: 2, width: 20, height: 16 },   // 分子上标 (k)
      { left: 68, top: 38, width: 24, height: 24 },  // 分母 k!
    ];

    for (const box of fragmentedBoxes) {
      const sel = document.createElement('div');
      sel.className = 'ML__selection';
      sel.style.left = `${box.left}px`;
      sel.style.top = `${box.top}px`;
      sel.style.width = `${box.width}px`;
      sel.style.height = `${box.height}px`;
      field.appendChild(sel);
    }

    const mockMf = {
      shadowRoot: shadow,
      _mathfield: { field },
    } as unknown as import('mathlive').MathfieldElement;

    unifySymbolabSelectionBoxes(mockMf);

    const visibleSelections = Array.from(
      field.querySelectorAll<HTMLElement>('.ML__selection')
    ).filter((el) => el.style.display !== 'none');
    expect(visibleSelections.length).toBe(1);

    const unified = visibleSelections[0];
    expect(unified.getAttribute('data-symbolab-unified')).toBe('1');
    // minLeft=10 (-3 -> 7), minTop=2 (-2 -> 0), maxRight=230 (+3 -> width 226), maxBottom=70 (+2 -> height 72)
    expect(unified.style.left).toBe('7px');
    expect(unified.style.top).toBe('0px');
    expect(unified.style.width).toBe('226px');
    expect(unified.style.height).toBe('72px');
  });

  it('injects Symbolab shadow styles and renders glowing active-slot box around superscript |2', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });

    const field = document.createElement('div');
    field.className = 'ML__content ML__focused';
    shadow.appendChild(field);

    const supSpan = document.createElement('span');
    supSpan.setAttribute('data-atom-id', 'atom-sup-2');
    supSpan.textContent = '2';
    field.appendChild(supSpan);

    const caretSpan = document.createElement('span');
    caretSpan.className = 'ML__caret';
    field.appendChild(caretSpan);

    // Mock bounding client rects for JSDOM
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 400,
      bottom: 150,
      width: 300,
      height: 100,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    vi.spyOn(supSpan, 'getBoundingClientRect').mockReturnValue({
      left: 180,
      top: 65,
      right: 192,
      bottom: 83,
      width: 12,
      height: 18,
      x: 180,
      y: 65,
      toJSON: () => ({}),
    });

    vi.spyOn(caretSpan, 'getBoundingClientRect').mockReturnValue({
      left: 179,
      top: 66,
      right: 181,
      bottom: 82,
      width: 2,
      height: 16,
      x: 179,
      y: 66,
      toJSON: () => ({}),
    });

    const firstAtom = { id: 'atom-first', type: 'first' };
    const digitTwoAtom = { id: 'atom-sup-2', type: 'mord', value: '2' };
    const parentSubsup = {
      id: 'atom-subsup',
      type: 'subsup',
      isRoot: false,
      branch: (name: string) => (name === 'superscript' ? [firstAtom, digitTwoAtom] : []),
    };

    Object.assign(firstAtom, { parent: parentSubsup, parentBranch: 'superscript' });
    Object.assign(digitTwoAtom, { parent: parentSubsup, parentBranch: 'superscript' });

    const mockMf = {
      shadowRoot: shadow,
      matches: () => true,
      _mathfield: {
        field,
        model: {
          position: 1,
          selectionIsCollapsed: true,
          at: () => firstAtom, // Cursor right before '2': |2
        },
      },
    } as unknown as import('mathlive').MathfieldElement;

    injectSymbolabShadowStyles(mockMf);
    const styleEl = shadow.getElementById('symbolab-mathfield-shadow-style');
    expect(styleEl).not.toBeNull();
    expect(styleEl!.textContent).toContain('#0875e1');
    expect(styleEl!.textContent).toContain('#ffffff');

    updateSymbolabActiveSlot(mockMf);

    const bgBox = field.querySelector('.symbolab-active-slot-bg') as HTMLElement | null;
    const borderBox = field.querySelector('.symbolab-active-slot-border') as HTMLElement | null;

    expect(bgBox).not.toBeNull();
    expect(borderBox).not.toBeNull();
    expect(parseInt(borderBox!.style.width, 10)).toBeGreaterThanOrEqual(18);
    expect(parseInt(borderBox!.style.height, 10)).toBeGreaterThanOrEqual(18);

    clearSymbolabActiveSlot(mockMf);
    expect(field.querySelector('.symbolab-active-slot-bg')).toBeNull();
    expect(field.querySelector('.symbolab-active-slot-border')).toBeNull();
  });

  it('renders \\ln(1+x) = x - \\frac{x^2}{2} + \\frac{x^3}{3} - \\dots + (-1)^{n-1}\\frac{x^n}{n} + o(x^n) in MathLive without ML__error', async () => {
    const ml = await import('mathlive');
    const { SAFE_SUPPLEMENTAL_MACROS } = await import('./symbolabVisualStyle');
    const formula =
      '\\ln(1+x) = x - \\frac{x^2}{2} + \\frac{x^3}{3} - \\dots + (-1)^{n-1}\\frac{x^n}{n} + o(x^n)';

    const markup = ml.convertLatexToMarkup(formula, {
      macros: SAFE_SUPPLEMENTAL_MACROS as Record<string, string | Partial<import('mathlive').MacroDefinition>>,
    });

    expect(markup).not.toContain('ML__error');
  });

  it('supports r^2=a^2ac in Visual Mode with full-container pointer hit area and continuous input', async () => {
    const ml = await import('mathlive');
    const { SAFE_SUPPLEMENTAL_MACROS } = await import('./symbolabVisualStyle');
    const { sourceToMathfieldLatex, mathfieldToSourceLatex } = await import('./latex');

    const source = 'r^2=a^2ac';
    const visualLatex = sourceToMathfieldLatex(source);
    expect(visualLatex).toBe('r^2=a^2ac');

    const markup = ml.convertLatexToMarkup(visualLatex, {
      macros: SAFE_SUPPLEMENTAL_MACROS as Record<string, string | Partial<import('mathlive').MacroDefinition>>,
    });
    expect(markup).not.toContain('ML__error');
    expect(mathfieldToSourceLatex(visualLatex)).toBe('r^2=a^2ac');

    // Verify Shadow DOM style expands .ML__container to 100% width and >= 112px min-height so clicks anywhere focus the field
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const mockMf = { shadowRoot: shadow } as unknown as import('mathlive').MathfieldElement;
    injectSymbolabShadowStyles(mockMf);
    const styleText = shadow.getElementById('symbolab-mathfield-shadow-style')?.textContent || '';
    expect(styleText).toContain('min-height: 112px !important;');
  });
});
