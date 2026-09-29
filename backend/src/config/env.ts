import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Cảnh báo: biến môi trường "${name}" chưa được thiết lập. Một số tính năng có thể không hoạt động.`
    );
    return "";
  }
  return value;
}

export const env = {
  PORT: parseInt(optional("PORT", "4000"), 10),
  NODE_ENV: optional("NODE_ENV", "development"),

  DATABASE_URL: required(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/tuition_db"
  ),

  SESSION_SECRET: required("SESSION_SECRET", "change_me"),

  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:5173"),
  BACKEND_URL: optional("BACKEND_URL", "http://localhost:4000"),

  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),

  MICROSOFT_CLIENT_ID: optional("MICROSOFT_CLIENT_ID", ""),
  MICROSOFT_CLIENT_SECRET: optional("MICROSOFT_CLIENT_SECRET", ""),

  GMAIL_USER: optional("GMAIL_USER", ""),
  GMAIL_APP_PASSWORD: optional("GMAIL_APP_PASSWORD", ""),

  CRON_SECRET: optional("CRON_SECRET", ""),

  TUITION_DUE_DAY: (() => {
    const raw = parseInt(optional("TUITION_DUE_DAY", "5"), 10);
    if (Number.isNaN(raw) || raw < 1 || raw > 28) return 5;
    return raw;
  })(),
};

export default env;
