import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";

const DEFAULT_PLANS = [
  { name: "Basic", description: "Core features for individuals", price: 4.99, interval: "MONTHLY" },
  {
    name: "Pro",
    description: "Everything in Basic, plus priority support",
    price: 9.99,
    interval: "MONTHLY",
  },
  {
    name: "Pro Annual",
    description: "Pro, billed yearly (two months free)",
    price: 99.9,
    interval: "YEARLY",
  },
] as const;

async function seedPlans() {
  if ((await prisma.plan.count()) > 0) {
    console.log("Plans already exist; skipping plan seed");
    return;
  }
  await prisma.plan.createMany({
    data: DEFAULT_PLANS.map((plan) => ({ ...plan, currency: "GBP" })),
  });
  console.log(`Seeded ${DEFAULT_PLANS.length} plans`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("ADMIN_EMAIL not set; skipping admin seed");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    console.log(`Promoted ${email} to ADMIN`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD (min 8 chars) is required to create the admin user");
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
    },
  });
  console.log(`Created admin ${email}`);
}

async function main() {
  await seedPlans();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
