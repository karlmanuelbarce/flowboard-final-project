import { z } from 'zod';

export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Priority = z.infer<typeof PriorityEnum>;

export const TaskIdParam = z.object({
  id: z.string().uuid(),
});

export const CreateTaskSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    priority: PriorityEnum.default('MEDIUM'),
    boardId: z.string().uuid(),
  })
  .strict();

export const UpdateTaskSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    priority: PriorityEnum.optional(),
  })
  .strict()
  .refine((o) => o.title !== undefined || o.priority !== undefined, {
    message: 'At least one of title or priority must be provided',
  });

export type TaskIdParamInput = z.infer<typeof TaskIdParam>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
