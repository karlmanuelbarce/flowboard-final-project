import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import { publishTaskEvent } from '../lib/events';
import { prisma } from '../lib/prisma';
import { requireUser } from '../middleware/authenticate';
import {
  CreateTaskSchema,
  TaskIdParam,
  UpdateTaskSchema,
  type CreateTaskInput,
  type TaskIdParamInput,
  type UpdateTaskInput,
} from '../schemas/task';

export const tasksRouter: Router = Router();

const assertBoardOwnedByUser = async (
  boardId: string,
  userId: string,
): Promise<void> => {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true },
  });
  if (!board) {
    throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
  }
  if (board.ownerId !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
};

const loadOwnedTask = async (
  taskId: string,
  userId: string,
): Promise<{ id: string; boardId: string }> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, boardId: true, board: { select: { ownerId: true } } },
  });
  if (!task) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }
  if (task.board.ownerId !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return { id: task.id, boardId: task.boardId };
};

export const getTask = async (
  req: Request<TaskIdParamInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);
    const { id } = TaskIdParam.parse(req.params);
    const task = await prisma.task.findUnique({
      where: { id },
      include: { board: { select: { ownerId: true } } },
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }
    if (task.board.ownerId !== user.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const { board: _board, ...taskData } = task;
    res.status(200).json({ success: true, data: taskData });
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
    const user = requireUser(req);
    const input = CreateTaskSchema.parse(req.body);

    await assertBoardOwnedByUser(input.boardId, user.id);

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        boardId: input.boardId,
      },
    });

    await publishTaskEvent({ action: 'CREATED', entityId: task.id, userId: user.id });

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
    const user = requireUser(req);
    const { id } = TaskIdParam.parse(req.params);
    const input = UpdateTaskSchema.parse(req.body);

    await loadOwnedTask(id, user.id);

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });

    await publishTaskEvent({ action: 'UPDATED', entityId: task.id, userId: user.id });

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
    const user = requireUser(req);
    const { id } = TaskIdParam.parse(req.params);

    await loadOwnedTask(id, user.id);

    await prisma.task.delete({ where: { id } });

    await publishTaskEvent({ action: 'DELETED', entityId: id, userId: user.id });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

tasksRouter.get('/:id', getTask);
tasksRouter.post('/', createTask);
tasksRouter.patch('/:id', updateTask);
tasksRouter.delete('/:id', deleteTask);
