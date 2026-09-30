import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';

const LOGIN_ERRORS: Record<string, string> = {
  not_allowed: 'Tài khoản này không có quyền truy cập hệ thống. Vui lòng đăng nhập bằng tài khoản đã được cấp quyền.',
  auth_failed: 'Đăng nhập không thành công. Vui lòng thử lại.',
};

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const errorKey = params.get('error');
  const errorMessage = errorKey ? LOGIN_ERRORS[errorKey] ?? LOGIN_ERRORS.auth_failed : null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-lg font-bold text-white">
            VC
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Van Chemistry Tuition</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để tiếp tục quản lý lớp học của bạn</p>
        </div>

        {errorMessage && (
          <div className="mb-4">
            <Alert message={errorMessage} />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <a
            href={authService.googleLoginUrl()}
            className="flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.08 3.56-5.14 3.56-8.82Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11C3.25 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.28A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.99-3.11Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.94 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.28 6.61l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
              />
            </svg>
            Đăng nhập với Google
          </a>

          <a
            href={authService.microsoftLoginUrl()}
            className="flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#F25022" d="M1 1h10.2v10.2H1z" />
              <path fill="#7FBA00" d="M12.8 1H23v10.2H12.8z" />
              <path fill="#00A4EF" d="M1 12.8h10.2V23H1z" />
              <path fill="#FFB900" d="M12.8 12.8H23V23H12.8z" />
            </svg>
            Đăng nhập với Microsoft
          </a>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Bằng việc đăng nhập, bạn đồng ý với các điều khoản sử dụng của hệ thống.
        </p>
      </div>
    </div>
  );
}
