import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

const USER_ID = '00000000-0000-4000-8000-000000000001';
const BOARD_ONE_ID = '00000000-0000-4000-8000-000000000002';
const BOARD_TWO_ID = '00000000-0000-4000-8000-000000000003';
const TASK_A_ID = '00000000-0000-4000-8000-000000000004';
const TASK_B_ID = '00000000-0000-4000-8000-000000000005';
const TASK_C_ID = '00000000-0000-4000-8000-000000000006';

const SEED_EMAIL = 'dev@flowboard.test';
const SEED_PASSWORD = 'dev-password-not-for-production';

const main = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    update: {},
    create: {
      id: USER_ID,
      email: SEED_EMAIL,
      password: passwordHash,
    },
  });

  await prisma.board.upsert({
    where: { id: BOARD_ONE_ID },
    update: { name: 'Backlog' },
    create: { id: BOARD_ONE_ID, name: 'Backlog', ownerId: user.id },
  });

  await prisma.board.upsert({
    where: { id: BOARD_TWO_ID },
    update: { name: 'In Flight' },
    create: { id: BOARD_TWO_ID, name: 'In Flight', ownerId: user.id },
  });

  await prisma.task.upsert({
    where: { id: TASK_A_ID },
    update: { title: 'Ship Day 3', priority: 'HIGH' },
    create: {
      id: TASK_A_ID,
      title: 'Ship Day 3',
      description: 'Prisma schema + seed',
      priority: 'HIGH',
      boardId: BOARD_ONE_ID,
    },
  });

  await prisma.task.upsert({
    where: { id: TASK_B_ID },
    update: { title: 'Write integration tests' },
    create: {
      id: TASK_B_ID,
      title: 'Write integration tests',
      priority: 'MEDIUM',
      boardId: BOARD_ONE_ID,
    },
  });

  await prisma.task.upsert({
    where: { id: TASK_C_ID },
    update: { title: 'Document API' },
    create: {
      id: TASK_C_ID,
      title: 'Document API',
      priority: 'LOW',
      boardId: BOARD_ONE_ID,
    },
  });

  logger.info(
    { user: user.email, boards: 2, tasks: 3 },
    'seed complete',
  );
};

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
