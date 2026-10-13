/**
 * Small readers for what the admin endpoints return. They accept the usual spellings,
 * so a slightly different field name shows up as a gap, not a blank page.
 */
export const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
export const idOf = (o) => (o && (o._id || o.id)) || '';

/** An array from a response body: the body itself, or the first of these keys that holds one. */
export function listOf(data, ...keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of [...keys, 'items', 'rows', 'results', 'data']) if (Array.isArray(data[k])) return data[k];
  return [];
}

export function pageOf(data, fallbackCount = 0, limit = 15) {
  const p = (data && (data.pagination || data.meta)) || data || {};
  const total = num(p.total ?? p.totalCount ?? p.count, fallbackCount);
  const pages = num(p.pages ?? p.totalPages, Math.max(1, Math.ceil(total / limit)));
  return { page: num(p.page, 1), pages: Math.max(1, pages), total };
}

/** [{ name, value }] from an array of {name|label|_id|status|service|date, count|value|total} or a { name: value } map. */
export function seriesOf(x) {
  if (!x) return [];
  if (Array.isArray(x)) {
    return x
      .map((r) => {
        if (r && typeof r === 'object') {
          const name = r.name ?? r.label ?? r.status ?? r.service ?? r.serviceType ?? r.date ?? r.day ?? r._id ?? r.key;
          const value = r.count ?? r.value ?? r.total ?? r.bookings ?? 0;
          return { name: String(name ?? '—'), value: num(value) };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof x === 'object') return Object.entries(x).filter(([, v]) => typeof v !== 'object').map(([name, value]) => ({ name, value: num(value) }));
  return [];
}

/** The first of these keys found on the object, or on one of its nested objects. */
export function pick(obj, keys, nested = ['counts', 'statusCounts', 'byStatus', 'totals', 'summary', 'stats']) {
  if (!obj || typeof obj !== 'object') return undefined;
  const scopes = [obj, ...nested.map((n) => obj[n]).filter((o) => o && typeof o === 'object' && !Array.isArray(o))];
  for (const s of scopes) for (const k of keys) if (s[k] !== undefined && s[k] !== null && typeof s[k] !== 'object') return s[k];
  return undefined;
}

export const dayLabel = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
