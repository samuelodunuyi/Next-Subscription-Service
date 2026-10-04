import "dotenv/config";
import { prisma } from "../lib/prisma";
import { expireLapsedSubscriptions } from "../lib/billing/service";
import { purgeExpiredSessions } from "../lib/auth/session";

async function main() {
  await expireLapsedSubscriptions(prisma);
  console.log("Closed lapsed subscriptions");

  const sessions = await purgeExpiredSessions();
  console.log(`Purged ${sessions} expired sessions`);

  const limits = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  console.log(`Purged ${limits.count} expired rate limit counters`);

  const refunds = await prisma.payment.findMany({
    where: { requiresRefund: true },
    select: { id: true, userId: true, amount: true, currency: true, refundReason: true },
  });
  if (refunds.length > 0) {
    console.warn(`${refunds.length} payment(s) need a manual refund:`);
    console.table(refunds.map((p) => ({ ...p, amount: p.amount.toFixed(2) })));
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
