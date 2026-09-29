import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PaymentEditModal, { PaymentEditTarget, paidDateText } from '../components/tuition/PaymentEditModal';
import DueDateModal, { DueDateEntry } from '../components/tuition/DueDateModal';
import CreatePeriodsModal, { CreatePeriodCandidate } from '../components/tuition/CreatePeriodsModal';
import { tuitionService } from '../services/tuitionService';
import { classService } from '../services/classService';
import { getErrorMessage } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import {
  Class,
  Payment,
  PaymentStatus,
  Period,
  TuitionColumn,
  TuitionGridClass,
  TuitionGridResponse,
  TuitionGridStudent,
} from '../types';
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatNumber,
  formatShortRange,
  toDateInput,
} from '../utils/format';
import { STATUS_CELL_CLASS, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../utils/status';

type ConfirmState =
  | { kind: 'unpay'; payment: Payment; label: string }
  | { kind: 'completePartial'; payment: Payment; label: string }
  | { kind: 'add'; studentId: string; periodId: string; label: string }
  | { kind: 'bulk'; ids: string[]; month: number };

const colKey = (c: { year: number; month: number }) => `${c.year}-${c.month}`;

function periodOf(cls: TuitionGridClass | undefined, col: TuitionColumn): Period | undefined {
  return cls?.periods.find((p) => p.year === col.year && p.month === col.month);
}

function paymentOf(student: TuitionGridStudent, col: TuitionColumn): Payment | undefined {
  return student.payments.find((p) => p.year === col.year && p.month === col.month);
}

function periodTitle(period: Period | undefined, fallbackMonth: number): string {
  if (!period) return `Tháng ${fallbackMonth}`;
  const range = formatDateRange(period.startDate, period.endDate);
  return range ? `${period.name} (${range})` : period.name;
}

function cellTooltip(payment: Payment, period: Period | undefined): string {
  const lines = [periodTitle(period, payment.month)];
  if (period) lines.push(`Hạn đóng: ${period.dueDate ? formatDate(period.dueDate) : 'Chưa đặt hạn'}`);
  lines.push(`Trạng thái: ${STATUS_LABEL[payment.status]}`);
  lines.push(`Đã đóng: ${formatCurrency(payment.paidAmount)} / ${formatCurrency(payment.expectedAmount)}`);
  const dateText = paidDateText(payment);
  if (dateText) lines.push(`Ngày đóng: ${dateText}`);
  if (payment.note) lines.push(`Ghi chú: ${payment.note}`);
  lines.push('Bấm vào chữ để sửa số tiền, ngày đóng.');
  return lines.join('\n');
}

/** Tháng mặc định cho thao tác hàng loạt: tháng gần nhất đã bắt đầu. */
function defaultBulkMonth(columns: TuitionColumn[]): string {
  if (columns.length === 0) return '';
  const now = new Date();
  const started = columns.filter(
    (c) => c.year < now.getFullYear() || (c.year === now.getFullYear() && c.month <= now.getMonth() + 1)
  );
  const pick = started.length ? started[started.length - 1] : columns[0];
  return String(pick.month);
}

const QUARTER_LABELS = ['Tháng 1–3', 'Tháng 4–6', 'Tháng 7–9', 'Tháng 10–12'];

/** Kỳ gần nhất của lớp trước tháng `col` (trong trang đang xem hoặc trước đó). */
function previousPeriodEnd(cls: TuitionGridClass, col: TuitionColumn): string | null {
  const inPage = cls.periods
    .filter((p) => p.year === col.year && p.month < col.month)
    .sort((a, b) => b.month - a.month)[0];
  const prev = inPage ?? cls.previousPeriod;
  return prev ? prev.endDate ?? prev.dueDate ?? prev.startDate : null;
}

export default function Tuition() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(today.getMonth() / 3) + 1);
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<'' | PaymentStatus>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const [data, setData] = useState<TuitionGridResponse | null>(null);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<PaymentEditTarget | null>(null);
  const [dueColumn, setDueColumn] = useState<TuitionColumn | null>(null);
  const [createTarget, setCreateTarget] = useState<{ column: TuitionColumn; onlyClassId: string | null } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMonth, setBulkMonth] = useState('');

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await tuitionService.grid({
        year,
        quarter,
        classId,
        status: status || undefined,
        search: debouncedSearch,
      });
      if (id !== requestId.current) return;
      setData(res);
    } catch (err) {
      if (id === requestId.current) setError(getErrorMessage(err, 'Không thể tải bảng học phí.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [year, quarter, classId, status, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    classService
      .list()
      .then(setAllClasses)
      .catch(() => {
        // Không bắt buộc: danh sách lớp cho bộ lọc sẽ lấy từ bảng học phí.
      });
  }, []);

  const columns = data?.columns ?? [];

  useEffect(() => {
    setBulkMonth((prev) =>
      prev && columns.some((c) => String(c.month) === prev) ? prev : defaultBulkMonth(columns)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const classById = useMemo(() => new Map((data?.classes ?? []).map((c) => [c.id, c])), [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    return data.classes
      .map((cls) => ({ cls, students: data.students.filter((s) => s.classId === cls.id) }))
      .filter((g) => g.students.length > 0);
  }, [data]);

  const visibleStudents = useMemo(() => groups.flatMap((g) => g.students), [groups]);
  const grouped = !classId && groups.length > 0;

  /** Dòng phụ của tiêu đề cột: chỉ hiện khi mọi lớp đang hiển thị có cùng kỳ. */
  const columnSubtitles = useMemo(() => {
    const shown = groups.length ? groups.map((g) => g.cls) : data?.classes ?? [];
    const result = new Map<string, string>();
    for (const col of columns) {
      const periods = shown.map((c) => periodOf(c, col));
      if (periods.length === 0 || periods.some((p) => !p)) continue;
      const first = periods[0]!;
      const same = periods.every(
        (p) => p!.name === first.name && p!.startDate === first.startDate && p!.endDate === first.endDate
      );
      if (!same) continue;
      const range = formatShortRange(first.startDate, first.endDate);
      const namePart = first.name.trim().toLowerCase() === `tháng ${col.month}` ? '' : first.name;
      const text = [namePart, range].filter(Boolean).join(' · ');
      if (text) result.set(colKey(col), text);
    }
    return result;
  }, [columns, groups, data]);

  const shownClasses = useMemo(() => (groups.length ? groups.map((g) => g.cls) : data?.classes ?? []), [groups, data]);

  /** Dòng hạn đóng dưới tiêu đề cột. */
  const columnDue = useMemo(() => {
    const result = new Map<string, { text: string; muted: boolean }>();
    for (const col of columns) {
      const periods = shownClasses.map((c) => periodOf(c, col)).filter((p): p is Period => !!p);
      if (periods.length === 0) continue;
      const dues = new Set(periods.map((p) => toDateInput(p.dueDate)));
      if (dues.size > 1) result.set(colKey(col), { text: 'Hạn: nhiều ngày', muted: false });
      else if (periods[0].dueDate) result.set(colKey(col), { text: `Hạn: ${formatDate(periods[0].dueDate)}`, muted: false });
      else result.set(colKey(col), { text: 'Chưa đặt hạn', muted: true });
    }
    return result;
  }, [columns, shownClasses]);

  const dueEntries: DueDateEntry[] = useMemo(() => {
    if (!dueColumn) return [];
    return shownClasses
      .map((c) => ({ className: c.name, period: periodOf(c, dueColumn) }))
      .filter((e): e is DueDateEntry => !!e.period);
  }, [dueColumn, shownClasses]);

  /** Lớp đang hiển thị chưa có kỳ trong tháng `col` (để tạo kỳ mới). */
  function missingClasses(col: TuitionColumn): CreatePeriodCandidate[] {
    return shownClasses
      .filter((c) => !periodOf(c, col))
      .map((c) => ({ classId: c.id, className: c.name, previousEnd: previousPeriodEnd(c, col) }));
  }

  const createCandidates = useMemo(
    () => (createTarget ? missingClasses(createTarget.column) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createTarget, shownClasses]
  );
  const pageHasPeriods = shownClasses.some((c) => c.periods.length > 0);

  const classOptions: { id: string; name: string }[] = allClasses.length ? allClasses : data?.classes ?? [];

  const yearOptions = data?.years?.length ? data.years : [year];
  const hasFilters = !!(classId || status || search);

  function goToPage(nextYear: number, nextQuarter: number) {
    setSelected(new Set());
    setYear(nextYear);
    setQuarter(nextQuarter);
  }
  const goPrev = () => (quarter === 1 ? goToPage(year - 1, 4) : goToPage(year, quarter - 1));
  const goNext = () => (quarter === 4 ? goToPage(year + 1, 1) : goToPage(year, quarter + 1));

  // ---------- Cập nhật dữ liệu cục bộ ----------

  function patchLocal(updated: Payment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students.map((s) => {
              if (s.id !== updated.studentId) return s;
              const exists = s.payments.some((p) => p.id === updated.id);
              return {
                ...s,
                payments: exists
                  ? s.payments.map((p) => (p.id === updated.id ? updated : p))
                  : [...s.payments, updated],
              };
            }),
          }
        : prev
    );
  }

  function removeLocal(payment: Payment) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students.map((s) =>
              s.id !== payment.studentId ? s : { ...s, payments: s.payments.filter((p) => p.id !== payment.id) }
            ),
          }
        : prev
    );
  }

  function setPendingFlag(id: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function markPaidOptimistic(payment: Payment) {
    setError('');
    setInfo('');
    const previous = payment;
    patchLocal({
      ...payment,
      isPaid: true,
      paidAmount: payment.expectedAmount,
      status: 'paid',
      paidDate: payment.paidDate ?? new Date().toISOString(),
    });
    setPendingFlag(payment.id, true);
    try {
      const updated = await tuitionService.updatePayment(payment.id, { isPaid: true });
      patchLocal(updated);
    } catch (err) {
      patchLocal(previous);
      setError(getErrorMessage(err, 'Không thể đánh dấu đã đóng. Vui lòng thử lại.'));
    } finally {
      setPendingFlag(payment.id, false);
    }
  }

  function handleCheckbox(student: TuitionGridStudent, payment: Payment, period: Period | undefined) {
    const label = `${student.fullName} – ${periodTitle(period, payment.month)}`;
    if (payment.isPaid) {
      setConfirm({ kind: 'unpay', payment, label });
    } else if (payment.paidAmount > 0) {
      setConfirm({ kind: 'completePartial', payment, label });
    } else {
      markPaidOptimistic(payment);
    }
  }

  function handleBulkClick() {
    setInfo('');
    const m = Number(bulkMonth);
    const col = columns.find((c) => c.month === m);
    if (!col) return;
    const ids = visibleStudents
      .filter((s) => selected.has(s.id))
      .map((s) => paymentOf(s, col))
      .filter((p): p is Payment => !!p && !p.isPaid)
      .map((p) => p.id);
    if (ids.length === 0) {
      setInfo(`Các học sinh đã chọn không có khoản nào chưa đóng trong Tháng ${m}.`);
      return;
    }
    setConfirm({ kind: 'bulk', ids, month: m });
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmLoading(true);
    setError('');
    try {
      if (confirm.kind === 'unpay') {
        const updated = await tuitionService.updatePayment(confirm.payment.id, { isPaid: false });
        patchLocal(updated);
      } else if (confirm.kind === 'completePartial') {
        const updated = await tuitionService.updatePayment(confirm.payment.id, { isPaid: true });
        patchLocal(updated);
      } else if (confirm.kind === 'add') {
        const created = await tuitionService.createPayment(confirm.studentId, confirm.periodId);
        patchLocal(created);
      } else if (confirm.kind === 'bulk') {
        const res = await tuitionService.bulkPaid(confirm.ids);
        setSelected(new Set());
        setInfo(`Đã đánh dấu ${res.updated.length} khoản là đã đóng.`);
        await load();
      }
      setConfirm(null);
    } catch (err) {
      setConfirm(null);
      setError(getErrorMessage(err, 'Không thể cập nhật học phí. Vui lòng thử lại.'));
    } finally {
      setConfirmLoading(false);
    }
  }

  // ---------- Chọn hàng loạt ----------

  const selectedVisible = visibleStudents.filter((s) => selected.has(s.id));
  const allSelected = visibleStudents.length > 0 && selectedVisible.length === visibleStudents.length;
  const someSelected = selectedVisible.length > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleStudents(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function resetFilters() {
    setClassId('');
    setStatus('');
    setSearch('');
  }

  // ---------- Hiển thị ô ----------

  function renderCell(student: TuitionGridStudent, cls: TuitionGridClass | undefined, col: TuitionColumn) {
    const key = colKey(col);
    const payment = paymentOf(student, col);
    const period = periodOf(cls, col) ?? (payment ? cls?.periods.find((p) => p.id === payment.periodId) : undefined);

    if (!payment) {
      if (!period) {
        return <td key={key} className="border-b border-l border-slate-100 bg-white" aria-hidden="true" />;
      }
      return (
        <td key={key} className="border-b border-l border-slate-100 bg-white p-0">
          <button
            type="button"
            className="flex h-full min-h-[44px] w-full items-center justify-center text-slate-300 hover:bg-slate-50 hover:text-slate-500"
            title={`${periodTitle(period, col.month)}\nHọc sinh không học kỳ này. Bấm để thêm vào kỳ.`}
            aria-label={`Thêm ${student.fullName} vào ${period.name}`}
            onClick={() =>
              setConfirm({
                kind: 'add',
                studentId: student.id,
                periodId: period.id,
                label: `${student.fullName} – ${periodTitle(period, col.month)}`,
              })
            }
          >
            —
          </button>
        </td>
      );
    }

    const isPending = pending.has(payment.id);
    const openEdit = () =>
      setEditTarget({ studentName: student.fullName, className: cls?.name ?? '', payment, period });

    return (
      <td
        key={key}
        className={`border-b border-l border-white px-1.5 py-1 align-middle ${STATUS_CELL_CLASS[payment.status]}`}
        title={cellTooltip(payment, period)}
      >
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer accent-success-500 disabled:cursor-wait"
            checked={payment.isPaid}
            disabled={isPending}
            onChange={() => handleCheckbox(student, payment, period)}
            aria-label={`${payment.isPaid ? 'Bỏ đánh dấu đã đóng' : 'Đánh dấu đã đóng'}: ${student.fullName}, ${
              period?.name ?? `Tháng ${col.month}`
            }`}
          />
          <button
            type="button"
            onClick={openEdit}
            className="min-w-0 rounded text-left text-[11px] leading-tight hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            aria-label={`Cập nhật học phí: ${student.fullName}, ${period?.name ?? `Tháng ${col.month}`}`}
          >
            <span className="block whitespace-nowrap font-medium">{STATUS_LABEL[payment.status]}</span>
            {payment.status === 'partial' && (
              <span className="block whitespace-nowrap tabular-nums">
                {formatNumber(payment.paidAmount)} / {formatNumber(payment.expectedAmount)}
              </span>
            )}
          </button>
        </div>
      </td>
    );
  }

  function renderStudentRow(student: TuitionGridStudent, cls: TuitionGridClass | undefined) {
    const isSelected = selected.has(student.id);
    const stickyBg = isSelected ? 'bg-primary-50' : 'bg-white group-hover:bg-slate-50';
    return (
      <tr key={student.id} className="group">
        <td className={`sticky left-0 z-10 w-9 min-w-[36px] border-b border-slate-100 px-2 text-center ${stickyBg}`}>
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-primary-500"
            checked={isSelected}
            onChange={(e) => toggleStudents([student.id], e.target.checked)}
            aria-label={`Chọn ${student.fullName}`}
          />
        </td>
        <td
          className={`sticky left-9 z-10 w-10 min-w-[40px] border-b border-slate-100 px-1 text-center text-xs tabular-nums text-slate-500 ${stickyBg}`}
        >
          {student.stt ?? ''}
        </td>
        <td
          className={`sticky left-[76px] z-10 w-40 min-w-[160px] max-w-[160px] border-b border-r border-slate-200 px-2 py-1.5 sm:w-52 sm:min-w-[208px] sm:max-w-[208px] ${stickyBg}`}
        >
          <p className="truncate text-sm font-medium text-slate-800" title={student.fullName}>
            {student.fullName}
            {!student.active && <span className="ml-1 text-xs font-normal text-slate-400">(nghỉ)</span>}
          </p>
          <p className="truncate text-[11px] text-slate-400">{cls?.name}</p>
        </td>
        {columns.map((col) => renderCell(student, cls, col))}
      </tr>
    );
  }

  // ---------- Hộp xác nhận ----------

  let confirmTitle = '';
  let confirmMessage = '';
  let confirmLabel = 'Xác nhận';
  let confirmDanger = false;
  if (confirm?.kind === 'unpay') {
    confirmTitle = 'Bỏ trạng thái đã đóng';
    confirmMessage = `${confirm.label}. Bỏ trạng thái đã đóng? Ngày đóng và số tiền đã ghi sẽ bị xóa.`;
    confirmLabel = 'Bỏ đã đóng';
    confirmDanger = true;
  } else if (confirm?.kind === 'completePartial') {
    confirmTitle = 'Xác nhận đã đóng đủ';
    confirmMessage = `${confirm.label}. Học sinh mới đóng ${formatCurrency(confirm.payment.paidAmount)} / ${formatCurrency(
      confirm.payment.expectedAmount
    )}. Xác nhận đã đóng đủ?`;
    confirmLabel = 'Đã đóng đủ';
  } else if (confirm?.kind === 'add') {
    confirmTitle = 'Thêm học sinh vào kỳ';
    confirmMessage = `Thêm học sinh vào kỳ này? ${confirm.label}.`;
    confirmLabel = 'Thêm vào kỳ';
  } else if (confirm?.kind === 'bulk') {
    confirmTitle = 'Đánh dấu hàng loạt';
    confirmMessage = `Đánh dấu ${confirm.ids.length} khoản là đã đóng? (Tháng ${confirm.month})`;
    confirmLabel = 'Đánh dấu đã đóng';
  }


  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Học phí</h1>
          {loading && data && <Spinner size={18} />}
        </div>
        {data && <p className="text-sm text-slate-500">{visibleStudents.length} học sinh</p>}
      </div>

      {/* Phân trang: mỗi trang 3 tháng, một năm 4 trang */}
      <nav className="card flex flex-wrap items-center gap-2 p-3" aria-label="Chọn quý">
        <button type="button" className="btn-secondary px-3" onClick={goPrev} aria-label="Trang trước">
          ‹ Trước
        </button>
        <div className="flex flex-wrap gap-1">
          {QUARTER_LABELS.map((label, i) => {
            const q = i + 1;
            const active = q === quarter;
            return (
              <button
                key={q}
                type="button"
                onClick={() => goToPage(year, q)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn-secondary px-3" onClick={goNext} aria-label="Trang sau">
          Sau ›
        </button>
        <span className="ml-auto text-sm font-semibold text-slate-800">
          {QUARTER_LABELS[quarter - 1]} / {year}
        </span>
      </nav>

      {/* Bộ lọc */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label text-xs" htmlFor="f-year">
            Năm
          </label>
          <select
            id="f-year"
            className="input w-auto"
            value={year}
            onChange={(e) => goToPage(Number(e.target.value), quarter)}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="f-class">
            Lớp
          </label>
          <select id="f-class" className="input w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Tất cả lớp</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="f-status">
            Trạng thái
          </label>
          <select
            id="f-status"
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | PaymentStatus)}
          >
            <option value="">Tất cả</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label text-xs" htmlFor="f-search">
            Tìm học sinh
          </label>
          <input
            id="f-search"
            className="input"
            placeholder="Nhập tên học sinh..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {hasFilters && (
          <button type="button" className="btn-secondary" onClick={resetFilters}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Chú thích màu */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-400">—</span> Không học kỳ này (bấm để thêm)
        </span>
        <span className="text-slate-400">Bấm vào chữ trong ô để sửa số tiền, ngày đóng.</span>
      </div>

      {error && <Alert message={error} />}
      {info && <Alert variant="info" message={info} />}
      {data && !loading && visibleStudents.length > 0 && !pageHasPeriods && (
        <Alert
          variant="info"
          message={`${QUARTER_LABELS[quarter - 1]}/${year} chưa có kỳ học phí nào. Bấm "+ Tạo kỳ" dưới tên tháng để tạo kỳ cho các lớp.`}
        />
      )}

      {/* Thanh thao tác hàng loạt */}
      {selectedVisible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary-50 px-4 py-3 ring-1 ring-primary-100">
          <span className="text-sm font-medium text-primary-700">Đã chọn {selectedVisible.length} học sinh</span>
          <select
            className="input w-auto bg-white"
            value={bulkMonth}
            onChange={(e) => setBulkMonth(e.target.value)}
            aria-label="Chọn tháng để đánh dấu"
          >
            {columns.map((c) => (
              <option key={colKey(c)} value={c.month}>
                Tháng {c.month}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={handleBulkClick} disabled={!bulkMonth}>
            Đánh dấu đã đóng
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="card p-0">
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : !data ? (
          <div className="p-6">
            <EmptyState message="Không tải được bảng học phí." />
          </div>
        ) : data.classes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <EmptyState message="Chưa có lớp học nào." />
            <p className="text-sm text-slate-500">
              Hãy vào{' '}
              <Link to="/classes" className="font-medium text-primary-600 hover:underline">
                Lớp học
              </Link>{' '}
              để thêm lớp, hoặc{' '}
              <Link to="/import" className="font-medium text-primary-600 hover:underline">
                Nhập dữ liệu
              </Link>{' '}
              từ file Excel.
            </p>
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Không có học sinh nào phù hợp với bộ lọc." />
          </div>
        ) : (
          <div className="max-h-[72vh] overflow-auto rounded-xl">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-9 min-w-[36px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-center">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary-500"
                      checked={allSelected}
                      onChange={(e) => toggleStudents(visibleStudents.map((s) => s.id), e.target.checked)}
                      aria-label="Chọn tất cả học sinh"
                      title="Chọn tất cả"
                    />
                  </th>
                  <th className="sticky left-9 top-0 z-30 w-10 min-w-[40px] border-b border-slate-200 bg-slate-50 px-1 py-2 text-center">
                    STT
                  </th>
                  <th className="sticky left-[76px] top-0 z-30 w-40 min-w-[160px] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 sm:w-52 sm:min-w-[208px]">
                    Tên học sinh
                  </th>
                  {columns.map((col) => {
                    const sub = columnSubtitles.get(colKey(col));
                    const due = columnDue.get(colKey(col));
                    return (
                      <th
                        key={colKey(col)}
                        className="sticky top-0 z-20 min-w-[112px] border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-left"
                        title={sub ? undefined : 'Các lớp có khoảng ngày khác nhau — rê chuột vào từng ô để xem kỳ.'}
                      >
                        <span className="block whitespace-nowrap text-slate-700">Tháng {col.month}</span>
                        {sub && <span className="block whitespace-nowrap text-[11px] font-normal text-slate-400">{sub}</span>}
                        {due && (
                          <button
                            type="button"
                            onClick={() => setDueColumn(col)}
                            className={`mt-0.5 flex items-center gap-1 whitespace-nowrap rounded px-1 -mx-1 text-[11px] font-medium hover:bg-primary-50 hover:text-primary-700 ${
                              due.muted ? 'text-slate-400' : 'text-primary-600'
                            }`}
                            title={`Đặt hạn đóng cho Tháng ${col.month}`}
                            aria-label={`Đặt hạn đóng cho Tháng ${col.month}/${col.year}`}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {due.text}
                          </button>
                        )}
                        {missingClasses(col).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCreateTarget({ column: col, onlyClassId: null })}
                            className="mt-0.5 -mx-1 block whitespace-nowrap rounded px-1 text-[11px] font-medium text-success-700 hover:bg-success-50"
                            title={`Tạo kỳ học phí Tháng ${col.month}/${col.year} cho các lớp chưa có`}
                          >
                            + Tạo kỳ
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? groups.map((g) => {
                      const ids = g.students.map((s) => s.id);
                      const allInClass = ids.every((id) => selected.has(id));
                      return [
                        <tr key={`h-${g.cls.id}`}>
                          <td
                            colSpan={3}
                            className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-1.5"
                          >
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary-500"
                                checked={allInClass}
                                onChange={(e) => toggleStudents(ids, e.target.checked)}
                                aria-label={`Chọn cả lớp ${g.cls.name}`}
                              />
                              <span className="truncate text-sm font-semibold text-slate-800">{g.cls.name}</span>
                              <span className="shrink-0 text-xs text-slate-500">{g.students.length} HS</span>
                            </label>
                          </td>
                          {columns.map((col) => (
                            <td key={colKey(col)} className="border-b border-l border-slate-200 bg-slate-100 px-2 py-1">
                              {!periodOf(g.cls, col) && (
                                <button
                                  type="button"
                                  onClick={() => setCreateTarget({ column: col, onlyClassId: g.cls.id })}
                                  className="whitespace-nowrap rounded px-1 text-[11px] font-medium text-success-700 hover:bg-success-50"
                                  title={`Tạo kỳ Tháng ${col.month}/${col.year} cho ${g.cls.name}`}
                                >
                                  + Tạo kỳ
                                </button>
                              )}
                            </td>
                          ))}
                        </tr>,
                        ...g.students.map((s) => renderStudentRow(s, g.cls)),
                      ];
                    })
                  : visibleStudents.map((s) => renderStudentRow(s, classById.get(s.classId)))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        danger={confirmDanger}
        loading={confirmLoading}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      <DueDateModal
        column={dueColumn}
        entries={dueEntries}
        onClose={() => setDueColumn(null)}
        onSaved={(n, done) => {
          if (n > 0) {
            setInfo(`Đã cập nhật hạn đóng cho ${n} lớp.`);
            load();
          }
          if (done) setDueColumn(null);
        }}
      />

      <CreatePeriodsModal
        column={createTarget?.column ?? null}
        candidates={createCandidates}
        onlyClassId={createTarget?.onlyClassId ?? null}
        onClose={() => setCreateTarget(null)}
        onCreated={(n, done) => {
          if (n > 0) {
            setInfo(`Đã tạo kỳ học phí cho ${n} lớp.`);
            load();
          }
          if (done) setCreateTarget(null);
        }}
      />

      <PaymentEditModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(p) => {
          patchLocal(p);
          setEditTarget(null);
        }}
        onRemoved={(p) => {
          removeLocal(p);
          setEditTarget(null);
        }}
      />
    </div>
  );
}
