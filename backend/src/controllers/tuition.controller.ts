import { Request, Response } from "express";
import prisma from "../config/db";
import { toNumber } from "../utils/money";
import { AppError } from "../middleware/errorHandler";
import { setPaymentStatus } from "../services/tuition.service";

export async function getTuitionGrid(req: Request, res: Response) {
  const userId = req.user!.id;
  const year = parseInt((req.query.year as string) ?? "", 10) || new Date().getFullYear();
  const classId = req.query.classId as string | undefined;

  const where: any = { class: { userId } };
  if (classId) where.classId = classId;

  const students = await prisma.student.findMany({
    where,
    include: {
      class: true,
      payments: { where: { year }, orderBy: { month: "asc" } },
    },
    orderBy: { fullName: "asc" },
  });

  const result = students.map((s) => {
    const paymentsByMonth = new Map(s.payments.map((p) => [p.month, p]));
    const payments = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const p = paymentsByMonth.get(month);
      return {
        month,
        isPaid: p?.isPaid ?? false,
        paidDate: p?.paidDate ?? null,
        dueDate: p?.dueDate ?? null,
      };
    });

    return {
      id: s.id,
      fullName: s.fullName,
      className: s.class.name,
      monthlyTuitionFee: toNumber(s.monthlyTuitionFee),
      payments,
    };
  });

  res.json({ students: result });
}

export async function updateTuitionPayment(req: Request, res: Response) {
  const userId = req.user!.id;
  const { studentId, year, month } = req.params;
  const { isPaid } = req.body ?? {};

  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);

  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 3000) {
    throw new AppError("Năm không hợp lệ.");
  }
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new AppError("Tháng không hợp lệ (1-12).");
  }
  if (typeof isPaid !== "boolean") {
    throw new AppError("Trường isPaid là bắt buộc và phải là boolean.");
  }

  const student = await prisma.student.findFirst({ where: { id: studentId, class: { userId } } });
  if (!student) {
    throw new AppError("Không tìm thấy học sinh.", 404);
  }

  const payment = await setPaymentStatus({ studentId, year: yearNum, month: monthNum, isPaid });

  res.json({
    id: payment.id,
    studentId: payment.studentId,
    year: payment.year,
    month: payment.month,
    isPaid: payment.isPaid,
    paidDate: payment.paidDate,
    amount: toNumber(payment.amount),
    dueDate: payment.dueDate,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  });
}

export default { getTuitionGrid, updateTuitionPayment };
