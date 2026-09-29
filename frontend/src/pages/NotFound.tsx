import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <h1 className="text-xl font-semibold text-slate-900">Không tìm thấy trang</h1>
      <p className="text-sm text-slate-500">Trang bạn tìm không tồn tại hoặc đã được chuyển đi.</p>
      <Link to="/tuition" className="btn-primary mt-2">
        Về bảng học phí
      </Link>
    </div>
  );
}
