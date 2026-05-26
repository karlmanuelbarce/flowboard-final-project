import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

// Runs before EACH test so every test starts from a known-empty state.
// TRUNCATE ... CASCADE handles FK dependencies in one statement.
// redis.flushdb() targets only DB index 1 (set via REDIS_URL in compose.test.yml),
// so the dev Redis DB 0 is never touched.
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "Task", "Board", "User" RESTART IDENTITY CASCADE',
  );
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});
