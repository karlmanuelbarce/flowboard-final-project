import request from 'supertest';
import type { Express } from 'express';

export interface RegisteredUser {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

let counter = 0;

// Each registered user gets a unique email so independent tests inside a single
// file do not collide even though beforeEach truncates between them.
export const registerUser = async (
  app: Express,
  password: string = 'correct-horse-staple-12',
): Promise<RegisteredUser> => {
  counter += 1;
  const email = `user-${Date.now()}-${counter}@example.com`;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  return {
    userId: res.body.data.user.id,
    email,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
};

export const createBoard = async (
  app: Express,
  accessToken: string,
  name: string = 'Test Board',
): Promise<string> => {
  const res = await request(app)
    .post('/boards')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);
  return res.body.data.id;
};
