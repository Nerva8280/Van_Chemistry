# Hệ thống Quản lý Học phí — Frontend

Frontend (React 18 + TypeScript + Vite + TailwindCSS + Recharts + React Router v6 + axios)
cho hệ thống quản lý học phí dành cho giáo viên/chủ lớp. Giao diện hoàn toàn bằng tiếng Việt.

Đây là phần frontend, gọi tới backend Node.js/Express theo đúng `docs/CONTRACT.md` ở thư
mục gốc dự án. Backend phải đang chạy (mặc định `http://localhost:4000`) để đăng nhập và
tải dữ liệu hoạt động.

## Yêu cầu hệ thống

- Node.js >= 18
- npm >= 9
- Backend đã được cấu hình và đang chạy (xem `backend/README.md`), bao gồm:
  - PostgreSQL với schema đã migrate
  - Google OAuth / Microsoft OAuth client id & secret hợp lệ
  - `FRONTEND_URL=http://localhost:5173` để backend redirect đúng sau khi đăng nhập

## Cài đặt

```bash
cd frontend
npm install
```

## Cấu hình biến môi trường

Sao chép file mẫu và chỉnh nếu cần:

```bash
cp .env.example .env
```

`.env`:

```
VITE_API_URL=http://localhost:4000/api
```

`VITE_API_URL` là gốc API của backend (bao gồm tiền tố `/api`). Ứng dụng sẽ tự suy ra
origin gốc (bỏ `/api`) để điều hướng trình duyệt tới các route OAuth
(`/api/auth/google`, `/api/auth/microsoft`).

## Chạy ở môi trường phát triển

```bash
npm run dev
```

Ứng dụng chạy tại `http://localhost:5173`. Đăng nhập bằng Google hoặc Microsoft sẽ
chuyển hướng sang backend; sau khi xác thực thành công, backend redirect người dùng
trở lại `http://localhost:5173/dashboard` kèm session cookie (`withCredentials: true`).

## Build production

```bash
npm run build
npm run preview
```

## Cấu trúc thư mục

```
src/
  components/       Layout, ProtectedRoute, các thành phần UI dùng chung (Modal, Badge, StatCard, ...)
  context/          AuthContext (trạng thái đăng nhập toàn cục)
  hooks/            useDebounce, ...
  pages/            Login, Dashboard, Classes, Students, Tuition, Overdue
  services/         axios instance + các service gọi API theo từng domain
  types/            Interface TypeScript khớp với CONTRACT.md
  utils/            Định dạng tiền tệ (Intl.NumberFormat vi-VN) và ngày (date-fns dd/MM/yyyy)
```

## Route chính

| Route | Mô tả |
|---|---|
| `/login` | Đăng nhập với Google / Microsoft |
| `/dashboard` | Bảng điều khiển: thẻ thống kê + 4 biểu đồ Recharts theo năm |
| `/classes` | Quản lý lớp học (thêm/sửa/xóa) |
| `/students` | Quản lý học sinh, tìm kiếm, lọc theo lớp, nhập/xuất Excel |
| `/tuition` | Bảng chấm học phí theo tháng (checkbox 12 tháng) |
| `/overdue` | Danh sách học sinh quá hạn đóng học phí |

Tất cả các route trên (trừ `/login`) đều được bảo vệ bởi `ProtectedRoute`, tự động
chuyển hướng về `/login` nếu chưa đăng nhập (dựa trên `GET /api/auth/me`).
