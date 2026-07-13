import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@example.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Password123!";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? DEMO_PASSWORD;


async function main() {
  const demoPasswordHash = await bcryptjs.hash(DEMO_PASSWORD, 10);
  const adminPasswordHash = await bcryptjs.hash(ADMIN_PASSWORD, 10);

  // Demo user (DEVELOPER)
  await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      enabled: true,
      name: "Demo Operator",
      password: demoPasswordHash,
      role: "DEVELOPER"
    },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Operator",
      password: demoPasswordHash,
      role: "DEVELOPER",
      enabled: true
    }
  });

  // Admin user (ADMIN)
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      enabled: true,
      name: "Admin Operator",
      password: adminPasswordHash,
      role: "ADMIN"
    },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin Operator",
      password: adminPasswordHash,
      role: "ADMIN",
      enabled: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });


