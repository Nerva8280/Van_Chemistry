import { lazy, ReactNode, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Spinner from './components/ui/Spinner';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Tuition from './pages/Tuition';
import Overdue from './pages/Overdue';
import Import from './pages/Import';
import NotFound from './pages/NotFound';

// Trang "Tạo đề" tải riêng (kèm jszip, DOMPurify) để các trang học phí không phải tải thêm.
const Exams = lazy(() => import('./pages/Exams'));
const ExamEditor = lazy(() => import('./pages/ExamEditor'));
const ExamPrint = lazy(() => import('./pages/ExamPrint'));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const IS_TEST = import.meta.env.VITE_APP_ENV === 'test';

export default function App() {
  return (
    <AuthProvider>
      {IS_TEST && (
        <div className="no-print sticky top-0 z-50 bg-warning-500 px-4 py-1.5 text-center text-sm font-semibold text-slate-900">
          MÔI TRƯỜNG TEST: dữ liệu ở đây là bản sao, sửa hay xóa không ảnh hưởng dữ liệu thật.
        </div>
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            {/* Trang in đề: không có thanh menu. */}
            <Route path="/exams/:id/print" element={<Lazy><ExamPrint /></Lazy>} />
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/students" element={<Students />} />
              <Route path="/tuition" element={<Tuition />} />
              <Route path="/import" element={<Import />} />
              <Route path="/overdue" element={<Overdue />} />
              <Route path="/exams" element={<Lazy><Exams /></Lazy>} />
              <Route path="/exams/:id" element={<Lazy><ExamEditor /></Lazy>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
