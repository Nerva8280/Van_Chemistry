import cron from "node-cron";
import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { isExactDaysAgo } from "../services/overdue.service";
import { sendReminderEmail, ReminderType } from "../services/email.service";

/**
 * Determines which reminder (if any) applies today for a given dueDate:
 *   - "due"       when today == dueDate
 *   - "overdue7"  when today == dueDate + 7 days
 *   - "overdue15" when today == dueDate + 15 days
 */
export function resolveReminderType(dueDate: Date, today: Date = new Date()): ReminderType | null {
  if (isExactDaysAgo(dueDate, today, 0)) return "due";
  if (isExactDaysAgo(dueDate, today, 7)) return "overdue7";
  if (isExactDaysAgo(dueDate, today, 15)) return "overdue15";
  return null;
}

/**
 * Scans all unpaid TuitionPayment rows (across every user — this is a
 * global background sweep) and sends the appropriate reminder email for
 * rows whose dueDate is exactly today, 7 days ago, or 15 days ago.
 * Uses ReminderLog's unique constraint (paymentId, reminderType)
 * to guarantee each reminder is sent at most once.
 */
export async function runReminderSweep(): Promise<{ sent: number }> {
  const today = new Date();

  const candidates = await prisma.tuitionPayment.findMany({
    where: { isPaid: false },
    include: { student: { include: { class: true } }, period: true },
  });

  let sent = 0;

  for (const payment of candidates) {
    const dueDate = payment.period.endDate;
    if (!dueDate) continue;
    const reminderType = resolveReminderType(dueDate, today);
    if (!reminderType) continue;

    const { student } = payment;
    if (!student.parentEmail) continue;

    try {
      // Reserve the ReminderLog row first (unique constraint guards against
      // duplicate sends, including across concurrent runs of this job).
      await prisma.reminderLog.create({
        data: { studentId: student.id, paymentId: payment.id, reminderType },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Already sent for this (payment, reminderType) — skip.
        continue;
      }
      // eslint-disable-next-line no-console
      console.error("[reminder.job] Lỗi ghi ReminderLog:", err);
      continue;
    }

    try {
      await sendReminderEmail({
        studentName: student.fullName,
        className: student.class.name,
        periodName: payment.period.name,
        year: payment.period.year,
        amount: Math.max(Number(payment.expectedAmount.toString()) - Number(payment.paidAmount.toString()), 0),
        dueDate,
        parentEmail: student.parentEmail,
        reminderType,
      });
      sent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[reminder.job] Gửi email thất bại cho học sinh ${student.fullName} (${reminderType}):`,
        err
      );
      // Note: ReminderLog was already created to reserve the slot. If the
      // email genuinely failed to send, an operator can requeue manually;
      // we intentionally do not retry-loop here to avoid spamming SMTP.
    }
  }

  return { sent };
}

let scheduledTask: cron.ScheduledTask | null = null;

/** Registers the daily 08:00 (server time) cron job. Call once at server startup. */
export function scheduleReminderJob(): void {
  if (scheduledTask) return;

  scheduledTask = cron.schedule("0 8 * * *", () => {
    runReminderSweep()
      .then(({ sent }) => {
        // eslint-disable-next-line no-console
        console.log(`[reminder.job] Đã gửi ${sent} email nhắc học phí lúc ${new Date().toISOString()}`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[reminder.job] Lỗi khi chạy tác vụ nhắc học phí:", err);
      });
  });

  // eslint-disable-next-line no-console
  console.log("[reminder.job] Đã lên lịch chạy hàng ngày lúc 08:00.");
}

export default { runReminderSweep, scheduleReminderJob, resolveReminderType };
