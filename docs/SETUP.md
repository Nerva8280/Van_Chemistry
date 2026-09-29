# Hướng dẫn cài đặt & chạy local (development)

## 1. Yêu cầu

- Node.js ≥ 18
- PostgreSQL ≥ 14 (chạy local hoặc Docker)
- Tài khoản Google Cloud (để lấy Google OAuth Client ID/Secret)
- Tài khoản Azure (để lấy Microsoft OAuth Client ID/Secret)
- Tài khoản Gmail + App Password (để gửi email nhắc nhở)

## 2. Chuẩn bị PostgreSQL

Cách nhanh nhất bằng Docker:

```powershell
docker run --name tuition-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tuition_db -p 5432:5432 -d postgres:16
```

Hoặc dùng PostgreSQL đã cài sẵn, tạo database `tuition_db`.

## 3. Lấy Google OAuth credentials

1. Vào https://console.cloud.google.com/ → tạo project mới (hoặc chọn project có sẵn).
2. **APIs & Services → OAuth consent screen** → chọn "External", điền thông tin cơ bản.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: "Web application".
4. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
5. Copy **Client ID** và **Client Secret** vào `backend/.env`.

## 4. Lấy Microsoft OAuth credentials

1. Vào https://portal.azure.com/ → **Azure Active Directory → App registrations → New registration**.
2. Tên bất kỳ, "Supported account types" chọn "Accounts in any organizational directory and personal Microsoft accounts".
3. Redirect URI (Web): `http://localhost:4000/api/auth/microsoft/callback`
4. Sau khi tạo, vào **Certificates & secrets → New client secret**, copy giá trị secret (chỉ hiển thị 1 lần).
5. Copy **Application (client) ID** và **client secret** vào `backend/.env`.

## 5. Lấy Gmail App Password

1. Bật xác thực 2 bước cho tài khoản Gmail dùng để gửi mail.
2. Vào https://myaccount.google.com/apppasswords → tạo App Password mới (chọn "Mail").
3. Copy chuỗi 16 ký tự vào `GMAIL_APP_PASSWORD`, email tương ứng vào `GMAIL_USER`.

## 6. Cấu hình backend

```powershell
cd backend
Copy-Item .env.example .env
# Mở .env, điền DATABASE_URL, GOOGLE_*, MICROSOFT_*, GMAIL_*, SESSION_SECRET
npm install
npx prisma migrate dev --name init
npm run dev
```

Backend chạy tại `http://localhost:4000`.

## 7. Cấu hình frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend chạy tại `http://localhost:5173`.

## 8. Kiểm tra

1. Mở `http://localhost:5173` → trang đăng nhập.
2. Đăng nhập bằng Google hoặc Microsoft.
3. Tạo một lớp học, thêm học sinh, thử tick ô học phí ở trang "Học phí".
4. Kiểm tra dashboard cập nhật số liệu và biểu đồ.
5. (Tùy chọn) gọi `POST http://localhost:4000/api/reminders/run-now` để kiểm thử gửi email nhắc nhở ngay lập tức thay vì chờ lịch cron 08:00 hằng ngày.
