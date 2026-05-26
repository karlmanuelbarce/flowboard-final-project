import { execSync } from 'node:child_process';

// Run once before any test suite. Idempotent: `migrate deploy` no-ops if the
// schema is already at head. Tests get a clean schema in the dedicated test DB.
export default async (): Promise<void> => {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
};
