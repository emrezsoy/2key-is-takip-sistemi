import { Client, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  const passwordHash = await hash("sifre123");

  const admin = await prisma.user.upsert({
    where: { username: "emre" },
    update: {},
    create: {
      username: "emre",
      passwordHash,
      email: "emre.ozsoy@101fps.com",
      fullName: "Emre Özsoy",
      role: "ADMIN",
      employmentType: "Admin",
      isActive: true,
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { username: "ayse" },
    update: {},
    create: {
      username: "ayse",
      passwordHash,
      email: "ayse@ajans.com",
      fullName: "Ayşe Demir",
      role: "SUPERVISOR",
      employmentType: "Fulltime",
      dailyRate: 1200,
      isActive: true,
    },
  });

  const mehmet = await prisma.user.upsert({
    where: { username: "mehmet" },
    update: {},
    create: {
      username: "mehmet",
      passwordHash,
      email: "mehmet@ajans.com",
      fullName: "Mehmet Kaya",
      role: "EMPLOYEE",
      employmentType: "Fulltime",
      dailyRate: 900,
      supervisorId: supervisor.id,
      isActive: true,
    },
  });

  const elif = await prisma.user.upsert({
    where: { username: "elif" },
    update: {},
    create: {
      username: "elif",
      passwordHash,
      email: "elif@ajans.com",
      fullName: "Elif Arslan",
      role: "EMPLOYEE",
      employmentType: "Stajyer",
      dailyRate: 500,
      supervisorId: supervisor.id,
      isActive: true,
    },
  });

  const clientNames = ["Anında Kolay", "MediFlow", "Luna", "Greeny", "NovaTech", "Vista", "Cafe Nero"];
  const clients: Client[] = [];
  for (const name of clientNames) {
    clients.push(
      await prisma.client.upsert({
        where: { id: name },
        update: {},
        create: { id: name, name },
      })
    );
  }

  const findClient = (name: string) => clients.find((c) => c.name === name)!;

  const today = new Date();
  for (let i = -20; i < 15; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;

    for (const user of [supervisor, mehmet, elif]) {
      await prisma.attendance.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: {},
        create: {
          userId: user.id,
          date,
          dayType: isWeekend ? "NONE" : "FULL",
        },
      });
    }
  }

  const taskSeed: {
    title: string;
    client: string;
    assignee: typeof mehmet;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    status: "TODO" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE";
    durationValue: number;
    durationUnit: "HOUR" | "DAY";
  }[] = [
    { title: "Instagram kampanya postu", client: "Anında Kolay", assignee: mehmet, urgency: "LOW", status: "TODO", durationValue: 1, durationUnit: "DAY" },
    { title: "Reel çekim ve kurgu", client: "Anında Kolay", assignee: mehmet, urgency: "HIGH", status: "IN_PROGRESS", durationValue: 2, durationUnit: "DAY" },
    { title: "Logo tasarım revizyonu", client: "Vista", assignee: elif, urgency: "MEDIUM", status: "IN_PROGRESS", durationValue: 4, durationUnit: "HOUR" },
    { title: "Kampanya stratejisi", client: "MediFlow", assignee: mehmet, urgency: "HIGH", status: "PENDING_APPROVAL", durationValue: 3, durationUnit: "DAY" },
    { title: "Web tasarım taslağı", client: "Luna", assignee: elif, urgency: "MEDIUM", status: "PENDING_APPROVAL", durationValue: 2, durationUnit: "DAY" },
    { title: "Reel #10", client: "Anında Kolay", assignee: mehmet, urgency: "LOW", status: "DONE", durationValue: 1, durationUnit: "DAY" },
    { title: "Logo tasarımı", client: "Cafe Nero", assignee: elif, urgency: "MEDIUM", status: "DONE", durationValue: 1, durationUnit: "DAY" },
  ];

  for (const t of taskSeed) {
    const existing = await prisma.task.findFirst({ where: { title: t.title, assignedToId: t.assignee.id } });
    if (existing) continue;

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);

    const task = await prisma.task.create({
      data: {
        title: t.title,
        clientId: findClient(t.client).id,
        assignedToId: t.assignee.id,
        createdById: admin.id,
        durationValue: t.durationValue,
        durationUnit: t.durationUnit,
        urgency: t.urgency,
        status: t.status,
        calculatedDeadline: deadline,
        completedAt: t.status === "DONE" ? new Date() : null,
      },
    });

    await prisma.activity.create({
      data: {
        userId: admin.id,
        taskId: task.id,
        message: `"${task.title}" görevini ekledi`,
      },
    });
  }

  console.log("Seed tamamlandı.");
  console.log("Giriş bilgileri (hepsi aynı şifre): sifre123");
  console.log("  admin      -> emre / sifre123");
  console.log("  süpervizör -> ayse / sifre123");
  console.log("  çalışan    -> mehmet / sifre123");
  console.log("  çalışan    -> elif / sifre123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
