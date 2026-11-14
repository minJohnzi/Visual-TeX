export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const VERTICAL_MERGE_TOLERANCE_PX = 4;
const HORIZONTAL_MERGE_TOLERANCE_PX = 8;

function canMergeSelectionRects(a: SelectionRect, b: SelectionRect): boolean {
  const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (verticalOverlap < -VERTICAL_MERGE_TOLERANCE_PX) return false;

  const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return horizontalOverlap >= -HORIZONTAL_MERGE_TOLERANCE_PX;
}

/**
 * Iteratively merges MathLive `.ML__selection` fragments on the same visual
 * row (such as integral limits, fractions, superscripts, and subscripts) into
 * unified, non-overlapping bounding boxes.
 */
export function mergeSelectionRects(rects: readonly SelectionRect[]): SelectionRect[] {
  if (rects.length <= 1) {
    return rects.map((r) => ({ ...r }));
  }

  const merged = rects.map((r) => ({ ...r }));
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (canMergeSelectionRects(merged[i], merged[j])) {
          merged[i] = {
            left: Math.min(merged[i].left, merged[j].left),
            top: Math.min(merged[i].top, merged[j].top),
            right: Math.max(merged[i].right, merged[j].right),
            bottom: Math.max(merged[i].bottom, merged[j].bottom),
          };
          merged.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return merged;
}

/**
 * Ensures rounded selection styles exist inside MathLive's shadow root and
 * coalesces fragmented `.ML__selection` boxes without triggering DOM childList churn.
 */
export function coalesceShadowSelections(shadowRoot: ShadowRoot | null): void {
  if (!shadowRoot) return;

  if (!shadowRoot.querySelector('style[data-visual-tex-selection="1"]')) {
    const style = document.createElement('style');
    style.setAttribute('data-visual-tex-selection', '1');
    style.textContent = `
      .ML__selection {
        border-radius: 6px;
      }
      .ML__contains-highlight {
        border-radius: 5px;
      }
    `;
    shadowRoot.appendChild(style);
  }

  const elements = Array.from(shadowRoot.querySelectorAll<HTMLElement>('.ML__selection'));
  if (elements.length === 0) return;

  const hasUnprocessed = elements.some((el) => el.getAttribute('data-coalesced') !== '1');
  if (!hasUnprocessed) return;

  const parsed: Array<{ el: HTMLElement; rect: SelectionRect }> = [];
  for (const el of elements) {
    const left = Number.parseFloat(el.style.left);
    const top = Number.parseFloat(el.style.top);
    const width = Number.parseFloat(el.style.width);
    const height = Number.parseFloat(el.style.height);
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      el.setAttribute('data-coalesced', '1');
      continue;
    }
    parsed.push({
      el,
      rect: {
        left,
        top,
        right: left + width,
        bottom: top + height,
      },
    });
  }

  if (parsed.length <= 1) {
    for (const item of parsed) {
      item.el.setAttribute('data-coalesced', '1');
    }
    return;
  }

  const mergedRects = mergeSelectionRects(parsed.map((item) => item.rect));

  parsed.forEach((item, index) => {
    item.el.setAttribute('data-coalesced', '1');
    const unified = mergedRects[index];
    if (unified) {
      item.el.style.left = `${unified.left}px`;
      item.el.style.top = `${unified.top}px`;
      item.el.style.width = `${Math.ceil(unified.right - unified.left)}px`;
      item.el.style.height = `${Math.ceil(unified.bottom - unified.top)}px`;
      item.el.style.display = '';
    } else {
      item.el.style.display = 'none';
    }
  });
}
