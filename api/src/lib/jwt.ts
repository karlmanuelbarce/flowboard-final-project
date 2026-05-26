import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from './env';

export interface AccessTokenPayload {
  sub: string;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

export const signAccessToken = (userId: string): string =>
  jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });

export const signRefreshToken = (userId: string, jti: string): string =>
  jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
  });

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as { sub?: unknown }).sub !== 'string'
  ) {
    throw new Error('Invalid access token payload');
  }
  return { sub: (decoded as { sub: string }).sub };
};
