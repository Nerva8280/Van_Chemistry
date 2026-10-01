// Làm sạch mọi HTML của đề trước khi lưu/hiển thị: chỉ giữ thẻ định dạng cơ bản, ảnh data: và
// các class "ex-…" dùng cho căn giữa và trình bày công thức.

import DOMPurify from 'dompurify';
import { ExamData, ExamDoc } from './types';

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'br', 'span', 'div', 'p', 'img'];
const ALLOWED_ATTR = ['class', 'src', 'width', 'height', 'alt'];
const DATA_IMG = /^data:image\/(png|jpeg|gif);base64,[a-z0-9+/=\s]+$/i;

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  const name = data.attrName;
  if (name === 'src') {
    if (!DATA_IMG.test(data.attrValue)) data.keepAttr = false;
  } else if (name === 'class') {
    const cls = data.attrValue
      .split(/\s+/)
      .filter((c) => /^ex-[a-z0-9-]+$/.test(c))
      .join(' ');
    if (cls) data.attrValue = cls;
    else data.keepAttr = false;
  } else if (name === 'width' || name === 'height') {
    if (!/^\d{1,4}$/.test(data.attrValue)) data.keepAttr = false;
  }
});

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|gif);base64,/i,
    // Có ALLOWED_URI_REGEXP thì DOMPurify bỏ mọi thuộc tính không thuộc nhóm "an toàn với URI" có
    // giá trị không khớp regex, kể cả width="300". Hook ở trên đã chỉ cho phép số nguyên.
    ADD_URI_SAFE_ATTR: ['width', 'height'],
  }) as string;
}

export function sanitizeDoc(doc: ExamDoc): ExamDoc {
  return {
    headerHtml: doc.headerHtml.map(sanitizeHtml),
    originalCode: doc.originalCode,
    sections: doc.sections.map((s) => ({
      ...s,
      titleHtml: s.titleHtml === null ? null : sanitizeHtml(s.titleHtml),
      questions: s.questions.map((q) => ({
        ...q,
        stemHtml: sanitizeHtml(q.stemHtml),
        options: q.options.map((o) => ({ ...o, html: sanitizeHtml(o.html) })),
      })),
    })),
  };
}

export function sanitizeData(data: ExamData): ExamData {
  return {
    ...data,
    doc: sanitizeDoc(data.doc),
    versions: data.versions.map((v) => ({
      ...v,
      overrides: Object.fromEntries(
        Object.entries(v.overrides).map(([qid, ov]) => [
          qid,
          {
            ...ov,
            stemHtml: ov.stemHtml === undefined ? undefined : sanitizeHtml(ov.stemHtml),
            options: ov.options
              ? Object.fromEntries(Object.entries(ov.options).map(([k, h]) => [k, sanitizeHtml(h)]))
              : undefined,
          },
        ])
      ),
    })),
  };
}

/**
 * HTML dán từ Word/trang web: chuyển định dạng kiểu style (vertical-align, font-weight…) sang
 * thẻ sub/sup/b/i/u trước khi làm sạch, để chỉ số hóa học không bị mất khi dán.
 */
export function cleanPastedHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false }) as string;
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) walk(c);
    const style = (el.getAttribute('style') || '').toLowerCase();
    if (!style) return;
    const wraps: string[] = [];
    if (/vertical-align\s*:\s*(sub|-)/.test(style)) wraps.push('sub');
    else if (/vertical-align\s*:\s*(super|sup)/.test(style)) wraps.push('sup');
    if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) wraps.push('b');
    if (/font-style\s*:\s*italic/.test(style)) wraps.push('i');
    if (/text-decoration[^;]*underline/.test(style)) wraps.push('u');
    for (const tag of wraps) {
      const w = document.createElement(tag);
      while (el.firstChild) w.appendChild(el.firstChild);
      el.appendChild(w);
    }
  };
  walk(tpl.content as unknown as Element);
  const div = document.createElement('div');
  div.appendChild(tpl.content.cloneNode(true));
  return sanitizeHtml(div.innerHTML);
}
