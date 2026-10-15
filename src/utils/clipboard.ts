/**
 * 健壮的跨环境剪贴板复制工具
 * 兼容 HTTPS、HTTP、iframe 以及本地 file:// 或禁止 navigator.clipboard 的限制环境
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // 1. 优先使用标准异步 Clipboard API（需安全上下文）
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 捕获权限被拒绝或 DOM 焦点丢失等异常，继续降级到方案 2
    }
  }

  // 2. 降级使用 document.execCommand('copy')
  try {
    if (typeof document === 'undefined') return false;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // 隐藏元素但保持可获得焦点与选区
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    textArea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textArea);
    
    // 选中全部文本
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy text using fallback method:', err);
    return false;
  }
}
