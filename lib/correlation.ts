import { familyOf } from './model';

/**
 * Jak często dwa typy z jednego meczu wchodzą razem w porównaniu z iloczynem ich trafności
 * (1 = niezależne, 1,10 = razem o 10% częściej). Policzone na 1355 meczach z 1.08–8.11.2026
 * dla typów z szansą 60–92% (z każdej rodziny linia najbliżej 72%), pary z co najmniej 400
 * meczów. Pary bliskie 1 (±3%) pominięte. Klucz: dwie rodziny posortowane alfabetycznie, „a + b”.
 */
export const PAIR_LIFT: Record<string, number> = {
  'btts + g-over': 1.341,
  'ag-over + btts': 1.341,
  'btts + hg-over': 1.247,
  'ac-over + c-over': 1.177,
  'btts + ht-over': 1.173,
  'f-over + hf-over': 1.171,
  'as-over + btts': 1.171,
  'g-over + ht-over': 1.168,
  'ag-over + g-over': 1.167,
  'ag-over + as-over': 1.164,
  'g-over + hg-over': 1.16,
  'as-over + s-over': 1.158,
  'af-over + f-over': 1.156,
  'c-over + hc-over': 1.13,
  'hy-over + y-over': 1.129,
  'ay-over + y-over': 1.12,
  'g-over + s-over': 1.119,
  'f-under + y-under': 1.118,
  'as-over + g-over': 1.111,
  'hg-over + ht-over': 1.108,
  'btts + s-over': 1.108,
  'ac-over + as-over': 1.105,
  'ag-over + ht-over': 1.101,
  'hs-over + s-over': 1.101,
  'hg-over + hs-over': 1.1,
  's-over + sh-over': 1.097,
  'as-over + sh-over': 1.093,
  'ht-over + s-over': 1.087,
  'as-over + ht-over': 1.085,
  'btts + hs-over': 1.073,
  'hg-over + s-over': 1.072,
  'ag-over + s-over': 1.072,
  'c-over + sh-over': 1.072,
  'btts + sh-over': 1.072,
  'hf-over + y-over': 1.069,
  'f-over + y-over': 1.068,
  'af-over + c-under': 1.06,
  'hf-over + hy-over': 1.059,
  'af-over + y-over': 1.058,
  'hs-over + sh-over': 1.058,
  'hc-over + sh-over': 1.056,
  'hc-over + hs-over': 1.054,
  'g-over + hs-over': 1.053,
  'ag-over + sh-over': 1.052,
  'ac-over + sh-over': 1.052,
  'ht-over + sh-over': 1.051,
  'g-over + sh-over': 1.049,
  'af-over + ay-over': 1.045,
  'f-over + g-under': 1.042,
  'hs-over + ht-over': 1.042,
  'c-under + g-under': 1.042,
  'c-under + f-over': 1.041,
  'g-under + hf-over': 1.039,
  'f-under + sh-over': 1.039,
  'hg-over + sh-over': 1.035,
  'c-over + f-under': 1.035,
  'f-under + hs-over': 1.035,
  'f-under + hc-over': 1.034,
  'as-over + c-over': 1.032,
  'ay-over + f-over': 1.032,
  'g-under + y-over': 1.031,
  'ac-over + s-over': 1.031,
  'f-over + hy-over': 1.031,
  'f-over + sh-over': 0.965,
  'af-over + sh-over': 0.961,
  'ac-over + hs-over': 0.959,
  'as-over + c-under': 0.959,
  'ay-over + f-under': 0.958,
  'f-under + hy-over': 0.953,
  'c-under + s-over': 0.953,
  'af-over + y-under': 0.951,
  'c-under + f-under': 0.95,
  'as-over + hc-over': 0.948,
  'f-over + y-under': 0.943,
  'btts + dc': 0.941,
  'f-under + g-under': 0.937,
  'c-under + sh-over': 0.93,
  'g-under + hs-over': 0.929,
  'ay-over + y-under': 0.928,
  'hf-over + y-under': 0.919,
  'ac-over + hc-over': 0.911,
  'f-under + y-over': 0.906,
  'hy-over + y-under': 0.904,
  'g-under + sh-over': 0.896,
  'g-under + hg-over': 0.88,
  'as-over + g-under': 0.877,
  'g-under + s-over': 0.876,
  'ag-over + g-under': 0.871,
  'c-under + hc-over': 0.868,
  'f-over + f-under': 0.85,
  'af-over + f-under': 0.842,
  'g-over + g-under': 0.832,
  'g-under + ht-over': 0.832,
  'y-over + y-under': 0.821,
  'f-under + hf-over': 0.818,
  'ac-over + c-under': 0.808,
  'c-over + c-under': 0.784,
};

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
