import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody, ErrorCode } from '../../shared/api';

/** An error that is safe to expose to the client as-is. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
