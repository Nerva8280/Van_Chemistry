import { FormEvent, useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import { tuitionService } from '../../services/tuitionService';
import { getErrorMessage } from '../../services/api';
import { Payment, Period } from '../../types';
import { formatCurrency, formatDate, formatDateRange, toDateInput } from '../../utils/format';
import { STATUS_BADGE_COLOR, STATUS_LABEL } from '../../utils/status';

export interface PaymentEditTarget {
  studentName: string;
  className: string;
  payment: Payment;
  period?: Period;
}

interface Props {
  target: PaymentEditTarget | null;
  onClose: () => void;
  onSaved: (payment: Payment) => void;
  onRemoved: (payment: Payment) => void;
}

function todayInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function paidDateText(payment: Payment): string {
  if (payment.paidDate) return formatDate(payment.paidDate);
  if (payment.isPaid || payment.paidAmount > 0) return 'Không rõ ngày';
  return '';
}

export default function PaymentEditModal({ target, onClose, onSaved, onRemoved }: Props) {
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [note, setNote] = useState('');
  const [confirmFull, setConfirmFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [customOn, setCustomOn] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (!target) return;
    const p = target.payment;
    setAmount(String(p.paidAmount ?? 0));
    setPaidDate(toDateInput(p.paidDate));
    setNote(p.note ?? '');
    const hasCustom = !!(p.customStartDate || p.customEndDate);
    setCustomOn(hasCustom);
    setCustomStart(toDateInput(hasCustom ? p.customStartDate : target.period?.startDate ?? null));
    setCustomEnd(toDateInput(hasCustom ? p.customEndDate : target.period?.endDate ?? null));
    setConfirmFull(p.isPaid && p.paidAmount < p.expectedAmount);
    setError('');
    setRemoveOpen(false);
  }, [target]);

  if (!target) return null;
  const { payment, period } = target;
  const expected = payment.expectedAmount;
  const amountNum = Number(amount);
  const amountValid = amount.trim() !== '' && Number.isInteger(amountNum) && amountNum >= 0;
  const range = period ? formatDateRange(period.startDate, period.endDate) : '';
  const hasCustom = !!(payment.customStartDate || payment.customEndDate);
  const dueDate = hasCustom ? payment.customEndDate : period?.endDate ?? null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amountValid) {
      setError('Số tiền đã đóng phải là số nguyên không âm (đơn vị: đồng).');
      return;
    }
    if (customOn && !customEnd) {
      setError('Hãy nhập "Đến ngày" của kỳ riêng (đây là hạn đóng của em này).');
      return;
    }
    if (customOn && customStart && customEnd && customStart > customEnd) {
      setError('Ngày bắt đầu kỳ riêng phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const partialConfirm = confirmFull && amountNum > 0 && amountNum < expected;
      const updated = await tuitionService.updatePayment(payment.id, {
        paidAmount: amountNum,
        paidDate: paidDate || null,
        note: note.trim() || null,
        customStartDate: customOn ? customStart || null : null,
        customEndDate: customOn ? customEnd || null : null,
        ...(partialConfirm ? { isPaid: true } : {}),
      });
      onSaved(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Không thể lưu học phí.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await tuitionService.deletePayment(payment.id);
      setRemoveOpen(false);
      onRemoved(payment);
    } catch (err) {
      setRemoveOpen(false);
      setError(getErrorMessage(err, 'Không thể bỏ học sinh khỏi kỳ này.'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Modal open={!!target && !removeOpen} title="Cập nhật học phí" onClose={onClose}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert message={error} autoHide />}

          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
            <dt className="text-slate-500">Học sinh</dt>
            <dd className="font-medium text-slate-800">{target.studentName}</dd>
            <dt className="text-slate-500">Lớp</dt>
            <dd className="text-slate-700">{target.className}</dd>
            <dt className="text-slate-500">Kỳ</dt>
            <dd className="text-slate-700">
              {period?.name ?? `Tháng ${payment.month}`}
              {range && <span className="text-slate-500"> ({range})</span>}
              {hasCustom && (
                <span className="mt-0.5 block text-xs font-medium text-primary-700">
                  Kỳ riêng: {formatDateRange(payment.customStartDate, payment.customEndDate)}
                </span>
              )}
            </dd>
            <dt className="text-slate-500">Hạn đóng</dt>
            <dd className="text-slate-700">
              {dueDate ? formatDate(dueDate) : <span className="text-slate-400">Chưa có ngày kết thúc kỳ</span>}
            </dd>
            <dt className="text-slate-500">Học phí dự kiến</dt>
            <dd className="font-medium tabular-nums text-slate-800">{formatCurrency(expected)}</dd>
            <dt className="text-slate-500">Trạng thái</dt>
            <dd>
              <Badge color={STATUS_BADGE_COLOR[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
              {paidDateText(payment) && (
                <span className="ml-2 text-xs text-slate-500">Ngày đóng: {paidDateText(payment)}</span>
              )}
            </dd>
          </dl>

          <div>
            <label className="label" htmlFor="paidAmount">
              Số tiền đã đóng (VNĐ)
            </label>
            <input
              id="paidAmount"
              className="input tabular-nums"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                className="rounded-md border border-success-100 bg-success-50 px-2 py-1 font-medium text-success-700 hover:bg-success-100"
                onClick={() => {
                  setAmount(String(expected));
                  if (!paidDate) setPaidDate(todayInput());
                }}
              >
                Đóng đủ {formatCurrency(expected)}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setAmount('0');
                  setPaidDate('');
                  setConfirmFull(false);
                }}
              >
                Chưa đóng (0 đ)
              </button>
              {amountValid && amountNum < expected && amountNum > 0 && (
                <span className="text-warning-700">Còn thiếu {formatCurrency(expected - amountNum)}</span>
              )}
              {amountValid && amountNum > expected && (
                <span className="text-primary-700">Đóng dư {formatCurrency(amountNum - expected)}</span>
              )}
            </div>
          </div>

          {amountValid && amountNum > 0 && amountNum < expected && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-success-500"
                checked={confirmFull}
                onChange={(e) => setConfirmFull(e.target.checked)}
              />
              <span>Vẫn tính là đã đóng đủ (ví dụ: học sinh được giảm học phí)</span>
            </label>
          )}

          <div>
            <label className="label" htmlFor="paidDate">
              Ngày đóng
            </label>
            <input
              id="paidDate"
              className="input"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">Để trống nếu không rõ ngày đóng.</p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary-500"
                checked={customOn}
                onChange={(e) => setCustomOn(e.target.checked)}
              />
              <span>
                Kỳ riêng cho em này
                <span className="block text-xs font-normal text-slate-500">
                  Dùng khi em vào học lệch thời gian với cả lớp. Hạn đóng của em sẽ là ngày kết thúc kỳ riêng.
                </span>
              </span>
            </label>
            {customOn && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label text-xs" htmlFor="customStart">
                    Từ ngày
                  </label>
                  <input id="customStart" className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs" htmlFor="customEnd">
                    Đến ngày (hạn đóng)
                  </label>
                  <input id="customEnd" className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="note">
              Ghi chú
            </label>
            <textarea
              id="note"
              className="input"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: đóng qua chuyển khoản"
            />
          </div>

          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="btn border border-danger-100 bg-white text-danger-600 hover:bg-danger-50"
              onClick={() => setRemoveOpen(true)}
              disabled={saving}
            >
              Bỏ học sinh khỏi kỳ này
            </button>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removeOpen}
        title="Bỏ học sinh khỏi kỳ này"
        message={`Bỏ "${target.studentName}" khỏi ${period?.name ?? `Tháng ${payment.month}`}? Ô sẽ chuyển thành "—" và số tiền đã ghi của kỳ này sẽ bị xóa.`}
        confirmLabel="Bỏ khỏi kỳ"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </>
  );
}
