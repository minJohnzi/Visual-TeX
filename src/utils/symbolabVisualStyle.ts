import type { MathfieldElement } from 'mathlive';

const SHADOW_STYLE_ID = 'symbolab-mathfield-shadow-style';
const ACTIVE_SLOT_BG_CLASS = 'symbolab-active-slot-bg';
const ACTIVE_SLOT_BORDER_CLASS = 'symbolab-active-slot-border';
const SELECTION_OBSERVER_FLAG = '__symbolabSelectionObserverAttached';

interface InternalAtom {
  id?: string;
  type?: string;
  command?: string;
  value?: string;
  isRoot?: boolean;
  environmentName?: string;
  parent?: InternalAtom;
  parentBranch?: string | [number, number];
  branch?: (name: string | [number, number]) => InternalAtom[] | undefined;
}

interface InternalMathfield {
  field?: HTMLElement;
  model?: {
    position: number;
    selectionIsCollapsed: boolean;
    at: (pos: number) => InternalAtom | undefined;
  };
}

interface SelectionBoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 将 MathLive 按子分支（root / above / below / superscript / subscript）拆碎的多个 .ML__selection 选区框
 * 合并为 Symbolab (zs.symbolab.com/solver) 风格的单一完整矩形选区框，彻底消除半透明色块叠加接缝与阶梯缺口。
 */
export function unifySymbolabSelectionBoxes(mf: MathfieldElement): void {
  const internal = (mf as unknown as { _mathfield?: InternalMathfield })._mathfield;
  const field =
    internal?.field ||
    (mf.shadowRoot?.querySelector('.ML__content') as HTMLElement | null);
  if (!field) return;

  const selectionNodes = Array.from(
    field.querySelectorAll<HTMLElement>('.ML__selection')
  );
  if (selectionNodes.length === 0) return;

  // 若已经合并完成且所有节点均带有统一标记，则直接跳过以防 MutationObserver 循环触发
  if (
    selectionNodes.every(
      (node) => node.getAttribute('data-symbolab-unified') === '1'
    )
  ) {
    return;
  }

  const rawRects: SelectionBoxRect[] = [];
  for (const node of selectionNodes) {
    const left = parseFloat(node.style.left);
    const top = parseFloat(node.style.top);
    const width = parseFloat(node.style.width);
    const height = parseFloat(node.style.height);
    if (
      Number.isFinite(left) &&
      Number.isFinite(top) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      rawRects.push({
        left,
        top,
        right: left + width,
        bottom: top + height,
      });
    }
  }

  if (rawRects.length === 0) return;

  // 按纵向重叠关系（同一公式行的分子、分母、上标、下标、求和上下限纵向区间必然重叠或紧邻）聚类合并
  const mergedLines: SelectionBoxRect[] = [];
  const sorted = [...rawRects].sort((a, b) => a.top - b.top);
  const verticalTolerance = 8;

  for (const rect of sorted) {
    let mergedIntoExisting = false;
    for (const group of mergedLines) {
      const overlapsVertically =
        rect.top <= group.bottom + verticalTolerance &&
        rect.bottom >= group.top - verticalTolerance;
      if (overlapsVertically) {
        group.left = Math.min(group.left, rect.left);
        group.top = Math.min(group.top, rect.top);
        group.right = Math.max(group.right, rect.right);
        group.bottom = Math.max(group.bottom, rect.bottom);
        mergedIntoExisting = true;
        break;
      }
    }
    if (!mergedIntoExisting) {
      mergedLines.push({ ...rect });
    }
  }

  // 二次归并：防止先加入的小上标框与后加入的主干框在合并后与其它框产生连通
  let changed = true;
  while (changed && mergedLines.length > 1) {
    changed = false;
    for (let i = 0; i < mergedLines.length; i++) {
      for (let j = i + 1; j < mergedLines.length; j++) {
        const a = mergedLines[i];
        const b = mergedLines[j];
        if (
          a.top <= b.bottom + verticalTolerance &&
          a.bottom >= b.top - verticalTolerance
        ) {
          a.left = Math.min(a.left, b.left);
          a.top = Math.min(a.top, b.top);
          a.right = Math.max(a.right, b.right);
          a.bottom = Math.max(a.bottom, b.bottom);
          mergedLines.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  const padX = 3;
  const padY = 2;

  for (let i = 0; i < mergedLines.length; i++) {
    const group = mergedLines[i];
    const el = selectionNodes[i];
    el.setAttribute('data-symbolab-unified', '1');
    el.style.display = 'block';
    el.style.left = `${Math.round(group.left - padX)}px`;
    el.style.top = `${Math.round(group.top - padY)}px`;
    el.style.width = `${Math.max(4, Math.round(group.right - group.left + padX * 2))}px`;
    el.style.height = `${Math.max(14, Math.round(group.bottom - group.top + padY * 2))}px`;
  }

  for (let i = mergedLines.length; i < selectionNodes.length; i++) {
    const extra = selectionNodes[i];
    extra.setAttribute('data-symbolab-unified', '1');
    extra.style.display = 'none';
    extra.style.width = '0px';
    extra.style.height = '0px';
  }
}

/**
 * 向 MathLive <math-field> 的 Shadow DOM 注入 Symbolab (zs.symbolab.com/solver) 风格样式：
 * 1. 移除 MathLive 默认对整个根式/分式祖先块的灰蓝底色填充 (.ML__contains-highlight)
 * 2. 选中区域采用 Symbolab 标志性纯正皇家蓝底框 (#0875e1) + 纯白选中文本与白色分式线/根号线 (#ffffff)
 * 3. 将光标竖线 (.ML__caret) 设为深海军蓝/亮白高对比度细竖线 (|2)
 * 4. 将空白占位槽 (\placeholder{}) 渲染为 Symbolab 虚线/浅灰矩形输入格，激活时呈现亮蓝外发光框
 * 5. 为当前活动子槽位（如上标 b^{|2}、下标 G_{|1}、n次根指数、上下限等）提供白底 + 亮蓝外发光边框图层
 * 6. 让 :host > span 与 .ML__container 完整撑满整个 <math-field> 区域，确保点击输入框任意空白处均可聚焦并定位光标
 */
export function injectSymbolabShadowStyles(mf: MathfieldElement): void {
  const shadow = mf.shadowRoot;
  if (!shadow) return;

  if (!shadow.getElementById(SHADOW_STYLE_ID)) {
    const styleEl = document.createElement('style');
    styleEl.id = SHADOW_STYLE_ID;
    styleEl.textContent = `
      :host {
        --_contains-highlight-background-color: transparent !important;
        --_contains-highlight-color: currentColor !important;
        --_text-highlight-background-color: rgba(8, 117, 225, 0.08) !important;
        --_selection-background-color: var(--symbolab-selection-bg, #0875e1) !important;
        --_selection-color: var(--symbolab-selection-color, #ffffff) !important;
        padding: 0 !important;
      }

      :host > span {
        display: block !important;
        width: 100% !important;
        min-height: inherit !important;
      }

      .ML__container {
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        min-height: 112px !important;
        padding: 1.25rem 4.25rem 1.25rem 1.5rem !important;
        box-sizing: border-box !important;
        cursor: text !important;
      }

      .ML__content {
        overflow: visible !important;
      }

      /* 隐藏 MathLive 默认的大块祖先高亮与右侧浮动汉堡菜单按钮 */
      .ML__contains-highlight {
        display: none !important;
        background: transparent !important;
        opacity: 0 !important;
      }

      .ML__menu-toggle,
      .ML__virtual-keyboard-toggle,
      .ML__toggles {
        display: none !important;
      }

      /* 保持根号、括号在光标进入时不发生突兀变色，与 Symbolab 保持一致 */
      .ML__contains-caret.ML__close,
      .ML__contains-caret.ML__open,
      .ML__contains-caret > .ML__close,
      .ML__contains-caret > .ML__open,
      .ML__contains-caret .ML__sqrt-sign,
      .ML__contains-caret .ML__sqrt-line {
        color: currentColor !important;
      }

      /* Symbolab 选中态：统一纯正皇家蓝实心底框 (#0875e1) + 纯白公式字符与分式线 (#ffffff) */
      .ML__selection,
      :host(:focus) .ML__selection,
      :host(:focus-within) .ML__selection,
      .ML__focused .ML__selection {
        background: var(--symbolab-selection-bg, #0875e1) !important;
        opacity: 1 !important;
        border-radius: 2px !important;
        z-index: 0 !important;
      }

      .ML__latex {
        position: relative;
        z-index: 1;
      }

      .ML__focused .ML__selected,
      .ML__focused .ML__selected *,
      .ML__selected,
      .ML__selected * {
        color: var(--symbolab-selection-color, #ffffff) !important;
      }

      .ML__selected .ML__frac-line,
      .ML__selected .ML__frac-line::after,
      .ML__selected .ML__sqrt-line,
      .ML__selected .ML__sqrt-line::before,
      .ML__focused .ML__selected .ML__frac-line,
      .ML__focused .ML__selected .ML__frac-line::after,
      .ML__focused .ML__selected .ML__sqrt-line,
      .ML__focused .ML__selected .ML__sqrt-line::before {
        background: var(--symbolab-selection-color, #ffffff) !important;
        background-color: var(--symbolab-selection-color, #ffffff) !important;
        border-color: var(--symbolab-selection-color, #ffffff) !important;
        color: var(--symbolab-selection-color, #ffffff) !important;
      }

      .ML__selected .ML__stretchy svg,
      .ML__focused .ML__selected .ML__stretchy svg {
        fill: var(--symbolab-selection-color, #ffffff) !important;
        stroke: var(--symbolab-selection-color, #ffffff) !important;
      }

      /* Symbolab 风格高对比度垂直输入光标 (|2) */
      .ML__caret::after,
      .ML__text-caret::after {
        --_caret-width: 1.6px !important;
        height: 0.84em !important;
        border-radius: 0 !important;
        border-right: 1.6px solid var(--symbolab-caret-color, #1e293b) !important;
        margin-right: -1.6px !important;
        left: -0.02em !important;
        bottom: -0.06em !important;
      }

      /* 空白占位格 (\placeholder{}) 渲染为 Symbolab 矩形待填框而非 Unicode 方块字符 */
      .ML__placeholder {
        display: inline-block !important;
        color: transparent !important;
        opacity: 1 !important;
        min-width: 0.66em !important;
        height: 0.84em !important;
        line-height: 0.84em !important;
        vertical-align: -0.07em !important;
        padding: 0 0.14em !important;
        margin: 0 0.05em !important;
        border: 1px dashed var(--symbolab-placeholder-border, #94a3b8) !important;
        border-radius: 2px !important;
        background: var(--symbolab-placeholder-bg, rgba(148, 163, 184, 0.13)) !important;
        box-sizing: border-box !important;
        user-select: none !important;
        transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
      }

      /* 当光标位于空白占位格上或选中该占位格时，呈现 Symbolab 亮蓝发光框 */
      .ML__focused .ML__selected .ML__placeholder,
      .ML__focused .ML__placeholder.ML__selected,
      .ML__focused .ML__placeholder.ML__placeholder-selected,
      .ML__focused .ML__placeholder.ML__caret,
      .ML__focused .ML__caret + .ML__placeholder {
        color: transparent !important;
        border: 1px solid var(--symbolab-slot-border, #1da1f2) !important;
        background: var(--symbolab-slot-bg, #ffffff) !important;
        box-shadow: 0 0 6px 1px var(--symbolab-slot-glow, rgba(0, 149, 255, 0.62)) !important;
      }

      /* Symbolab 活动子槽位（如 b^{|2} 的上标框）底层白底衬垫与顶层亮蓝发光边框 */
      .${ACTIVE_SLOT_BG_CLASS} {
        position: absolute;
        pointer-events: none;
        box-sizing: border-box;
        border-radius: 2px;
        background: var(--symbolab-slot-bg, #ffffff);
        z-index: 0;
      }

      .${ACTIVE_SLOT_BORDER_CLASS} {
        position: absolute;
        pointer-events: none;
        box-sizing: border-box;
        border-radius: 2px;
        background: transparent;
        border: 1px solid var(--symbolab-slot-border, #1da1f2);
        box-shadow:
          0 0 6px 1.2px var(--symbolab-slot-glow, rgba(0, 149, 255, 0.62)),
          0 0 2px 0 var(--symbolab-slot-glow-inner, rgba(0, 149, 255, 0.85));
        z-index: 5;
      }
    `;

    shadow.appendChild(styleEl);
  }

  // 挂载 MutationObserver 监听 MathLive 每次重绘 .ML__selection，并在浏览器绘制前即时合并为单一选区矩形
  const shadowWithFlag = shadow as unknown as Record<string, unknown>;
  if (!shadowWithFlag[SELECTION_OBSERVER_FLAG] && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      const internal = (mf as unknown as { _mathfield?: InternalMathfield })._mathfield;
      if (internal?.model && !internal.model.selectionIsCollapsed) {
        unifySymbolabSelectionBoxes(mf);
      }
    });
    observer.observe(shadow, { childList: true, subtree: true });
    shadowWithFlag[SELECTION_OBSERVER_FLAG] = observer;
  }
}

/**
 * 判断当前光标所在的分支是否属于需要显示 Symbolab 聚焦发光小方框的“子槽位”：
 * - 上标 (superscript，如 b^{|2})
 * - 下标 (subscript，如 G_{|1})
 * - 根式次数 (surd 的 above 分支，如 \sqrt[|3]{x})
 * - 极限/求和/积分/上下括号的上下限 (overunder / extensible-symbol / mop 的 above / below)
 * - 任何处于空状态或仅含 placeholder 的子分支（如刚插入的分式分子/分母、空根号内部）
 */
function resolveActiveSymbolabSlotAtoms(model: NonNullable<InternalMathfield['model']>): InternalAtom[] | null {
  if (!model.selectionIsCollapsed) return null;

  const cursorAtom = model.at(model.position);
  if (!cursorAtom) return null;

  // 若光标本身停在 placeholder 上
  if (cursorAtom.type === 'placeholder') {
    return [cursorAtom];
  }

  const parent = cursorAtom.parent;
  const branchName = cursorAtom.parentBranch;
  if (!parent || !branchName || parent.isRoot || parent.environmentName === 'lines') {
    return null;
  }

  const branchAtoms = typeof parent.branch === 'function' ? parent.branch(branchName) : undefined;
  if (!branchAtoms || branchAtoms.length === 0) return null;

  // 检查该分支是否仅含 first / placeholder（即空槽位）
  const meaningfulAtoms = branchAtoms.filter((a) => a.type !== 'first');
  const isEmptyOrPlaceholderSlot =
    meaningfulAtoms.length === 0 ||
    (meaningfulAtoms.length === 1 && meaningfulAtoms[0].type === 'placeholder');

  if (isEmptyOrPlaceholderSlot) {
    return branchAtoms;
  }

  // 非空分支：参照 Symbolab (zs.symbolab.com/solver)，对上标、下标、根指数、算子上下限显示聚焦发光小方框
  const isScriptBranch = branchName === 'superscript' || branchName === 'subscript';
  const isNthRootIndex = parent.type === 'surd' && branchName === 'above';
  const isLimitOrOverUnder =
    (parent.type === 'overunder' ||
      parent.type === 'extensible-symbol' ||
      parent.type === 'mop' ||
      parent.type === 'accent') &&
    (branchName === 'above' || branchName === 'below');

  if (isScriptBranch || isNthRootIndex || isLimitOrOverUnder) {
    return branchAtoms;
  }

  return null;
}

/**
 * 清除 Shadow DOM 中的 Symbolab 活动子槽位高亮框
 */
export function clearSymbolabActiveSlot(mf: MathfieldElement): void {
  const shadow = mf.shadowRoot;
  if (!shadow) return;
  shadow
    .querySelectorAll(`.${ACTIVE_SLOT_BG_CLASS}, .${ACTIVE_SLOT_BORDER_CLASS}`)
    .forEach((el) => el.remove());
}

/**
 * 计算并渲染 Symbolab 风格的活动子槽位发光聚焦框（如 \frac{-b \pm \sqrt{b^{|2} - 4ac}}{2a} 中的 |2 框）
 * 同时确保多分支选区被合并为单一矩形
 */
export function updateSymbolabActiveSlot(mf: MathfieldElement): void {
  injectSymbolabShadowStyles(mf);
  unifySymbolabSelectionBoxes(mf);

  const internal = (mf as unknown as { _mathfield?: InternalMathfield })._mathfield;
  const field = internal?.field;
  const model = internal?.model;
  if (!field || !model) return;

  const isFocused =
    document.activeElement === mf ||
    mf.matches?.(':focus-within') ||
    field.classList.contains('ML__focused');

  const slotAtoms = isFocused ? resolveActiveSymbolabSlotAtoms(model) : null;
  const nonFirst = slotAtoms ? slotAtoms.filter((a) => a.type !== 'first') : [];
  const shouldHideSlotBox =
    !isFocused ||
    !slotAtoms ||
    slotAtoms.length === 0 ||
    (nonFirst.length === 1 && nonFirst[0].type === 'placeholder');

  if (shouldHideSlotBox) {
    field
      .querySelectorAll(`.${ACTIVE_SLOT_BG_CLASS}, .${ACTIVE_SLOT_BORDER_CLASS}`)
      .forEach((el) => el.remove());
    return;
  }

  const fieldRect = field.getBoundingClientRect();
  if (fieldRect.width === 0 && fieldRect.height === 0) return;

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  for (const atom of slotAtoms) {
    if (!atom.id) continue;
    const nodes = field.querySelectorAll(`[data-atom-id="${atom.id}"]`);
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('ML__pstrut')) return;
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      minLeft = Math.min(minLeft, r.left);
      minTop = Math.min(minTop, r.top);
      maxRight = Math.max(maxRight, r.right);
      maxBottom = Math.max(maxBottom, r.bottom);
    });
  }

  // 同时纳入当前光标竖线 (.ML__caret) 的坐标，确保当光标在槽位最左侧 (|2) 时发光框完整包裹竖线与数字
  const caretEl = field.querySelector('.ML__caret, .ML__text-caret');
  if (caretEl instanceof HTMLElement) {
    const cr = caretEl.getBoundingClientRect();
    if (cr.top !== 0 || cr.left !== 0) {
      const caretTop = cr.height > 2 ? cr.top : cr.top - 11;
      const caretBottom = cr.height > 2 ? cr.bottom : cr.bottom + 2;
      minLeft = Math.min(minLeft, cr.left - 1);
      maxRight = Math.max(maxRight, cr.right + 1);
      if (!Number.isFinite(minTop)) {
        minTop = caretTop;
        maxBottom = caretBottom;
      }
    }
  }

  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) {
    field
      .querySelectorAll(`.${ACTIVE_SLOT_BG_CLASS}, .${ACTIVE_SLOT_BORDER_CLASS}`)
      .forEach((el) => el.remove());
    return;
  }

  const padX = 3;
  const padY = 1.5;

  const left = Math.round(minLeft - fieldRect.left + field.scrollLeft - padX);
  const top = Math.round(minTop - fieldRect.top + field.scrollTop - padY);
  const width = Math.max(12, Math.round(maxRight - minLeft + padX * 2));
  const height = Math.max(15, Math.round(maxBottom - minTop + padY * 2));

  let bgBox = field.querySelector(`.${ACTIVE_SLOT_BG_CLASS}`) as HTMLElement | null;
  if (!bgBox) {
    bgBox = document.createElement('div');
    bgBox.className = ACTIVE_SLOT_BG_CLASS;
    field.insertBefore(bgBox, field.childNodes[0] || null);
  }
  bgBox.style.left = `${left}px`;
  bgBox.style.top = `${top}px`;
  bgBox.style.width = `${width}px`;
  bgBox.style.height = `${height}px`;

  let borderBox = field.querySelector(`.${ACTIVE_SLOT_BORDER_CLASS}`) as HTMLElement | null;
  if (!borderBox) {
    borderBox = document.createElement('div');
    borderBox.className = ACTIVE_SLOT_BORDER_CLASS;
    field.appendChild(borderBox);
  }
  borderBox.style.left = `${left}px`;
  borderBox.style.top = `${top}px`;
  borderBox.style.width = `${width}px`;
  borderBox.style.height = `${height}px`;
}

/**
 * MathLive 缺失的标准 LaTeX / amsmath 补充宏字典（非递归、严禁覆盖 MathLive 内置宏）：
 * - MathLive 原生仅定义了 \ldots, \cdots, \vdots, \ddots，未定义 \dots, \dotsb, \dotsc 等标准省略号命令，
 *   导致 \ln(1+x) = x - \frac{x^2}{2} + \frac{x^3}{3} - \dots + (-1)^{n-1}\frac{x^n}{n} + o(x^n) 中的 \dots 显示红色报错框。
 * - 通过指向底层内置图元 (\cdots, \ldots 等) 且设置 expand: false，既能在视觉模式正常渲染，
 *   又能在序列化 mf.value 时 100% 保留原始 \dots 命令不发生突变。
 */
export const SAFE_SUPPLEMENTAL_MACROS: Record<
  string,
  { def: string; args?: number; expand?: boolean; captureSelection?: boolean }
> = {
  dots: { def: '\\cdots', expand: false },
  dotsb: { def: '\\cdots', expand: false },
  dotsc: { def: '\\ldots', expand: false },
  dotsi: { def: '\\cdots', expand: false },
  dotsm: { def: '\\cdots', expand: false },
  dotso: { def: '\\ldots', expand: false },
  hdots: { def: '\\ldots', expand: false },
  iddots: { def: '\\ddots', expand: false },
  iiiint: { def: '\\iiint', expand: false },
  diagdown: { def: '\\backslash', expand: false },
  diagup: { def: '/', expand: false },
  pmb: { args: 1, def: '\\boldsymbol{#1}', expand: false },
  bm: { args: 1, def: '\\boldsymbol{#1}', expand: false },
  hbox: { args: 1, def: '\\text{#1}', expand: false },
  substack: { args: 1, def: '\\begin{gathered}#1\\end{gathered}', expand: false },
  sgn: { def: '\\operatorname{sgn}', expand: false },
  rank: { def: '\\operatorname{rank}', expand: false },
  tr: { def: '\\operatorname{tr}', expand: false },
  diag: { def: '\\operatorname{diag}', expand: false },
  cov: { def: '\\operatorname{cov}', expand: false },
  var: { def: '\\operatorname{var}', expand: false },
  Cov: { def: '\\operatorname{Cov}', expand: false },
  Var: { def: '\\operatorname{Var}', expand: false },
  Res: { def: '\\operatorname{Res}', expand: false },
  lcm: { def: '\\operatorname{lcm}', expand: false },
};

/**
 * 配置 MathLive 实例以匹配 Symbolab (https://zs.symbolab.com/solver) 的输入交互逻辑：
 * 1. defaultMode = 'inline-math'：使 \sum_{k=0}^n \frac{f^{(k)}(0)}{k!} x^k + R_n(x) 的上下限位于 \Sigma 右侧 (\Sigma^n_{k=0})，与 Symbolab 输入框完全对齐
 * 2. smartSuperscript = true：输入 r^2=a^2ac 等连续含上标表达式时，键入单数字指数 2 后自动返回基线，防止后续 =a^2ac 卡死在上标槽内无法输入
 * 3. 注册 SAFE_SUPPLEMENTAL_MACROS：解决 \dots 等标准 LaTeX 宏在视觉模式无法渲染的问题
 * 4. 增强行内快捷输入：支持 +- -> \pm, -+ -> \mp, sqrt -> \sqrt{#?}, cbrt -> \sqrt[3]{#?}, frac -> \frac{#?}{#?}
 * 5. 将 dx / dy / dt 修正为 KaTeX 兼容的 \mathrm{d}x / \mathrm{d}y / \mathrm{d}t，移除易误触的 ii / jj / ee 宏
 */
export function configureSymbolabMathfieldBehavior(mf: MathfieldElement): void {
  try {
    mf.defaultMode = 'inline-math';
    mf.smartSuperscript = true;
    mf.smartFence = true;
  } catch {
    // ignore in mock environments
  }

  try {
    const currentMacros =
      typeof mf.macros === 'object' && mf.macros !== null ? mf.macros : {};
    mf.macros = {
      ...currentMacros,
      ...SAFE_SUPPLEMENTAL_MACROS,
    };
  } catch {
    // ignore if mathfield not mounted or in mock environment
  }

  try {
    const existingShortcuts =
      typeof mf.inlineShortcuts === 'object' && mf.inlineShortcuts !== null
        ? { ...mf.inlineShortcuts }
        : {};

    // 移除会把连续输入 ii / jj / ee 变成非标准 KaTeX 宏 (\imaginaryI, \exponentialE) 的内置规则
    delete existingShortcuts['ii'];
    delete existingShortcuts['jj'];
    delete existingShortcuts['ee'];

    mf.inlineShortcuts = {
      ...existingShortcuts,
      '+-': '\\pm',
      '-+': '\\mp',
      sqrt: '\\sqrt{#?}',
      cbrt: '\\sqrt[3]{#?}',
      nthroot: '\\sqrt[#?]{#?}',
      frac: '\\frac{#?}{#?}',
      dx: '\\mathrm{d}x',
      dy: '\\mathrm{d}y',
      dt: '\\mathrm{d}t',
      ds: '\\mathrm{d}s',
      "''": '^{\\prime\\prime}',
    };
  } catch {
    // ignore in mock environments
  }
}
