import { ReactNode } from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Extra controls shown under the message (e.g. an option checkbox). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} widthClassName="max-w-sm">
      <p className="text-sm text-slate-600">{message}</p>
      {children}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
