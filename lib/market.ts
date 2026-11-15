import { poissonPmf, pOver } from './model';

// Kursy bukmacherskie z ESPN (DraftKings): 1X2 i jedna linia goli.
// Z nich wyliczamy, ile goli „spodziewa się rynek” dla każdej drużyny.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface MarketOdds {
  /** kursy dziesiętne */
  home: number;
  draw: number;
  away: number;
  line: number | null;
  over: number | null;
  under: number | null;
  provider: string;
}

export interface MarketLambdas {
  home: number;
  away: number;
}

/** kurs amerykański (+150, -120) → dziesiętny */
export function americanToDecimal(a: number | string | null | undefined): number | null {
  const x = Number(a);
  if (!Number.isFinite(x) || x === 0) return null;
  return x > 0 ? 1 + x / 100 : 1 + 100 / Math.abs(x);
}

/** Kursy z odpowiedzi `summary` ESPN (sekcja pickcenter / odds). */
export function oddsFromSummary(s: Any): MarketOdds | null {
  const o = s?.pickcenter?.[0] ?? s?.odds?.[0];
  if (!o) return null;
  const home = americanToDecimal(o.homeTeamOdds?.moneyLine);
  const away = americanToDecimal(o.awayTeamOdds?.moneyLine);
  const draw = americanToDecimal(o.drawOdds?.moneyLine ?? o.drawOdds);
  if (!home || !away || !draw) return null;
  const line = Number(o.overUnder);
  return {
    home,
    draw,
    away,
    line: Number.isFinite(line) ? line : null,
    over: americanToDecimal(o.overOdds),
    under: americanToDecimal(o.underOdds),
    provider: o.provider?.name ?? 'bukmacher',
  };
}

/** Prawdopodobieństwa bez marży bukmachera (normalizacja odwrotności kursów). */
export function fairProbs(m: MarketOdds) {
  const s = 1 / m.home + 1 / m.draw + 1 / m.away;
  const r = { home: 1 / m.home / s, draw: 1 / m.draw / s, away: 1 / m.away / s, over: null as number | null, margin1x2: s - 1 };
  if (m.line !== null && m.over && m.under) {
    const t = 1 / m.over + 1 / m.under;
    r.over = 1 / m.over / t;
  }
  return r;
}

function outcome1x2(lh: number, la: number) {
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = poissonPmf(i, lh) * poissonPmf(j, la);
    if (i > j) h += p; else if (i === j) d += p; else a += p;
  }
  const s = h + d + a;
  return { h: h / s, d: d / s, a: a / s };
}

/**
 * Oczekiwane gole wg rynku: suma goli z linii powyżej/poniżej, podział między drużyny z kursów 1X2.
 * Gdy nie ma linii goli, sumę bierzemy z modelu (`fallbackTotal`).
 */
export function impliedLambdas(m: MarketOdds, fallbackTotal: number): MarketLambdas | null {
  const f = fairProbs(m);
  let total = fallbackTotal;
  if (f.over !== null && m.line !== null) {
    let lo = 0.2, hi = 8;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      if (pOver(m.line, mid) < f.over) lo = mid; else hi = mid;
    }
    total = (lo + hi) / 2;
  }
  let best = 0.5, err = Infinity;
  for (let s = 0.05; s <= 0.95; s += 0.01) {
    const o = outcome1x2(s * total, (1 - s) * total);
    const e = (o.h - f.home) ** 2 + (o.a - f.away) ** 2;
    if (e < err) { err = e; best = s; }
  }
  return { home: best * total, away: (1 - best) * total };
}
