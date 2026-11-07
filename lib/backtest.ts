import { backtestGet, backtestSave } from './db';
import { getFinishedFull, getFixturesByDate, getTeamFinished, warsawDate } from './data';
import { pool } from './espn';
import { buildModel, hitRate, MODEL_VERSION } from './model';
import { settleMarket } from './settle';
import { summarize, toTeamMatch } from './stats';
import type { ApiFixture } from './types';

// Test wsteczny: dla rozegranych meczów liczymy typy tak, jak aplikacja pokazałaby je przed
// meczem (tylko dane sprzed spotkania), i sprawdzamy, czy weszły. Wyniki trzymamy w bazie,
// więc kolejne odświeżenia liczą tylko nowe mecze.

export interface BacktestPick {
  id: string;
  /** nazwa typu bez nazw drużyn, np. „Gospodarze: rożne powyżej 4.5” */
  type: string;
  label: string;
  group: string;
  p: number;
  fair: number;
  history: number | null;
  hit: boolean;
}

export interface BacktestRow {
  fixtureId: number;
  date: string;
  league: string;
  leagueName: string;
  home: string;
  away: string;
  score: string;
  picks: BacktestPick[];
}

export type Progress = (done: number, total: number, step: string) => void;

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function analyse(fx: ApiFixture): Promise<BacktestRow> {
  const id = fx.fixture.id;
  const T = (await getFinishedFull([id])).get(id) ?? fx;
  const base: BacktestRow = {
    fixtureId: id,
    date: T.fixture.date,
    league: fx.league.id,
    leagueName: fx.league.name,
    home: T.teams.home.name,
    away: T.teams.away.name,
    score: `${T.goals.home ?? 0}:${T.goals.away ?? 0}`,
    picks: [],
  };
  const before = T.fixture.timestamp;
  const season = T.league.season || fx.league.season;
  const [hAll, aAll] = await Promise.all([
    getTeamFinished(T.teams.home.id, season, before),
    getTeamFinished(T.teams.away.id, season, before),
  ]);
  const hl = hAll.slice(0, 10);
  const al = aAll.slice(0, 10);
  const full = await getFinishedFull([...new Set([...hl, ...al].map((f) => f.fixture.id))]);
  const H = summarize(T.teams.home, hl.map((f) => toTeamMatch(full.get(f.fixture.id) ?? f, T.teams.home.id)));
  const A = summarize(T.teams.away, al.map((f) => toTeamMatch(full.get(f.fixture.id) ?? f, T.teams.away.id)));
  if (Math.min(H.goals.n, A.goals.n) < 6) return base;

  const { markets, picks } = buildModel(H, A);
  for (const pid of picks) {
    const m = markets.find((x) => x.id === pid);
    if (!m) continue;
    const hit = settleMarket(pid, T);
    if (hit === null) continue;
    base.picks.push({
      id: pid,
      type: m.label.replace(T.teams.home.name, 'Gospodarze').replace(T.teams.away.name, 'Goście'),
      label: m.label,
      group: m.group,
      p: m.p,
      fair: Number((1 / m.p).toFixed(2)),
      history: hitRate(m),
      hit,
    });
  }
  return base;
}

/** Przelicza (w razie potrzeby) i zwraca wyniki z ostatnich `days` dni, bez dzisiejszego dnia. */
export async function runBacktest(days: number, progress: Progress = () => {}): Promise<BacktestRow[]> {
  const today = warsawDate();
  const dates = Array.from({ length: days }, (_, i) => shift(today, -(i + 1)));

  progress(0, dates.length, 'Pobieram listy meczów');
  let listed = 0;
  const lists = await pool(dates, 3, async (d) => {
    const list = await getFixturesByDate(d).catch(() => [] as ApiFixture[]);
    progress(++listed, dates.length, 'Pobieram listy meczów');
    return list;
  });
  const seen = new Set<number>();
  const targets = lists
    .flat()
    .filter((f) => f.fixture.status.short === 'FT')
    .filter((f) => (seen.has(f.fixture.id) ? false : (seen.add(f.fixture.id), true)));

  const rows: BacktestRow[] = [];
  const todo: ApiFixture[] = [];
  for (const f of targets) {
    const cached = backtestGet(f.fixture.id, MODEL_VERSION) as BacktestRow | undefined;
    if (cached) rows.push(cached);
    else todo.push(f);
  }

  let done = 0;
  progress(0, todo.length, todo.length ? 'Liczę typy dla nowych meczów' : 'Gotowe');
  await pool(todo, 3, async (f) => {
    try {
      const row = await analyse(f);
      backtestSave(f.fixture.id, row.date, MODEL_VERSION, row);
      rows.push(row);
    } catch {
      // mecz pomijamy – spróbujemy przy następnym odświeżeniu
    }
    progress(++done, todo.length, 'Liczę typy dla nowych meczów');
  });

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
