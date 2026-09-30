import type { TrackRequest } from '../../../shared/api';
import { AppError } from '../errors';

const TRACKING_NUMBER_PATTERN = /^[A-Z0-9]{5,40}$/;
const COURIER_CODE_PATTERN = /^[a-z0-9-]{2,50}$/;

function invalid(message: string): AppError {
  return new AppError(400, 'INVALID_REQUEST', message);
}

export function parseTrackRequest(body: unknown): TrackRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('Request body must be a JSON object.');
  }

  const { trackingNumber, courierCode } = body as Record<string, unknown>;

  if (typeof trackingNumber !== 'string') {
    throw invalid('`trackingNumber` is required and must be a string.');
  }

  // Numbers are often pasted with spaces or dashes.
  const normalizedNumber = trackingNumber.replace(/[\s-]/g, '').toUpperCase();
  if (!TRACKING_NUMBER_PATTERN.test(normalizedNumber)) {
    throw invalid('`trackingNumber` must be 5-40 letters or digits.');
  }

  if (courierCode === undefined || courierCode === null || courierCode === '') {
    return { trackingNumber: normalizedNumber };
  }

  if (typeof courierCode !== 'string') {
    throw invalid('`courierCode` must be a string.');
  }

  const normalizedCourier = courierCode.trim().toLowerCase();
  if (!COURIER_CODE_PATTERN.test(normalizedCourier)) {
    throw invalid('`courierCode` is not a valid courier code.');
  }

  return { trackingNumber: normalizedNumber, courierCode: normalizedCourier };
}

const MAX_DESTINATION_LENGTH = 80;

/** A city or province, e.g. "Tacloban City, Leyte". Empty means none. */
export function parseDestination(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, MAX_DESTINATION_LENGTH);
  return cleaned || undefined;
}
