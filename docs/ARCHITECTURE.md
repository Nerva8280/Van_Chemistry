# Kiến trúc hệ thống — Hệ thống Quản lý Học phí

## 1. Tổng quan

Ứng dụng web quản lý học phí dành cho **một giáo viên/chủ lớp duy nhất** (single-user), triển khai dạng client-server cổ điển:

```
┌────────────────────┐        HTTPS / JSON         ┌─────────────────────┐        SQL        ┌────────────────┐
│   Frontend (SPA)   │ ───────────────────────────▶ │   Backend (API)     │ ─────────────────▶ │   PostgreSQL   │
│ React + TS + Tailw.│ ◀─────────────────────────── │ Node.js + Express   │ ◀───────────────── │                │
└────────────────────┘        session cookie        └─────────────────────┘                   └────────────────┘
        │                                                     │
        │  OAuth redirect                                     │  SMTP
        ▼                                                     ▼
 Google / Microsoft OAuth                              Gmail SMTP (Nodemailer)
                                                                │
                                                                ▼
                                                      node-cron: nhắc học phí hằng ngày
```

## 2. Thành phần

- **Frontend**: React 18 SPA (Vite build), TailwindCSS cho giao diện, Recharts cho biểu đồ, React Router cho điều hướng, axios cho gọi API (cookie session, `withCredentials: true`).
- **Backend**: Express REST API viết bằng TypeScript. Xác thực qua Passport.js (Google OAuth2 + Microsoft OAuth2), phiên đăng nhập lưu trong PostgreSQL (`connect-pg-simple`). Prisma ORM thao tác dữ liệu.
- **Database**: PostgreSQL — xem [ERD.md](ERD.md) và [DATABASE.sql](DATABASE.sql).
- **Email**: Nodemailer qua Gmail SMTP (dùng App Password), template HTML tiếng Việt.
- **Scheduler**: `node-cron` chạy trong tiến trình backend, mỗi ngày 08:00 kiểm tra các khoản học phí đến hạn/quá hạn 7 ngày/quá hạn 15 ngày và gửi email nhắc nhở, ghi log để tránh gửi trùng.
- **Import/Export**: thư viện `xlsx` (SheetJS) xử lý đọc/ghi file Excel/CSV ở backend.

## 3. Luồng xác thực

1. Người dùng bấm "Đăng nhập với Google/Microsoft" → frontend điều hướng trình duyệt sang `GET /api/auth/google` (hoặc `/microsoft`) của backend.
2. Backend redirect sang trang consent của Google/Microsoft.
3. Sau khi người dùng đồng ý, provider gọi lại `GET /api/auth/*/callback` → Passport xác thực, tạo/tìm `User` trong DB, thiết lập session cookie (httpOnly, secure ở production).
4. Backend redirect trình duyệt về `FRONTEND_URL/dashboard`.
5. Frontend gọi `GET /api/auth/me` để lấy thông tin người dùng hiện tại; mọi request API sau đó dùng cookie phiên có sẵn.
6. Middleware `requireAuth` chặn mọi route `/api/*` (trừ `/api/auth/*`) nếu chưa đăng nhập → trả `401`, frontend tự động điều hướng về `/login`.

## 4. Luồng nghiệp vụ chính

### Lưới điểm danh học phí (checkbox grid)
Mỗi học sinh có 12 bản ghi `TuitionPayment` (một cho mỗi tháng) được tạo tự động khi thêm học sinh (cho năm hiện tại). Khi giáo viên tick/bỏ tick ô tháng nào, frontend gọi `PUT /api/tuition/:studentId/:year/:month`; backend cập nhật `isPaid` và tự set/xóa `paidDate`.

### Quá hạn
Được tính **on-the-fly** (không cần cron riêng) mỗi khi gọi `GET /api/overdue`: với mỗi `TuitionPayment` chưa thanh toán có `dueDate` đã qua, số ngày trễ = hôm nay − dueDate; phân loại màu cam (≤15 ngày) / đỏ (>15 ngày).

### Nhắc email
Cron job hằng ngày quét toàn bộ `TuitionPayment` chưa thanh toán, so khớp `dueDate` với hôm nay / hôm nay−7 / hôm nay−15 để xác định loại nhắc nhở (`due`, `overdue7`, `overdue15`), gửi email và ghi `ReminderLog` (có unique constraint theo `studentId+year+month+reminderType` để không gửi trùng).

## 5. Bảo mật

- Session cookie httpOnly + `secure` (bật ở production qua HTTPS) + `sameSite=lax`.
- CORS chỉ cho phép origin của `FRONTEND_URL`, `credentials: true`.
- Input validation ở mọi endpoint ghi dữ liệu (Zod hoặc kiểm tra thủ công tùy backend implementation).
- Secrets (OAuth client secret, Gmail App Password, session secret) chỉ lưu trong `.env`, không commit.
- Giới hạn loại file import (.xlsx/.csv) và kích thước qua middleware `multer`.

## 6. Cấu trúc thư mục

Xem [README.md](../README.md) ở gốc dự án để biết cấu trúc thư mục đầy đủ của `backend/` và `frontend/`.
