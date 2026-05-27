import pino from 'pino';
import { Writable } from 'node:stream';

import { loggerOptions } from '../src/lib/logger';

// Build a sibling logger from the shared loggerOptions so the test asserts
// against the exact redact config the production singleton uses, without
// touching the singleton's stdout stream.
const buildCapturingLogger = (): { logger: pino.Logger; output: () => string } => {
  let buffer = '';
  const sink = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void): void {
      buffer += chunk.toString('utf8');
      cb();
    },
  });
  const logger = pino({ ...loggerOptions, level: 'info' }, sink);
  return { logger, output: (): string => buffer };
};

describe('logger redaction', () => {
  it('redacts Authorization header and password/refreshToken/token in body', () => {
    const { logger, output } = buildCapturingLogger();
    logger.info(
      {
        req: { headers: { authorization: 'Bearer secret-access-token-xxx', cookie: 'sid=abc' } },
        body: { password: 'plaintext-password', refreshToken: 'rt-secret', token: 'tk-secret' },
      },
      'auth attempt',
    );

    const line = output();
    // The censor value should be present at every redacted path…
    expect(line).toContain('[REDACTED]');
    // …and none of the plaintext secrets should be anywhere in the line.
    expect(line).not.toContain('Bearer secret-access-token-xxx');
    expect(line).not.toContain('plaintext-password');
    expect(line).not.toContain('rt-secret');
    expect(line).not.toContain('tk-secret');
    expect(line).not.toContain('sid=abc');
  });

  it('redacts wildcard *.password / *.token / *.refreshToken nested fields', () => {
    const { logger, output } = buildCapturingLogger();
    logger.info(
      {
        user: { password: 'should-not-leak', refreshToken: 'rt-2', token: 'tk-2' },
      },
      'user event',
    );

    const line = output();
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('should-not-leak');
    expect(line).not.toContain('rt-2');
    expect(line).not.toContain('tk-2');
  });

  it('does NOT redact unrelated fields', () => {
    const { logger, output } = buildCapturingLogger();
    logger.info({ user: { id: 'user-123', email: 'alice@example.com' } }, 'ok');
    const line = output();
    expect(line).toContain('user-123');
    expect(line).toContain('alice@example.com');
  });
});
