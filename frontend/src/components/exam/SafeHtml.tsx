import { useMemo } from 'react';
import { sanitizeHtml } from '../../exam/sanitize';

interface SafeHtmlProps {
  html: string;
  className?: string;
  as?: 'div' | 'span';
}

/** Hiển thị HTML của đề sau khi làm sạch bằng DOMPurify. */
export default function SafeHtml({ html, className, as = 'span' }: SafeHtmlProps) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const Tag = as;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
