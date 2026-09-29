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
- **Scheduler**: `node-cron` chạy trong tiến trình backend lúc 08:00. Vì gói miễn phí của Render cho server "ngủ" khi không có truy cập, production dựa vào một dịch vụ hẹn giờ bên ngoài gọi `POST /api/cron/reminders` (có `x-cron-secret`) mỗi ngày. Cả hai cùng dùng một hàm quét, và `ReminderLog` chặn gửi trùng.
- **Triển khai**: frontend trên Vercel, rewrite `/api/*` sang backend trên Render (Singapore), nên trình duyệt chỉ làm việc với một domain và cookie phiên là first-party. Database là Neon PostgreSQL. Server chạy với `TZ=Asia/Ho_Chi_Minh`.
- **Import/Export**: thư viện `xlsx` (SheetJS) xử lý đọc/ghi file Excel/CSV ở backend.

## 3. Luồng xác thực

1. Người dùng bấm "Đăng nhập với Google/Microsoft" → frontend điều hướng trình duyệt sang `GET /api/auth/google` (hoặc `/microsoft`) của backend.
2. Backend redirect sang trang consent của Google/Microsoft.
3. Sau khi người dùng đồng ý, provider gọi lại `GET /api/auth/*/callback` → Passport xác thực, tạo/tìm `User` trong DB, thiết lập session cookie (httpOnly, secure ở production).
4. Backend redirect trình duyệt về `FRONTEND_URL/dashboard`.
5. Frontend gọi `GET /api/auth/me` để lấy thông tin người dùng hiện tại; mọi request API sau đó dùng cookie phiên có sẵn.
6. Middleware `requireAuth` chặn mọi route `/api/*` (trừ `/api/auth/*`) nếu chưa đăng nhập → trả `401`, frontend tự động điều hướng về `/login`.

## 4. Luồng nghiệp vụ chính

### Kỳ học phí và bảng học phí
Mỗi lớp có các **kỳ học phí** (`TuitionPeriod`) với khoảng ngày và hạn đóng riêng, ví dụ "Tháng 7 (15/6-14/7)". Mỗi kỳ được gắn một `year/month` để các lớp khác nhau xếp chung một cột tháng. Mỗi học sinh học một kỳ thì có một `TuitionPayment` ghi học phí dự kiến và số đã đóng. Nếu không có bản ghi, học sinh không học kỳ đó.
- Tick ô: đánh dấu đã đóng đủ, ghi ngày hôm nay nếu chưa có ngày đóng.
- Bỏ tick: giao diện hỏi xác nhận trước, rồi xoá số tiền và ngày đóng.
- Ghi số tiền nhỏ hơn mức dự kiến thì khoản đó thành "Đóng một phần". Khoản này chỉ được coi là hoàn tất khi người dùng xác nhận.

### Nhập dữ liệu từ Excel
`POST /api/import/tuition` đọc file dạng bảng ngang: mỗi sheet có cột "Tên học sinh", các cột kỳ, và dòng "Tổng" tuỳ chọn.
- Luôn trả về bản **xem trước** trước: số liệu từng lớp và từng kỳ, đối chiếu tổng tính được với tổng ghi tay, cùng các cảnh báo (STT trùng, tên có thể trùng, tên viết bất thường, cột ngày không hợp lệ, giá trị 0, ô trống, đóng thiếu, đóng dư, dòng lạ).
- Chỉ ghi vào database khi gửi `commit=true`.
- Có thể nhập lại cùng file nhiều lần mà không bị nhân đôi, vì lớp, kỳ và học sinh được so khớp theo tên.

### Quá hạn
Được tính mỗi khi đọc dữ liệu. Với khoản chưa đóng xong mà hạn đóng đã qua: số ngày trễ = hôm nay − hạn đóng. Màu cam nếu trễ ≤ 15 ngày, màu đỏ nếu trễ > 15 ngày. Số tiền được tính là số **còn thiếu**.

### Nhắc email
Quét các khoản chưa đóng xong có hạn đóng đúng bằng hôm nay, hôm nay−7 hoặc hôm nay−15 ngày, rồi gửi email loại tương ứng (`due`, `overdue7`, `overdue15`) tới email phụ huynh (nếu có). Mỗi lần gửi được ghi vào `ReminderLog`, với ràng buộc unique `(paymentId, reminderType)` để không gửi trùng.

## 5. Bảo mật

- Session cookie httpOnly + `secure` (bật ở production qua HTTPS) + `sameSite=lax`.
- CORS chỉ cho phép origin của `FRONTEND_URL`, `credentials: true`.
- Input validation ở mọi endpoint ghi dữ liệu (Zod hoặc kiểm tra thủ công tùy backend implementation).
- Secrets (OAuth client secret, Gmail App Password, session secret) chỉ lưu trong `.env`, không commit.
- Giới hạn loại file import (.xlsx/.csv) và kích thước qua middleware `multer`.

## 6. Cấu trúc thư mục

Xem [README.md](../README.md) ở gốc dự án để biết cấu trúc thư mục đầy đủ của `backend/` và `frontend/`.
