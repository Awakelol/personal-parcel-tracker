import { Hono } from 'hono';
import type { SavedParcel, SavedParcelWithLatest } from '../../../shared/api';
import type { AppBindings } from '../env';
import { AppError } from '../errors';
import { cacheKey, readCachedResult } from '../lib/cache';
import { readJsonBody } from '../lib/request';
import { parseDestination, parseTrackRequest } from '../lib/validation';

const MAX_PARCELS = 100;
const MAX_NAME_LENGTH = 60;
const MAX_SCAN_KEY_LENGTH = 300;

const storageKey = (userId: string) => `parcels:${userId}`;

async function loadParcels(kv: KVNamespace, userId: string): Promise<SavedParcel[]> {
  return (await kv.get<SavedParcel[]>(storageKey(userId), 'json')) ?? [];
}

async function storeParcels(kv: KVNamespace, userId: string, parcels: SavedParcel[]): Promise<void> {
  await kv.put(storageKey(userId), JSON.stringify(parcels));
}

function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new AppError(400, 'INVALID_REQUEST', 'Give the parcel a name.');
  return name.slice(0, MAX_NAME_LENGTH);
}

function parseScanKey(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, MAX_SCAN_KEY_LENGTH) : undefined;
}

export const parcelsRoute = new Hono<AppBindings>();

parcelsRoute.get('/', async (c) => {
  const parcels = await loadParcels(c.env.USER_DATA, c.get('user').id);

  const withLatest = await Promise.all(
    parcels.map(async (parcel): Promise<SavedParcelWithLatest> => {
      const key = cacheKey({ trackingNumber: parcel.trackingNumber, courierCode: parcel.courierCode });
      return { ...parcel, latest: await readCachedResult(c.env.TRACKING_CACHE, key) };
    }),
  );
  return c.json(withLatest);
});

parcelsRoute.put('/:trackingNumber', async (c) => {
  const body = await readJsonBody(c.req);
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const { trackingNumber, courierCode } = parseTrackRequest({
    trackingNumber: c.req.param('trackingNumber'),
    courierCode: fields.courierCode,
  });
  const name = parseName(fields.name);

  const user = c.get('user');
  const parcels = await loadParcels(c.env.USER_DATA, user.id);
  const existing = parcels.find((p) => p.trackingNumber === trackingNumber);

  const seenLatest = parseScanKey(fields.seenLatest) ?? existing?.seenLatest;
  // Omitted keeps the current destination; an empty string clears it.
  const destination = fields.destination === undefined ? existing?.destination : parseDestination(fields.destination);
  const parcel: SavedParcel = {
    trackingNumber,
    ...(courierCode && { courierCode }),
    name,
    savedAt: existing?.savedAt ?? new Date().toISOString(),
    ...(seenLatest && { seenLatest }),
    ...(destination && { destination }),
  };

  if (!existing && parcels.length >= MAX_PARCELS) {
    throw new AppError(400, 'INVALID_REQUEST', `You can save up to ${MAX_PARCELS} parcels. Remove some first.`);
  }

  const next = existing
    ? parcels.map((p) => (p.trackingNumber === trackingNumber ? parcel : p))
    : [parcel, ...parcels];
  await storeParcels(c.env.USER_DATA, user.id, next);
  return c.json(parcel);
});

// Records the latest scan the user has looked at, which clears the "new update" badge.
parcelsRoute.post('/:trackingNumber/seen', async (c) => {
  const { trackingNumber } = parseTrackRequest({ trackingNumber: c.req.param('trackingNumber') });
  const latest = parseScanKey(((await readJsonBody(c.req)) as Record<string, unknown> | null)?.latest);
  if (!latest) throw new AppError(400, 'INVALID_REQUEST', '`latest` is required.');

  const user = c.get('user');
  const parcels = await loadParcels(c.env.USER_DATA, user.id);
  if (!parcels.some((p) => p.trackingNumber === trackingNumber)) {
    throw new AppError(404, 'NOT_FOUND', 'That parcel isn’t saved.');
  }
  await storeParcels(
    c.env.USER_DATA,
    user.id,
    parcels.map((p) => (p.trackingNumber === trackingNumber ? { ...p, seenLatest: latest } : p)),
  );
  return c.body(null, 204);
});

parcelsRoute.delete('/:trackingNumber', async (c) => {
  const { trackingNumber } = parseTrackRequest({ trackingNumber: c.req.param('trackingNumber') });
  const user = c.get('user');
  const parcels = await loadParcels(c.env.USER_DATA, user.id);
  await storeParcels(
    c.env.USER_DATA,
    user.id,
    parcels.filter((p) => p.trackingNumber !== trackingNumber),
  );
  return c.body(null, 204);
});
