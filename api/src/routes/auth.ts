import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt';
import * as loginThrottle from '../lib/loginThrottle';
import { prisma } from '../lib/prisma';
import * as refreshStore from '../lib/refreshStore';
import { rateLimiter } from '../middleware/rateLimiter';
import {
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RegisterInput,
} from '../schemas/auth';

export const authRouter: Router = Router();

const BCRYPT_COST = 12;

// Precomputed dummy hash used when the email does not exist on login.
// Forces bcrypt.compare to run so the response time is uniform — prevents
// attackers from distinguishing "unknown email" from "wrong password" by latency.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalization', BCRYPT_COST);

interface PrismaKnownError {
  code: string;
  name: 'PrismaClientKnownRequestError';
}

const isPrismaUniqueViolation = (err: unknown): err is PrismaKnownError =>
  typeof err === 'object' &&
  err !== null &&
  (err as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
  (err as { code?: unknown }).code === 'P2002';

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

const issueTokens = (userId: string): IssuedTokens => {
  const refreshTokenId = randomUUID();
  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId, refreshTokenId),
    refreshTokenId,
  };
};

const respondWithTokens = async (
  res: Response,
  status: 200 | 201,
  userId: string,
  user: { id: string; email: string },
): Promise<void> => {
  const tokens = issueTokens(userId);
  await refreshStore.store(userId, tokens.refreshTokenId);
  res.status(status).json({
    success: true,
    data: {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
};

export const register = async (
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = RegisterSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    let user;
    try {
      user = await prisma.user.create({
        data: { email, password: passwordHash },
        select: { id: true, email: true },
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');
      }
      throw err;
    }

    await respondWithTokens(res, 201, user.id, user);
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request<unknown, unknown, LoginInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = LoginSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const ip = req.ip ?? 'unknown';
    const attemptId = { email, ip };

    // Brute-force gate runs BEFORE bcrypt to short-circuit cheap attempts.
    // assertNotLocked is fail-open on Redis errors (see loginThrottle.ts).
    await loginThrottle.assertNotLocked(attemptId);

    const user = await prisma.user.findUnique({ where: { email } });
    const hashToCompare = user?.password ?? DUMMY_HASH;
    const ok = await bcrypt.compare(input.password, hashToCompare);

    if (!user || !ok) {
      // Bump counters BEFORE throwing so the very next attempt sees the new count.
      await loginThrottle.registerFailedLogin(attemptId);
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    // Clear both counters on success so a user who fumbled then succeeded is
    // not locked out on their next legitimate attempt.
    await loginThrottle.clearLoginFailures(attemptId);

    await respondWithTokens(res, 200, user.id, { id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
};

const INVALID_REFRESH_TOKEN = (): AppError =>
  new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');

export const refresh = async (
  req: Request<unknown, unknown, RefreshInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = RefreshSchema.parse(req.body);

    let payload;
    try {
      payload = verifyRefreshToken(input.refreshToken);
    } catch {
      // Collapse signature / expired / payload-shape into one code to avoid leaking
      // which path failed. Redis-down errors are NOT caught here — those bubble up
      // as 500. Failing-open on this path would make stolen refresh tokens replayable
      // for as long as Redis is down. Day 11+ may add hardening; for now: hard-fail.
      throw INVALID_REFRESH_TOKEN();
    }

    const consumed = await refreshStore.consume(payload.sub, payload.jti);
    if (!consumed) {
      // Either the token was already used (replay) or never stored. Either way: 401.
      throw INVALID_REFRESH_TOKEN();
    }

    const tokens = issueTokens(payload.sub);
    await refreshStore.store(payload.sub, tokens.refreshTokenId);

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (
  req: Request<unknown, unknown, LogoutInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = LogoutSchema.parse(req.body);

    let payload;
    try {
      payload = verifyRefreshToken(input.refreshToken);
    } catch {
      // Can't identify whose key to delete if the JWT itself is invalid.
      throw INVALID_REFRESH_TOKEN();
    }

    // Idempotent: 204 whether the key was present or not.
    await refreshStore.consume(payload.sub, payload.jti);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

authRouter.post('/register', rateLimiter, register);
authRouter.post('/login', rateLimiter, login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
