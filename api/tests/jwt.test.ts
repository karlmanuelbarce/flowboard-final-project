import jwt from 'jsonwebtoken';

import { env } from '../src/lib/env';
import { verifyAccessToken, verifyRefreshToken } from '../src/lib/jwt';

// These tests exist because the happy-path integration tests sign tokens via
// the helpers in lib/jwt itself; they never exercise the payload-shape guards
// inside the verify functions. Sign a syntactically valid JWT with a missing
// or wrong-typed claim to hit those branches.
describe('verifyAccessToken', () => {
  it('returns the parsed payload on a well-formed token', () => {
    const token = jwt.sign({ sub: 'user-1' }, env.JWT_ACCESS_SECRET);
    expect(verifyAccessToken(token)).toEqual({ sub: 'user-1' });
  });

  it('throws when sub is missing', () => {
    const token = jwt.sign({ notSub: 'x' }, env.JWT_ACCESS_SECRET);
    expect(() => verifyAccessToken(token)).toThrow(/payload/i);
  });

  it('throws when the token was signed with a string payload', () => {
    // jwt.sign with a string payload produces a token whose `decoded` is a
    // string, not an object — hits the `typeof decoded !== 'object'` branch.
    const token = jwt.sign('not-an-object', env.JWT_ACCESS_SECRET);
    expect(() => verifyAccessToken(token)).toThrow(/payload/i);
  });
});

describe('verifyRefreshToken', () => {
  it('returns the parsed payload on a well-formed token', () => {
    const token = jwt.sign({ sub: 'user-1', jti: 'j-1' }, env.JWT_REFRESH_SECRET);
    expect(verifyRefreshToken(token)).toEqual({ sub: 'user-1', jti: 'j-1' });
  });

  it('throws when jti is missing', () => {
    const token = jwt.sign({ sub: 'user-1' }, env.JWT_REFRESH_SECRET);
    expect(() => verifyRefreshToken(token)).toThrow(/payload/i);
  });

  it('throws when sub is missing', () => {
    const token = jwt.sign({ jti: 'j-1' }, env.JWT_REFRESH_SECRET);
    expect(() => verifyRefreshToken(token)).toThrow(/payload/i);
  });
});
