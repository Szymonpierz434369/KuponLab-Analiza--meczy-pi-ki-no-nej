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
export const MODEL_VERSION = 5;

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
  /** korekta Dixona-Colesa dla wyników 0:0, 1:0, 0:1, 1:1 (0 = brak) */
  dcRho: 0,
  /** typy muszą mieć potwierdzenie w historii drużyn (≥ 60% trafień w ostatnich meczach) */
  historyFilter: true,
  /** waga oczekiwanych goli wyliczonych z kursów bukmachera (0 = sam model, 1 = sam rynek) */
  marketWeight: 0,
  /** kalibracja szans dla rodzin zdarzeń: p' = σ(a + b·logit(p)); brak wpisu = bez zmian */
  calibration: {} as Record<string, { a: number; b: number }>,
  /** waga średnich u siebie / na wyjeździe dla rożnych, kartek, strzałów i fauli (0 = tylko ogólne) */
  venueStats: 0,
  /** model mnożący (atak × obrona ÷ średnia) zamiast średniej z ataku i obrony */
  multiplicative: { goals: false, stats: false },
  /** ile ostatnich meczów liczy się do historii „ile razy weszło” (0 = wszystkie podane) */
  histN: 0,
  /** wagi czasowe w historii „ile razy weszło” (1 = wszystkie mecze równo) */
  histDecay: 1,
  /**
   * Progi wyboru „Typów z najwyższą zgodnością”. Dobrane testem na 1355 meczach (1.08–8.11.2026):
   * dobór na meczach do 9.10, sprawdzenie na meczach od 10.10. Trafność typów z kursem fair ≥ 1,25:
   * 79,2% → 80,3% przy tym samym średnim kursie fair (1,32). Wcześniej: 0.6 / 0.92 / 0.6 / 0.72 / 0.6.
   */
  picks: { pMin: 0.65, pMax: 0.88, histMin: 0.6, target: 0.76, wModel: 0.4, perGroup: 2, max: 6 },
};

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export function calibrate(family: string, p: number): number {
  const c = MODEL_CFG.calibration[family];
  if (!c) return p;
  const q = Math.min(0.999, Math.max(0.001, p));
  return sigmoid(c.a + c.b * logit(q));
}

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
  /** skuteczność w historii z wagami czasowymi (gdy histDecay < 1) */
  hitW?: number | null;
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

function hits(ms: TeamMatch[], view: (m: TeamMatch) => View, pred: Pred): [number, number, number, number] {
  let k = 0;
  let n = 0;
  let kw = 0;
  let nw = 0;
  const d = MODEL_CFG.histDecay;
  const list = MODEL_CFG.histN > 0 ? ms.slice(0, MODEL_CFG.histN) : ms;
  list.forEach((m, i) => {
    const r = pred(view(m));
    if (r === null) return;
    const w = Math.pow(d, i);
    n++;
    nw += w;
    if (r) {
      k++;
      kw += w;
    }
  });
  return [k, n, kw, nw];
}

const blend = (overall: number, venue: number, nVenue: number) => (nVenue >= 3 ? 0.6 * overall + 0.4 * venue : overall);
const clampL = (x: number) => Math.max(0.1, x);
const sumStat = (v: View, key: StatKey) => (v.stats && v.h[key] !== null && v.a[key] !== null ? (v.h[key] as number) + (v.a[key] as number) : null);
const sideStat = (v: View, side: 'h' | 'a', key: StatKey) => (v.stats && v[side][key] !== null ? (v[side][key] as number) : null);

export function buildModel(
  H: TeamSummary,
  A: TeamSummary,
  opts: { referee?: RefereeInput; market?: { home: number; away: number } | null } = {},
): { model: ModelOutput; markets: Market[]; picks: string[] } {
  // --- Gole ---
  const hAtt = blend(H.goals.mFor, H.goals.home.mFor, H.goals.home.n);
  const hDef = blend(H.goals.mAgainst, H.goals.home.mAgainst, H.goals.home.n);
  const aAtt = blend(A.goals.mFor, A.goals.away.mFor, A.goals.away.n);
  const aDef = blend(A.goals.mAgainst, A.goals.away.mAgainst, A.goals.away.n);
  let lh = (hAtt + aDef) / 2;
  let la = (aAtt + hDef) / 2;
  const gPrior = H.goals.prior && A.goals.prior ? (H.goals.prior + A.goals.prior) / 2 : null;
  if (MODEL_CFG.multiplicative.goals && gPrior) {
    lh = (hAtt * aDef) / gPrior;
    la = (aAtt * hDef) / gPrior;
  }

  const xgOk = H.stats.xg.n >= 5 && A.stats.xg.n >= 5;
  if (xgOk) {
    const xh = (H.stats.xg.mFor + A.stats.xg.mAgainst) / 2;
    const xa = (A.stats.xg.mFor + H.stats.xg.mAgainst) / 2;
    lh = 0.65 * lh + 0.35 * xh;
    la = 0.65 * la + 0.35 * xa;
  }
  lh = clampL(lh);
  la = clampL(la);
  // Łączenie z rynkiem: bukmacher zna składy, kontuzje i formę, której model nie widzi
  const mw = MODEL_CFG.marketWeight;
  if (opts.market && mw > 0) {
    lh = (1 - mw) * lh + mw * opts.market.home;
    la = (1 - mw) * la + mw * opts.market.away;
  }

  // macierz wyników 0..10
  const N = 10;
  let pH = 0, pD = 0, pA = 0, pBtts = 0;
  const scores: { h: number; a: number; p: number }[] = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      let p = poissonPmf(i, lh) * poissonPmf(j, la);
      // Dixon-Coles: poprawka dla niskich wyników (0:0 i 1:1 zdarzają się częściej niż przy niezależności)
      const rho = MODEL_CFG.dcRho;
      if (rho) {
        if (i === 0 && j === 0) p *= 1 - lh * la * rho;
        else if (i === 0 && j === 1) p *= 1 + lh * rho;
        else if (i === 1 && j === 0) p *= 1 + la * rho;
        else if (i === 1 && j === 1) p *= 1 - rho;
      }
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
    const vw = MODEL_CFG.venueStats;
    const h = H.stats[key];
    const a = A.stats[key];
    const hFor = vw > 0 && h.home.n >= 2 ? (1 - vw) * h.mFor + vw * h.home.mFor : h.mFor;
    const hAg = vw > 0 && h.home.n >= 2 ? (1 - vw) * h.mAgainst + vw * h.home.mAgainst : h.mAgainst;
    const aFor = vw > 0 && a.away.n >= 2 ? (1 - vw) * a.mFor + vw * a.away.mFor : a.mFor;
    const aAg = vw > 0 && a.away.n >= 2 ? (1 - vw) * a.mAgainst + vw * a.away.mAgainst : a.mAgainst;
    const prior = h.prior && a.prior ? (h.prior + a.prior) / 2 : null;
    const mult = MODEL_CFG.multiplicative.stats && prior;
    const home = clampL(mult ? (hFor * aAg) / prior : (hFor + aAg) / 2);
    const away = clampL(mult ? (aFor * hAg) / prior : (aFor + hAg) / 2);
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
    const hh = hits(H.matches, viewHome, pred);
    const ha = hits(A.matches, viewAway, pred);
    markets.push({
      id,
      group,
      family,
      label,
      p: calibrate(family, Math.min(0.999, Math.max(0.001, p))),
      hitHome: [hh[0], hh[1]],
      hitAway: [ha[0], ha[1]],
      hitW: hh[3] + ha[3] > 0 ? (hh[2] + ha[2]) / (hh[3] + ha[3]) : null,
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
  if (n < 8) return null;
  return MODEL_CFG.histDecay < 1 && m.hitW != null ? m.hitW : k / n;
}

/**
 * Typy z najwyższą zgodnością modelu i historii: szansa 65–88%, a w ostatnich
 * meczach obu drużyn zdarzenie wystąpiło w co najmniej 60% przypadków.
 * Z każdej rodziny (np. „rożne powyżej”) bierzemy jedną linię – najbliższą 76%.
 * Kolejność: 40% szansa z modelu, 60% trafność w historii.
 */
export function choosePicks(markets: Market[]): string[] {
  const P = MODEL_CFG.picks;
  const scored = markets
    .map((m) => ({ m, hit: hitRate(m) }))
    .filter(({ m, hit }) => m.p >= P.pMin && m.p <= P.pMax && (!MODEL_CFG.historyFilter || (hit !== null && hit >= P.histMin)))
    .map(({ m, hit }) => ({ m, score: MODEL_CFG.historyFilter ? P.wModel * m.p + (1 - P.wModel) * (hit as number) : m.p }));

  const bestPerFamily = new Map<string, { m: Market; score: number }>();
  for (const s of scored) {
    const cur = bestPerFamily.get(s.m.family);
    if (!cur || Math.abs(s.m.p - P.target) < Math.abs(cur.m.p - P.target)) bestPerFamily.set(s.m.family, s);
  }
  const perGroup = new Map<string, number>();
  return [...bestPerFamily.values()]
    .sort((a, b) => b.score - a.score)
    .filter(({ m }) => {
      const c = perGroup.get(m.group) ?? 0;
      if (c >= P.perGroup) return false;
      perGroup.set(m.group, c + 1);
      return true;
    })
    .slice(0, P.max)
    .map(({ m }) => m.id);
}

/** Rodzina zdarzenia na podstawie jego id (np. „c-o9.5” → „c-over”). */
export function familyOf(id: string): string {
  if (id === '1' || id === 'X' || id === '2') return '1x2';
  if (id === '1X' || id === 'X2' || id === '12') return 'dc';
  if (id === 'btts' || id === 'btts-no') return 'btts';
  if (id === 'red') return 'red';
  const p = id.replace(/\d+(\.\d+)?$/, '');
  const map: Record<string, string> = { o: 'g-over', u: 'g-under', 'h-o': 'hg-over', 'a-o': 'ag-over', 'ht-o': 'ht-over' };
  if (map[p]) return map[p];
  return p.replace(/-o$/, '-over').replace(/-u$/, '-under');
}
