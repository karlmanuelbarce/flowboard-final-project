import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // bcrypt cost 12 + a shared test DB make parallel runs both slow and racy.
  // Single worker keeps the suite deterministic.
  maxWorkers: 1,
  testTimeout: 30_000,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**',
    // Generated/instantiation-only — covered indirectly by every other test.
    '!src/lib/prisma.ts',
    // Entrypoint binds a port and registers signal handlers; exercised by the
    // running container, not by Jest.
    '!src/server.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
};

export default config;
