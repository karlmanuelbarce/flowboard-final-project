import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../lib/jwt';

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      throw new AppError('Missing Authorization header', 401, 'UNAUTHORIZED');
    }

    const [scheme, token, ...rest] = header.split(' ');
    if (scheme !== 'Bearer' || !token || rest.length > 0) {
      throw new AppError('Malformed Authorization header', 401, 'UNAUTHORIZED');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      // Collapse JsonWebTokenError / TokenExpiredError / payload-shape errors into one code
      // so we don't leak which kind of failure happened.
      throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
    }

    req.user = { id: payload.sub };
    next();
  } catch (err) {
    next(err);
  }
};

// Accept any Request shape — handlers may parameterize their params/body generics,
// and we only need to peek at .user (set by the authenticate middleware above).
export const requireUser = (req: { user?: { id: string } }): { id: string } => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, 'UNAUTHORIZED');
  }
  return req.user;
};
