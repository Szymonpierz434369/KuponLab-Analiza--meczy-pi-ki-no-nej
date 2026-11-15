import type { ApiFixture } from './types';

// Statystyki, które wyciągamy z każdego meczu (nazwy z API-Football → nasze klucze)
export const STAT_KEYS = ['shots', 'sot', 'corners', 'yellow', 'red', 'fouls', 'offsides', 'saves', 'poss', 'xg'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  shots: 'Strzały',
  sot: 'Strzały celne',
  corners: 'Rzuty rożne',
  yellow: 'Żółte kartki',
  red: 'Czerwone kartki',
  fouls: 'Faule',
  offsides: 'Spalone',
  saves: 'Obrony bramkarza',
  poss: 'Posiadanie piłki %',
  xg: 'xG (gole oczekiwane)',
};

// Nazwy statystyk w ESPN (oraz dawne nazwy z API-Football)
const API_NAMES: Record<string, StatKey> = {
  totalShots: 'shots',
  shotsOnTarget: 'sot',
  wonCorners: 'corners',
  yellowCards: 'yellow',
  redCards: 'red',
  foulsCommitted: 'fouls',
  offsides: 'offsides',
  saves: 'saves',
  possessionPct: 'poss',
  'Total Shots': 'shots',
  'Shots on Goal': 'sot',
  'Corner Kicks': 'corners',
  'Yellow Cards': 'yellow',
  'Red Cards': 'red',
  Fouls: 'fouls',
  Offsides: 'offsides',
  'Goalkeeper Saves': 'saves',
  'Ball Possession': 'poss',
  expected_goals: 'xg',
};

// Dla tych statystyk brak wartości oznacza „nie mierzono”. Dla pozostałych API zwraca null zamiast 0.
const NULL_MEANS_UNKNOWN = new Set<StatKey>(['poss', 'xg']);

export type StatRow = Record<StatKey, number | null>;

export interface TeamMatch {
  fixtureId: number;
  date: string;
  ts: number;
  league: string;
  leagueLogo: string;
  opponent: string;
  opponentId: number;
  opponentLogo: string;
  /** siła rywala względem średniej (1 = przeciętny): ile strzela i ile traci; ustawiane przy korekcie na rywali */
  oppAttF?: number | null;
  oppDefF?: number | null;
  venue: 'home' | 'away';
  gf: number;
  ga: number;
  htgf: number | null;
  htga: number | null;
  result: 'W' | 'D' | 'L';
  hasStats: boolean;
  for: StatRow;
  against: StatRow;
}

function parseVal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function emptyRow(): StatRow {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, null])) as StatRow;
}

function readBlock(f: ApiFixture, teamId: number): StatRow | null {
  const block = f.statistics?.find((b) => b.team.id === teamId);
  if (!block || block.statistics.length === 0) return null;
  const row = emptyRow();
  for (const s of block.statistics) {
    const key = API_NAMES[s.type];
    if (key) row[key] = parseVal(s.value);
  }
  // Mecz bez podstawowych liczb (słabo pokryte rozgrywki) traktujemy jak mecz bez statystyk
  if (row.shots === null && row.corners === null && row.fouls === null) return null;
  for (const k of STAT_KEYS) if (row[k] === null && !NULL_MEANS_UNKNOWN.has(k)) row[k] = 0;
  return row;
}

export function toTeamMatch(f: ApiFixture, teamId: number): TeamMatch {
  const isHome = f.teams.home.id === teamId;
  const me = isHome ? f.teams.home : f.teams.away;
  const opp = isHome ? f.teams.away : f.teams.home;
  const gf = (isHome ? f.goals.home : f.goals.away) ?? 0;
  const ga = (isHome ? f.goals.away : f.goals.home) ?? 0;
  const ht = f.score?.halftime ?? { home: null, away: null };
  const mine = readBlock(f, me.id);
  const theirs = readBlock(f, opp.id);
  // Przy karnych liczy się wynik po dogrywce, a o zwycięzcy decyduje pole winner
  let result: TeamMatch['result'] = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  if (f.fixture.status.short === 'PEN') result = 'D';
  return {
    fixtureId: f.fixture.id,
    date: f.fixture.date,
    ts: f.fixture.timestamp,
    league: f.league.name,
    leagueLogo: f.league.logo,
    opponent: opp.name,
    opponentId: opp.id,
    opponentLogo: opp.logo,
    venue: isHome ? 'home' : 'away',
    gf,
    ga,
    htgf: isHome ? ht.home : ht.away,
    htga: isHome ? ht.away : ht.home,
    result,
    hasStats: !!(mine && theirs),
    for: mine ?? emptyRow(),
    against: theirs ?? emptyRow(),
  };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Opcje liczenia średnich dla modelu (domyślnie: zwykła średnia, jak w pierwszej wersji). */
export interface SummaryOpts {
  /** waga meczu maleje z każdym starszym meczem: 1, d, d², … (1 = wszystkie mecze równo) */
  decay?: number;
  /** siła ściągania do średniej: tyle „wirtualnych” przeciętnych meczów dodajemy (0 = brak) */
  shrinkK?: number;
  /** średnie „przeciętnej drużyny” na mecz, do ściągania */
  priors?: Partial<Record<StatKey | 'goals', number>>;
  /** korekta goli na siłę rywali (wymaga oppAttF/oppDefF w meczach) */
  opponentAdjust?: boolean;
}

/**
 * Ustawienia średnich dla modelu, wybrane testem (uczenie: 538 meczów 1.09–15.10.2026,
 * sprawdzenie: 561 meczów 16.10–14.11.2026). Każda zmiana poprawiła błąd Briera i trafność
 * typów na meczach testowych:
 * - wagi czasowe 0,9: nowsze mecze ważą więcej,
 * - ściąganie do średniej z siłą 8 meczów: mniej szumu przy 10 meczach,
 * - korekta goli na siłę rywali.
 * „priors” to średnie na drużynę i mecz z danych uczących.
 */
export const DEFAULT_SUMMARY_OPTS: SummaryOpts = {
  decay: 0.9,
  shrinkK: 8,
  priors: { goals: 1.616, shots: 13.556, sot: 4.689, corners: 4.961, yellow: 1.756, red: 0.075, fouls: 11.221 },
  opponentAdjust: true,
};

function weightsFor(ms: TeamMatch[], decay = 1): number[] {
  return ms.map((_, i) => Math.pow(decay, i)); // ms: od najnowszego
}

/** średnia ważona z opcjonalnym ściąganiem do wartości `prior` z siłą k */
function wmean(pairs: [number, number][], k = 0, prior?: number): number {
  let s = 0;
  let w = 0;
  for (const [x, wi] of pairs) {
    s += x * wi;
    w += wi;
  }
  if (prior !== undefined && k > 0) {
    s += prior * k;
    w += k;
  }
  return w > 0 ? s / w : prior ?? 0;
}

export interface StatAgg {
  n: number;
  avgFor: number;
  avgAgainst: number;
  /** średnie używane przez model (z wagami czasowymi i ściąganiem do średniej, jeśli włączone) */
  mFor: number;
  mAgainst: number;
  avgTotal: number;
  minTotal: number;
  maxTotal: number;
  /** od najstarszego do najnowszego – do wykresów */
  fors: number[];
  againsts: number[];
}

export function aggStat(ms: TeamMatch[], key: StatKey, opts: SummaryOpts = {}): StatAgg {
  const W = weightsFor(ms, opts.decay);
  const sel = ms.map((m, i) => ({ m, w: W[i] })).filter(({ m }) => m.hasStats && m.for[key] !== null && m.against[key] !== null);
  const rows = sel.map((x) => x.m).reverse();
  const fors = rows.map((m) => m.for[key] as number);
  const againsts = rows.map((m) => m.against[key] as number);
  const totals = fors.map((v, i) => v + againsts[i]);
  const prior = opts.priors?.[key];
  const k = prior !== undefined ? opts.shrinkK ?? 0 : 0;
  return {
    n: rows.length,
    avgFor: avg(fors),
    avgAgainst: avg(againsts),
    mFor: wmean(sel.map(({ m, w }) => [m.for[key] as number, w]), k, prior),
    mAgainst: wmean(sel.map(({ m, w }) => [m.against[key] as number, w]), k, prior),
    avgTotal: avg(totals),
    minTotal: totals.length ? Math.min(...totals) : 0,
    maxTotal: totals.length ? Math.max(...totals) : 0,
    fors,
    againsts,
  };
}

export interface GoalsAgg {
  n: number;
  avgFor: number;
  avgAgainst: number;
  avgTotal: number;
  /** średnie dla modelu (wagi czasowe, ściąganie, korekta na rywali – jeśli włączone) */
  mFor: number;
  mAgainst: number;
  home: { n: number; avgFor: number; avgAgainst: number; mFor: number; mAgainst: number };
  away: { n: number; avgFor: number; avgAgainst: number; mFor: number; mAgainst: number };
  overs: Record<'0.5' | '1.5' | '2.5' | '3.5' | '4.5', number>;
  btts: number;
  cleanSheets: number;
  failedToScore: number;
  ht: { n: number; avgFor: number; avgAgainst: number };
  fors: number[];
  againsts: number[];
}

function aggGoals(ms: TeamMatch[], opts: SummaryOpts = {}): GoalsAgg {
  const W = weightsFor(ms, opts.decay);
  const adj = !!opts.opponentAdjust;
  // gole skorygowane o siłę rywala: 2 gole z mocną obroną znaczą więcej niż 2 gole ze słabą
  const gfA = (m: TeamMatch) => (adj && m.oppDefF ? m.gf / m.oppDefF : m.gf);
  const gaA = (m: TeamMatch) => (adj && m.oppAttF ? m.ga / m.oppAttF : m.ga);
  const prior = opts.priors?.goals;
  const k = prior !== undefined ? opts.shrinkK ?? 0 : 0;
  const side = (v: 'home' | 'away') => {
    const idx = ms.map((m, i) => ({ m, w: W[i] })).filter(({ m }) => m.venue === v);
    const s = idx.map((x) => x.m);
    return {
      n: s.length,
      avgFor: avg(s.map((m) => m.gf)),
      avgAgainst: avg(s.map((m) => m.ga)),
      mFor: wmean(idx.map(({ m, w }) => [gfA(m), w])),
      mAgainst: wmean(idx.map(({ m, w }) => [gaA(m), w])),
    };
  };
  const ht = ms.filter((m) => m.htgf !== null && m.htga !== null);
  const tot = (m: TeamMatch) => m.gf + m.ga;
  const chrono = ms.slice().reverse();
  return {
    n: ms.length,
    avgFor: avg(ms.map((m) => m.gf)),
    avgAgainst: avg(ms.map((m) => m.ga)),
    avgTotal: avg(ms.map(tot)),
    mFor: wmean(ms.map((m, i) => [gfA(m), W[i]]), k, prior),
    mAgainst: wmean(ms.map((m, i) => [gaA(m), W[i]]), k, prior),
    home: side('home'),
    away: side('away'),
    overs: {
      '0.5': ms.filter((m) => tot(m) > 0.5).length,
      '1.5': ms.filter((m) => tot(m) > 1.5).length,
      '2.5': ms.filter((m) => tot(m) > 2.5).length,
      '3.5': ms.filter((m) => tot(m) > 3.5).length,
      '4.5': ms.filter((m) => tot(m) > 4.5).length,
    },
    btts: ms.filter((m) => m.gf > 0 && m.ga > 0).length,
    cleanSheets: ms.filter((m) => m.ga === 0).length,
    failedToScore: ms.filter((m) => m.gf === 0).length,
    ht: { n: ht.length, avgFor: avg(ht.map((m) => m.htgf as number)), avgAgainst: avg(ht.map((m) => m.htga as number)) },
    fors: chrono.map((m) => m.gf),
    againsts: chrono.map((m) => m.ga),
  };
}

export interface TeamSummary {
  team: { id: number; name: string; logo: string };
  matches: TeamMatch[];
  record: { w: number; d: number; l: number };
  points: number;
  goals: GoalsAgg;
  stats: Record<StatKey, StatAgg>;
  statsN: number;
}

export function summarize(team: TeamSummary['team'], matches: TeamMatch[], opts: SummaryOpts = {}): TeamSummary {
  const w = matches.filter((m) => m.result === 'W').length;
  const d = matches.filter((m) => m.result === 'D').length;
  const l = matches.filter((m) => m.result === 'L').length;
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, aggStat(matches, k, opts)])) as Record<StatKey, StatAgg>;
  return {
    team,
    matches,
    record: { w, d, l },
    points: 3 * w + d,
    goals: aggGoals(matches, opts),
    stats,
    statsN: matches.filter((m) => m.hasStats).length,
  };
}

/** Bilans rywala przed danym meczem: średnio strzelone i stracone gole. */
export interface OpponentForm {
  scored: number;
  conceded: number;
  n: number;
}

/**
 * Dopisuje do meczów siłę rywali (1 = przeciętny rywal). Średnia „ligowa” L to średnia z rywali
 * tej drużyny, więc nie trzeba znać średnich lig. Przy małej liczbie meczów rywala ściągamy do 1.
 */
export function attachOpponentFactors(matches: TeamMatch[], form: Map<number, OpponentForm>) {
  const known = matches.map((m) => form.get(m.opponentId)).filter((f): f is OpponentForm => !!f && f.n > 0);
  if (!known.length) return;
  const L = known.reduce((a, f) => a + (f.scored + f.conceded) / 2, 0) / known.length || 1.35;
  const K = 5;
  const clamp = (x: number) => Math.min(2, Math.max(0.5, x));
  for (const m of matches) {
    const f = form.get(m.opponentId);
    if (!f || f.n === 0 || L <= 0) {
      m.oppAttF = null;
      m.oppDefF = null;
      continue;
    }
    m.oppAttF = clamp((f.n * (f.scored / L) + K) / (f.n + K));
    m.oppDefF = clamp((f.n * (f.conceded / L) + K) / (f.n + K));
  }
}
