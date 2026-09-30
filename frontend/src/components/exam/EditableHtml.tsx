import { ClipboardEvent, useLayoutEffect, useRef } from 'react';
import { cleanPastedHtml, sanitizeHtml } from '../../exam/sanitize';

interface EditableHtmlProps {
  html: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  /** true: một dòng (đáp án, ý), Enter không xuống dòng. */
  singleLine?: boolean;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Ô sửa trực tiếp nội dung (contentEditable). Chỉ ghi lại innerHTML khi giá trị từ ngoài thay đổi
 * (không phải do chính ô này gõ ra) để con trỏ không bị nhảy.
 */
export default function EditableHtml({ html, onChange, className = '', placeholder, singleLine }: EditableHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const lastClean = useRef<string>('');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html !== last.current) {
      el.innerHTML = sanitizeHtml(html);
      last.current = html;
      lastClean.current = sanitizeHtml(el.innerHTML);
    }
  }, [html]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    let clean = sanitizeHtml(el.innerHTML);
    if (clean === '<br>') clean = '';
    if (clean === lastClean.current) return;
    lastClean.current = clean;
    last.current = clean;
    onChange(clean);
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const htmlData = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (htmlData) {
      let cleaned = cleanPastedHtml(htmlData);
      if (singleLine) cleaned = cleaned.replace(/<\/?(div|p)[^>]*>/gi, ' ').replace(/<br\s*\/?>/gi, ' ');
      document.execCommand('insertHTML', false, cleaned);
    } else if (text) {
      const t = singleLine ? text.replace(/\s*\n\s*/g, ' ') : text;
      document.execCommand('insertHTML', false, escapeText(t).replace(/\r?\n/g, '<br>'));
    }
  }

  return (
    <div
      ref={ref}
      className={`ex-editable ${className}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={emit}
      onPaste={handlePaste}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault();
      }}
    />
  );
}
