import { familyOf } from './model';

/**
 * Jak często dwa typy z jednego meczu wchodzą razem w porównaniu z mnożeniem ich szans
 * (1 = niezależne, 1,10 = razem o 10% częściej). Policzone na rozegranych meczach dla
 * typów z szansą 60–92%. Klucz: dwie rodziny zdarzeń posortowane alfabetycznie, „a + b”.
 */
export const PAIR_LIFT: Record<string, number> = {};

export interface LinkedPair {
  a: string;
  b: string;
  lift: number;
}

/** Pary zdarzeń z tego samego meczu z wyraźnym powiązaniem i łączny mnożnik szansy kuponu. */
export function couponLinks(items: { fixtureId: number; marketId: string; label: string }[]): { pairs: LinkedPair[]; factor: number } {
  const pairs: LinkedPair[] = [];
  let factor = 1;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i];
      const y = items[j];
      if (x.fixtureId !== y.fixtureId) continue;
      const key = [familyOf(x.marketId), familyOf(y.marketId)].sort().join(' + ');
      const lift = PAIR_LIFT[key];
      if (lift === undefined) continue;
      factor *= lift;
      if (Math.abs(lift - 1) >= 0.03) pairs.push({ a: x.label, b: y.label, lift });
    }
  return { pairs, factor };
}
