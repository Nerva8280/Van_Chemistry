import '../exam/exam.css';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import ExamPaper from '../components/exam/ExamPaper';
import AnswerKeyTable from '../components/exam/AnswerKeyTable';
import { PDF_HINT } from '../components/exam/VersionsStep';
import { examService, ExamFull } from '../services/examService';
import { getErrorMessage } from '../services/api';

/** Trang in A4 (ngoài Layout): ?codes=101,102 in các mã đề; ?answers=1 in bảng đáp án. */
export default function ExamPrint() {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const [exam, setExam] = useState<ExamFull | null>(null);
  const [error, setError] = useState('');
  const printed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const answersMode = params.get('answers') === '1';
  const codesParam = params.get('codes');

  useEffect(() => {
    examService
      .get(id)
      .then(setExam)
      .catch((err) => setError(getErrorMessage(err, 'Không mở được đề để in.')));
  }, [id]);

  const allVersions = exam?.data.versions ?? [];
  const wanted = codesParam ? codesParam.split(',').map((c) => c.trim()) : null;
  const versions = wanted ? allVersions.filter((v) => wanted.includes(v.code)) : allVersions;

  useEffect(() => {
    if (!exam || printed.current || !versions.length) return;
    printed.current = true;
    document.title = answersMode
      ? `Đáp án - ${exam.title}`
      : `${exam.title} - mã ${versions.map((v) => v.code).join(', ')}`;
    const imgs = Array.from(rootRef.current?.querySelectorAll('img') ?? []);
    Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
      )
    ).then(() => window.setTimeout(() => window.print(), 300));
  }, [exam, versions.length, answersMode]);

  if (error) {
    return (
      <div className="p-6">
        <Alert message={error} />
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="ex-print-root min-h-screen bg-slate-100 py-4">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-col gap-2 px-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            In / Lưu PDF
          </button>
          <button type="button" className="btn-secondary" onClick={() => window.close()}>
            Đóng trang này
          </button>
        </div>
        <Alert variant="info" message={PDF_HINT} />
      </div>

      <div ref={rootRef}>
        {!versions.length ? (
          <div className="no-print mx-auto max-w-[210mm] px-2">
            <Alert message="Không có mã đề nào để in. Hãy tạo mã đề ở bước 2." />
          </div>
        ) : answersMode ? (
          <div className="ex-sheet ex-paper">
            <div className="ex-center mb-3 font-bold">ĐÁP ÁN - {exam.title}</div>
            {versions.map((v) => (
              <div key={v.code} className="ex-question mb-4">
                <AnswerKeyTable doc={exam.data.doc} version={v} />
              </div>
            ))}
          </div>
        ) : (
          versions.map((v, i) => (
            <div key={v.code} className={`ex-sheet ${i > 0 ? 'ex-page-break' : ''}`}>
              <ExamPaper doc={exam.data.doc} version={v} code={v.code} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
