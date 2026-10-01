// "Tạo đề từ ảnh": chuẩn bị ảnh (xoay, thu nhỏ, nén JPEG) trước khi gửi cho AI, rồi dựng ExamDoc
// từ kết quả AI trả về với ĐÚNG cấu trúc mà parseDocx tạo ra (id, answer, span mã đề, khối căn giữa
// cho hình...) để trình sửa đề, tráo mã đề, bảng đáp án và in hoạt động như với file Word.

import { arrowWithTextHtml, CONTENT_WIDTH_PX } from './parseDocx';
import { sanitizeHtml } from './sanitize';
import { ExamDoc, ExamOption, ExamSection, Question, QuestionAnswer, ROMAN, SectionKind, newId } from './types';

// ---------------------------------------------------------------------------
// Kết quả từ backend (POST /api/exams/ocr), đã được backend ép đúng kiểu.

export interface OcrFigure {
  id: string;
  /** Số thứ tự ảnh, bắt đầu từ 1. */
  image: number;
  /** [ymin, xmin, ymax, xmax] thang 0–1000. */
  box_2d: [number, number, number, number];
}

export interface OcrResult {
  headerLines: string[];
  originalCode: string | null;
  sections: { kind: SectionKind; title: string | null; questions: { stem: string; options: string[] }[] }[];
  figures: OcrFigure[];
  warnings: string[];
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  /** data:image/jpeg;base64,… — cùng nội dung với blob; dùng để xem trước, gửi đi và cắt hình. */
  dataUrlForPreview: string;
}

/** Lỗi đọc ảnh có thông báo tiếng Việt, hiển thị thẳng cho người dùng. */
export class ImageReadError extends Error {}

export const MAX_SIDE_PX = 2000;
export const JPEG_QUALITY = 0.85;
export const FIGURE_MAX_WIDTH_PX = 600;
export const AI_WARNING =
  'Đề được đọc từ ảnh bằng AI: hãy kiểm tra kỹ từng câu, nhất là số liệu, công thức và hình vẽ.';

const HEIC_MSG =
  'Không đọc được ảnh này (định dạng HEIC). Trên iPhone hãy chọn ảnh từ Thư viện hoặc chụp trực tiếp.';
const BAD_IMAGE_MSG = 'Không đọc được ảnh này. Hãy chọn ảnh dạng JPG hoặc PNG.';

// ---------------------------------------------------------------------------
// Chuẩn bị ảnh

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

function isHeic(file: Blob): boolean {
  const type = (file.type || '').toLowerCase();
  const name = ((file as File).name || '').toLowerCase();
  return /heic|heif/.test(type) || /\.(heic|heif)$/.test(name);
}

function loadImgElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
}

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Safari cũ / định dạng lạ: thử lại bằng <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImgElement(url);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    // Ảnh đã giải mã xong nên thu hồi URL được ngay.
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Giải mã, xoay (0/90/180/270), thu nhỏ cạnh dài ≤ 2000px và nén JPEG 0,85. */
export async function prepareImage(file: Blob, rotationDegrees = 0): Promise<PreparedImage> {
  let img: Drawable;
  try {
    img = await decode(file);
  } catch {
    throw new ImageReadError(isHeic(file) ? HEIC_MSG : BAD_IMAGE_MSG);
  }
  try {
    const rot = (((Math.round(rotationDegrees / 90) * 90) % 360) + 360) % 360;
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const swap = rot === 90 || rot === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    // Nền trắng: ảnh PNG trong suốt (ảnh chụp màn hình) khi nén JPEG không bị nền đen.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img.source, -w / 2, -h / 2, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    const dataUrlForPreview = await blobToDataUrl(blob);
    return { blob, width: canvas.width, height: canvas.height, dataUrlForPreview };
  } catch (err) {
    if (err instanceof ImageReadError) throw err;
    throw new ImageReadError(BAD_IMAGE_MSG);
  } finally {
    img.close?.();
  }
}

/** Phần base64 (không có tiền tố data:) để gửi cho backend. */
export function base64Of(prepared: PreparedImage): string {
  const i = prepared.dataUrlForPreview.indexOf(',');
  return i >= 0 ? prepared.dataUrlForPreview.slice(i + 1) : '';
}

// ---------------------------------------------------------------------------
// Cắt hình vẽ

export interface CroppedFigure {
  dataUrl: string;
  /** Kích thước hiển thị trên đề in (px, theo khổ nội dung A4). */
  width: number;
  height: number;
}

export type CropFn = (image: PreparedImage, box: [number, number, number, number]) => Promise<CroppedFigure | null>;

/** Cắt vùng box_2d (thang 0–1000) khỏi ảnh đã chuẩn bị, chừa lề ~2%, rộng tối đa 600px. */
export const cropFigure: CropFn = async (image, box) => {
  const [y0, x0, y1, x1] = box;
  const padX = 0.02 * image.width;
  const padY = 0.02 * image.height;
  const left = Math.max(0, Math.floor((x0 / 1000) * image.width - padX));
  const top = Math.max(0, Math.floor((y0 / 1000) * image.height - padY));
  const right = Math.min(image.width, Math.ceil((x1 / 1000) * image.width + padX));
  const bottom = Math.min(image.height, Math.ceil((y1 / 1000) * image.height + padY));
  const cw = right - left;
  const ch = bottom - top;
  if (cw < 4 || ch < 4) return null;
  const src = await loadImgElement(image.dataUrlForPreview);
  const scale = Math.min(1, FIGURE_MAX_WIDTH_PX / cw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, left, top, cw, ch, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  // Ảnh chụp cả trang giấy: tỉ lệ chiều rộng hình / chiều rộng ảnh ≈ tỉ lệ trên trang in.
  const width = Math.max(40, Math.min(CONTENT_WIDTH_PX, Math.round((cw / image.width) * CONTENT_WIDTH_PX * 1.15)));
  const height = Math.max(1, Math.round((width * ch) / cw));
  return { dataUrl, width, height };
};

// ---------------------------------------------------------------------------
// Dựng ExamDoc

const ARROW_RE = /\[\[ARROW(2?):([\s\S]*?)\|([\s\S]*?)\]\]/g;
const FIG_RE = /\[\[FIG:\s*([^\]\s]+)\s*\]\]/g;
const QUESTION_PREFIX_RE = /^\s*(?:<(b|strong)>\s*)?Câu\s*\d+\s*[.:)]?\s*(?:<\/(?:b|strong)>)?\s*/i;
const CODE_RE = /(MÃ\s*ĐỀ\s*(?:THI)?\s*:?\s*(?:<[^>]+>\s*)*)(\d+)/i;
const MISSING_FIG = '<span class="ex-missing">[Hình không hiển thị được]</span>';

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Chuẩn hóa chuỗi HTML do AI trả về: NFC, xuống dòng thật → <br>, mũi tên [[ARROW…]]. */
function convertTokens(html: string): string {
  return html
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\n/g, '<br>')
    // AI không được tự chèn ảnh; hình chỉ đến từ [[FIG:…]] (cắt từ ảnh chụp).
    .replace(/<img\b[^>]*>/gi, '')
    .replace(ARROW_RE, (_m, two: string, above: string, below: string) =>
      arrowWithTextHtml(two ? '⇌' : '→', above, below)
    );
}

/** Bỏ ký hiệu "A." / "a)" nếu AI vẫn để lại — chỉ khi MỌI phương án đều có đúng ký hiệu theo thứ tự. */
function stripMarkers(options: string[], letters: string, punct: string): string[] {
  const res = options.map((o, i) =>
    new RegExp(`^\\s*(?:<(?:b|strong)>\\s*)?${letters[i] ?? '#'}\\s*[${punct}]\\s*(?:</(?:b|strong)>)?\\s*`).exec(o)
  );
  if (options.length < 2 || res.some((m) => !m)) return options;
  return options.map((o, i) => o.slice(res[i]![0].length));
}

export interface BuildOptions {
  /** Thay thế cách cắt hình (dùng khi kiểm thử không có canvas). */
  crop?: CropFn;
}

export async function buildExamDocFromOcr(
  result: OcrResult,
  preparedImages: PreparedImage[],
  opts: BuildOptions = {}
): Promise<{ doc: ExamDoc; warnings: string[] }> {
  const crop = opts.crop ?? cropFigure;
  const warnings: string[] = [AI_WARNING];
  for (const w of result.warnings) if (w && w.trim()) warnings.push(w.trim());

  // --- Cắt sẵn các hình được nhắc tới
  const figById = new Map(result.figures.map((f) => [f.id, f]));
  const cropCache = new Map<string, Promise<CroppedFigure | null>>();
  const usedFigs = new Set<string>();
  const cropOnce = (id: string) => {
    let p = cropCache.get(id);
    if (!p) {
      const f = figById.get(id)!;
      const img = preparedImages[f.image - 1];
      p = img ? crop(img, f.box_2d).catch(() => null) : Promise.resolve(null);
      cropCache.set(id, p);
    }
    return p;
  };

  async function replaceFigs(html: string, label: string): Promise<string> {
    const ids = Array.from(html.matchAll(FIG_RE), (m) => m[1]);
    const crops = new Map<string, CroppedFigure | null>();
    for (const id of ids) {
      if (!figById.has(id) || !preparedImages[figById.get(id)!.image - 1]) continue;
      usedFigs.add(id);
      crops.set(id, await cropOnce(id));
    }
    return html.replace(FIG_RE, (_m, id: string) => {
      if (!crops.has(id)) {
        warnings.push(`${label}: AI đánh dấu một hình nhưng không xác định được vị trí hình, đã bỏ qua. Hãy chèn lại hình nếu cần.`);
        return '';
      }
      const c = crops.get(id);
      if (!c) {
        warnings.push(`${label}: không cắt được hình từ ảnh. Hãy chèn lại hình này.`);
        return `<div class="ex-center">${MISSING_FIG}</div>`;
      }
      return `<div class="ex-center"><img src="${c.dataUrl}" width="${c.width}" height="${c.height}" alt=""></div>`;
    });
  }

  async function html(raw: string, label: string): Promise<string> {
    return sanitizeHtml(await replaceFigs(convertTokens(raw), label));
  }

  // --- Các phần thi
  const sections: ExamSection[] = [];
  let totalQ = 0;
  for (const sec of result.sections) {
    if (!sec.questions.length && !(sec.title && sec.title.trim())) continue;
    const label = `Phần ${ROMAN[sections.length] ?? sections.length + 1}`;
    const kind = sec.kind;
    const titleHtml = sec.title && sec.title.trim() ? `<div>${await html(sec.title, label)}</div>` : null;
    const questions: Question[] = [];
    for (let qi = 0; qi < sec.questions.length; qi++) {
      const q = sec.questions[qi];
      const qLabel = `${label}, câu ${qi + 1}`;
      let stemRaw = q.stem.replace(QUESTION_PREFIX_RE, '');
      let items = q.options.filter((o) => plain(o) !== '' || /\[\[FIG:/.test(o));
      if (kind === 'mcq') items = stripMarkers(items, 'ABCDEFGH', '.):');
      else if (kind === 'truefalse') items = stripMarkers(items, 'abcdefgh', ').');
      else if (items.length) {
        // Phần trả lời ngắn không có phương án: giữ nội dung bằng cách nối vào cuối đề bài.
        stemRaw += items.map((o) => '<br>' + o).join('');
        warnings.push(`${qLabel}: câu trả lời ngắn có dòng giống phương án, đã nối vào đề bài. Hãy kiểm tra lại.`);
        items = [];
      }

      const stemHtml = await html(stemRaw, qLabel);
      if (!plain(stemHtml) && !/<img/.test(stemHtml)) warnings.push(`${qLabel}: phần đề bài trống.`);
      if (kind === 'mcq') {
        if (items.length === 0) warnings.push(`${qLabel}: không tìm thấy đáp án A, B, C, D.`);
        else if (items.length < 4) warnings.push(`${qLabel}: chỉ có ${items.length} đáp án.`);
        else if (items.length > 4) warnings.push(`${qLabel}: có ${items.length} đáp án (nhiều hơn 4).`);
      } else if (kind === 'truefalse' && items.length !== 4) {
        warnings.push(`${qLabel}: tìm thấy ${items.length} ý (cần 4 ý a, b, c, d).`);
      }

      const options: ExamOption[] = [];
      for (const o of items) options.push({ id: newId(), html: await html(o, qLabel) });
      const answer: QuestionAnswer =
        kind === 'mcq'
          ? { mcq: null }
          : kind === 'truefalse'
            ? { tf: Object.fromEntries(options.map((o) => [o.id, null])) }
            : { short: '' };
      questions.push({ id: newId(), stemHtml, options, answer });
    }
    totalQ += questions.length;
    sections.push({ id: newId(), kind, titleHtml, questions });
  }

  // --- Phần đầu đề + mã đề (span ex-code giống parseDocx để thay bằng mã từng đề khi in)
  let originalCode: string | null = null;
  const headerHtml: string[] = [];
  for (const line of result.headerLines) {
    let h = await html(line, 'Phần đầu đề');
    if (!plain(h) && !/<img/.test(h)) continue;
    if (originalCode === null) {
      const m = CODE_RE.exec(h);
      if (m) {
        originalCode = m[2];
        h = h.slice(0, m.index) + m[1] + `<span class="ex-code">${m[2]}</span>` + h.slice(m.index + m[0].length);
      }
    }
    const left = /^(Họ|Số báo danh|SBD|Cho biết|Cho:|Nguyên tử khối)/i.test(plain(h));
    headerHtml.push(sanitizeHtml(`<div${left ? '' : ' class="ex-center"'}>${h}</div>`));
  }
  if (originalCode === null && result.originalCode && /^\d+$/.test(result.originalCode.trim())) {
    originalCode = result.originalCode.trim();
  }

  // --- Cảnh báo chung
  if (totalQ === 0) warnings.unshift('Không tìm thấy câu hỏi nào trong ảnh.');
  const unused = result.figures.filter((f) => !usedFigs.has(f.id));
  if (unused.length) {
    const pages = Array.from(new Set(unused.map((f) => f.image))).sort((a, b) => a - b);
    warnings.push(
      `AI nhận ra ${unused.length} hình (ảnh ${pages.join(', ')}) nhưng không gắn vào câu nào. Hãy kiểm tra có câu nào thiếu hình không.`
    );
  }

  return { doc: { headerHtml, originalCode, sections }, warnings };
}

