import { randomUUID } from 'node:crypto';

import bcrypt from 'bcrypt';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import {
  LoginSchema,
  RegisterSchema,
  type LoginInput,
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

const issueTokens = (userId: string): { accessToken: string; refreshToken: string } => ({
  accessToken: signAccessToken(userId),
  refreshToken: signRefreshToken(userId, randomUUID()),
});

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

    const tokens = issueTokens(user.id);
    res.status(201).json({
      success: true,
      data: { user, ...tokens },
    });
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

    const user = await prisma.user.findUnique({ where: { email } });
    const hashToCompare = user?.password ?? DUMMY_HASH;
    const ok = await bcrypt.compare(input.password, hashToCompare);

    if (!user || !ok) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const tokens = issueTokens(user.id);
    res.status(200).json({
      success: true,
      data: { user: { id: user.id, email: user.email }, ...tokens },
    });
  } catch (err) {
    next(err);
  }
};

authRouter.post('/register', register);
authRouter.post('/login', login);
