import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import { examService } from '../services/examService';
import { getErrorMessage } from '../services/api';
import { base64Of, buildExamDocFromOcr, ImageReadError, prepareImage, PreparedImage } from '../exam/fromImages';
import { DEFAULT_SETTINGS, ExamData, newId } from '../exam/types';

const MAX_IMAGES = 8;
const MAX_BYTES = 12 * 1024 * 1024;

interface Item {
  id: string;
  file: Blob;
  rotation: number;
  /** Ảnh đã chuẩn bị với góc xoay 0 (dùng để xem trước). */
  prepared: PreparedImage;
}

type Phase = 'idle' | 'preparing' | 'reading' | 'saving';

export default function ExamFromImages() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const pickInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const addingRef = useRef(0);
  itemsRef.current = items;
  const busy = phase !== 'idle';
  const isTouch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  async function addFiles(files: Blob[]) {
    if (!files.length || busy) return;
    setError('');
    setNotice('');
    const room = MAX_IMAGES - itemsRef.current.length - addingRef.current;
    const accepted = files.slice(0, Math.max(0, room));
    const skipped = files.length - accepted.length;
    const errors: string[] = [];
    if (skipped > 0) errors.push(`Tối đa ${MAX_IMAGES} ảnh mỗi lần (mỗi ảnh một trang). Đã bỏ qua ${skipped} ảnh.`);
    addingRef.current += accepted.length;
    setAdding(addingRef.current);
    for (const file of accepted) {
      try {
        const prepared = await prepareImage(file, 0);
        setItems((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, { id: newId(), file, rotation: 0, prepared }]));
      } catch (err) {
        const msg = err instanceof ImageReadError ? err.message : 'Không đọc được ảnh này.';
        if (!errors.includes(msg)) errors.push(msg);
      } finally {
        addingRef.current -= 1;
        setAdding(addingRef.current);
      }
    }
    if (errors.length) setError(errors.join(' '));
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    addFiles(files);
  }

  const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files).filter(isImageFile));
  }

  // Dán ảnh chụp màn hình (Ctrl+V / ⌘V) ở bất kỳ đâu trên màn hình này.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files: File[] = [];
      for (const it of Array.from(e.clipboardData?.items ?? [])) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addRef.current(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  function move(index: number, delta: number) {
    setItems((prev) => {
      const j = index + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function rotate(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, rotation: (it.rotation + 90) % 360 } : it)));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Đếm giây khi AI đang đọc để cô biết máy vẫn đang chạy.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'reading') return;
    setElapsed(0);
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  async function handleRead() {
    if (!items.length || busy || adding) return;
    setError('');
    setNotice('');
    setPhase('preparing');
    try {
      const prepared: PreparedImage[] = [];
      for (const it of items) {
        prepared.push(it.rotation ? await prepareImage(it.file, it.rotation) : it.prepared);
      }
      setPhase('reading');
      const { result } = await examService.ocr(prepared.map((p) => ({ mimeType: 'image/jpeg', data: base64Of(p) })));
      setPhase('saving');
      const { doc, warnings } = await buildExamDocFromOcr(result, prepared);
      const count = doc.sections.reduce((n, s) => n + s.questions.length, 0);
      if (count === 0) {
        setError('AI không tìm thấy câu hỏi nào trong ảnh. Hãy chụp lại rõ hơn (thẳng, đủ sáng, đủ 4 góc trang) rồi thử lại.');
        return;
      }
      const data: ExamData = { doc, settings: { ...DEFAULT_SETTINGS }, versions: [], parseWarnings: warnings };
      if (new Blob([JSON.stringify(data)]).size > MAX_BYTES) {
        setError('Đề quá lớn để lưu (trên 12 MB). Hãy thử với ít ảnh hơn.');
        return;
      }
      const title = `Đề từ ảnh – ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      const exam = await examService.create({ title, sourceName: `${items.length} ảnh`, data });
      navigate(`/exams/${exam.id}`);
    } catch (err) {
      if (err instanceof ImageReadError) setError(err.message);
      else if (axios.isAxiosError(err) && err.code === 'ECONNABORTED')
        setError('AI đọc ảnh quá lâu. Hãy thử với ít ảnh hơn.');
      else if (axios.isAxiosError(err)) setError(getErrorMessage(err, 'Không đọc được đề từ ảnh. Vui lòng thử lại.'));
      else setError('Không đọc được đề từ ảnh. Vui lòng thử lại.');
    } finally {
      setPhase('idle');
    }
  }

  const progressText =
    phase === 'preparing'
      ? 'Đang chuẩn bị ảnh…'
      : phase === 'reading'
        ? `AI đang đọc đề, có thể mất 30–60 giây… (${elapsed} giây)`
        : phase === 'saving'
          ? 'Đang tạo đề…'
          : '';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/exams" className="py-2 text-sm font-medium text-primary-600 hover:underline">
          ← Danh sách đề
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Tạo đề từ ảnh</h1>
      </div>
      <div
        className={`card flex flex-col gap-3 border-2 border-dashed p-4 sm:p-5 ${
          dragOver ? 'border-primary-400 bg-primary-50' : 'border-transparent'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={pickInput} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            className="btn-primary min-h-[44px]"
            disabled={busy || items.length + adding >= MAX_IMAGES}
            onClick={() => pickInput.current?.click()}
          >
            Chọn ảnh
          </button>
          {isTouch && (
            <button
              type="button"
              className="btn-secondary min-h-[44px]"
              disabled={busy || items.length + adding >= MAX_IMAGES}
              onClick={() => cameraInput.current?.click()}
            >
              Chụp ảnh
            </button>
          )}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Mỗi ảnh là một trang đề, tối đa {MAX_IMAGES} ảnh. Sắp xếp đúng thứ tự trang.</li>
          <li>Chụp thẳng từ trên xuống, đủ sáng, không bị bóng, giữ đủ 4 góc trang giấy.</li>
          <li className="max-sm:hidden">Có thể kéo thả ảnh vào đây hoặc dán ảnh chụp màn hình (Ctrl+V / ⌘V).</li>
        </ul>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Ảnh sẽ được gửi tới dịch vụ AI Gemini của Google để đọc chữ. Không chụp kèm thông tin cá nhân của học sinh.
        </p>
      </div>

      {error && <Alert message={error} />}
      {notice && <Alert message={notice} variant="info" />}
      {(items.length > 0 || adding > 0) && (
        <ol className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3 lg:grid-cols-4">
          {items.map((it, i) => (
            <li key={it.id} className="card flex min-w-0 flex-col gap-2 p-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold text-slate-700">Trang {i + 1}</span>
                <button
                  type="button"
                  className="min-h-[40px] min-w-[40px] rounded-lg text-sm font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => remove(it.id)}
                  aria-label={`Xóa trang ${i + 1}`}
                >
                  Xóa
                </button>
              </div>
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                <img
                  src={it.prepared.dataUrlForPreview}
                  alt={`Trang ${i + 1}`}
                  className="max-h-full max-w-full object-contain transition-transform"
                  style={{
                    transform: `rotate(${it.rotation}deg)${
                      it.rotation % 180 ? ` scale(${Math.min(it.prepared.width, it.prepared.height) / Math.max(it.prepared.width, it.prepared.height)})` : ''
                    }`,
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  className="btn-secondary min-h-[40px] px-0"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Đưa trang ${i + 1} lên trước`}
                  title="Lên trước"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-[40px] px-0"
                  disabled={busy}
                  onClick={() => rotate(it.id)}
                  aria-label={`Xoay trang ${i + 1}`}
                  title="Xoay 90°"
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-[40px] px-0"
                  disabled={busy || i === items.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Đưa trang ${i + 1} ra sau`}
                  title="Ra sau"
                >
                  →
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: adding }, (_, k) => (
            <li key={`adding-${k}`} className="card flex aspect-[3/4] items-center justify-center p-2">
              <Spinner size={24} />
            </li>
          ))}
        </ol>
      )}
      {items.length === 0 && adding === 0 ? (
        <p className="text-sm text-slate-500">Chưa có ảnh nào. Bấm "Chọn ảnh" để thêm ảnh các trang đề.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn-primary min-h-[48px] text-base sm:min-w-[12rem]"
            disabled={busy || adding > 0 || items.length === 0}
            onClick={handleRead}
          >
            {busy ? (
              <>
                <Spinner size={18} /> Đang đọc…
              </>
            ) : (
              `Đọc đề (${items.length} ảnh)`
            )}
          </button>
          {busy && (
            <p className="text-sm text-slate-600" role="status" aria-live="polite">
              {progressText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
