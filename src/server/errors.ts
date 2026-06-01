export class BadRequestError extends Error {
  readonly statusCode = 400;
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
}

export class ConflictError extends Error {
  readonly statusCode = 409;
}

export function statusCodeForError(error: unknown): number | undefined {
  if (
    error instanceof BadRequestError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return error.statusCode;
  }

  return undefined;
}

export function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}
