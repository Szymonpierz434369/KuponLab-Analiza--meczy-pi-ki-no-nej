import { cacheGet, cacheSet } from './db';
import { DataError, espnGet, fromSchedule, fromScoreboard, fromSummary, pool } from './espn';
import { EXTRA_LEAGUES, LEAGUES } from './leagues';
import type { OpponentForm } from './stats';
import { ApiFixture, FINISHED } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;

export function warsawDate(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
}

const compact = (iso: string) => iso.replaceAll('-', '');
function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mecze danego dnia (czas polski) we wskazanych ligach. */
export async function getFixturesByDate(date: string, all = false): Promise<ApiFixture[]> {
  const leagues = all ? [...LEAGUES, ...EXTRA_LEAGUES] : LEAGUES;
  const isToday = date === warsawDate();
  const isPast = date < warsawDate();
  // ESPN liczy dni wg czasu USA, więc pobieramy też poprzedni dzień i filtrujemy po dacie polskiej
  const days = [compact(shiftDate(date, -1)), compact(date)];
  const maxAgeMs = isToday ? 10 * MIN : isPast ? 24 * HOUR : 3 * HOUR;
  const jobs = leagues.flatMap((lg) => days.map((d) => ({ lg, d })));

  const results = await pool(jobs, 8, async ({ lg, d }) => {
    const j = await espnGet<{ leagues?: unknown[]; events?: unknown[] }>(`${lg.slug}/scoreboard?dates=${d}&limit=200`, {
      maxAgeMs,
      soft: true,
    });
    if (!j) return { ok: false, list: [] as ApiFixture[] };
    const meta = (j.leagues?.[0] ?? { slug: lg.slug }) as { slug: string };
    return { ok: true, list: (j.events ?? []).map((ev) => fromScoreboard(ev, { ...meta, slug: lg.slug })) };
  });

  if (results.every((r) => !r.ok)) throw new DataError('Nie udało się pobrać meczów z ESPN. Sprawdź połączenie z internetem.');
  const seen = new Set<number>();
  return results
    .flatMap((r) => r.list)
    .filter((f) => warsawDate(new Date(f.fixture.date)) === date)
    .filter((f) => (seen.has(f.fixture.id) ? false : (seen.add(f.fixture.id), true)));
}

/** Pełne dane jednego meczu (nadchodzącego lub rozegranego) */
export async function getFixture(id: number): Promise<ApiFixture | undefined> {
  const s = await espnGet<unknown>(`all/summary?event=${id}`, { maxAgeMs: 30 * MIN });
  return s ? fromSummary(s) : undefined;
}

const byNewest = (a: ApiFixture, b: ApiFixture) => b.fixture.timestamp - a.fixture.timestamp;

/** Wszystkie zakończone mecze drużyny z bieżącego i poprzedniego sezonu (bez sparingów) */
export async function getTeamFinished(teamId: number, season: number, beforeTs: number): Promise<ApiFixture[]> {
  // Domyślny terminarz ESPN bywa pusty (np. Bayern w sezonie 2026/27), więc pobieramy też sezon wprost.
  const [cur, curSeason, prev] = await Promise.all([
    espnGet<{ events?: unknown[] }>(`all/teams/${teamId}/schedule`, { maxAgeMs: 6 * HOUR, soft: true }),
    espnGet<{ events?: unknown[] }>(`all/teams/${teamId}/schedule?season=${season}`, { maxAgeMs: 6 * HOUR, soft: true }),
    espnGet<{ events?: unknown[] }>(`all/teams/${teamId}/schedule?season=${season - 1}`, { maxAgeMs: 7 * 24 * HOUR, soft: true }),
  ]);
  if (!cur && !curSeason && !prev) throw new DataError(`Nie udało się pobrać terminarza drużyny (ESPN, id ${teamId}).`);
  const seen = new Set<number>();
  return [...(cur?.events ?? []), ...(curSeason?.events ?? []), ...(prev?.events ?? [])]
    .map(fromSchedule)
    .filter((f) => !f.league.id.includes('friendly'))
    .filter((f) => FINISHED.has(f.fixture.status.short) && f.fixture.timestamp < beforeTs)
    .filter((f) => (seen.has(f.fixture.id) ? false : (seen.add(f.fixture.id), true)))
    .sort(byNewest);
}

/**
 * Pełne dane zakończonych meczów ze statystykami (jedno zapytanie na mecz).
 * Zakończony mecz się nie zmienia, więc po pobraniu statystyk trzymamy go na stałe.
 */
export async function getFinishedFull(ids: number[], onEach?: (done: number, total: number) => void): Promise<Map<number, ApiFixture>> {
  const out = new Map<number, ApiFixture>();
  let done = 0;
  await pool(ids, 5, async (id) => {
    let f = cacheGet<ApiFixture>(`full:${id}`, Infinity);
    if (!f) {
      const s = await espnGet<unknown>(`all/summary?event=${id}`, { maxAgeMs: HOUR, soft: true });
      if (s) {
        f = fromSummary(s);
        const hasStats = (f.statistics?.length ?? 0) > 0;
        const oldEnough = Date.now() / 1000 - f.fixture.timestamp > 2 * 24 * 3600;
        // na stałe zapisujemy tylko mecze zakończone (trwający mecz też ma już statystyki)
        if (FINISHED.has(f.fixture.status.short) && (hasStats || oldEnough)) cacheSet(`full:${id}`, f);
      }
    }
    if (f) out.set(id, f);
    onEach?.(++done, ids.length);
  });
  return out;
}

/** Bezpośrednie mecze wyliczone z terminarza gospodarzy */
export function headToHead(homeFinished: ApiFixture[], awayId: number): ApiFixture[] {
  return homeFinished.filter((f) => f.teams.home.id === awayId || f.teams.away.id === awayId).slice(0, 6);
}

/** Forma rywali (średnio strzelone i stracone gole w ostatnich 10 meczach przed `beforeTs`). */
export async function getOpponentForms(
  opponentIds: number[],
  season: number,
  beforeTs: number,
): Promise<Map<number, OpponentForm>> {
  const ids = [...new Set(opponentIds.filter((x) => x > 0))];
  const out = new Map<number, OpponentForm>();
  await pool(ids, 6, async (oid) => {
    try {
      const fx = (await getTeamFinished(oid, season, beforeTs)).slice(0, 10);
      if (!fx.length) return;
      let sc = 0;
      let co = 0;
      for (const f of fx) {
        const home = f.teams.home.id === oid;
        sc += (home ? f.goals.home : f.goals.away) ?? 0;
        co += (home ? f.goals.away : f.goals.home) ?? 0;
      }
      out.set(oid, { scored: sc / fx.length, conceded: co / fx.length, n: fx.length });
    } catch {
      // brak danych rywala – mecz liczony bez korekty
    }
  });
  return out;
}

/** Surowe dane meczu z ESPN (do kursów bukmacherskich). */
export async function getRawSummary(id: number): Promise<unknown | null> {
  return espnGet<unknown>(`all/summary?event=${id}`, { maxAgeMs: 30 * MIN, soft: true });
}
