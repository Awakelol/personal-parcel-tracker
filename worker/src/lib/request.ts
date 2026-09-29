import type { HonoRequest } from 'hono';
import { AppError } from '../errors';

export async function readJsonBody(req: HonoRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be valid JSON.');
  }
}
