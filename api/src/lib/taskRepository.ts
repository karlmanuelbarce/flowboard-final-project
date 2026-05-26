import { randomUUID } from 'node:crypto';

import type { CreateTaskInput, Priority, UpdateTaskInput } from '../schemas/task';

// TODO(day-03): replace this in-memory store with Prisma (`prisma.task.*`).
// Kept narrow so the handler signatures and Day-3 swap stay mechanical.

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  boardId: string;
  createdAt: Date;
  updatedAt: Date;
}

const store = new Map<string, TaskRecord>();

export const taskRepository = {
  findById(id: string): TaskRecord | null {
    return store.get(id) ?? null;
  },

  create(input: CreateTaskInput): TaskRecord {
    const now = new Date();
    const record: TaskRecord = {
      id: randomUUID(),
      title: input.title,
      description: input.description ?? null,
      status: 'TODO',
      priority: input.priority,
      boardId: input.boardId,
      createdAt: now,
      updatedAt: now,
    };
    store.set(record.id, record);
    return record;
  },

  update(id: string, input: UpdateTaskInput): TaskRecord | null {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: TaskRecord = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      updatedAt: new Date(),
    };
    store.set(id, updated);
    return updated;
  },

  delete(id: string): boolean {
    return store.delete(id);
  },
};
