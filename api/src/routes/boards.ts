import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import {
  BoardIdParam,
  CreateBoardSchema,
  type BoardIdParamInput,
  type CreateBoardInput,
} from '../schemas/board';

export const boardsRouter: Router = Router();

// TODO(day-05): replace with req.user.id once the authenticate middleware lands.
// Matches the seeded dev user (api/prisma/seed.ts) so POST /boards has a valid FK.
const DEV_OWNER_ID = '00000000-0000-4000-8000-000000000001';

export const listBoards = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // TODO(day-05): scope by req.user.id once auth is wired.
    const boards = await prisma.board.findMany({ orderBy: { createdAt: 'asc' } });
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
    const input = CreateBoardSchema.parse(req.body);
    const board = await prisma.board.create({
      data: {
        name: input.name,
        ownerId: DEV_OWNER_ID,
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
    const { id } = BoardIdParam.parse(req.params);
    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
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
    const { id } = BoardIdParam.parse(req.params);

    const board = await prisma.board.findUnique({ where: { id } });
    if (!board) {
      throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
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
