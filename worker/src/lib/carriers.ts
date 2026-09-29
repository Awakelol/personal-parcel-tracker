import { COURIERS } from '../../../shared/api';
import type { CourierCode, TrackRequest } from '../../../shared/api';
import { AppError } from '../errors';

/** 17TRACK carrier IDs, from https://res.17track.net/asset/carrier/info/apicarrier.all.json */
const SEVENTEENTRACK_CARRIER_IDS: Record<CourierCode, number> = {
  'spx-ph': 100519,
  'jnt-ph': 100240,
  'ninjavan-ph': 100126,
  'flash-ph': 100480,
};

export const SPX_17TRACK_CARRIER_ID = SEVENTEENTRACK_CARRIER_IDS['spx-ph'];

/** SPX Philippines numbers look like SPXPH0xxxxxxxxxxx or PH123456789012A. */
const SPX_TRACKING_NUMBER_PATTERN = /^(SPXPH\d{8,}|PH\d{12}[A-Z])$/;

export type TrackingRoute =
  | { provider: 'spx' }
  | { provider: '17track'; carrierId: number | undefined };

export function resolveRoute({ trackingNumber, courierCode }: TrackRequest): TrackingRoute {
  if (courierCode === 'spx-ph') return { provider: 'spx' };

  if (!courierCode) {
    return SPX_TRACKING_NUMBER_PATTERN.test(trackingNumber)
      ? { provider: 'spx' }
      : { provider: '17track', carrierId: undefined };
  }

  if (isCourierCode(courierCode)) {
    return { provider: '17track', carrierId: SEVENTEENTRACK_CARRIER_IDS[courierCode] };
  }

  if (/^\d+$/.test(courierCode)) {
    return { provider: '17track', carrierId: Number(courierCode) };
  }

  throw new AppError(400, 'INVALID_REQUEST', `Unknown courier code "${courierCode}".`);
}

export function courierCodeFor17TrackId(carrierId: number): string {
  const match = COURIERS.find((c) => SEVENTEENTRACK_CARRIER_IDS[c.code] === carrierId);
  return match?.code ?? String(carrierId);
}

export function courierName(code: string): string | null {
  return COURIERS.find((c) => c.code === code)?.name ?? null;
}

function isCourierCode(code: string): code is CourierCode {
  return COURIERS.some((c) => c.code === code);
}
