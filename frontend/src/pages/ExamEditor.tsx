import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import ContentStep from '../components/exam/ContentStep';
import GenerateStep from '../components/exam/GenerateStep';
import VersionsStep from '../components/exam/VersionsStep';
import AnswersStep from '../components/exam/AnswersStep';
import { examService } from '../services/examService';
import { getErrorMessage } from '../services/api';
import { DEFAULT_SETTINGS, ExamData } from '../exam/types';

type Step = 1 | 2 | 3 | 4;
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: '1. Nội dung gốc' },
  { step: 2, label: '2. Tạo mã đề' },
  { step: 3, label: '3. Các mã đề' },
  { step: 4, label: '4. Đáp án' },
];

function normalize(data: ExamData): ExamData {
  return {
    ...data,
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    versions: Array.isArray(data.versions) ? data.versions : [],
  };
}

export default function ExamEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<ExamData | null>(null);
  const [title, setTitle] = useState('');
  const [step, setStep] = useState<Step>(1);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState('');
  const [showWarnings, setShowWarnings] = useState(false);
  const [printError, setPrintError] = useState('');

  const dataRef = useRef<ExamData | null>(null);
  const titleRef = useRef('');
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    examService
      .get(id)
      .then((ex) => {
        if (cancelled) return;
        const d = normalize(ex.data);
        dataRef.current = d;
        titleRef.current = ex.title;
        setData(d);
        setTitle(ex.title);
        setSavedAt(new Date(ex.updatedAt));
        setSaveState('saved');
      })
      .catch((err) => !cancelled && setLoadError(getErrorMessage(err, 'Không mở được đề.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const doSave = useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      if (!dirty.current || !dataRef.current) return;
      dirty.current = false;
      setSaveState('saving');
      try {
        const t = titleRef.current.trim();
        await examService.update(id, { data: dataRef.current, ...(t ? { title: t.slice(0, 200) } : {}) });
        setSavedAt(new Date());
        setSaveError('');
        setSaveState(dirty.current ? 'pending' : 'saved');
      } catch (err) {
        dirty.current = true;
        setSaveState('error');
        setSaveError(getErrorMessage(err, 'Không lưu được thay đổi.'));
      }
    });
    return chain.current;
  }, [id]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSaveState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      doSave();
    }, 1500);
  }, [doSave]);

  const update = useCallback(
    (fn: (d: ExamData) => ExamData) => {
      const cur = dataRef.current;
      if (!cur) return;
      const next = fn(cur);
      dataRef.current = next;
      setData(next);
      schedule();
    },
    [schedule]
  );

  // Lưu nốt khi rời trang; cảnh báo nếu đóng tab khi còn thay đổi chưa lưu.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(timer.current);
      if (dirty.current) doSave();
    };
  }, [doSave]);

  async function openPrint(query: string) {
    setPrintError('');
    const w = window.open('', '_blank');
    window.clearTimeout(timer.current);
    await doSave();
    if (dirty.current) {
      w?.close();
      setPrintError('Chưa lưu được thay đổi mới nhất nên chưa thể in. Vui lòng kiểm tra mạng rồi thử lại.');
      return;
    }
    const url = `/exams/${id}/print?${query}`;
    if (w) w.location.href = url;
    else navigate(url);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Alert message={loadError || 'Không mở được đề.'} />
        <Link to="/exams" className="text-sm font-medium text-primary-600 hover:underline">
          ← Về danh sách đề
        </Link>
      </div>
    );
  }

  const warnings = data.parseWarnings ?? [];
  const titleEmpty = !title.trim();

  let saveText = '';
  if (saveState === 'pending' || saveState === 'saving') saveText = 'Đang lưu…';
  else if (saveState === 'saved' && savedAt) saveText = `Đã lưu lúc ${format(savedAt, 'HH:mm')}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Điện thoại: hàng 1 = "← Danh sách đề" + trạng thái lưu, hàng 2 = ô tên đề rộng hết. Từ sm giữ nguyên một hàng. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-3">
        <Link to="/exams" className="order-1 py-2 text-sm font-medium text-primary-600 hover:underline sm:py-0">
          ← Danh sách đề
        </Link>
        <div className="order-3 flex min-w-0 basis-full flex-col sm:order-2 sm:min-w-[16rem] sm:flex-1 sm:basis-0">
          <input
            className="input text-base font-semibold"
            value={title}
            maxLength={200}
            aria-label="Tên đề"
            placeholder="Tên đề"
            onChange={(e) => {
              setTitle(e.target.value);
              titleRef.current = e.target.value;
              schedule();
            }}
          />
          {titleEmpty && <span className="mt-1 text-xs text-danger-600">Tên đề không được để trống.</span>}
        </div>
        <div className="order-2 ml-auto text-right text-sm sm:order-3 sm:ml-0 sm:text-left">
          {saveState === 'error' ? (
            <span className="flex items-center gap-2 text-danger-600">
              Chưa lưu được.
              <button type="button" className="font-medium underline" onClick={() => doSave()}>
                Thử lưu lại
              </button>
            </span>
          ) : (
            <span className="text-slate-500">{saveText}</span>
          )}
        </div>
      </div>

      {saveError && saveState === 'error' && <Alert message={saveError} />}
      {printError && <Alert message={printError} />}

      {warnings.length > 0 && (
        <div className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 ring-1 ring-inset ring-warning-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="font-medium hover:underline" onClick={() => setShowWarnings((s) => !s)}>
              Có {warnings.length} lưu ý khi đọc file Word ({showWarnings ? 'bấm để thu gọn' : 'bấm để xem'})
            </button>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => update((d) => ({ ...d, parseWarnings: [] }))}
            >
              Đã xem, ẩn đi
            </button>
          </div>
          {showWarnings && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Điện thoại: lưới 2×2 nút bước thay vì tab xuống dòng lộn xộn. Từ sm giữ kiểu tab cũ. */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-sm:border-b-0">
        {STEPS.map((s) => (
          <button
            key={s.step}
            type="button"
            aria-current={step === s.step ? 'step' : undefined}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-medium max-sm:mb-0 max-sm:min-h-[40px] max-sm:rounded-lg max-sm:px-2 ${
              step === s.step
                ? 'border-slate-200 border-b-white bg-white text-primary-600 max-sm:border-primary-200 max-sm:bg-primary-50 max-sm:shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-700 max-sm:border-slate-200 max-sm:bg-white'
            }`}
            onClick={() => setStep(s.step)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {step === 1 && <ContentStep data={data} update={update} />}
      {step === 2 && <GenerateStep data={data} update={update} onGenerated={() => setStep(3)} />}
      {step === 3 && (
        <VersionsStep
          data={data}
          update={update}
          onGoGenerate={() => setStep(2)}
          onPrint={(codes) => openPrint(`codes=${encodeURIComponent(codes.join(','))}`)}
        />
      )}
      {step === 4 && (
        <AnswersStep
          data={data}
          onGoGenerate={() => setStep(2)}
          onPrintAnswers={() => openPrint('answers=1')}
        />
      )}
    </div>
  );
}
