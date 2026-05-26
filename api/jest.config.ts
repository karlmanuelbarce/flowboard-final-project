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
};

export default config;
