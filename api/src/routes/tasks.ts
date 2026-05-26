import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import {
  CreateTaskSchema,
  TaskIdParam,
  UpdateTaskSchema,
  type CreateTaskInput,
  type TaskIdParamInput,
  type UpdateTaskInput,
} from '../schemas/task';

export const tasksRouter: Router = Router();

export const getTask = async (
  req: Request<TaskIdParamInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = TaskIdParam.parse(req.params);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const createTask = async (
  req: Request<unknown, unknown, CreateTaskInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = CreateTaskSchema.parse(req.body);
    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        boardId: input.boardId,
      },
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const updateTask = async (
  req: Request<TaskIdParamInput, unknown, UpdateTaskInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = TaskIdParam.parse(req.params);
    const input = UpdateTaskSchema.parse(req.body);
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });
    res.status(200).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const deleteTask = async (
  req: Request<TaskIdParamInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = TaskIdParam.parse(req.params);
    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

tasksRouter.get('/:id', getTask);
tasksRouter.post('/', createTask);
tasksRouter.patch('/:id', updateTask);
tasksRouter.delete('/:id', deleteTask);
