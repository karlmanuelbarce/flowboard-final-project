import { z } from 'zod';

import { prisma } from '../prisma';

// Redis Stream entries arrive as a flat [k, v, k, v, ...] string array.
// Convert to a record, then validate via Zod so any malformed event is rejected
// at the boundary rather than crashing the handler with an obscure DB error.
const fieldsToRecord = (fields: string[]): Record<string, string> => {
  const record: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key === undefined || value === undefined) continue;
    record[key] = value;
  }
  return record;
};

const TaskEventSchema = z.object({
  action: z.enum(['CREATED', 'UPDATED', 'DELETED']),
  entity: z.literal('Task'),
  entityId: z.string().uuid(),
  userId: z.string().uuid(),
  occurredAt: z.string().optional(),
});

export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const parseTaskEvent = (fields: string[]): TaskEvent =>
  TaskEventSchema.parse(fieldsToRecord(fields));

export const handleTaskEvent = async (event: TaskEvent): Promise<void> => {
  await prisma.auditLog.create({
    data: {
      userId: event.userId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
    },
  });
};
