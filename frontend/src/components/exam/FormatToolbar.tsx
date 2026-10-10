import { useEffect, useRef, useState } from 'react';

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

/** Cỡ chữ (pt) cho chọn; 12 là cỡ chuẩn của đề nên không cần bọc thẻ. */
export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20];
const DEFAULT_SIZE = 12;
const FS_CLASS = /^ex-fs-\d+$/;

function sizeSpanIn(node: Node, root: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'SPAN' && Array.from(el.classList).some((c) => FS_CLASS.test(c))) return el;
    el = el.parentElement;
  }
  return null;
}

/** Cỡ chữ (pt) tại đầu vùng chọn, để hiển thị trên nút. */
function sizeAtSelection(): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  // After a size change the selection starts *before* the new span (container = its parent),
  // so look at the node right after the start offset.
  let node: Node = range.startContainer;
  if (node.nodeType === Node.ELEMENT_NODE && !range.collapsed) node = node.childNodes[range.startOffset] ?? node;
  const root = editableRoot(node);
  if (!root) return null;
  const span = sizeSpanIn(node, root);
  const cls = span && Array.from(span.classList).find((c) => FS_CLASS.test(c));
  return cls ? Number(cls.slice(6)) : DEFAULT_SIZE;
}

/**
 * Đặt cỡ chữ cho vùng đang bôi đen: bỏ mọi cỡ cũ bên trong, tách vùng chọn ra khỏi thẻ cỡ chữ
 * đang bao nó (giống chỉ số dưới/trên), rồi bọc lại bằng <span class="ex-fs-N"> nếu không phải cỡ chuẩn.
 * Lưu bằng class vì bộ làm sạch HTML bỏ thuộc tính style.
 */
function setFontSize(size: number) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const root = editableRoot(range.commonAncestorContainer);
  if (!root) return false;

  const content = range.extractContents();
  content.querySelectorAll('span').forEach((el) => {
    const keep = Array.from(el.classList).filter((c) => !FS_CLASS.test(c));
    if (keep.length === el.classList.length) return;
    if (keep.length) el.className = keep.join(' ');
    else el.replaceWith(...Array.from(el.childNodes));
  });

  for (let outer = sizeSpanIn(range.startContainer, root); outer; outer = sizeSpanIn(range.startContainer, root)) {
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
  if (size !== DEFAULT_SIZE) {
    const wrap = document.createElement('span');
    wrap.className = `ex-fs-${size}`;
    wrap.append(content);
    inserted = wrap;
  }
  const first = inserted instanceof DocumentFragment ? inserted.firstChild : inserted;
  const last = inserted instanceof DocumentFragment ? inserted.lastChild : inserted;
  range.insertNode(inserted);

  root.querySelectorAll('span').forEach((el) => {
    if (!el.textContent && !el.querySelector('img, br')) el.remove();
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
  return true;
}

function runCommand(cmd: 'bold' | 'italic') {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd);
}

type Align = 'left' | 'center' | 'right';
const JUSTIFY: Record<Align, string> = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight' };

/**
 * Căn lề các dòng đang chọn. Trình duyệt ghi căn lề bằng style/align, mà bộ làm sạch bỏ style,
 * nên đổi ngay sang class ex-center / ex-right (căn trái = bỏ class).
 */
function align(where: Align) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const root = editableRoot(sel.getRangeAt(0).commonAncestorContainer);
  if (!root) return;
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(JUSTIFY[where]);
  document.execCommand('styleWithCSS', false, 'false');
  root.querySelectorAll<HTMLElement>('[style], [align]').forEach((el) => {
    const value = (el.style.textAlign || el.getAttribute('align') || '').toLowerCase();
    if (!value) return;
    el.style.removeProperty('text-align');
    el.removeAttribute('align');
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
    el.classList.remove('ex-center', 'ex-right');
    if (value === 'center') el.classList.add('ex-center');
    else if (value === 'right' || value === 'end') el.classList.add('ex-right');
    if (!el.classList.length) el.removeAttribute('class');
  });
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

function currentCell(): HTMLTableCellElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).startContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const cell = el?.closest<HTMLTableCellElement>('td') ?? null;
  return cell && editableRoot(cell) ? cell : null;
}

function emptyCell(): HTMLTableCellElement {
  const td = document.createElement('td');
  td.innerHTML = '<br>';
  return td;
}

type TableAction = 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable';

/** Thêm/xóa hàng, cột tại ô đang đặt con trỏ. */
function editTable(action: TableAction) {
  const cell = currentCell();
  if (!cell) return;
  const root = editableRoot(cell)!;
  const row = cell.parentElement as HTMLTableRowElement;
  const table = cell.closest('table')!;
  const rows = Array.from(table.rows);
  const col = cell.cellIndex;
  if (action === 'addRow') {
    const tr = document.createElement('tr');
    for (let i = 0; i < row.cells.length; i++) tr.append(emptyCell());
    row.after(tr);
  } else if (action === 'addCol') {
    rows.forEach((r) => {
      const ref = r.cells[col];
      if (ref) ref.after(emptyCell());
      else r.append(emptyCell());
    });
  } else if (action === 'delRow') {
    if (rows.length <= 1) table.remove();
    else row.remove();
  } else if (action === 'delCol') {
    if (row.cells.length <= 1) table.remove();
    else rows.forEach((r) => r.cells[col]?.remove());
  } else {
    table.remove();
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

const SIZE_STEP = 10;
const MIN_WIDTH = 24;
const MIN_HEIGHT = 20;

/**
 * Đổi độ rộng cả cột / độ cao cả hàng chứa ô đang chọn thêm `delta` px. Lưu bằng thuộc tính
 * width/height trên từng ô (bộ làm sạch giữ lại), lấy kích thước đang hiển thị làm mốc.
 */
function resizeCell(kind: 'col' | 'row', delta: number) {
  const cell = currentCell();
  if (!cell) return;
  const root = editableRoot(cell)!;
  const table = cell.closest('table')!;
  // Ô dùng box-sizing: border-box (Tailwind), nên width/height = kích thước nhìn thấy của ô.
  const rect = cell.getBoundingClientRect();
  if (kind === 'col') {
    const width = String(Math.max(MIN_WIDTH, Math.round(rect.width + delta)));
    Array.from(table.rows).forEach((r) => r.cells[cell.cellIndex]?.setAttribute('width', width));
  } else {
    const height = String(Math.max(MIN_HEIGHT, Math.round(rect.height + delta)));
    Array.from((cell.parentElement as HTMLTableRowElement).cells).forEach((c) => c.setAttribute('height', height));
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Bỏ mọi độ rộng/độ cao đã chỉnh, để bảng tự co giãn theo chữ. */
function autoSizeTable() {
  const cell = currentCell();
  if (!cell) return;
  const root = editableRoot(cell)!;
  cell.closest('table')!.querySelectorAll('td').forEach((c) => {
    c.removeAttribute('width');
    c.removeAttribute('height');
  });
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

function tableHtml(rows: number, cols: number): string {
  const tr = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
  return `<table class="ex-table"><tbody>${tr.repeat(rows)}</tbody></table><br>`;
}

const ALIGN_LINES: Record<Align, [number, number][]> = {
  left: [[2, 14], [2, 10], [2, 14], [2, 9]],
  center: [[2, 14], [4, 12], [2, 14], [4.5, 11.5]],
  right: [[2, 14], [6, 14], [2, 14], [7, 14]],
};

function AlignIcon({ where }: { where: Align }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {ALIGN_LINES[where].map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={3 + i * 3.4} y2={3 + i * 3.4} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Thanh nút định dạng cho ô đang sửa: chỉ số dưới/trên, đậm, nghiêng, căn lề, kẻ bảng. */
export default function FormatToolbar() {
  const btn =
    'inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:min-w-[2.5rem]';
  const [inTable, setInTable] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [currentSize, setCurrentSize] = useState<number | null>(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hint, setHint] = useState('');
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    const onChange = () => {
      setInTable(!!currentCell());
      setCurrentSize(sizeAtSelection());
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(''), 3000);
    return () => window.clearTimeout(t);
  }, [hint]);

  // Ô chọn số hàng/cột lấy mất focus, nên nhớ vị trí con trỏ trước khi mở.
  function openPicker() {
    if (picker) return setPicker(false);
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range || !editableRoot(range.commonAncestorContainer)) {
      setHint('Hãy bấm vào chỗ cần chèn bảng trong ô nội dung trước.');
      return;
    }
    if (currentCell()) {
      setHint('Không chèn bảng bên trong một bảng khác.');
      return;
    }
    savedRange.current = range.cloneRange();
    setPicker(true);
  }

  function insertTable() {
    const range = savedRange.current;
    setPicker(false);
    if (!range) return;
    const root = editableRoot(range.commonAncestorContainer);
    if (!root || !root.isConnected) return;
    root.focus();
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertHTML', false, tableHtml(rows, cols));
    root.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const press = (fn: () => void) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    fn();
  };
  const sizes = Array.from({ length: 10 }, (_, i) => i + 1);

  function applySize(size: number) {
    if (!setFontSize(size)) {
      setHint('Hãy bôi đen chữ cần đổi cỡ trước.');
      return;
    }
    setCurrentSize(size);
  }

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg bg-slate-100/95 px-3 py-2 text-xs text-slate-600 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span>Bôi đen chữ trong ô rồi bấm:</span>
        <button type="button" className={btn} title="Chỉ số dưới (ví dụ H₂O)" onMouseDown={press(() => toggleScript('sub'))}>
          x<sub>2</sub>
        </button>
        <button type="button" className={btn} title="Chỉ số trên (ví dụ Fe³⁺)" onMouseDown={press(() => toggleScript('sup'))}>
          x<sup>2</sup>
        </button>
        <button type="button" className={`${btn} font-bold`} title="In đậm" onMouseDown={press(() => runCommand('bold'))}>
          Đ
        </button>
        <button type="button" className={`${btn} italic`} title="In nghiêng" onMouseDown={press(() => runCommand('italic'))}>
          N
        </button>
        <button
          type="button"
          className={`${btn} gap-1 ${sizeOpen ? 'border-primary-400 bg-primary-50' : ''}`}
          title="Đổi cỡ chữ của phần đang bôi đen"
          aria-expanded={sizeOpen}
          onMouseDown={press(() => setSizeOpen((v) => !v))}
        >
          <span className="font-serif">
            A<span className="text-[0.7em]">A</span>
          </span>
          Cỡ chữ{currentSize ? ` ${currentSize}` : ''}
        </button>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <button type="button" className={btn} title="Căn trái" aria-label="Căn trái" onMouseDown={press(() => align('left'))}>
          <AlignIcon where="left" />
        </button>
        <button type="button" className={btn} title="Căn giữa" aria-label="Căn giữa" onMouseDown={press(() => align('center'))}>
          <AlignIcon where="center" />
        </button>
        <button type="button" className={btn} title="Căn phải" aria-label="Căn phải" onMouseDown={press(() => align('right'))}>
          <AlignIcon where="right" />
        </button>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <button
          type="button"
          className={`${btn} gap-1 ${picker ? 'border-primary-400 bg-primary-50' : ''}`}
          title="Kẻ bảng tại vị trí con trỏ"
          aria-expanded={picker}
          onMouseDown={press(openPicker)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
            <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" />
            <line x1="1.5" y1="10" x2="14.5" y2="10" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" />
            <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" />
          </svg>
          Bảng
        </button>
        <span className="hidden sm:inline">Bấm lại lần nữa để bỏ định dạng.</span>
      </div>

      {sizeOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Cỡ chữ (pt):</span>
          {FONT_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              className={`${btn} ${currentSize === n ? 'border-primary-400 bg-primary-50 font-semibold text-primary-700' : ''}`}
              title={n === DEFAULT_SIZE ? 'Cỡ chuẩn của đề (12)' : `Cỡ ${n}`}
              onMouseDown={press(() => applySize(n))}
            >
              {n}
              {n === DEFAULT_SIZE && <span className="ml-1 text-[11px] font-normal text-slate-500">chuẩn</span>}
            </button>
          ))}
        </div>
      )}

      {picker && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            Số hàng
            <select className="input h-8 w-16 py-0 text-sm" value={rows} onChange={(e) => setRows(Number(e.target.value))}>
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Số cột
            <select className="input h-8 w-16 py-0 text-sm" value={cols} onChange={(e) => setCols(Number(e.target.value))}>
              {sizes.slice(0, 8).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary h-8 py-0 text-sm" onClick={insertTable}>
            Chèn bảng
          </button>
          <button type="button" className="btn-secondary h-8 py-0 text-sm" onClick={() => setPicker(false)}>
            Hủy
          </button>
        </div>
      )}

      {inTable && !picker && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Bảng:</span>
          <button type="button" className={btn} onMouseDown={press(() => editTable('addRow'))}>
            + Hàng
          </button>
          <button type="button" className={btn} onMouseDown={press(() => editTable('addCol'))}>
            + Cột
          </button>
          <button type="button" className={btn} onMouseDown={press(() => editTable('delRow'))}>
            Xóa hàng
          </button>
          <button type="button" className={btn} onMouseDown={press(() => editTable('delCol'))}>
            Xóa cột
          </button>
          <button type="button" className={`${btn} text-danger-600`} onMouseDown={press(() => editTable('delTable'))}>
            Xóa bảng
          </button>
          <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
          <span>Cột:</span>
          <button type="button" className={btn} title="Thu hẹp cột đang chọn" onMouseDown={press(() => resizeCell('col', -SIZE_STEP))}>
            ← Hẹp
          </button>
          <button type="button" className={btn} title="Nới rộng cột đang chọn" onMouseDown={press(() => resizeCell('col', SIZE_STEP))}>
            Rộng →
          </button>
          <span>Hàng:</span>
          <button type="button" className={btn} title="Giảm độ cao hàng đang chọn" onMouseDown={press(() => resizeCell('row', -SIZE_STEP))}>
            ↑ Thấp
          </button>
          <button type="button" className={btn} title="Tăng độ cao hàng đang chọn" onMouseDown={press(() => resizeCell('row', SIZE_STEP))}>
            Cao ↓
          </button>
          <button type="button" className={btn} title="Bỏ các độ rộng, độ cao đã chỉnh" onMouseDown={press(autoSizeTable)}>
            Tự động
          </button>
        </div>
      )}

      {hint && <p className="text-danger-600">{hint}</p>}
    </div>
  );
}
