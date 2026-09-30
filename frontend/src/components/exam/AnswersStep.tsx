import { ExamData } from '../../exam/types';
import { countMissingInVersion } from '../../exam/versions';
import AnswerKeyTable from './AnswerKeyTable';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { PDF_HINT } from './VersionsStep';

interface AnswersStepProps {
  data: ExamData;
  onPrintAnswers: () => void;
  onGoGenerate: () => void;
}

export default function AnswersStep({ data, onPrintAnswers, onGoGenerate }: AnswersStepProps) {
  const versions = data.versions;
  if (!versions.length) {
    return (
      <div className="card flex flex-col items-center gap-3">
        <EmptyState message="Chưa có mã đề nào nên chưa có bảng đáp án." />
        <button type="button" className="btn-primary" onClick={onGoGenerate}>
          Sang bước 2. Tạo mã đề
        </button>
      </div>
    );
  }

  const missing = versions
    .map((v) => ({ code: v.code, n: countMissingInVersion(data.doc, v) }))
    .filter((x) => x.n > 0);

  return (
    <div className="flex flex-col gap-4">
      {missing.length > 0 && (
        <Alert
          message={`Còn thiếu đáp án: ${missing
            .map((m) => `mã ${m.code} thiếu ${m.n} câu`)
            .join('; ')}. Hãy chọn đáp án ở bước 1 (hoặc đáp án riêng ở bước 3). Ô thiếu được tô đỏ.`}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onPrintAnswers}>
          In bảng đáp án
        </button>
      </div>
      <Alert variant="info" message={PDF_HINT} />
      <div className="grid gap-4 lg:grid-cols-2">
        {versions.map((v) => (
          <div key={v.code} className="card overflow-x-auto">
            <AnswerKeyTable doc={data.doc} version={v} highlightMissing />
          </div>
        ))}
      </div>
    </div>
  );
}
