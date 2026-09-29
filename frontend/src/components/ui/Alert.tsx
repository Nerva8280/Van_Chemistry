interface AlertProps {
  message: string;
  variant?: 'error' | 'success' | 'info';
}

const variantStyles = {
  error: 'bg-danger-50 text-danger-600 ring-danger-100',
  success: 'bg-success-50 text-success-700 ring-success-100',
  info: 'bg-primary-50 text-primary-700 ring-primary-100',
};

export default function Alert({ message, variant = 'error' }: AlertProps) {
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${variantStyles[variant]}`}>{message}</div>
  );
}
