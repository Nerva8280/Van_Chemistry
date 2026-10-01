// Đọc file Word (.docx) đề thi hóa học định dạng THPT 2025 thành ExamDoc.
// Chạy hoàn toàn trong trình duyệt: jszip giải nén, DOMParser đọc XML.
// Chỉ dùng API DOM cơ bản (childNodes, localName, namespaceURI, attributes) để chạy được cả
// với @xmldom/xmldom khi kiểm thử bằng Node.

import JSZip from 'jszip';
import {
  ExamDoc,
  ExamOption,
  ExamSection,
  Question,
  QuestionAnswer,
  ROMAN,
  SectionKind,
  newId,
} from './types';

export interface ParseResult {
  doc: ExamDoc;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Namespace

const NS: Record<string, string> = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/math': 'm',
  'http://purl.oclc.org/ooxml/officeDocument/math': 'm',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing': 'wp',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing': 'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'urn:schemas-microsoft-com:vml': 'v',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
};

function nsKey(uri: string | null | undefined): string {
  return (uri && NS[uri]) || '';
}

function is(el: Element, key: string, local: string): boolean {
  return el.localName === local && nsKey(el.namespaceURI) === key;
}

function kids(el: Element | Document): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

function child(el: Element | null | undefined, key: string, local: string): Element | null {
  if (!el) return null;
  for (const c of kids(el)) if (is(c, key, local)) return c;
  return null;
}

function childrenOf(el: Element | null | undefined, key: string, local: string): Element[] {
  if (!el) return [];
  return kids(el).filter((c) => is(c, key, local));
}

function findDesc(el: Element, key: string, local: string): Element | null {
  for (const c of kids(el)) {
    if (is(c, key, local)) return c;
    const d = findDesc(c, key, local);
    if (d) return d;
  }
  return null;
}

function attr(el: Element | null | undefined, key: string, local: string): string | null {
  if (!el) return null;
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    const name = a.localName || a.name;
    if (name === local && nsKey(a.namespaceURI) === key) return a.value;
  }
  return null;
}

/** Giá trị w:val (hoặc m:val) của phần tử con. */
function childVal(el: Element | null | undefined, key: string, local: string): string | null {
  const c = child(el, key, local);
  return c ? attr(c, key, 'val') : null;
}

function isOn(el: Element | null, key = 'w'): boolean {
  if (!el) return false;
  const v = attr(el, key, 'val');
  return v === null || !['0', 'false', 'off', 'none'].includes(v.toLowerCase());
}

function textOf(el: Element): string {
  return (el.textContent || '').normalize('NFC');
}

// ---------------------------------------------------------------------------
// HTML helpers

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Runs / segments

interface Fmt {
  b: boolean;
  i: boolean;
  u: boolean;
  sub: boolean;
  sup: boolean;
}

interface TextSeg extends Fmt {
  t: 'text';
  text: string;
}

interface AtomSeg {
  t: 'atom';
  kind: 'img' | 'math' | 'br' | 'other';
  html: string;
}

type Seg = TextSeg | AtomSeg;

type Align = 'left' | 'center' | 'right';

interface Para {
  segs: Seg[];
  align: Align;
  plain: string;
}

const OBJ = '￼';

function segPlain(s: Seg): string {
  if (s.t === 'text') return s.text;
  return s.kind === 'br' ? '\n' : OBJ;
}

function plainOf(segs: Seg[]): string {
  return segs.map(segPlain).join('');
}

const NO_FMT: Fmt = { b: false, i: false, u: false, sub: false, sup: false };

function fmtKey(f: Fmt): string {
  return `${+f.b}${+f.i}${+f.u}${+f.sub}${+f.sup}`;
}

/**
 * Cắt danh sách đoạn chữ theo vị trí trong chuỗi thuần (plain).
 * unboldCut: nếu một đoạn in đậm bị cắt ở `start` mà phần trước điểm cắt (ký hiệu "C. " hay
 * "Câu 1.") có chữ, phần còn lại của đoạn đó được bỏ in đậm ("**C. D**isaccharide" → "Disaccharide").
 */
function sliceSegs(segs: Seg[], start: number, end: number, unboldCut = false): Seg[] {
  const out: Seg[] = [];
  let pos = 0;
  for (const s of segs) {
    const len = segPlain(s).length;
    const sStart = pos;
    const sEnd = pos + len;
    pos = sEnd;
    if (sEnd <= start || sStart >= end) continue;
    if (s.t === 'atom') {
      out.push(s);
      continue;
    }
    const a = Math.max(start, sStart) - sStart;
    const b = Math.min(end, sEnd) - sStart;
    const piece: TextSeg = { ...s, text: s.text.slice(a, b) };
    if (unboldCut && a > 0 && s.b && /\S/.test(s.text.slice(0, a))) piece.b = false;
    if (piece.text) out.push(piece);
  }
  return out;
}

function trimSegs(segs: Seg[]): Seg[] {
  const out = segs.map((s) => (s.t === 'text' ? { ...s } : s));
  while (out.length) {
    const f = out[0];
    if (f.t === 'atom') {
      if (f.kind === 'br') {
        out.shift();
        continue;
      }
      break;
    }
    f.text = f.text.replace(/^[\s ]+/, '');
    if (f.text) break;
    out.shift();
  }
  while (out.length) {
    const l = out[out.length - 1];
    if (l.t === 'atom') {
      if (l.kind === 'br') {
        out.pop();
        continue;
      }
      break;
    }
    l.text = l.text.replace(/[\s ]+$/, '');
    if (l.text) break;
    out.pop();
  }
  return out;
}

function segsToHtml(segs: Seg[]): string {
  let html = '';
  let i = 0;
  while (i < segs.length) {
    const s = segs[i];
    if (s.t === 'atom') {
      html += s.html;
      i++;
      continue;
    }
    let text = s.text;
    let j = i + 1;
    while (j < segs.length) {
      const n = segs[j];
      if (n.t !== 'text' || fmtKey(n) !== fmtKey(s)) break;
      text += n.text;
      j++;
    }
    i = j;
    let h = escapeHtml(text.replace(/\t+/g, ' '));
    if (s.sub) h = `<sub>${h}</sub>`;
    else if (s.sup) h = `<sup>${h}</sup>`;
    if (s.u) h = `<u>${h}</u>`;
    if (s.i) h = `<i>${h}</i>`;
    if (s.b) h = `<b>${h}</b>`;
    html += h;
  }
  return html;
}

function isEmptyPara(segs: Seg[]): boolean {
  return !segs.some((s) => s.t === 'atom' && s.kind !== 'br') && plainOf(segs).trim() === '';
}

// ---------------------------------------------------------------------------
// OMML → HTML

const ARROWS = new Set(['→', '←', '↔', '⇌', '⇄', '⇋', '⟶', '⟵', '⟷', '⇒', '⇐', '⇔', '=', '⟹']);
const ACC_MAP: Record<string, string> = {
  '̂': '^',
  '̃': '~',
  '̇': '˙',
  '̈': '¨',
  '⃗': '→',
  '⃖': '←',
  '̅': '¯',
  '¯': '¯',
  '́': '´',
  '̀': '`',
};

function mChildrenHtml(el: Element | null): string {
  if (!el) return '';
  let h = '';
  for (const c of kids(el)) {
    if (c.localName.endsWith('Pr')) continue;
    h += omml(c);
  }
  return h;
}

function mText(el: Element): string {
  let t = '';
  const walk = (e: Element) => {
    for (const c of kids(e)) {
      if ((is(c, 'm', 't') || is(c, 'w', 't'))) t += textOf(c);
      else walk(c);
    }
  };
  walk(el);
  return t;
}

function small(h: string): string {
  return `<span class="ex-small">${h}</span>`;
}

function stack(over: string | null, mid: string, under: string | null): string {
  return (
    '<span class="ex-stack">' +
    (over !== null ? small(over) : '') +
    `<span class="ex-mid">${mid}</span>` +
    (under !== null ? small(under) : '') +
    '</span>'
  );
}

function arrowHtml(chr: string): string {
  if (chr === '→' || chr === '⟶') return '<span class="ex-arrow ex-arrow-r">→</span>';
  if (chr === '←' || chr === '⟵') return '<span class="ex-arrow ex-arrow-l">←</span>';
  return `<span class="ex-arrow">${escapeHtml(chr)}</span>`;
}

/**
 * Mũi tên phản ứng có chữ trên/dưới, đúng cấu trúc HTML mà công thức Word (m:groupChr,
 * m:limUpp/m:limLow) tạo ra. Dùng chung cho "Tạo đề từ ảnh". `above`/`below` là HTML, rỗng = không có.
 */
export function arrowWithTextHtml(chr: string, above: string, below: string): string {
  const a = above.trim() ? above.trim() : null;
  const b = below.trim() ? below.trim() : null;
  const arrow = arrowHtml(chr);
  return `<span class="ex-math">${a === null && b === null ? arrow : stack(a, arrow, b)}</span>`;
}

function omml(el: Element): string {
  const k = nsKey(el.namespaceURI);
  if (k === 'w') {
    if (el.localName === 't') return escapeHtml(textOf(el));
    if (el.localName === 'r') return mChildrenHtml(el);
    return '';
  }
  if (k !== 'm') return '';
  const n = el.localName;
  const pr = child(el, 'm', n + 'Pr');
  switch (n) {
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg':
    case 'lim':
    case 'fName':
    case 'box':
    case 'borderBox':
    case 'phant':
      return mChildrenHtml(el);
    case 'r': {
      let t = '';
      for (const c of kids(el)) {
        if (is(c, 'm', 't') || is(c, 'w', 't')) t += escapeHtml(textOf(c));
        else if (is(c, 'w', 'br')) t += '<br>';
      }
      return t;
    }
    case 't':
      return escapeHtml(textOf(el));
    case 'sSub':
      return mChildrenHtml(child(el, 'm', 'e')) + `<sub>${mChildrenHtml(child(el, 'm', 'sub'))}</sub>`;
    case 'sSup':
      return mChildrenHtml(child(el, 'm', 'e')) + `<sup>${mChildrenHtml(child(el, 'm', 'sup'))}</sup>`;
    case 'sSubSup':
      return (
        mChildrenHtml(child(el, 'm', 'e')) +
        `<span class="ex-subsup"><sup>${mChildrenHtml(child(el, 'm', 'sup'))}</sup><sub>${mChildrenHtml(
          child(el, 'm', 'sub')
        )}</sub></span>`
      );
    case 'sPre':
      return (
        `<span class="ex-subsup"><sup>${mChildrenHtml(child(el, 'm', 'sup'))}</sup><sub>${mChildrenHtml(
          child(el, 'm', 'sub')
        )}</sub></span>` + mChildrenHtml(child(el, 'm', 'e'))
      );
    case 'f': {
      const type = childVal(pr, 'm', 'type');
      const num = mChildrenHtml(child(el, 'm', 'num'));
      const den = mChildrenHtml(child(el, 'm', 'den'));
      if (type === 'lin' || type === 'skw') return `${num}/${den}`;
      if (type === 'noBar') return `<span class="ex-stack"><span class="ex-mid">${num}</span><span class="ex-mid">${den}</span></span>`;
      return `<span class="ex-frac"><span class="ex-num">${num}</span><span class="ex-den">${den}</span></span>`;
    }
    case 'd': {
      const beg = child(pr, 'm', 'begChr');
      const end = child(pr, 'm', 'endChr');
      const sep = child(pr, 'm', 'sepChr');
      const b = beg ? attr(beg, 'm', 'val') ?? '' : '(';
      const e = end ? attr(end, 'm', 'val') ?? '' : ')';
      const s = sep ? attr(sep, 'm', 'val') ?? '' : '|';
      const parts = childrenOf(el, 'm', 'e').map((x) => mChildrenHtml(x));
      return escapeHtml(b) + parts.join(escapeHtml(s)) + escapeHtml(e);
    }
    case 'groupChr': {
      const chr = childVal(pr, 'm', 'chr') ?? '⏟';
      const pos = childVal(pr, 'm', 'pos') ?? 'bot';
      const base = mChildrenHtml(child(el, 'm', 'e'));
      if (ARROWS.has(chr)) {
        // Mũi tên có chữ: pos=bot (mặc định) → mũi tên nằm dưới, chữ ở trên.
        return pos === 'top' ? stack(null, arrowHtml(chr), base) : stack(base, arrowHtml(chr), null);
      }
      return pos === 'top' ? stack(escapeHtml(chr), base, null) : stack(null, base, escapeHtml(chr));
    }
    case 'limUpp':
      return stack(mChildrenHtml(child(el, 'm', 'lim')), mChildrenHtml(child(el, 'm', 'e')), null);
    case 'limLow':
      return stack(null, mChildrenHtml(child(el, 'm', 'e')), mChildrenHtml(child(el, 'm', 'lim')));
    case 'acc': {
      const chr = childVal(pr, 'm', 'chr') ?? '̂';
      const shown = ACC_MAP[chr] ?? chr;
      const base = mChildrenHtml(child(el, 'm', 'e'));
      return stack(escapeHtml(shown), base, null);
    }
    case 'bar': {
      const pos = childVal(pr, 'm', 'pos') ?? 'bot';
      const base = mChildrenHtml(child(el, 'm', 'e'));
      return `<span class="${pos === 'top' ? 'ex-overline' : 'ex-underline'}">${base}</span>`;
    }
    case 'nary': {
      const chr = childVal(pr, 'm', 'chr') ?? '∫';
      const subHide = isOn(child(pr, 'm', 'subHide'), 'm') && !!child(pr, 'm', 'subHide');
      const supHide = isOn(child(pr, 'm', 'supHide'), 'm') && !!child(pr, 'm', 'supHide');
      const sub = subHide ? '' : mChildrenHtml(child(el, 'm', 'sub'));
      const sup = supHide ? '' : mChildrenHtml(child(el, 'm', 'sup'));
      return (
        `<span class="ex-nary">${escapeHtml(chr)}</span>` +
        (sub || sup ? `<span class="ex-subsup"><sup>${sup}</sup><sub>${sub}</sub></span>` : '') +
        mChildrenHtml(child(el, 'm', 'e'))
      );
    }
    case 'rad': {
      const degHide = !!child(pr, 'm', 'degHide') && isOn(child(pr, 'm', 'degHide'), 'm');
      const deg = degHide ? '' : mChildrenHtml(child(el, 'm', 'deg'));
      return (deg ? `<sup>${deg}</sup>` : '') + `√<span class="ex-overline">${mChildrenHtml(child(el, 'm', 'e'))}</span>`;
    }
    case 'func':
      return mChildrenHtml(child(el, 'm', 'fName')) + ' ' + mChildrenHtml(child(el, 'm', 'e'));
    case 'eqArr':
      return childrenOf(el, 'm', 'e')
        .map((x) => mChildrenHtml(x))
        .join('<br>');
    case 'm':
      return childrenOf(el, 'm', 'mr')
        .map((row) =>
          childrenOf(row, 'm', 'e')
            .map((x) => mChildrenHtml(x))
            .join(' ')
        )
        .join('<br>');
    default:
      if (n.endsWith('Pr')) return '';
      return escapeHtml(mText(el));
  }
}

function mathAtom(oMath: Element): AtomSeg {
  return { t: 'atom', kind: 'math', html: `<span class="ex-math">${omml(oMath)}</span>` };
}

// ---------------------------------------------------------------------------
// Images

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
};

const EMU_PER_PX = 9525;
export const CONTENT_WIDTH_PX = 680; // A4 (210mm) trừ lề 2 × 15mm ≈ 180mm ≈ 680px

interface ImageRel {
  dataUrl?: string;
  ext?: string;
  external?: boolean;
}

interface Ctx {
  images: Map<string, ImageRel>;
  flags: Set<string>;
}

function imgHtml(ctx: Ctx, rid: string | null, wPx: number, hPx: number): AtomSeg {
  const rel = rid ? ctx.images.get(rid) : undefined;
  if (!rel || !rel.dataUrl) {
    if (rel?.external) ctx.flags.add('img-external');
    else if (rel?.ext) ctx.flags.add('img-unsupported:' + rel.ext.toUpperCase());
    else ctx.flags.add('img-missing');
    return { t: 'atom', kind: 'other', html: '<span class="ex-missing">[Hình không hiển thị được]</span>' };
  }
  let w = Math.max(1, Math.round(wPx));
  let h = Math.max(1, Math.round(hPx));
  if (w > CONTENT_WIDTH_PX) {
    h = Math.round((h * CONTENT_WIDTH_PX) / w);
    w = CONTENT_WIDTH_PX;
  }
  const size = wPx > 0 && hPx > 0 ? ` width="${w}" height="${h}"` : '';
  return { t: 'atom', kind: 'img', html: `<img src="${rel.dataUrl}"${size} alt="">` };
}

function drawingAtom(ctx: Ctx, drawing: Element): AtomSeg | null {
  const blip = findDesc(drawing, 'a', 'blip');
  if (!blip) {
    ctx.flags.add('shape');
    return null;
  }
  const rid = attr(blip, 'r', 'embed') ?? attr(blip, 'r', 'link');
  const extent = findDesc(drawing, 'wp', 'extent');
  const cx = Number(extent?.getAttribute('cx') || 0);
  const cy = Number(extent?.getAttribute('cy') || 0);
  return imgHtml(ctx, rid, cx / EMU_PER_PX, cy / EMU_PER_PX);
}

function vmlAtom(ctx: Ctx, el: Element, isObject: boolean): AtomSeg | null {
  const imagedata = findDesc(el, 'v', 'imagedata');
  if (!imagedata) {
    if (isObject) ctx.flags.add('ole');
    else ctx.flags.add('shape');
    return null;
  }
  const rid = attr(imagedata, 'r', 'id') ?? attr(imagedata, 'r', 'embed');
  const shape = findDesc(el, 'v', 'shape');
  const style = shape?.getAttribute('style') || '';
  const toPx = (name: string) => {
    const m = new RegExp(`${name}\\s*:\\s*([\\d.]+)\\s*(pt|px|in)?`).exec(style);
    if (!m) return 0;
    const v = Number(m[1]);
    return m[2] === 'px' ? v : m[2] === 'in' ? v * 96 : (v * 96) / 72;
  };
  const atom = imgHtml(ctx, rid, toPx('width'), toPx('height'));
  if (isObject && atom.kind !== 'img') ctx.flags.add('ole');
  return atom;
}

// ---------------------------------------------------------------------------
// Paragraph reading

const SYMBOL_MAP: Record<number, string> = {
  0x44: 'Δ', 0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x64: 'δ', 0x6c: 'λ', 0x6d: 'μ', 0x70: 'π', 0x72: 'ρ',
  0x73: 'σ', 0x77: 'ω', 0xa3: '≤', 0xb3: '≥', 0xb9: '≠', 0xbb: '≈', 0xb0: '°', 0xb1: '±', 0xb4: '×',
  0xb8: '÷', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xab: '↔', 0xdb: '⇔', 0xde: '⇒', 0xdc: '⇐',
  0xa5: '∞', 0xd6: '√', 0xe5: '∑',
};

function readFmt(rPr: Element | null): Fmt {
  if (!rPr) return { ...NO_FMT };
  const va = childVal(rPr, 'w', 'vertAlign');
  const uEl = child(rPr, 'w', 'u');
  return {
    b: isOn(child(rPr, 'w', 'b')),
    i: isOn(child(rPr, 'w', 'i')),
    u: !!uEl && isOn(uEl),
    sub: va === 'subscript',
    sup: va === 'superscript',
  };
}

function pushText(segs: Seg[], text: string, fmt: Fmt) {
  if (!text) return;
  const last = segs[segs.length - 1];
  if (last && last.t === 'text' && fmtKey(last) === fmtKey(fmt)) last.text += text;
  else segs.push({ t: 'text', text, ...fmt });
}

function runContent(ctx: Ctx, container: Element, fmt: Fmt, segs: Seg[]) {
  for (const c of kids(container)) {
    const k = nsKey(c.namespaceURI);
    const n = c.localName;
    if (k === 'w') {
      switch (n) {
        case 't':
          pushText(segs, textOf(c), fmt);
          break;
        case 'tab':
        case 'ptab':
          pushText(segs, '\t', fmt);
          break;
        case 'br':
        case 'cr': {
          const type = attr(c, 'w', 'type');
          if (type !== 'page' && type !== 'column') segs.push({ t: 'atom', kind: 'br', html: '<br>' });
          break;
        }
        case 'noBreakHyphen':
          pushText(segs, '-', fmt);
          break;
        case 'sym': {
          const code = parseInt(attr(c, 'w', 'char') || '', 16);
          if (Number.isFinite(code)) {
            const base = code >= 0xf000 ? code - 0xf000 : code;
            const font = (attr(c, 'w', 'font') || '').toLowerCase();
            const ch = font.includes('symbol') || code >= 0xf000 ? SYMBOL_MAP[base] : undefined;
            pushText(segs, ch ?? (code >= 0xf000 ? '?' : String.fromCharCode(code)), fmt);
          }
          break;
        }
        case 'drawing': {
          const a = drawingAtom(ctx, c);
          if (a) segs.push(a);
          break;
        }
        case 'pict': {
          const a = vmlAtom(ctx, c, false);
          if (a) segs.push(a);
          break;
        }
        case 'object': {
          const a = vmlAtom(ctx, c, true);
          if (a) segs.push(a);
          break;
        }
        default:
          // instrText, delText, fldChar, rPr, footnoteReference ... bỏ qua
          break;
      }
    } else if (k === 'mc' && n === 'AlternateContent') {
      const choice = child(c, 'mc', 'Choice') ?? child(c, 'mc', 'Fallback');
      if (choice) runContent(ctx, choice, fmt, segs);
    }
  }
}

function walkInline(ctx: Ctx, el: Element, segs: Seg[]) {
  for (const c of kids(el)) {
    const k = nsKey(c.namespaceURI);
    const n = c.localName;
    if (k === 'w') {
      if (n === 'r') runContent(ctx, c, readFmt(child(c, 'w', 'rPr')), segs);
      else if (['hyperlink', 'ins', 'smartTag', 'fldSimple', 'customXml', 'moveTo', 'bdo', 'dir'].includes(n))
        walkInline(ctx, c, segs);
      else if (n === 'sdt') {
        const content = child(c, 'w', 'sdtContent');
        if (content) walkInline(ctx, content, segs);
      }
    } else if (k === 'm') {
      if (n === 'oMath') segs.push(mathAtom(c));
      else if (n === 'oMathPara') {
        for (const om of childrenOf(c, 'm', 'oMath')) segs.push(mathAtom(om));
      }
    } else if (k === 'mc' && n === 'AlternateContent') {
      const choice = child(c, 'mc', 'Choice') ?? child(c, 'mc', 'Fallback');
      if (choice) walkInline(ctx, choice, segs);
    }
  }
}

function readPara(ctx: Ctx, p: Element): Para {
  const pPr = child(p, 'w', 'pPr');
  const jc = childVal(pPr, 'w', 'jc');
  const align: Align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left';
  if (child(pPr, 'w', 'numPr')) ctx.flags.add('numbering');
  const segs: Seg[] = [];
  walkInline(ctx, p, segs);
  return { segs, align, plain: plainOf(segs) };
}

function collectParagraphs(ctx: Ctx, container: Element, out: Element[]) {
  for (const c of kids(container)) {
    if (is(c, 'w', 'p')) out.push(c);
    else if (is(c, 'w', 'tbl')) {
      ctx.flags.add('table');
      for (const tr of childrenOf(c, 'w', 'tr')) {
        for (const tc of childrenOf(tr, 'w', 'tc')) collectParagraphs(ctx, tc, out);
      }
    } else if (is(c, 'w', 'sdt')) {
      const content = child(c, 'w', 'sdtContent');
      if (content) collectParagraphs(ctx, content, out);
    } else if (is(c, 'w', 'customXml')) collectParagraphs(ctx, c, out);
    else if (is(c, 'mc', 'AlternateContent')) {
      const choice = child(c, 'mc', 'Choice') ?? child(c, 'mc', 'Fallback');
      if (choice) collectParagraphs(ctx, choice, out);
    }
  }
}

// ---------------------------------------------------------------------------
// Nhận dạng cấu trúc đề

const QUESTION_RE = /^\s*Câu\s*(\d+)\s*[.:)]?\s*/i;
const STATEMENT_RE = /^\s*([a-d])\s*\)\s*/;
const OPTION_PUNCT_RE = /^\s*([A-D])\s*[.):]/;
const OPTION_SPACE_RE = /^\s*([A-D])\s+\S/;
const END_RE = /^[\s\-–—_.*=]*HẾT[\s\-–—_.*=!]*$/i;

function markerRe(letter: string): RegExp {
  return new RegExp(`^${letter}(\\s*[.):]\\s*|\\s+)`);
}

interface OptRange {
  letter: string;
  start: number;
  cStart: number;
}

/** Tách một dòng chứa một hoặc nhiều phương án ("A. …⇥B. …"). */
function splitOptions(plain: string): OptRange[] {
  const m = /^(\s*)([A-D])(\s*[.):]\s*|\s+)/.exec(plain);
  if (!m) return [];
  const res: OptRange[] = [{ letter: m[2], start: m[1].length, cStart: m[0].length }];
  let code = m[2].charCodeAt(0) + 1;
  let pos = m[0].length;
  while (code <= 68) {
    const L = String.fromCharCode(code);
    let found = -1;
    let cStart = -1;
    for (let i = pos; i < plain.length; i++) {
      if (plain[i] !== '\t') continue;
      let j = i;
      while (j < plain.length && /\s/.test(plain[j])) j++;
      const mm = markerRe(L).exec(plain.slice(j));
      if (mm) {
        found = i;
        cStart = j + mm[0].length;
        break;
      }
    }
    if (found < 0) {
      const re = new RegExp(`(\\s{2,}|[.;,]\\s+)${L}\\s*[.)]\\s*`, 'g');
      re.lastIndex = pos;
      const mm = re.exec(plain);
      if (mm) {
        found = /^[.;,]/.test(mm[1]) ? mm.index + 1 : mm.index;
        cStart = mm.index + mm[0].length;
      }
    }
    if (found < 0) break;
    res.push({ letter: L, start: found, cStart });
    pos = cStart;
    code++;
  }
  return res;
}

function headingInfo(plain: string): { kind: SectionKind | null } | null {
  const t = plain.trim();
  if (!t || t.length > 300) return null;
  if (QUESTION_RE.test(t) || STATEMENT_RE.test(t) || OPTION_PUNCT_RE.test(t)) return null;
  // Từ khóa chỉ tính khi viết HOA như tiêu đề (tránh nhầm với câu hỏi có chữ "trắc nghiệm").
  const up = t;
  const stripped = t.replace(/^phần\s+/i, '');
  const hasPhan = stripped !== t;
  const romanOk =
    /^(IV|VI|V|I{1,3})(?=\s*[.:\-–)]|\s|$)/.test(stripped) || (hasPhan && /^\d(?=\s*[.:\-–)]|\s|$)/.test(stripped));
  const keywordOk =
    /(TRẮC NGHIỆM|ĐÚNG\s*[-/–]?\s*SAI|TRẢ LỜI NGẮN|TỰ LUẬN)/.test(up) && !/^(ĐỀ|KỲ THI|KÌ THI|KIỂM TRA|BÀI KIỂM TRA)/.test(up);
  if (!romanOk && !keywordOk) return null;
  let kind: SectionKind | null = null;
  if (/ĐÚNG\s*[-/–]?\s*SAI/.test(up)) kind = 'truefalse';
  else if (/TRẢ LỜI NGẮN/.test(up)) kind = 'short';
  else if (/NHIỀU LỰA CHỌN|TRẮC NGHIỆM/.test(up)) kind = 'mcq';
  return { kind };
}

interface QB {
  num: number;
  stem: Para[];
  opts: Seg[][];
  stmts: Seg[][];
  mode: 'stem' | 'opts' | 'stmts';
  continued: boolean;
}

interface SB {
  hint: SectionKind | null;
  title: Para[];
  qs: QB[];
}

function paraBlock(p: { segs: Seg[]; align: Align }): string {
  const segs = trimSegs(p.segs);
  const inner = segs.length ? segsToHtml(segs) : '<br>';
  const cls = p.align === 'center' ? ' class="ex-center"' : p.align === 'right' ? ' class="ex-right"' : '';
  return `<div${cls}>${inner}</div>`;
}

function buildStem(stem: Para[]): string {
  if (!stem.length) return '';
  const [first, ...rest] = stem;
  let html = segsToHtml(trimSegs(first.segs));
  const tail = [...rest];
  while (tail.length && isEmptyPara(tail[tail.length - 1].segs)) tail.pop();
  // Dòng "Câu N." trống: bỏ các dòng trống ngay sau đó.
  if (!html) while (tail.length && isEmptyPara(tail[0].segs)) tail.shift();
  for (const p of tail) html += paraBlock(p);
  return html;
}

function appendContinuation(target: Seg[], p: Para): Seg[] {
  return [...target, { t: 'atom', kind: 'br', html: '<br>' }, ...trimSegs(p.segs)];
}

// ---------------------------------------------------------------------------
// Main

const BAD_FILE = 'Không đọc được file. Hãy chắc chắn đây là file Word (.docx) còn mở được bằng Word.';

/** Lỗi đọc file có thông báo tiếng Việt, hiển thị thẳng cho người dùng. */
export class DocxParseError extends Error {}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new DocxParseError(BAD_FILE);
  return doc;
}

function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

async function readRels(zip: JSZip, path: string): Promise<Element[]> {
  const f = zip.file(path);
  if (!f) return [];
  const xml = parseXml(await f.async('string'));
  const root = xml.documentElement;
  return root ? kids(root).filter((e) => e.localName === 'Relationship') : [];
}

export async function parseDocx(buffer: ArrayBuffer): Promise<ParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxParseError(BAD_FILE);
  }

  let mainPath = 'word/document.xml';
  for (const r of await readRels(zip, '_rels/.rels')) {
    if ((r.getAttribute('Type') || '').endsWith('/officeDocument')) mainPath = resolvePath('', r.getAttribute('Target') || mainPath);
  }
  const mainFile = zip.file(mainPath);
  if (!mainFile) throw new DocxParseError(BAD_FILE);
  const baseDir = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : '';
  const relsPath = `${baseDir}_rels/${mainPath.slice(baseDir.length)}.rels`;

  const ctx: Ctx = { images: new Map(), flags: new Set() };
  for (const r of await readRels(zip, relsPath)) {
    const type = r.getAttribute('Type') || '';
    if (!type.endsWith('/image')) continue;
    const id = r.getAttribute('Id') || '';
    const target = r.getAttribute('Target') || '';
    if (r.getAttribute('TargetMode') === 'External') {
      ctx.images.set(id, { external: true });
      continue;
    }
    const ext = (target.split('.').pop() || '').toLowerCase();
    const mime = MIME[ext];
    const f = zip.file(resolvePath(baseDir, target));
    if (!mime || !f) {
      ctx.images.set(id, { ext });
      continue;
    }
    ctx.images.set(id, { ext, dataUrl: `data:${mime};base64,${await f.async('base64')}` });
  }

  const xml = parseXml(await mainFile.async('string'));
  const body = xml.documentElement ? child(xml.documentElement, 'w', 'body') : null;
  if (!body) throw new DocxParseError(BAD_FILE);

  const pEls: Element[] = [];
  collectParagraphs(ctx, body, pEls);
  const paras = pEls.map((p) => readPara(ctx, p));

  // --- Phân đoạn
  const header: Para[] = [];
  const sections: SB[] = [];
  let curQ: QB | null = null;
  let inHeader = true;
  let ended = false;
  let ignoredAfterEnd = 0;

  const curSection = (): SB => {
    if (!sections.length) sections.push({ hint: null, title: [], qs: [] });
    return sections[sections.length - 1];
  };

  for (const p of paras) {
    const plain = p.plain;
    if (ended) {
      if (!isEmptyPara(p.segs)) ignoredAfterEnd++;
      continue;
    }
    const qm = QUESTION_RE.exec(plain);
    if (qm) {
      inHeader = false;
      const sec = curSection();
      curQ = {
        num: Number(qm[1]),
        stem: [{ segs: sliceSegs(p.segs, qm[0].length, plain.length, true), align: p.align, plain: plain.slice(qm[0].length) }],
        opts: [],
        stmts: [],
        mode: 'stem',
        continued: false,
      };
      sec.qs.push(curQ);
      continue;
    }
    if (END_RE.test(plain.trim())) {
      if (!inHeader) {
        ended = true;
        curQ = null;
        continue;
      }
    }
    const hd = headingInfo(plain);
    // Dòng bắt đầu bằng số La Mã nhưng không có từ khóa phần thi, nằm giữa đề bài một câu
    // (ví dụ "II. Cho …") thì vẫn coi là đề bài.
    if (hd && !(curQ && curQ.mode === 'stem' && !hd.kind && !/^\s*phần/i.test(plain))) {
      inHeader = false;
      sections.push({ hint: hd.kind, title: [p], qs: [] });
      curQ = null;
      continue;
    }
    if (inHeader) {
      if (!isEmptyPara(p.segs)) header.push(p);
      continue;
    }
    if (!curQ) {
      if (!isEmptyPara(p.segs)) curSection().title.push(p);
      continue;
    }
    const q: QB = curQ;
    const hint = curSection().hint;
    const allowOpts = hint !== 'short' && hint !== 'truefalse';
    const allowStmts = hint !== 'short' && hint !== 'mcq';

    let isOpt = false;
    if (allowOpts && q.mode !== 'stmts') {
      if (OPTION_PUNCT_RE.test(plain)) isOpt = true;
      else {
        const ms = OPTION_SPACE_RE.exec(plain);
        if (ms && ms[1].charCodeAt(0) - 65 === q.opts.length) {
          isOpt = q.opts.length > 0 || splitOptions(plain).length > 1;
        }
      }
    }
    if (isOpt) {
      const ranges = splitOptions(plain);
      ranges.forEach((r, i) => {
        const end = i + 1 < ranges.length ? ranges[i + 1].start : plain.length;
        q.opts.push(trimSegs(sliceSegs(p.segs, r.cStart, end, true)));
      });
      q.mode = 'opts';
      continue;
    }
    const st = allowStmts && q.mode !== 'opts' ? STATEMENT_RE.exec(plain) : null;
    if (st) {
      q.stmts.push(trimSegs(sliceSegs(p.segs, st[0].length, plain.length, true)));
      q.mode = 'stmts';
      continue;
    }
    if (q.mode === 'stem') {
      q.stem.push(p);
      continue;
    }
    if (isEmptyPara(p.segs)) continue;
    const list = q.mode === 'opts' ? q.opts : q.stmts;
    list[list.length - 1] = appendContinuation(list[list.length - 1], p);
    q.continued = true;
  }

  // --- Dựng ExamDoc
  const warnings: string[] = [];
  const outSections: ExamSection[] = [];
  let totalQ = 0;

  sections.forEach((sb, si) => {
    if (!sb.qs.length && !sb.title.length) return;
    const label = `Phần ${ROMAN[outSections.length] ?? si + 1}`;
    const contentKind = (q: QB): SectionKind => (q.opts.length ? 'mcq' : q.stmts.length ? 'truefalse' : 'short');
    let kind: SectionKind;
    if (sb.hint) kind = sb.hint;
    else {
      const count: Record<SectionKind, number> = { mcq: 0, truefalse: 0, short: 0 };
      sb.qs.forEach((q) => count[contentKind(q)]++);
      kind = count.truefalse > count.mcq && count.truefalse >= count.short ? 'truefalse' : count.short > count.mcq ? 'short' : 'mcq';
    }

    const questions: Question[] = [];
    let prevNum = 0;
    sb.qs.forEach((qb, qi) => {
      const qLabel = `${label}, câu ${qb.num}`;
      if (qi > 0 && qb.num !== prevNum + 1) {
        warnings.push(`${label}: số thứ tự câu không liên tiếp (sau câu ${prevNum} là câu ${qb.num}). Hãy kiểm tra có câu nào bị thiếu không.`);
      }
      prevNum = qb.num;
      const stemHtml = buildStem(qb.stem);
      if (!stemHtml.replace(/<[^>]*>/g, '').trim() && !/<img/.test(stemHtml)) warnings.push(`${qLabel}: phần đề bài trống.`);
      const ck = contentKind(qb);
      let items: Seg[][] = [];
      if (kind === 'mcq') {
        items = qb.opts.length ? qb.opts : qb.stmts;
        if (ck === 'truefalse') warnings.push(`${qLabel}: câu có các ý a), b)… nhưng nằm trong phần trắc nghiệm nhiều lựa chọn.`);
        if (items.length === 0) warnings.push(`${qLabel}: không tìm thấy đáp án A, B, C, D.`);
        else if (items.length < 4) warnings.push(`${qLabel}: chỉ tìm thấy ${items.length} đáp án.`);
        else if (items.length > 4) warnings.push(`${qLabel}: tìm thấy ${items.length} đáp án (nhiều hơn 4).`);
      } else if (kind === 'truefalse') {
        items = qb.stmts.length ? qb.stmts : qb.opts;
        if (ck === 'mcq') warnings.push(`${qLabel}: câu có đáp án A, B, C, D nhưng nằm trong phần đúng/sai.`);
        if (items.length !== 4) warnings.push(`${qLabel}: tìm thấy ${items.length} ý (cần 4 ý a, b, c, d).`);
      }
      if (qb.continued) warnings.push(`${qLabel}: có dòng nằm sau các đáp án/ý, đã gộp vào đáp án/ý cuối cùng. Hãy kiểm tra lại.`);
      items.forEach((segs, oi) => {
        if (!segs.length) warnings.push(`${qLabel}: đáp án/ý thứ ${oi + 1} trống.`);
      });

      const options: ExamOption[] = items.map((segs) => ({ id: newId(), html: segsToHtml(segs) }));
      const answer: QuestionAnswer =
        kind === 'mcq'
          ? { mcq: null }
          : kind === 'truefalse'
            ? { tf: Object.fromEntries(options.map((o) => [o.id, null])) }
            : { short: '' };
      questions.push({ id: newId(), stemHtml, options, answer });
    });
    totalQ += questions.length;

    const titleHtml = sb.title.length ? sb.title.map((p) => paraBlock(p)).join('') : null;
    outSections.push({ id: newId(), kind, titleHtml, questions });
  });

  // --- Phần đầu đề + mã đề
  let originalCode: string | null = null;
  const headerHtml: string[] = [];
  for (const p of header) {
    const segs = trimSegs(p.segs);
    const plain = plainOf(segs);
    const m: RegExpExecArray | null = originalCode === null ? /MÃ\s*ĐỀ\s*(?:THI)?\s*:?\s*(\d+)/i.exec(plain) : null;
    const cls = p.align === 'center' ? ' class="ex-center"' : p.align === 'right' ? ' class="ex-right"' : '';
    if (m) {
      originalCode = m[1];
      const ds = m.index + m[0].length - m[1].length;
      const de = m.index + m[0].length;
      const codeSegs = sliceSegs(segs, ds, de).filter((s): s is TextSeg => s.t === 'text');
      const fmt: Fmt = codeSegs[0] ? { b: codeSegs[0].b, i: codeSegs[0].i, u: codeSegs[0].u, sub: false, sup: false } : { ...NO_FMT };
      const codeHtml = segsToHtml([{ t: 'text', text: m[1], ...fmt }]);
      headerHtml.push(
        `<div${cls}>${segsToHtml(sliceSegs(segs, 0, ds))}<span class="ex-code">${codeHtml}</span>${segsToHtml(
          sliceSegs(segs, de, plain.length)
        )}</div>`
      );
    } else {
      headerHtml.push(`<div${cls}>${segsToHtml(segs)}</div>`);
    }
  }

  // --- Cảnh báo chung
  if (totalQ === 0) {
    warnings.unshift('Không tìm thấy câu hỏi nào. Mỗi câu trong file Word cần bắt đầu bằng "Câu 1.", "Câu 2."…');
  }
  if (ctx.flags.has('table')) warnings.push('File có bảng; nội dung trong bảng đã được tách thành từng dòng. Hãy kiểm tra lại các câu có bảng.');
  if (ctx.flags.has('numbering')) warnings.push('File có dòng đánh số/đánh chữ tự động của Word; phần số hoặc chữ tự động có thể bị mất. Hãy kiểm tra lại.');
  if (ctx.flags.has('ole')) warnings.push('File có công thức hoặc đối tượng nhúng (ví dụ MathType) không hiển thị được trên trình duyệt. Hãy gõ lại các công thức đó.');
  if (ctx.flags.has('shape')) warnings.push('File có hình vẽ bằng công cụ vẽ của Word (không phải ảnh), phần này bị bỏ qua.');
  if (ctx.flags.has('img-external')) warnings.push('File có ảnh liên kết ngoài (không nằm trong file), không hiển thị được.');
  if (ctx.flags.has('img-missing')) warnings.push('Có ảnh không đọc được trong file.');
  for (const f of ctx.flags) {
    if (f.startsWith('img-unsupported:')) {
      warnings.push(`Có ảnh định dạng ${f.split(':')[1]} mà trình duyệt không hiển thị được. Hãy chèn lại ảnh dạng PNG hoặc JPG trong Word.`);
    }
  }
  if (ignoredAfterEnd > 0) warnings.push(`Đã bỏ qua ${ignoredAfterEnd} dòng nằm sau dòng "HẾT".`);

  return { doc: { headerHtml, originalCode, sections: outSections }, warnings };
}
