# Backend — Hệ thống Quản lý Học phí

Backend Node.js + Express + TypeScript + Prisma (PostgreSQL) cho hệ thống quản lý học phí dành cho giáo viên/chủ lớp học.

## 1. Yêu cầu hệ thống (Prerequisites)

- Node.js >= 18
- PostgreSQL >= 13 (chạy local hoặc cloud, ví dụ Neon/Supabase/RDS)
- Tài khoản Google Cloud (để tạo OAuth Client cho đăng nhập Google)
- Tài khoản Microsoft Azure (để tạo App Registration cho đăng nhập Microsoft)
- Tài khoản Gmail + App Password (để gửi email nhắc học phí qua Nodemailer)

## 2. Cài đặt

```bash
cd backend
npm install
```

## 3. Cấu hình PostgreSQL & biến môi trường

1. Tạo database Postgres, ví dụ:
   ```sql
   CREATE DATABASE tuition_db;
   ```
2. Sao chép file mẫu env:
   ```bash
   cp .env.example .env
   ```
   (Windows PowerShell: `Copy-Item .env.example .env`)
3. Mở `.env` và điền các giá trị:

   ```
   PORT=4000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tuition_db
   SESSION_SECRET=<chuỗi ngẫu nhiên dài, bí mật>
   FRONTEND_URL=http://localhost:5173
   BACKEND_URL=http://localhost:4000

   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=

   MICROSOFT_CLIENT_ID=
   MICROSOFT_CLIENT_SECRET=

   GMAIL_USER=
   GMAIL_APP_PASSWORD=

   TUITION_DUE_DAY=5
   ```

## 4. Khởi tạo cơ sở dữ liệu với Prisma

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Lệnh `prisma:migrate` sẽ tạo các bảng `User`, `Class`, `Student`, `TuitionPeriod`, `TuitionPayment`, `ReminderLog` theo `prisma/schema.prisma`. Bảng `session` (dùng cho `connect-pg-simple`) được tự động tạo khi server khởi động lần đầu (`createTableIfMissing: true`).

Dữ liệu học phí được nạp qua trang "Nhập dữ liệu" trên giao diện (file Excel dạng bảng ngang, có file mẫu tải về ngay trên trang đó).

Nếu bạn muốn xem/áp dụng script SQL thuần (không qua Prisma), tham khảo `docs/DATABASE.sql` ở thư mục gốc dự án.

## 5. Lấy Google OAuth credentials

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới (hoặc chọn project có sẵn).
2. Vào **APIs & Services → OAuth consent screen**:
   - Chọn loại **External** (hoặc Internal nếu dùng Google Workspace nội bộ).
   - Điền tên ứng dụng, email hỗ trợ, thêm scope `email`, `profile`.
   - Ở mục "Test users" (khi app ở trạng thái Testing), thêm email Google bạn sẽ dùng để đăng nhập.
3. Vào **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: thêm chính xác
     ```
     http://localhost:4000/api/auth/google/callback
     ```
     (thay bằng `BACKEND_URL` thật khi deploy production).
4. Sau khi tạo, copy **Client ID** và **Client Secret** vào `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   ```

## 6. Lấy Microsoft OAuth credentials (Azure App Registration)

1. Vào [Azure Portal](https://portal.azure.com/) → **Azure Active Directory → App registrations → New registration**.
2. Đặt tên ứng dụng, chọn **Supported account types**: "Accounts in any organizational directory and personal Microsoft accounts" (multi-tenant + personal, tương ứng tenant `common`).
3. Ở mục **Redirect URI**, chọn loại **Web** và nhập:
   ```
   http://localhost:4000/api/auth/microsoft/callback
   ```
4. Sau khi tạo xong, vào **Certificates & secrets → New client secret**, tạo secret mới và copy **giá trị secret ngay lúc đó** (chỉ hiển thị một lần).
5. Vào **API permissions**, đảm bảo có quyền `User.Read` (Microsoft Graph, delegated) — mặc định thường đã có sẵn.
6. Copy **Application (client) ID** và **client secret** vào `.env`:
   ```
   MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   MICROSOFT_CLIENT_SECRET=xxxx
   ```

## 7. Lấy Gmail App Password (để gửi email nhắc học phí)

1. Bật xác minh 2 bước (2-Step Verification) cho tài khoản Gmail tại https://myaccount.google.com/security.
2. Vào https://myaccount.google.com/apppasswords (yêu cầu đã bật 2FA).
3. Tạo App Password mới (chọn app "Mail", thiết bị "Other" → đặt tên ví dụ "Tuition System").
4. Google sẽ cấp một mật khẩu 16 ký tự — copy vào `.env`:
   ```
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=abcdefghijklmnop   # 16 ký tự, không dấu cách
   ```
   Lưu ý: đây **không phải** mật khẩu Gmail thông thường của bạn.

Nếu chưa cấu hình `GMAIL_USER`/`GMAIL_APP_PASSWORD`, hệ thống vẫn chạy bình thường nhưng email nhắc học phí sẽ chỉ được ghi log ra console (chế độ dry-run), không gửi thật.

## 8. Chạy server

```bash
npm run dev
```

Server mặc định chạy tại `http://localhost:4000`. Kiểm tra nhanh: `GET http://localhost:4000/health`.

Cron job nhắc học phí (chạy hàng ngày lúc 08:00 giờ server) được khởi động tự động cùng server. Để kiểm thử thủ công không cần chờ đến 08:00, gọi:

```
POST http://localhost:4000/api/reminders/run-now
```
(yêu cầu đã đăng nhập/có session hợp lệ)

## 9. Build & chạy production

```bash
npm run build
npm start
```

## 10. Scripts có sẵn

| Script                  | Mô tả                                              |
|-------------------------|-----------------------------------------------------|
| `npm run dev`           | Chạy dev server với hot-reload (tsx watch)          |
| `npm run build`         | Biên dịch TypeScript → `dist/`                      |
| `npm start`             | Chạy server đã build (`dist/server.js`)             |
| `npm run prisma:generate` | Sinh Prisma Client                                |
| `npm run prisma:migrate`  | Tạo & áp dụng migration (dev)                     |
| `npm run prisma:deploy`   | Áp dụng migration (production)                    |

## 11. Cấu trúc thư mục

```
backend/
  prisma/schema.prisma      # Định nghĩa DB schema
  src/config/                # env, db (Prisma client), session, passport
  src/middleware/             # requireAuth, errorHandler, upload (multer)
  src/routes/                 # Express routers theo từng domain
  src/controllers/            # Xử lý request/response
  src/services/                # Business logic: email, excel, overdue, tuition
  src/jobs/                    # node-cron reminder job
  src/utils/                   # helpers (asyncHandler, money)
  src/app.ts / src/server.ts   # Khởi tạo Express app / start server
```
