import app from "./app";
import env from "./config/env";
import { scheduleReminderJob } from "./jobs/reminder.job";

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Hệ thống Quản lý Học phí đang chạy tại http://localhost:${env.PORT}`);
  scheduleReminderJob();
});

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledRejection]", reason);
});

process.on("SIGTERM", () => {
  // eslint-disable-next-line no-console
  console.log("[server] Nhận SIGTERM, đang tắt máy chủ...");
  server.close(() => process.exit(0));
});

export default server;
