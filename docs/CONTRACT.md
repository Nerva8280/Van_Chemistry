# Contract: Hệ thống Quản lý Học phí — Backend/Frontend API & DB Contract

This is the single source of truth both the backend and frontend implementations must follow exactly, so they integrate without further coordination. Do not deviate from field names, routes, or types below.

## 1. Tech stack

- Backend: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, Passport.js (Google OAuth20 + Microsoft/azure-ad), express-session with connect-pg-simple (or JWT — see Auth section), Nodemailer, `xlsx` (SheetJS), `node-cron`.
- Frontend: React 18 + TypeScript + Vite, TailwindCSS, Recharts, React Router v6, axios.
- Single user system: there is no multi-tenant complexity, but the DB still stores a `User` row representing whoever logs in (first login auto-registers). All classes/students belong to that logged-in user via `userId` FK — this keeps the schema correct even though in practice only one person uses it.

## 2. Database schema (Prisma) — `backend/prisma/schema.prisma`

```prisma
model User {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String
  avatarUrl   String?
  provider    String   // "google" | "microsoft"
  providerId  String
  createdAt   DateTime @default(now())
  classes     Class[]
}

model Class {
  id                String    @id @default(uuid())
  name              String
  defaultTuitionFee Decimal   @db.Decimal(12, 0)
  userId            String
  user              User      @relation(fields: [userId], references: [id])
  students          Student[]
  createdAt         DateTime  @default(now())
}

model Student {
  id                 String           @id @default(uuid())
  fullName           String
  classId            String
  class              Class            @relation(fields: [classId], references: [id])
  parentEmail        String?
  parentPhone        String?
  monthlyTuitionFee  Decimal          @db.Decimal(12, 0)
  active             Boolean          @default(true)
  createdAt          DateTime         @default(now())
  payments           TuitionPayment[]
  reminders          ReminderLog[]
}

model TuitionPayment {
  id         String    @id @default(uuid())
  studentId  String
  student    Student   @relation(fields: [studentId], references: [id])
  year       Int
  month      Int       // 1-12
  isPaid     Boolean   @default(false)
  paidDate   DateTime?
  amount     Decimal   @db.Decimal(12, 0)
  dueDate    DateTime  // e.g. day 5 of that month
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([studentId, year, month])
}

model ReminderLog {
  id           String   @id @default(uuid())
  studentId    String
  student      Student  @relation(fields: [studentId], references: [id])
  year         Int
  month        Int
  reminderType String   // "due" | "overdue7" | "overdue15"
  sentAt       DateTime @default(now())

  @@unique([studentId, year, month, reminderType])
}
```

Payment due day default: the 5th of each month (configurable via `TUITION_DUE_DAY` env var, default `5`).

## 3. Auth strategy

Use **session-based auth** with `express-session` (store: `connect-pg-simple` pointing at the same Postgres DB) + Passport strategies:
- `passport-google-oauth20`
- `passport-microsoft` (or `passport-azure-ad` OIDC strategy) — use `passport-microsoft` package for simplicity (common/consumers tenant).

Routes:
- `GET /api/auth/google` → redirect to Google consent
- `GET /api/auth/google/callback` → on success, create/find `User`, establish session, redirect to `FRONTEND_URL/dashboard`
- `GET /api/auth/microsoft` → redirect to Microsoft consent
- `GET /api/auth/microsoft/callback` → same as above
- `GET /api/auth/me` → `{ user: User | null }`
- `POST /api/auth/logout` → destroy session

Middleware `requireAuth` protects all `/api/*` routes except `/api/auth/*`. Frontend sends `withCredentials: true` on axios; backend CORS config: `origin: FRONTEND_URL, credentials: true`.

## 4. REST API

All responses JSON. Errors: `{ error: string }` with appropriate HTTP status.

### Classes
- `GET /api/classes` → `Class[]` (each with `studentCount`)
- `POST /api/classes` body `{ name, defaultTuitionFee }` → `Class`
- `PUT /api/classes/:id` body `{ name?, defaultTuitionFee? }` → `Class`
- `DELETE /api/classes/:id` → `204`

### Students
- `GET /api/students?classId=&search=` → `Student[]` (includes `class` relation)
- `POST /api/students` body `{ fullName, classId, parentEmail?, parentPhone?, monthlyTuitionFee }` → `Student` (also creates 12 `TuitionPayment` rows for the current year, unpaid)
- `PUT /api/students/:id` → `Student`
- `DELETE /api/students/:id` → `204`
- `POST /api/students/import` multipart file `file` (.xlsx/.csv), body field `classId` optional → `{ imported: number, errors: {row:number, message:string}[] }`. Columns expected (Vietnamese headers): `Họ và tên`, `Lớp`, `Email phụ huynh`, `Số điện thoại`, `Học phí`.
- `GET /api/students/export?classId=` → streams .xlsx file

### Tuition grid
- `GET /api/tuition?year=2026&classId=` → `{ students: { id, fullName, className, monthlyTuitionFee, payments: { month: 1..12, isPaid, paidDate, dueDate }[] }[] }`
- `PUT /api/tuition/:studentId/:year/:month` body `{ isPaid: boolean }` → updates/creates the `TuitionPayment` row; when `isPaid` flips true, sets `paidDate = now()`; when false, clears `paidDate`. Returns updated `TuitionPayment`.

### Dashboard
- `GET /api/dashboard/summary?year=2026` → `{ totalClasses, totalStudents, totalExpected, totalCollected, totalOutstanding, completionRate, overdueStudentCount }`
- `GET /api/dashboard/charts?year=2026` → `{ monthlyRevenue: {month, expected, collected}[], classCollectionRate: {className, rate}[], paidVsUnpaid: {paid, unpaid}, revenueTrend: {month, revenue}[] }`

### Overdue
- `GET /api/overdue?year=2026` → `{ studentName, className, month, daysLate, amount, severity: "orange"|"red" }[]`
  - `daysLate` = today − dueDate(month) in days, only if unpaid and dueDate < today.
  - severity: `orange` if `daysLate <= 15`, else `red`.

### Reports / export
- `GET /api/reports/students/export` → xlsx of student list
- `GET /api/reports/tuition-summary/export?year=` → xlsx summary per student/month
- `GET /api/reports/overdue/export?year=` → xlsx of overdue list

### Reminders
- `POST /api/reminders/run-now` (manual trigger, for testing) → `{ sent: number }`
- Cron job (`node-cron`, runs daily at 08:00 server time) checks all unpaid `TuitionPayment` rows where `dueDate` matches today, +7 days ago, or +15 days ago, sends Vietnamese email via Nodemailer/Gmail SMTP to `parentEmail`, logs to `ReminderLog` (unique constraint prevents duplicate sends).

## 5. Env vars (`backend/.env.example`)

```
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tuition_db
SESSION_SECRET=change_me
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

Frontend `.env.example`:
```
VITE_API_URL=http://localhost:4000/api
```

## 6. Frontend routes/pages

- `/login` — Vietnamese login page, "Đăng nhập với Google" / "Đăng nhập với Microsoft" buttons (redirect to backend OAuth routes).
- `/` (protected, redirects to `/dashboard`)
- `/dashboard` — summary cards + 4 charts (Recharts): doanh thu theo tháng (bar), tỷ lệ thu theo lớp (bar/pie), đã đóng/chưa đóng (pie), xu hướng doanh thu (line).
- `/classes` — CRUD list of classes.
- `/students` — CRUD table, search box, import/export buttons, filter by class.
- `/tuition` — the year checkbox grid (Student | T1..T12), year selector, class filter, overdue rows highlighted red per rules.
- `/overdue` — overdue table with color badges.

Shared `AuthContext` fetches `/api/auth/me` on load; `ProtectedRoute` wrapper redirects to `/login` if no user.

All UI text in Vietnamese, currency formatted via `Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'})`, dates via `date-fns` format `dd/MM/yyyy`.

## 7. Folder structure (already created)

```
backend/
  prisma/schema.prisma
  src/config/  src/middleware/  src/routes/  src/controllers/  src/services/  src/jobs/  src/utils/
  src/app.ts  src/server.ts
frontend/
  src/pages/ src/components/ src/context/ src/services/ src/types/ src/hooks/
  src/App.tsx src/main.tsx
docs/
```
