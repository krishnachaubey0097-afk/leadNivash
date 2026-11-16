import { Model, Types } from 'mongoose';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Asserts that a MongoDB document exists and belongs to the given user.
 * ALWAYS returns 404 NOT_FOUND instead of 403 FORBIDDEN to prevent IDOR scanning.
 * Returns 404 on invalid ObjectIds (never 500 CastError).
 */
export async function assertOwnership<T>(
  ModelClass: Model<T>,
  resourceId: string,
  userId: string,
  extraFilter: Record<string, unknown> = {}
): Promise<T> {
  if (!Types.ObjectId.isValid(resourceId) || !Types.ObjectId.isValid(userId)) {
    const err: AppError = new Error('Resource not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const query: Record<string, unknown> = {
    _id: new Types.ObjectId(resourceId),
    userId: new Types.ObjectId(userId),
    ...extraFilter,
  };

  if (ModelClass.schema?.path('isDeleted')) {
    query.isDeleted = false;
  }

  const doc = await ModelClass.findOne(query);

  if (!doc) {
    const err: AppError = new Error('Resource not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return doc as T;
}
