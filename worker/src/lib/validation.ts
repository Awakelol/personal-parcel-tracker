import type { TrackRequest } from '../../../shared/api';
import { AppError } from '../errors';

const TRACKING_NUMBER_PATTERN = /^[A-Z0-9]{5,40}$/;
const COURIER_CODE_PATTERN = /^[a-z0-9-]{2,50}$/;

function invalid(message: string): AppError {
  return new AppError(400, 'INVALID_REQUEST', message);
}

/** Validates and normalises the POST /api/track body. */
export function parseTrackRequest(body: unknown): TrackRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('Request body must be a JSON object.');
  }

  const { trackingNumber, courierCode } = body as Record<string, unknown>;

  if (typeof trackingNumber !== 'string') {
    throw invalid('`trackingNumber` is required and must be a string.');
  }

  // Carriers often print numbers with spaces or dashes; strip them so the
  // cache key is stable regardless of how the user pasted it.
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
    throw invalid('`courierCode` is not a valid TrackingMore courier code.');
  }

  return { trackingNumber: normalizedNumber, courierCode: normalizedCourier };
}
