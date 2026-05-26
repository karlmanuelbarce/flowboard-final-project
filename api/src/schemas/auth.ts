import { z } from 'zod';

const credentialsShape = {
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
};

export const RegisterSchema = z.object(credentialsShape).strict();
export const LoginSchema = z.object(credentialsShape).strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
