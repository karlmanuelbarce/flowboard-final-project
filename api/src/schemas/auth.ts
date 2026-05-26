import { z } from 'zod';

const credentialsShape = {
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
};

export const RegisterSchema = z.object(credentialsShape).strict();
export const LoginSchema = z.object(credentialsShape).strict();

const refreshShape = { refreshToken: z.string().min(1) };
export const RefreshSchema = z.object(refreshShape).strict();
export const LogoutSchema = z.object(refreshShape).strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type LogoutInput = z.infer<typeof LogoutSchema>;
