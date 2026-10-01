// "Tạo đề từ ảnh": gửi ảnh chụp đề thi tới Gemini (REST, fetch có sẵn của Node) và nhận về
// cấu trúc đề dạng JSON. Không làm sạch HTML ở đây (frontend làm sạch bằng DOMPurify), chỉ ép
// đúng kiểu dữ liệu để frontend tin được.

import { AppError } from "../middleware/errorHandler";

export const OCR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type OcrMimeType = (typeof OCR_MIME_TYPES)[number];

export interface OcrImage {
  mimeType: OcrMimeType;
  data: string;
}

export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
export const GEMINI_TIMEOUT_MS = 100_000;

export interface OcrFigure {
  id: string;
  image: number;
  box_2d: [number, number, number, number];
}

export interface OcrQuestion {
  stem: string;
  options: string[];
}

export interface OcrSection {
  kind: "mcq" | "truefalse" | "short";
  title: string | null;
  questions: OcrQuestion[];
}

export interface OcrResult {
  headerLines: string[];
  originalCode: string | null;
  sections: OcrSection[];
  figures: OcrFigure[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu gửi lên

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function decodedSize(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export function validateImages(body: unknown): OcrImage[] {
  const images = (body as { images?: unknown } | null | undefined)?.images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new AppError("Chưa có ảnh nào. Hãy chọn ít nhất 1 ảnh đề thi.");
  }
  if (images.length > MAX_IMAGES) {
    throw new AppError(`Tối đa ${MAX_IMAGES} ảnh mỗi lần (đang gửi ${images.length} ảnh).`);
  }
  let total = 0;
  return images.map((img, i) => {
    const n = i + 1;
    if (!img || typeof img !== "object") throw new AppError(`Ảnh số ${n} không hợp lệ.`);
    const { mimeType, data } = img as { mimeType?: unknown; data?: unknown };
    if (typeof mimeType !== "string" || !(OCR_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new AppError(`Ảnh số ${n} có định dạng không được hỗ trợ (chỉ nhận JPEG, PNG hoặc WEBP).`);
    }
    if (typeof data !== "string" || !data || data.startsWith("data:")) {
      throw new AppError(`Dữ liệu ảnh số ${n} không hợp lệ.`);
    }
    const clean = data.replace(/\s+/g, "");
    if (!BASE64_RE.test(clean)) throw new AppError(`Dữ liệu ảnh số ${n} không hợp lệ.`);
    const size = decodedSize(clean);
    if (size > MAX_IMAGE_BYTES) {
      throw new AppError(`Ảnh số ${n} quá lớn (trên 4 MB). Hãy chụp lại với độ phân giải thấp hơn.`, 413);
    }
    total += size;
    if (total > MAX_TOTAL_BYTES) {
      throw new AppError("Tổng dung lượng ảnh quá lớn (trên 14 MB). Hãy bớt ảnh rồi thử lại.", 413);
    }
    return { mimeType: mimeType as OcrMimeType, data: clean };
  });
}

// ---------------------------------------------------------------------------
// Prompt + schema

export const OCR_PROMPT = `Bạn là công cụ chép lại (OCR) đề thi Hóa học THPT của Việt Nam từ ảnh chụp. Các ảnh được đánh số theo thứ tự trang (ảnh 1 = trang 1, ...). Hãy trả về đúng JSON theo schema.

QUY TẮC CHUNG
- Chép CHÍNH XÁC từng chữ, từng số, từng công thức như trong ảnh. TUYỆT ĐỐI không bịa thêm, không sửa lỗi, không tóm tắt, không giải đề, không thêm đáp án.
- Giữ nguyên tiếng Việt có dấu (Unicode dựng sẵn).
- Bỏ qua số trang, chân trang/đầu trang lặp lại, chữ viết tay, dấu khoanh/tích đáp án, chữ ký, đóng dấu.
- Nội dung bị ngắt sang trang sau vẫn thuộc cùng câu hỏi/ý đang dở; không tạo câu mới.
- Mọi chỗ không chắc chắn (mờ, bị che, bị cắt, khó đọc số liệu) ghi vào "warnings" bằng tiếng Việt, nêu rõ ảnh và câu, ví dụ: "Ảnh 2: câu 5 bị mờ, có thể đọc sai số liệu". Vẫn chép phần đọc được tốt nhất có thể.

CẤU TRÚC
- "headerLines": các dòng phần đầu đề (tên sở/trường, kỳ thi, môn, thời gian làm bài, "Họ, tên thí sinh", "Số báo danh", ...) theo thứ tự đọc, mỗi dòng một chuỗi. Không đưa câu hỏi vào đây. Câu dặn dò cho cả đề như "Cho biết nguyên tử khối: H = 1; C = 12; ..." cũng thuộc headerLines nếu nằm trước Phần I.
- "originalCode": số MÃ ĐỀ in trên đề (chỉ phần số, ví dụ "0123"), hoặc null nếu không có.
- "sections": các phần thi theo thứ tự:
  - Phần trắc nghiệm nhiều phương án lựa chọn (A, B, C, D) → kind "mcq"; "options" là ĐÚNG 4 phương án A, B, C, D theo thứ tự.
  - Phần trắc nghiệm đúng/sai (các ý a), b), c), d)) → kind "truefalse"; "options" là các ý a), b), c), d) theo thứ tự.
  - Phần trả lời ngắn → kind "short"; "options": [].
  - "title": dòng tiêu đề của phần, chép nguyên văn (ví dụ "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 18. Mỗi câu hỏi thí sinh chỉ chọn một phương án."). Nếu phần đầu tiên không có tiêu đề thì null.
  - Số thứ tự câu đánh lại từ Câu 1 trong mỗi phần; thứ tự trong mảng "questions" chính là số câu.
- "stem": đề bài của câu, KHÔNG kèm tiền tố "Câu 1.", "Câu 2:"...
- Phương án/ý KHÔNG kèm ký hiệu "A.", "B.", "a)", "b)"... (thứ tự trong mảng đã thể hiện ký hiệu).

ĐỊNH DẠNG (HTML đơn giản trong chuỗi)
- Chỉ số dưới, chỉ số trên, điện tích dùng <sub>, <sup>: H<sub>2</sub>SO<sub>4</sub>, (C<sub>17</sub>H<sub>35</sub>COO)<sub>3</sub>C<sub>3</sub>H<sub>5</sub>, Fe<sup>3+</sup>, SO<sub>4</sub><sup>2-</sup>, 10<sup>-3</sup>, cm<sup>3</sup>.
- <b>, <i> chỉ khi chữ rõ ràng in đậm/in nghiêng (ví dụ chữ "không", "sai" in đậm trong đề).
- Xuống dòng bên trong đề bài dùng <br> (ví dụ các dòng "Bước 1: ...<br>Bước 2: ...", hoặc các chất (1), (2), (3) liệt kê trên nhiều dòng).
- Mũi tên phản ứng có điều kiện viết bằng ký hiệu [[ARROW:chữ trên|chữ dưới]] (một bên có thể để trống, ví dụ [[ARROW:t<sup>o</sup>|]] hoặc [[ARROW:H<sub>2</sub>SO<sub>4</sub> đặc|t<sup>o</sup>]]); mũi tên thuận nghịch ⇌ có điều kiện viết [[ARROW2:chữ trên|chữ dưới]]. Mũi tên không có điều kiện ghi thẳng ký tự "→" hoặc "⇌".
- Dùng ký tự Unicode cho các ký hiệu: °, Δ, ≤, ≥, ×, ⇌, →, ↑, ↓.
- Bảng số liệu dạng chữ: chép từng hàng một dòng, các ô cách nhau bằng " | ", các hàng nối bằng <br>.

HÌNH VẼ
- Mỗi hình vẽ, sơ đồ thí nghiệm, ảnh chụp, đồ thị, công thức cấu tạo vẽ hình, hoặc bảng phức tạp dạng hình nằm trong câu hỏi: đặt ký hiệu [[FIG:id]] (id tự đặt: f1, f2, ...) tại đúng vị trí của hình trong đề bài (hoặc trong phương án nếu hình nằm ở phương án), và thêm một phần tử vào "figures" với "image" = số thứ tự ảnh (bắt đầu từ 1) chứa hình và "box_2d" = [ymin, xmin, ymax, xmax] theo thang 0–1000 của ảnh đó, khung sát quanh phần hình vẽ (không gồm chữ đề bài xung quanh). Nhãn chữ nằm bên trong hình vẽ thì thuộc hình.
- Logo/quốc hiệu ở đầu đề không cần đưa vào figures.`;

export const OCR_SCHEMA = {
  type: "object",
  properties: {
    headerLines: {
      type: "array",
      description: "Các dòng phần đầu đề theo thứ tự, có thể chứa HTML đơn giản.",
      items: { type: "string" },
    },
    originalCode: { type: "string", nullable: true, description: "Số MÃ ĐỀ nếu có in trên đề." },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["mcq", "truefalse", "short"] },
          title: { type: "string", nullable: true },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stem: { type: "string" },
                options: { type: "array", items: { type: "string" } },
              },
              required: ["stem", "options"],
            },
          },
        },
        required: ["kind", "title", "questions"],
      },
    },
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          image: { type: "integer", description: "Số thứ tự ảnh chứa hình, bắt đầu từ 1." },
          box_2d: {
            type: "array",
            description: "[ymin, xmin, ymax, xmax] theo thang 0-1000.",
            items: { type: "integer" },
          },
        },
        required: ["id", "image", "box_2d"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["headerLines", "originalCode", "sections", "figures", "warnings"],
};

export function buildGeminiBody(images: OcrImage[]) {
  const parts: Record<string, unknown>[] = [{ text: OCR_PROMPT }];
  images.forEach((img, i) => {
    parts.push({ text: `Ảnh số ${i + 1} (trang ${i + 1}):` });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });
  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      // Đề 3 phần, nhiều trang có thể dài; để mặc định thì dễ bị cắt giữa chừng.
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
      responseSchema: OCR_SCHEMA,
    },
  };
}

// ---------------------------------------------------------------------------
// Ép kiểu kết quả

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s) => s !== "") : [];
}

const KINDS = ["mcq", "truefalse", "short"] as const;

function clampBox(v: number): number {
  return Math.min(1000, Math.max(0, Math.round(v)));
}

export function normalizeResult(raw: unknown, imageCount: number): OcrResult {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const codeRaw = str(r.originalCode).trim();
  const sections: OcrSection[] = (Array.isArray(r.sections) ? r.sections : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => {
      const questions: OcrQuestion[] = (Array.isArray(s.questions) ? s.questions : [])
        .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
        .map((q) => ({ stem: str(q.stem), options: Array.isArray(q.options) ? q.options.map(str) : [] }));
      let kind = (KINDS as readonly string[]).includes(str(s.kind)) ? (str(s.kind) as OcrSection["kind"]) : null;
      if (!kind) kind = questions.some((q) => q.options.length) ? "mcq" : "short";
      const title = str(s.title).trim();
      return { kind, title: title || null, questions };
    });

  const figures: OcrFigure[] = [];
  const seen = new Set<string>();
  for (const f of Array.isArray(r.figures) ? r.figures : []) {
    if (!f || typeof f !== "object") continue;
    const id = str((f as any).id).trim();
    const image = Math.round(Number((f as any).image));
    const box = (f as any).box_2d;
    if (!id || seen.has(id)) continue;
    if (!Number.isFinite(image) || image < 1 || image > imageCount) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((b: unknown) => Number.isFinite(Number(b)))) continue;
    let [y0, x0, y1, x1] = box.map((b: unknown) => clampBox(Number(b)));
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y1 - y0 < 1 || x1 - x0 < 1) continue;
    seen.add(id);
    figures.push({ id, image, box_2d: [y0, x0, y1, x1] });
  }

  return {
    headerLines: strList(r.headerLines),
    originalCode: codeRaw || null,
    sections,
    figures,
    warnings: strList(r.warnings),
  };
}

// ---------------------------------------------------------------------------
// Gọi Gemini

export const MSG_NOT_CONFIGURED = "Chưa cấu hình AI đọc ảnh. Vui lòng liên hệ người quản trị.";
export const MSG_QUOTA = "AI đang quá tải hoặc đã hết lượt miễn phí hôm nay. Vui lòng thử lại sau.";
export const MSG_BAD_KEY = "Mã API Gemini không hợp lệ.";
export const MSG_TIMEOUT = "AI đọc ảnh quá lâu. Hãy thử với ít ảnh hơn.";
export const MSG_BAD_JSON = "AI trả về kết quả không đọc được. Vui lòng thử lại.";
export const MSG_BLOCKED =
  "AI từ chối đọc các ảnh này (bị bộ lọc an toàn chặn hoặc không có kết quả). Hãy chụp lại chỉ phần đề thi rồi thử lại.";
export const MSG_TOO_LONG = "Đề quá dài để AI đọc trong một lần. Hãy chia thành nhiều lần, mỗi lần ít ảnh hơn.";
export const MSG_UNAVAILABLE = "Dịch vụ AI đang bận. Vui lòng thử lại sau ít phút.";
export const MSG_NETWORK = "Không kết nối được dịch vụ AI. Vui lòng thử lại sau.";

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function logUpstream(status: number | string, body: string) {
  // eslint-disable-next-line no-console
  console.error(`[ocr] Gemini lỗi: status=${status} body=${body.slice(0, 2000)}`);
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1] : t;
}

export async function ocrWithGemini(images: OcrImage[], opts: GeminiOptions): Promise<{ result: OcrResult; model: string }> {
  if (!opts.apiKey) throw new AppError(MSG_NOT_CONFIGURED, 503);
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? GEMINI_TIMEOUT_MS);

  let status = 0;
  let bodyText = "";
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify(buildGeminiBody(images)),
      signal: controller.signal,
    });
    status = res.status;
    bodyText = await res.text();
  } catch (err: any) {
    if (controller.signal.aborted || err?.name === "AbortError" || err?.name === "TimeoutError") {
      logUpstream("timeout", "");
      throw new AppError(MSG_TIMEOUT, 504);
    }
    logUpstream("network", String(err?.message ?? err));
    throw new AppError(MSG_NETWORK, 502);
  } finally {
    clearTimeout(timer);
  }

  if (status < 200 || status >= 300) {
    logUpstream(status, bodyText);
    if (status === 429 || /RESOURCE_EXHAUSTED/.test(bodyText)) throw new AppError(MSG_QUOTA, 429);
    if ((status === 400 || status === 401 || status === 403) && /API[_ ]?key|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(bodyText)) {
      throw new AppError(MSG_BAD_KEY, 502);
    }
    if (status === 503 || status === 500) throw new AppError(MSG_UNAVAILABLE, 503);
    throw new AppError(`Dịch vụ AI gặp lỗi (mã ${status}). Vui lòng thử lại sau.`, 502);
  }

  let envelope: any;
  try {
    envelope = JSON.parse(bodyText);
  } catch {
    logUpstream(status, bodyText);
    throw new AppError(MSG_BAD_JSON, 502);
  }

  const candidate = Array.isArray(envelope?.candidates) ? envelope.candidates[0] : undefined;
  const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .filter((p) => p && typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("");
  const finish = String(candidate?.finishReason ?? "");

  if (envelope?.promptFeedback?.blockReason || !text.trim()) {
    logUpstream(status, JSON.stringify({ promptFeedback: envelope?.promptFeedback, finishReason: finish }));
    if (finish === "MAX_TOKENS") throw new AppError(MSG_TOO_LONG, 502);
    throw new AppError(MSG_BLOCKED, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    logUpstream(status, `finishReason=${finish} text=${text.slice(0, 500)}`);
    if (finish === "MAX_TOKENS") throw new AppError(MSG_TOO_LONG, 502);
    throw new AppError(MSG_BAD_JSON, 502);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logUpstream(status, `not an object: ${text.slice(0, 500)}`);
    throw new AppError(MSG_BAD_JSON, 502);
  }

  return { result: normalizeResult(parsed, images.length), model: opts.model };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The free tier often answers 503 "high demand" for a few seconds, and Google retires models
 * for new keys (404). Retry a busy model briefly, then fall back to the next one, all within
 * one overall deadline so the browser's request doesn't give up first.
 */
export async function ocrWithFallback(
  images: OcrImage[],
  opts: Omit<GeminiOptions, "model" | "timeoutMs"> & { models: string[]; deadlineMs?: number }
): Promise<{ result: OcrResult; model: string }> {
  const deadline = Date.now() + (opts.deadlineMs ?? 110_000);
  const models = [...new Set(opts.models.filter(Boolean))];
  let lastError: unknown = new AppError(MSG_UNAVAILABLE, 503);
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 15_000) throw lastError;
      try {
        return await ocrWithGemini(images, { ...opts, model, timeoutMs: Math.min(GEMINI_TIMEOUT_MS, remaining) });
      } catch (err) {
        lastError = err;
        const busy = err instanceof AppError && err.message === MSG_UNAVAILABLE;
        const retired = err instanceof AppError && /\(mã 404\)/.test(err.message);
        if (retired) break;
        if (!busy) throw err;
        await sleep(attempt === 0 ? 3000 : 6000);
      }
    }
  }
  throw lastError;
}
