import type { ParcelStatus } from '@shared/api';

export const STATUS_LABELS: Record<ParcelStatus, string> = {
  pending: 'Awaiting first scan',
  not_found: 'Not found',
  info_received: 'Label created',
  in_transit: 'In transit',
  available_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed_attempt: 'Delivery failed',
  exception: 'Problem reported',
  expired: 'Tracking expired',
  unknown: 'Status unknown',
};

/** Statuses that need the reader's attention get the alert colour. */
export const ALERT_STATUSES: ReadonlySet<ParcelStatus> = new Set([
  'failed_attempt',
  'exception',
  'expired',
  'not_found',
]);

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso: string): string {
  const date = parse(iso);
  return date ? dateTimeFormat.format(date) : iso;
}

export function formatDay(iso: string): string {
  const date = parse(iso);
  return date ? dayFormat.format(date) : '';
}

export function formatTime(iso: string): string {
  const date = parse(iso);
  return date ? timeFormat.format(date) : iso;
}

/** "3 hours ago", "yesterday", … */
export function formatRelative(iso: string, now = Date.now()): string {
  const date = parse(iso);
  if (!date) return '';
  const seconds = Math.round((date.getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
