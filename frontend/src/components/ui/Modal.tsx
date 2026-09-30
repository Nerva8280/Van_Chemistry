import { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

export default function Modal({ open, title, onClose, children, widthClassName = 'max-w-lg' }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/50 p-3 pt-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pt-16">
      <div
        className={`w-full min-w-0 max-w-full ${widthClassName} rounded-xl bg-white shadow-xl ring-1 ring-slate-100`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 shrink-0 rounded-md p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:-mr-1 sm:p-1"
            aria-label="Đóng"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* overflow-x-auto: bảng rộng trong hộp thoại cuộn ngang bên trong, không làm tràn trang trên điện thoại. */}
        <div className="overflow-x-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
