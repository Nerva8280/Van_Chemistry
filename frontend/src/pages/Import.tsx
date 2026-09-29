import { ChangeEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { importService, MoneyUnit } from '../services/importService';
import { getErrorMessage } from '../services/api';
import { ImportPreview, ImportWarning, TuitionImportResponse } from '../types';
import { formatCurrency, formatDate, formatDateRange } from '../utils/format';

/** Tiêu đề nhóm cảnh báo; thứ tự = thứ tự hiển thị (quan trọng trước). */
const WARNING_GROUPS: { type: string; title: string; important: boolean }[] = [
  { type: 'missing_header', title: 'Thiếu dòng tiêu đề', important: true },
  { type: 'invalid_period', title: 'Tiêu đề kỳ không đọc được', important: true },
  { type: 'total_mismatch', title: 'Tổng tiền không khớp với số ghi tay', important: true },
  { type: 'total_unassigned', title: 'Tổng ghi tay chưa rõ thuộc kỳ nào', important: true },
  { type: 'overpaid', title: 'Đóng nhiều hơn học phí', important: true },
  { type: 'partial_payment', title: 'Đóng một phần', important: true },
  { type: 'duplicate_name', title: 'Trùng tên học sinh', important: true },
  { type: 'similar_name', title: 'Tên học sinh gần giống nhau', important: true },
  { type: 'duplicate_stt', title: 'Trùng số thứ tự (STT)', important: true },
  { type: 'unusual_name', title: 'Tên học sinh bất thường', important: true },
  { type: 'invalid_value', title: 'Giá trị không hợp lệ', important: true },
  { type: 'stray_row', title: 'Dòng lạ (bị bỏ qua)', important: true },
  { type: 'total_match', title: 'Tổng tiền khớp với số ghi tay', important: false },
  { type: 'zero_value', title: 'Ô ghi số 0', important: false },
  { type: 'blank_cell', title: 'Ô để trống (chưa đóng)', important: false },
];

function StepCard({ step, title, children, muted }: { step: number; title: string; children: ReactNode; muted?: boolean }) {
  return (
    <section className={`card flex flex-col gap-4 ${muted ? 'opacity-60' : ''}`}>
      <h2 className="flex items-center gap-3 text-base font-semibold text-slate-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm text-white">
          {step}
        </span>
        Bước {step}: {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function WarningGroups({ warnings }: { warnings: ImportWarning[] }) {
  const groups = useMemo(() => {
    const known = new Set(WARNING_GROUPS.map((g) => g.type));
    const list = WARNING_GROUPS.map((g) => ({ ...g, items: warnings.filter((w) => w.type === g.type) }));
    const other = warnings.filter((w) => !known.has(w.type));
    if (other.length) list.push({ type: 'other', title: 'Cảnh báo khác', important: true, items: other });
    return list.filter((g) => g.items.length > 0);
  }, [warnings]);

  if (groups.length === 0) return <Alert variant="success" message="Không có cảnh báo nào. Dữ liệu trông ổn." />;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <details
          key={g.type}
          open={g.important}
          className={`rounded-lg ring-1 ring-inset ${g.important ? 'bg-warning-50/50 ring-warning-100' : 'bg-slate-50 ring-slate-100'}`}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-800">
            {g.title} <span className="ml-1 text-slate-500">({g.items.length})</span>
          </summary>
          <ul className="max-h-60 overflow-y-auto border-t border-slate-100 px-3 py-2 text-sm text-slate-700">
            {g.items.map((w, i) => (
              <li key={i} className="py-0.5">
                <span className="font-medium text-slate-600">
                  Sheet {w.sheet}
                  {w.row ? `, dòng ${w.row}` : ''}:
                </span>{' '}
                {w.message}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function PreviewView({ preview }: { preview: ImportPreview }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Số sheet" value={preview.sheets.length} />
        <SummaryCard label="Số lớp" value={preview.classes.length} />
        <SummaryCard label="Số học sinh" value={preview.studentCount} />
        <SummaryCard label="Số khoản học phí" value={preview.paymentCount} />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-800">Các lớp trong file</h3>
        {preview.classes.map((c) => (
          <div key={`${c.sheetName}-${c.name}`} className="overflow-hidden rounded-lg ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-900">{c.name}</span>
              <span className="text-slate-500">Sheet: {c.sheetName}</span>
              {c.exists ? <Badge color="slate">Đã có</Badge> : <Badge color="green">Mới</Badge>}
              <span className="text-slate-600">Học phí mặc định: {formatCurrency(c.defaultFee)}</span>
              <span className="text-slate-600">{c.studentCount} học sinh</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Kỳ</th>
                    <th className="px-3 py-2">Khoảng ngày</th>
                    <th className="px-3 py-2">Hạn đóng</th>
                    <th className="px-3 py-2 text-right">Số HS học</th>
                    <th className="px-3 py-2 text-right">Đã đóng</th>
                    <th className="px-3 py-2 text-right">Một phần</th>
                    <th className="px-3 py-2 text-right">Chưa đóng</th>
                    <th className="px-3 py-2 text-right">Tổng thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.periods.map((p) => (
                    <tr key={`${p.year}-${p.month}-${p.header}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-800" title={p.header}>
                        {p.name}
                        <span className="ml-1 text-xs font-normal text-slate-400">(tháng {p.month}/{p.year})</span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{formatDateRange(p.startDate, p.endDate) || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        {p.dueDate ? formatDate(p.dueDate) : <span className="text-slate-400">Chưa đặt hạn</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.enrolled}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-success-700">{p.paid}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-warning-700">{p.partial}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{p.unpaid}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(p.collected)}</td>
                    </tr>
                  ))}
                  {c.periods.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 text-center text-slate-400">
                        Không tìm thấy kỳ nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {preview.totals.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Đối chiếu dòng tổng</h3>
          <p className="text-xs text-slate-500">
            So sánh tổng tiền hệ thống tự cộng với dòng tổng bạn ghi tay trong file.
          </p>
          <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Cột</th>
                  <th className="px-3 py-2 text-right">Hệ thống tính</th>
                  <th className="px-3 py-2 text-right">Ghi tay</th>
                  <th className="px-3 py-2">Kết quả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.totals.map((t, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-slate-600">{t.sheet}</td>
                    <td className="px-3 py-1.5 text-slate-800">{t.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(t.computed)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {t.manual === null ? '—' : formatCurrency(t.manual)}
                    </td>
                    <td className="px-3 py-1.5">
                      {t.match === true ? (
                        <Badge color="green">Khớp</Badge>
                      ) : t.match === false ? (
                        <Badge color="red">Lệch</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Cảnh báo <span className="font-normal text-slate-500">({preview.warnings.length})</span>
        </h3>
        <p className="text-xs text-slate-500">
          Hãy đọc các nhóm đang mở. Các nhóm thu gọn thường là thông tin bình thường, bấm vào để xem.
        </p>
        <WarningGroups warnings={preview.warnings} />
      </div>
    </div>
  );
}

export default function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [unit, setUnit] = useState<MoneyUnit>(1000);
  const [checking, setChecking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<TuitionImportResponse['imported'] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function resetResults() {
    setPreview(null);
    setResult(null);
    setError('');
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    resetResults();
  }

  function yearNumber(): number | null {
    const y = Number(year);
    return Number.isInteger(y) && y >= 2000 && y <= 3000 ? y : null;
  }

  async function handleCheck() {
    if (!file) return setError('Vui lòng chọn file Excel (.xlsx).');
    const y = yearNumber();
    if (!y) return setError('Năm không hợp lệ.');
    setChecking(true);
    resetResults();
    try {
      const res = await importService.preview(file, y, unit);
      setPreview(res.preview);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể kiểm tra file. Vui lòng thử lại.'));
    } finally {
      setChecking(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    const y = yearNumber();
    if (!y) return setError('Năm không hợp lệ.');
    setCommitting(true);
    setError('');
    try {
      const res = await importService.commit(file, y, unit);
      setPreview(res.preview);
      setResult(
        res.imported ?? { classesCreated: 0, studentsCreated: 0, studentsUpdated: 0, payments: 0 }
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể nhập dữ liệu. Vui lòng thử lại.'));
    } finally {
      setCommitting(false);
    }
  }

  async function handleTemplate() {
    setDownloading(true);
    setError('');
    try {
      await importService.downloadTemplate();
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể tải file mẫu.'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Nhập dữ liệu</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nhập bảng học phí từ file Excel: mỗi sheet có các lớp, mỗi cột là một kỳ (ví dụ "Tháng 7 (15/6-14/7)"), mỗi
          dòng là một học sinh.
        </p>
      </div>

      {error && <Alert message={error} />}

      <StepCard step={1} title="Chọn file và cài đặt">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="imp-file">
              File Excel (.xlsx)
            </label>
            <input ref={fileRef} id="imp-file" type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary shrink-0" onClick={() => fileRef.current?.click()}>
                Chọn file
              </button>
              <span className="truncate text-sm text-slate-600" title={file?.name}>
                {file ? file.name : 'Chưa chọn file'}
              </span>
            </div>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-primary-600 hover:underline disabled:opacity-50"
              onClick={handleTemplate}
              disabled={downloading}
            >
              {downloading ? 'Đang tải...' : 'Tải file mẫu'}
            </button>
          </div>
          <div>
            <label className="label" htmlFor="imp-year">
              Năm
            </label>
            <input
              id="imp-year"
              className="input"
              type="number"
              min={2000}
              max={3000}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                resetResults();
              }}
            />
            <p className="mt-1 text-xs text-slate-400">Năm của các kỳ học phí trong file.</p>
          </div>
          <div>
            <span className="label">Đơn vị tiền trong file</span>
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unit"
                  className="accent-primary-500"
                  checked={unit === 1000}
                  onChange={() => {
                    setUnit(1000);
                    resetResults();
                  }}
                />
                Nghìn đồng (500 = 500.000đ)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unit"
                  className="accent-primary-500"
                  checked={unit === 1}
                  onChange={() => {
                    setUnit(1);
                    resetResults();
                  }}
                />
                Đồng (500.000 = 500.000đ)
              </label>
            </div>
          </div>
        </div>
        <div>
          <button type="button" className="btn-primary" onClick={handleCheck} disabled={!file || checking || committing}>
            {checking ? 'Đang kiểm tra...' : 'Kiểm tra dữ liệu'}
          </button>
          <p className="mt-1 text-xs text-slate-400">Bước này chỉ đọc file để bạn xem trước, chưa lưu gì vào hệ thống.</p>
        </div>
      </StepCard>

      <StepCard step={2} title="Xem trước dữ liệu" muted={!preview}>
        {checking ? (
          <div className="flex justify-center py-10">
            <Spinner size={28} />
          </div>
        ) : preview ? (
          <PreviewView preview={preview} />
        ) : (
          <p className="text-sm text-slate-500">Chọn file ở Bước 1 rồi bấm "Kiểm tra dữ liệu".</p>
        )}
      </StepCard>

      <StepCard step={3} title="Xác nhận nhập" muted={!preview}>
        <p className="text-sm text-slate-600">
          Nhập lại cùng một file sẽ cập nhật dữ liệu cũ (so khớp lớp, kỳ, học sinh theo tên), không tạo bản trùng.
        </p>
        {result ? (
          <div className="flex flex-col gap-3">
            <Alert variant="success" message="Đã nhập dữ liệu thành công." />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard label="Lớp mới tạo" value={result.classesCreated} />
              <SummaryCard label="Học sinh mới" value={result.studentsCreated} />
              <SummaryCard label="Học sinh cập nhật" value={result.studentsUpdated} />
              <SummaryCard label="Khoản học phí" value={result.payments} />
            </div>
            <div>
              <Link to="/tuition" className="btn-primary">
                Xem bảng học phí
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleCommit}
              disabled={!preview || !file || committing || checking}
            >
              {committing ? 'Đang nhập...' : 'Xác nhận nhập dữ liệu'}
            </button>
          </div>
        )}
      </StepCard>
    </div>
  );
}
