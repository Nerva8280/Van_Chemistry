type Script = 'sub' | 'sup';

function editableRoot(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  return el?.closest<HTMLElement>('.ex-editable') ?? null;
}

function closestIn(node: Node, tag: Script, root: HTMLElement): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const hit = el?.closest<HTMLElement>(tag) ?? null;
  return hit && root.contains(hit) ? hit : null;
}

/** True when every non-empty text node touched by the range sits inside a <tag>. */
function rangeIsAll(range: Range, tag: Script, root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let any = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n) || !n.textContent?.trim()) continue;
    any = true;
    if (!closestIn(n, tag, root)) return false;
  }
  return any;
}

function unwrapAll(parent: ParentNode, selector: string) {
  parent.querySelectorAll(selector).forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
}

/**
 * Toggles sub/superscript on the current selection. The browser's execCommand leaves the
 * text small when toggling off, so the selection is rewritten by hand: it is lifted out of
 * any enclosing <sub>/<sup> (splitting it) and re-wrapped only when turning the style on.
 */
function toggleScript(tag: Script) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const root = editableRoot(range.commonAncestorContainer);
  if (!root) return;

  const turnOff = rangeIsAll(range, tag, root);
  const content = range.extractContents();
  unwrapAll(content, 'sub, sup');

  // Leave any <sub>/<sup> the caret is now inside, splitting it so the selection sits outside.
  for (let outer = closestIn(range.startContainer, 'sub', root) ?? closestIn(range.startContainer, 'sup', root);
    outer;
    outer = closestIn(range.startContainer, 'sub', root) ?? closestIn(range.startContainer, 'sup', root)) {
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(outer, outer.childNodes.length);
    const rest = tail.extractContents();
    const after = outer.cloneNode(false) as HTMLElement;
    after.append(rest);
    outer.after(after);
    if (!after.textContent) after.remove();
    range.setStartAfter(outer);
    range.collapse(true);
    if (!outer.textContent) outer.remove();
  }

  let inserted: Node = content;
  if (!turnOff) {
    const wrap = document.createElement(tag);
    wrap.append(content);
    inserted = wrap;
  }
  const first = inserted instanceof DocumentFragment ? inserted.firstChild : inserted;
  const last = inserted instanceof DocumentFragment ? inserted.lastChild : inserted;
  range.insertNode(inserted);

  root.querySelectorAll('sub, sup').forEach((el) => {
    if (!el.textContent) el.remove();
  });
  root.normalize();

  if (first && last && root.contains(first) && root.contains(last)) {
    const next = document.createRange();
    next.setStartBefore(first);
    next.setEndAfter(last);
    sel.removeAllRanges();
    sel.addRange(next);
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

function runCommand(cmd: 'bold' | 'italic') {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd);
}

/** Thanh nút định dạng cho chữ đang chọn trong ô sửa (chỉ số dưới/trên, đậm, nghiêng). */
export default function FormatToolbar() {
  const btn =
    'inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:min-w-[2.5rem]';
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100/95 px-3 py-2 text-xs text-slate-600 backdrop-blur">
      <span>Bôi đen chữ trong ô rồi bấm:</span>
      <button type="button" className={btn} title="Chỉ số dưới (ví dụ H₂O)" onMouseDown={(e) => { e.preventDefault(); toggleScript('sub'); }}>
        x<sub>2</sub>
      </button>
      <button type="button" className={btn} title="Chỉ số trên (ví dụ Fe³⁺)" onMouseDown={(e) => { e.preventDefault(); toggleScript('sup'); }}>
        x<sup>2</sup>
      </button>
      <button type="button" className={`${btn} font-bold`} title="In đậm" onMouseDown={(e) => { e.preventDefault(); runCommand('bold'); }}>
        Đ
      </button>
      <button type="button" className={`${btn} italic`} title="In nghiêng" onMouseDown={(e) => { e.preventDefault(); runCommand('italic'); }}>
        N
      </button>
      <span className="hidden sm:inline">Bấm lại lần nữa để bỏ định dạng.</span>
    </div>
  );
}
