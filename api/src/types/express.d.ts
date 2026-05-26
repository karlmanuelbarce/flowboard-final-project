// Augment Express's Request so handlers behind `authenticate` can read `req.user`.
// The middleware sets it; routes that bypass authenticate (e.g. /auth/*) leave it undefined.
import 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export {};
