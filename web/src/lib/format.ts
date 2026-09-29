import type { DateRange, ParcelStatus } from '@shared/api';

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

const monthDayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const shortRangeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

// new Date('2026-10-01') would parse as UTC midnight; we want local.
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function formatDateRange(range: DateRange): string {
  const earliest = parseDateOnly(range.earliest);
  const latest = parseDateOnly(range.latest);
  if (!earliest || !latest) return `${range.earliest} – ${range.latest}`;
  if (earliest.getTime() === latest.getTime()) return monthDayFormat.format(earliest);
  return shortRangeFormat.formatRange(earliest, latest);
}

export function formatArrivalHint(range: DateRange, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = (value: string) => {
    const date = parseDateOnly(value);
    return date ? Math.round((date.getTime() - today) / 86_400_000) : NaN;
  };
  const from = Math.max(0, days(range.earliest));
  const to = Math.max(0, days(range.latest));
  if (Number.isNaN(from) || Number.isNaN(to)) return '';
  if (from === to) return from === 0 ? 'today' : from === 1 ? 'tomorrow' : `in ${from} days`;
  if (from === 0) return to === 1 ? 'today or tomorrow' : `within ${to} days`;
  return `in ${from}–${to} days`;
}

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
