import { PrismaClient } from "@prisma/client";
import { createYearlyPaymentsForStudent } from "../src/services/tuition.service";

const prisma = new PrismaClient();

async function main() {
  const year = new Date().getFullYear();

  const user = await prisma.user.upsert({
    where: { email: "demo.teacher@example.com" },
    update: {},
    create: {
      email: "demo.teacher@example.com",
      name: "Giáo viên Demo",
      provider: "google",
      providerId: "demo-seed-user",
    },
  });

  const classesData = [
    { name: "Hóa 10A1", defaultTuitionFee: 500000 },
    { name: "Hóa 11A2", defaultTuitionFee: 600000 },
  ];

  for (const c of classesData) {
    let cls = await prisma.class.findFirst({ where: { name: c.name, userId: user.id } });
    if (!cls) {
      cls = await prisma.class.create({
        data: { name: c.name, defaultTuitionFee: c.defaultTuitionFee, userId: user.id },
      });
    }

    const studentNames =
      c.name === "Hóa 10A1"
        ? ["Nguyễn Văn An", "Trần Thị Bình", "Lê Hoàng Cường"]
        : ["Phạm Thị Dung", "Hoàng Văn Em", "Vũ Thị Phương"];

    for (const fullName of studentNames) {
      const existing = await prisma.student.findFirst({ where: { fullName, classId: cls.id } });
      if (existing) continue;

      const student = await prisma.student.create({
        data: {
          fullName,
          classId: cls.id,
          parentEmail: null,
          parentPhone: null,
          monthlyTuitionFee: c.defaultTuitionFee,
        },
      });

      await createYearlyPaymentsForStudent(prisma, {
        studentId: student.id,
        monthlyTuitionFee: c.defaultTuitionFee,
        year,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log("Đã seed dữ liệu mẫu thành công.");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
