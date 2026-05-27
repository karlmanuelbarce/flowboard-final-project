import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { requireUser } from '../middleware/authenticate';
import {
  BoardIdParam,
  CreateBoardSchema,
  type BoardIdParamInput,
  type CreateBoardInput,
} from '../schemas/board';

export const boardsRouter: Router = Router();

export const listBoards = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);
    const boards = await prisma.board.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ success: true, data: boards });
  } catch (err) {
    next(err);
  }
};

export const createBoard = async (
  req: Request<unknown, unknown, CreateBoardInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);
    const input = CreateBoardSchema.parse(req.body);
    const board = await prisma.board.create({
      data: {
        name: input.name,
        ownerId: user.id,
      },
    });
    res.status(201).json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
};

export const getBoard = async (
  req: Request<BoardIdParamInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);
    const { id } = BoardIdParam.parse(req.params);
    const board = await prisma.board.findUnique({ where: { id } });
    // Read-mismatch policy: collapse "exists but not yours" into the same 404
    // shape as "does not exist" so an attacker cannot enumerate board IDs.
    // Writes (PATCH/DELETE) keep 403 — see ai-context.md "Authorization Leak Policy".
    if (!board || board.ownerId !== user.id) {
      throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
    }
    res.status(200).json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
};

export const deleteBoard = async (
  req: Request<BoardIdParamInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = requireUser(req);
    const { id } = BoardIdParam.parse(req.params);

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
    }
    if (board.ownerId !== user.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    // Block-on-children: preserve audit trail; do not cascade-delete tasks silently.
    const taskCount = await prisma.task.count({ where: { boardId: id } });
    if (taskCount > 0) {
      throw new AppError(
        'Board has tasks; delete them first',
        409,
        'BOARD_HAS_TASKS',
      );
    }

    await prisma.board.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

boardsRouter.get('/', listBoards);
boardsRouter.post('/', createBoard);
boardsRouter.get('/:id', getBoard);
boardsRouter.delete('/:id', deleteBoard);
