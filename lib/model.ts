import type { StatKey, TeamMatch, TeamSummary } from './stats';

// ---------------------------------------------------------------------------
// Model: rozkład Poissona.
// Oczekiwana liczba goli gospodarzy = średnia z (ich ataku, obrony rywala),
// z uwzględnieniem formy u siebie / na wyjeździe i – gdy jest – xG.
// Tak samo dla rożnych, kartek i strzałów celnych.
// ---------------------------------------------------------------------------

export function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function poissonCdf(k: number, lambda: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += poissonPmf(i, lambda);
  return Math.min(1, s);
}

/** P(X > line), np. line = 2.5 → co najmniej 3 */
export function pOver(line: number, lambda: number): number {
  return Math.max(0, 1 - poissonCdf(Math.floor(line), lambda));
}

/**
 * Rozkład ujemny dwumianowy (średnia mu, rozrzut r): wariancja = mu + mu²/r.
 * Rożne, strzały i kartki mają większy rozrzut niż zakłada Poisson, więc dla nich
 * używamy tego rozkładu. r = Infinity oznacza zwykły rozkład Poissona.
 */
export function nbOver(line: number, mu: number, r: number): number {
  if (!Number.isFinite(r)) return pOver(line, mu);
  const k = Math.floor(line);
  const q = mu / (r + mu);
  let p = Math.pow(r / (r + mu), r);
  let cdf = p;
  for (let i = 1; i <= k; i++) {
    p *= ((i - 1 + r) / i) * q;
    cdf += p;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** Wersja modelu – zmień ją po każdej zmianie obliczeń (zakładka Skuteczność przeliczy wtedy historię). */
export const MODEL_VERSION = 3;

/**
 * Parametry modelu. `dispersion` = r rozkładu ujemnego dwumianowego dla każdej statystyki
 * (mniejsze r = większy rozrzut, Infinity = Poisson). Dobrane testem wstecznym na ok. 430
 * meczach z 17.10–6.11.2026 i sprawdzone na 174 meczach z 26.09–16.10 (błąd Briera, kalibracja):
 * rożne mają duży rozrzut, strzały celne umiarkowany, faule mały, a dla kartek i wszystkich
 * strzałów Poisson wypadał najlepiej.
 */
export const MODEL_CFG = {
  dispersion: { corners: 7, yellow: Infinity, sot: 15, shots: Infinity, fouls: 40 } as Record<'corners' | 'yellow' | 'sot' | 'shots' | 'fouls', number>,
  /** Jaką wagę ma średnia sędziego wobec średniej drużyn (0–1). Założenie – ESPN nie podaje sędziów, więc nie dało się jej przetestować. */
  refereeWeight: 0.5,
};

/** Średnie sędziego wpisane ręcznie na stronie meczu (na mecz, obie drużyny łącznie). */
export interface RefereeInput {
  yellow?: number | null;
  fouls?: number | null;
}

export type MarketGroup = 'Wynik' | 'Bramki' | 'Rożne' | 'Kartki' | 'Faule' | 'Strzały celne' | 'Strzały';

export interface Market {
  id: string;
  group: MarketGroup;
  family: string;
  label: string;
  p: number;
  /** skuteczność w ostatnich meczach: [trafione, mecze z danymi] */
  hitHome: [number, number] | null;
  hitAway: [number, number] | null;
}

export interface ModelOutput {
  lambda: { home: number; away: number };
  goalsFromXg: boolean;
  outcome: { home: number; draw: number; away: number };
  scores: { h: number; a: number; p: number }[];
  expected: Record<'corners' | 'yellow' | 'sot' | 'shots' | 'red' | 'fouls', { home: number; away: number; total: number }>;
  /** czy uwzględniono średnie sędziego */
  referee: { yellow: number | null; fouls: number | null };
  htShare: number;
  dataWarning: string | null;
}

// Perspektywa „nadchodzącego meczu”: h = gospodarze, a = goście.
interface View {
  hg: number;
  ag: number;
  hht: number | null;
  aht: number | null;
  stats: boolean;
  h: Record<StatKey, number | null>;
  a: Record<StatKey, number | null>;
}
const viewHome = (m: TeamMatch): View => ({ hg: m.gf, ag: m.ga, hht: m.htgf, aht: m.htga, stats: m.hasStats, h: m.for, a: m.against });
const viewAway = (m: TeamMatch): View => ({ hg: m.ga, ag: m.gf, hht: m.htga, aht: m.htgf, stats: m.hasStats, h: m.against, a: m.for });

type Pred = (v: View) => boolean | null; // null = brak danych w tym meczu

function hits(ms: TeamMatch[], view: (m: TeamMatch) => View, pred: Pred): [number, number] {
  let k = 0;
  let n = 0;
  for (const m of ms) {
    const r = pred(view(m));
    if (r === null) continue;
    n++;
    if (r) k++;
  }
  return [k, n];
}

const blend = (overall: number, venue: number, nVenue: number) => (nVenue >= 3 ? 0.6 * overall + 0.4 * venue : overall);
const clampL = (x: number) => Math.max(0.1, x);
const sumStat = (v: View, key: StatKey) => (v.stats && v.h[key] !== null && v.a[key] !== null ? (v.h[key] as number) + (v.a[key] as number) : null);
const sideStat = (v: View, side: 'h' | 'a', key: StatKey) => (v.stats && v[side][key] !== null ? (v[side][key] as number) : null);

export function buildModel(
  H: TeamSummary,
  A: TeamSummary,
  opts: { referee?: RefereeInput } = {},
): { model: ModelOutput; markets: Market[]; picks: string[] } {
  // --- Gole ---
  const hAtt = blend(H.goals.avgFor, H.goals.home.avgFor, H.goals.home.n);
  const hDef = blend(H.goals.avgAgainst, H.goals.home.avgAgainst, H.goals.home.n);
  const aAtt = blend(A.goals.avgFor, A.goals.away.avgFor, A.goals.away.n);
  const aDef = blend(A.goals.avgAgainst, A.goals.away.avgAgainst, A.goals.away.n);
  let lh = (hAtt + aDef) / 2;
  let la = (aAtt + hDef) / 2;

  const xgOk = H.stats.xg.n >= 5 && A.stats.xg.n >= 5;
  if (xgOk) {
    const xh = (H.stats.xg.avgFor + A.stats.xg.avgAgainst) / 2;
    const xa = (A.stats.xg.avgFor + H.stats.xg.avgAgainst) / 2;
    lh = 0.65 * lh + 0.35 * xh;
    la = 0.65 * la + 0.35 * xa;
  }
  lh = clampL(lh);
  la = clampL(la);

  // macierz wyników 0..10
  const N = 10;
  let pH = 0, pD = 0, pA = 0, pBtts = 0;
  const scores: { h: number; a: number; p: number }[] = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = poissonPmf(i, lh) * poissonPmf(j, la);
      if (i > j) pH += p;
      else if (i === j) pD += p;
      else pA += p;
      if (i > 0 && j > 0) pBtts += p;
      scores.push({ h: i, a: j, p });
    }
  }
  const norm = pH + pD + pA;
  pH /= norm; pD /= norm; pA /= norm;
  scores.sort((x, y) => y.p - x.p);

  // udział goli w 1. połowie
  const htGoals = H.goals.ht.n * (H.goals.ht.avgFor + H.goals.ht.avgAgainst) + A.goals.ht.n * (A.goals.ht.avgFor + A.goals.ht.avgAgainst);
  const ftGoals = H.goals.ht.n * H.goals.avgTotal + A.goals.ht.n * A.goals.avgTotal;
  const htShare = ftGoals > 0 && H.goals.ht.n + A.goals.ht.n >= 8 ? Math.min(0.6, Math.max(0.3, htGoals / ftGoals)) : 0.44;
  const lht = (lh + la) * htShare;

  // --- Statystyki liczbowe ---
  const exp = (key: StatKey) => {
    const home = clampL((H.stats[key].avgFor + A.stats[key].avgAgainst) / 2);
    const away = clampL((A.stats[key].avgFor + H.stats[key].avgAgainst) / 2);
    return { home, away, total: home + away };
  };
  const corners = exp('corners');
  // Sędzia: łączna średnia jest mieszana ze średnią drużyn, a podział gospodarze/goście zostaje z drużyn
  const ref = opts.referee ?? {};
  const withReferee = (e: { home: number; away: number; total: number }, refAvg: number | null | undefined) => {
    if (!refAvg || refAvg <= 0 || e.total <= 0) return e;
    const w = MODEL_CFG.refereeWeight;
    const total = (1 - w) * e.total + w * refAvg;
    const k = total / e.total;
    return { home: e.home * k, away: e.away * k, total };
  };
  const yellow = withReferee(exp('yellow'), ref.yellow);
  const fouls = withReferee(exp('fouls'), ref.fouls);
  const sot = exp('sot');
  const shots = exp('shots');
  const red = { home: H.stats.red.avgFor, away: A.stats.red.avgFor, total: (H.stats.red.avgTotal + A.stats.red.avgTotal) / 2 };

  const D = MODEL_CFG.dispersion;
  const markets: Market[] = [];
  const add = (id: string, group: MarketGroup, family: string, label: string, p: number, pred: Pred) => {
    markets.push({
      id,
      group,
      family,
      label,
      p: Math.min(0.999, Math.max(0.001, p)),
      hitHome: hits(H.matches, viewHome, pred),
      hitAway: hits(A.matches, viewAway, pred),
    });
  };

  // Wynik
  add('1', 'Wynik', '1x2', `Wygrana ${H.team.name}`, pH, (v) => v.hg > v.ag);
  add('X', 'Wynik', '1x2', 'Remis', pD, (v) => v.hg === v.ag);
  add('2', 'Wynik', '1x2', `Wygrana ${A.team.name}`, pA, (v) => v.hg < v.ag);
  add('1X', 'Wynik', 'dc', `${H.team.name} lub remis (1X)`, pH + pD, (v) => v.hg >= v.ag);
  add('X2', 'Wynik', 'dc', `${A.team.name} lub remis (X2)`, pA + pD, (v) => v.hg <= v.ag);
  add('12', 'Wynik', 'dc', 'Ktoś wygra (12)', pH + pA, (v) => v.hg !== v.ag);

  // Bramki
  const lt = lh + la;
  for (const line of [1.5, 2.5, 3.5]) {
    add(`o${line}`, 'Bramki', 'g-over', `Powyżej ${line} gola`, pOver(line, lt), (v) => v.hg + v.ag > line);
    add(`u${line}`, 'Bramki', 'g-under', `Poniżej ${line} gola`, 1 - pOver(line, lt), (v) => v.hg + v.ag < line);
  }
  add('btts', 'Bramki', 'btts', 'Obie drużyny strzelą', pBtts / norm, (v) => v.hg > 0 && v.ag > 0);
  add('btts-no', 'Bramki', 'btts', 'Obie drużyny strzelą: NIE', 1 - pBtts / norm, (v) => !(v.hg > 0 && v.ag > 0));
  for (const line of [0.5, 1.5]) {
    add(`h-o${line}`, 'Bramki', 'hg-over', `${H.team.name} powyżej ${line} gola`, pOver(line, lh), (v) => v.hg > line);
    add(`a-o${line}`, 'Bramki', 'ag-over', `${A.team.name} powyżej ${line} gola`, pOver(line, la), (v) => v.ag > line);
  }
  add('ht-o0.5', 'Bramki', 'ht-over', 'Gol w 1. połowie', pOver(0.5, lht), (v) => (v.hht === null || v.aht === null ? null : v.hht + v.aht > 0.5));
  add('ht-o1.5', 'Bramki', 'ht-over', '1. połowa powyżej 1.5 gola', pOver(1.5, lht), (v) => (v.hht === null || v.aht === null ? null : v.hht + v.aht > 1.5));

  const statOk = H.stats.corners.n >= 3 && A.stats.corners.n >= 3;
  if (statOk) {
    // Rożne
    for (const line of [7.5, 8.5, 9.5, 10.5, 11.5]) {
      add(`c-o${line}`, 'Rożne', 'c-over', `Rożne powyżej ${line}`, nbOver(line, corners.total, D.corners), (v) => { const s = sumStat(v, 'corners'); return s === null ? null : s > line; });
    }
    for (const line of [8.5, 9.5, 10.5]) {
      add(`c-u${line}`, 'Rożne', 'c-under', `Rożne poniżej ${line}`, 1 - nbOver(line, corners.total, D.corners), (v) => { const s = sumStat(v, 'corners'); return s === null ? null : s < line; });
    }
    for (const line of [3.5, 4.5, 5.5]) {
      add(`hc-o${line}`, 'Rożne', 'hc-over', `${H.team.name}: rożne powyżej ${line}`, nbOver(line, corners.home, D.corners), (v) => { const s = sideStat(v, 'h', 'corners'); return s === null ? null : s > line; });
      add(`ac-o${line}`, 'Rożne', 'ac-over', `${A.team.name}: rożne powyżej ${line}`, nbOver(line, corners.away, D.corners), (v) => { const s = sideStat(v, 'a', 'corners'); return s === null ? null : s > line; });
    }

    // Kartki
    for (const line of [2.5, 3.5, 4.5, 5.5]) {
      add(`y-o${line}`, 'Kartki', 'y-over', `Żółte kartki powyżej ${line}`, nbOver(line, yellow.total, D.yellow), (v) => { const s = sumStat(v, 'yellow'); return s === null ? null : s > line; });
      add(`y-u${line}`, 'Kartki', 'y-under', `Żółte kartki poniżej ${line}`, 1 - nbOver(line, yellow.total, D.yellow), (v) => { const s = sumStat(v, 'yellow'); return s === null ? null : s < line; });
    }
    for (const line of [0.5, 1.5, 2.5]) {
      add(`hy-o${line}`, 'Kartki', 'hy-over', `${H.team.name}: żółte powyżej ${line}`, nbOver(line, yellow.home, D.yellow), (v) => { const s = sideStat(v, 'h', 'yellow'); return s === null ? null : s > line; });
      add(`ay-o${line}`, 'Kartki', 'ay-over', `${A.team.name}: żółte powyżej ${line}`, nbOver(line, yellow.away, D.yellow), (v) => { const s = sideStat(v, 'a', 'yellow'); return s === null ? null : s > line; });
    }
    add('red', 'Kartki', 'red', 'Czerwona kartka w meczu', 1 - Math.exp(-red.total), (v) => { const s = sumStat(v, 'red'); return s === null ? null : s > 0; });

    // Strzały celne
    for (const line of [6.5, 7.5, 8.5, 9.5, 10.5]) {
      add(`s-o${line}`, 'Strzały celne', 's-over', `Strzały celne powyżej ${line}`, nbOver(line, sot.total, D.sot), (v) => { const s = sumStat(v, 'sot'); return s === null ? null : s > line; });
    }
    for (const line of [2.5, 3.5, 4.5, 5.5]) {
      add(`hs-o${line}`, 'Strzały celne', 'hs-over', `${H.team.name}: celne powyżej ${line}`, nbOver(line, sot.home, D.sot), (v) => { const s = sideStat(v, 'h', 'sot'); return s === null ? null : s > line; });
      add(`as-o${line}`, 'Strzały celne', 'as-over', `${A.team.name}: celne powyżej ${line}`, nbOver(line, sot.away, D.sot), (v) => { const s = sideStat(v, 'a', 'sot'); return s === null ? null : s > line; });
    }

    // Faule
    if (H.stats.fouls.n >= 3 && A.stats.fouls.n >= 3) {
      for (const line of [19.5, 21.5, 23.5, 25.5, 27.5]) {
        add(`f-o${line}`, 'Faule', 'f-over', `Faule łącznie powyżej ${line}`, nbOver(line, fouls.total, D.fouls), (v) => { const s = sumStat(v, 'fouls'); return s === null ? null : s > line; });
      }
      for (const line of [21.5, 23.5, 25.5]) {
        add(`f-u${line}`, 'Faule', 'f-under', `Faule łącznie poniżej ${line}`, 1 - nbOver(line, fouls.total, D.fouls), (v) => { const s = sumStat(v, 'fouls'); return s === null ? null : s < line; });
      }
      for (const line of [9.5, 10.5, 11.5, 12.5, 13.5]) {
        add(`hf-o${line}`, 'Faule', 'hf-over', `${H.team.name}: faule powyżej ${line}`, nbOver(line, fouls.home, D.fouls), (v) => { const s = sideStat(v, 'h', 'fouls'); return s === null ? null : s > line; });
        add(`af-o${line}`, 'Faule', 'af-over', `${A.team.name}: faule powyżej ${line}`, nbOver(line, fouls.away, D.fouls), (v) => { const s = sideStat(v, 'a', 'fouls'); return s === null ? null : s > line; });
      }
    }

    // Strzały (wszystkie)
    for (const line of [19.5, 21.5, 23.5, 25.5]) {
      add(`sh-o${line}`, 'Strzały', 'sh-over', `Strzały łącznie powyżej ${line}`, nbOver(line, shots.total, D.shots), (v) => { const s = sumStat(v, 'shots'); return s === null ? null : s > line; });
    }
  }

  const minN = Math.min(H.goals.n, A.goals.n);
  const minStats = Math.min(H.statsN, A.statsN);
  let dataWarning: string | null = null;
  if (minN < 6) dataWarning = `Mało danych: jedna z drużyn ma tylko ${minN} rozegranych meczów w bazie.`;
  else if (!statOk) dataWarning = 'Brak szczegółowych statystyk (rożne, kartki, strzały) dla tych drużyn – model liczy tylko bramki.';
  else if (minStats < 6) dataWarning = `Szczegółowe statystyki są tylko z ${minStats} meczów jednej z drużyn.`;

  return {
    model: {
      lambda: { home: lh, away: la },
      goalsFromXg: xgOk,
      outcome: { home: pH, draw: pD, away: pA },
      scores: scores.slice(0, 8),
      expected: { corners, yellow, sot, shots, red, fouls },
      referee: { yellow: ref.yellow && ref.yellow > 0 ? ref.yellow : null, fouls: ref.fouls && ref.fouls > 0 ? ref.fouls : null },
      htShare,
      dataWarning,
    },
    markets,
    picks: choosePicks(markets),
  };
}

export function hitRate(m: Market): number | null {
  const k = (m.hitHome?.[0] ?? 0) + (m.hitAway?.[0] ?? 0);
  const n = (m.hitHome?.[1] ?? 0) + (m.hitAway?.[1] ?? 0);
  return n >= 8 ? k / n : null;
}

/**
 * Typy z najwyższą zgodnością modelu i historii: szansa 60–92%, a w ostatnich
 * meczach obu drużyn zdarzenie wystąpiło w co najmniej 60% przypadków.
 * Z każdej rodziny (np. „rożne powyżej”) bierzemy jedną linię – najbliższą 72%.
 */
export function choosePicks(markets: Market[]): string[] {
  const scored = markets
    .map((m) => ({ m, hit: hitRate(m) }))
    .filter(({ m, hit }) => hit !== null && m.p >= 0.6 && m.p <= 0.92 && hit >= 0.6)
    .map(({ m, hit }) => ({ m, score: 0.6 * m.p + 0.4 * (hit as number) }));

  const bestPerFamily = new Map<string, { m: Market; score: number }>();
  for (const s of scored) {
    const cur = bestPerFamily.get(s.m.family);
    if (!cur || Math.abs(s.m.p - 0.72) < Math.abs(cur.m.p - 0.72)) bestPerFamily.set(s.m.family, s);
  }
  const perGroup = new Map<string, number>();
  return [...bestPerFamily.values()]
    .sort((a, b) => b.score - a.score)
    .filter(({ m }) => {
      const c = perGroup.get(m.group) ?? 0;
      if (c >= 2) return false;
      perGroup.set(m.group, c + 1);
      return true;
    })
    .slice(0, 6)
    .map(({ m }) => m.id);
}
