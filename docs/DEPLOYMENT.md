# Hướng dẫn triển khai Production

Kiến trúc gợi ý (chi phí thấp, phù hợp ứng dụng 1 người dùng):

- **Frontend**: build tĩnh (`npm run build` → thư mục `dist/`) triển khai trên Vercel/Netlify/Cloudflare Pages.
- **Backend**: Railway/Render/Fly.io (Node.js container) — cần chạy liên tục để cron job nhắc nhở hoạt động (không dùng serverless dạng "cold start" cho phần cron).
- **Database**: PostgreSQL managed (Railway Postgres, Supabase, Neon, hoặc RDS).

## 1. Build

```powershell
# Backend
cd backend
npm install
npm run build      # biên dịch TypeScript sang dist/
npx prisma migrate deploy   # áp dụng migration lên DB production

# Frontend
cd ../frontend
npm install
npm run build       # tạo dist/ tĩnh
```

## 2. Biến môi trường production

Backend (đặt trong dashboard của nền tảng hosting, KHÔNG commit vào repo):

```
NODE_ENV=production
PORT=4000
DATABASE_URL=<connection string DB production>
SESSION_SECRET=<chuỗi ngẫu nhiên dài, khác local>
FRONTEND_URL=https://<domain-frontend>
BACKEND_URL=https://<domain-backend>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
TUITION_DUE_DAY=5
```

Cập nhật **redirect URI** trong Google Cloud Console và Azure App Registration thành:
- `https://<domain-backend>/api/auth/google/callback`
- `https://<domain-backend>/api/auth/microsoft/callback`

Frontend:
```
VITE_API_URL=https://<domain-backend>/api
```

## 3. Bảo mật production

- Bật `secure: true`, `sameSite: 'none'` cho session cookie nếu frontend/backend khác domain (bắt buộc HTTPS).
- Đặt `SESSION_SECRET` là chuỗi ngẫu nhiên mạnh (ví dụ `openssl rand -hex 32`), khác hoàn toàn giá trị dev.
- CORS: chỉ whitelist đúng domain frontend production trong `FRONTEND_URL`.
- Bật rate-limiting cơ bản (ví dụ `express-rate-limit`) trên các route auth và import Excel để tránh lạm dụng.
- Sao lưu định kỳ (backup) database (hầu hết các nhà cung cấp managed Postgres đều có backup tự động — bật tính năng này).

## 4. Chạy production

```powershell
cd backend
npm run start        # chạy node dist/server.js (đã start cron job nhắc nhở)
```

Đảm bảo tiến trình backend luôn chạy (dùng process manager của nền tảng hosting hoặc PM2 nếu tự quản lý VPS) để cron job 08:00 hằng ngày hoạt động đều đặn.

## 5. Domain & HTTPS

- Trỏ domain frontend (ví dụ `hocphi.example.com`) tới nền tảng static hosting.
- Trỏ domain/subdomain backend (ví dụ `api.hocphi.example.com`) tới nền tảng chạy Node.js, bật HTTPS (Let's Encrypt tự động trên hầu hết nền tảng managed).

## 6. Giám sát

- Theo dõi log backend để phát hiện lỗi gửi email (SMTP) hoặc lỗi OAuth callback.
- Định kỳ kiểm tra bảng `ReminderLog` để xác nhận cron job chạy đúng lịch, không gửi trùng/gửi thiếu.
