import { cacheGet, cacheSet } from './db';
import { LEAGUE_BY_SLUG } from './leagues';
import type { ApiFixture, ApiStatBlock, ApiTeam } from './types';

// Publiczne (nieoficjalne) API ESPN – bez klucza. Odpowiedzi trzymamy w lokalnym cache,
// żeby nie obciążać serwera i żeby aplikacja działała szybko.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export class DataError extends Error {}

export interface GetOptions {
  maxAgeMs: number;
  /** nie zgłaszaj błędu – zwróć null (np. liga, której ESPN nie ma) */
  soft?: boolean;
}

// Najwyżej 8 zapytań do ESPN naraz – żeby nie przeciążać serwera przy dużych przeliczeniach
const g = globalThis as unknown as { __espnActive?: number; __espnQueue?: (() => void)[] };
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  g.__espnActive ??= 0;
  g.__espnQueue ??= [];
  if (g.__espnActive >= 8) await new Promise<void>((r) => g.__espnQueue!.push(r));
  g.__espnActive++;
  try {
    return await fn();
  } finally {
    g.__espnActive--;
    g.__espnQueue.shift()?.();
  }
}

export async function espnGet<T>(path: string, opts: GetOptions): Promise<T | null> {
  const key = `espn:${path}`;
  const fresh = cacheGet<T>(key, opts.maxAgeMs);
  if (fresh) return fresh;
  try {
    const res = await slot(() => fetch(`${BASE}/${path}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (KuponLab; uzytek prywatny)', accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }));
    if (!res.ok) {
      if (opts.soft) return null;
      throw new DataError(`ESPN odpowiedziało błędem ${res.status} dla ${path}.`);
    }
    const json = (await res.json()) as T;
    cacheSet(key, json);
    return json;
  } catch (e) {
    const stale = cacheGet<T>(key, 0, true);
    if (stale) return stale;
    if (opts.soft) return null;
    if (e instanceof DataError) throw e;
    throw new DataError(`Nie udało się połączyć z ESPN (${(e as Error).message}). Sprawdź internet.`);
  }
}

/** Uruchamia zadania z ograniczoną równoległością */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Mapowanie formatu ESPN na nasz wewnętrzny ApiFixture
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

function num(v: Any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return num(v.value ?? v.displayValue);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function team(c: Any): ApiTeam {
  const t = c?.team ?? {};
  return {
    id: Number(t.id ?? c?.id),
    name: t.displayName ?? t.name ?? '?',
    logo: t.logo ?? t.logos?.[0]?.href ?? '',
    winner: c?.winner ?? null,
  };
}

function status(type: Any): { short: string; long: string } {
  const name: string = type?.name ?? '';
  const state: string = type?.state ?? 'pre';
  const long = type?.description ?? '';
  if (/POSTPONED|DELAYED|SUSPENDED/.test(name)) return { short: 'PST', long };
  if (/CANCEL|ABANDON/.test(name)) return { short: 'CANC', long };
  if (state === 'pre') return { short: 'NS', long };
  if (state === 'in') return { short: type?.shortDetail || 'LIVE', long };
  if (type?.completed === false) return { short: 'PST', long };
  if (/PEN|SHOOTOUT/.test(name)) return { short: 'PEN', long };
  if (/AET|EXTRA/.test(name)) return { short: 'AET', long };
  return { short: 'FT', long };
}

function base(id: Any, date: string, comp: Any, league: ApiFixture['league'], venue?: string | null): ApiFixture {
  const cs: Any[] = comp?.competitors ?? [];
  const h = cs.find((c) => c.homeAway === 'home') ?? cs[0];
  const a = cs.find((c) => c.homeAway === 'away') ?? cs[1];
  const st = status(comp?.status?.type);
  const started = st.short !== 'NS' && st.short !== 'PST' && st.short !== 'CANC';
  const ts = Math.floor(new Date(date).getTime() / 1000);
  return {
    fixture: { id: Number(id), date: new Date(date).toISOString(), timestamp: ts, venue: { name: venue ?? comp?.venue?.fullName ?? null }, status: st },
    league,
    teams: { home: team(h), away: team(a) },
    goals: { home: started ? num(h?.score) : null, away: started ? num(a?.score) : null },
    score: {
      halftime: { home: num(h?.linescores?.[0]), away: num(a?.linescores?.[0]) },
      fulltime: { home: started ? num(h?.score) : null, away: started ? num(a?.score) : null },
    },
  };
}

function league(slug: string, name?: string, logo?: string, season?: number): ApiFixture['league'] {
  const known = LEAGUE_BY_SLUG.get(slug);
  return { id: slug, name: known?.name ?? name ?? slug, country: known?.country ?? '', logo: logo ?? '', season: season ?? new Date().getFullYear() };
}

/** Wydarzenie z listy meczów dnia (scoreboard) */
export function fromScoreboard(ev: Any, lg: Any): ApiFixture {
  return base(ev.id, ev.date, ev.competitions?.[0], league(lg?.slug, lg?.name, lg?.logos?.[0]?.href, ev.season?.year));
}

/** Wydarzenie z terminarza drużyny (team schedule) */
export function fromSchedule(ev: Any): ApiFixture {
  return base(ev.id, ev.date, ev.competitions?.[0], league(ev.league?.slug ?? '', ev.league?.name, undefined, ev.season?.year));
}

/** Pełne dane meczu ze statystykami (summary) */
export function fromSummary(s: Any): ApiFixture {
  const h = s.header ?? {};
  const comp = h.competitions?.[0] ?? {};
  const lg = league(h.league?.slug ?? '', h.league?.name, h.league?.logos?.[0]?.href, h.season?.year);
  const f = base(h.id ?? comp.id, comp.date, comp, lg, s.gameInfo?.venue?.fullName);
  const refs: Any[] = s.gameInfo?.officials ?? [];
  f.fixture.referee = refs[0]?.displayName ?? refs[0]?.fullName ?? null;
  const blocks: ApiStatBlock[] = (s.boxscore?.teams ?? [])
    .filter((t: Any) => (t.statistics ?? []).length > 0)
    .map((t: Any) => ({
      team: { id: Number(t.team?.id), name: t.team?.displayName ?? '' },
      statistics: (t.statistics as Any[]).map((x) => ({ type: x.name, value: x.displayValue ?? x.value ?? null })),
    }));
  f.statistics = blocks;
  return f;
}
