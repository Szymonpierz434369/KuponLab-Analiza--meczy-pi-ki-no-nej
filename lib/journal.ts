import { journalAdd, journalDelete, journalList, journalSetItems } from './db';
import { getFinishedFull, getRawSummary } from './data';
import { fairProbs, oddsFromSummary } from './market';
import { settleMarket } from './settle';
import { FINISHED } from './types';

// Dziennik kuponów: zapisane kupony z prawdziwymi kursami, rozliczane automatycznie po meczach.

export interface JournalItem {
  fixtureId: number;
  match: string;
  kickoff: string;
  marketId: string;
  label: string;
  p: number;
  odds: number;
  /**
   * Kurs zamknięcia (DraftKings z ESPN, ostatni przed meczem) i szansa rynku bez marży.
   * Tylko dla 1X2 i linii goli, którą podaje ESPN; null = rynek bez kursu zamknięcia.
   */
  closing?: { odds: number; fairP: number } | null;
}

export type ItemStatus = 'won' | 'lost' | 'pending' | 'void';

export interface JournalEntry {
  id: number;
  createdAt: string;
  stake: number;
  tax: boolean;
  items: (JournalItem & { status: ItemStatus; score: string | null })[];
  odds: number;
  status: ItemStatus;
  payout: number;
}

export function addCoupon(stake: number, tax: boolean, items: JournalItem[]): number {
  if (!(stake > 0)) throw new Error('Podaj stawkę większą od zera.');
  if (!items.length) throw new Error('Kupon jest pusty.');
  for (const it of items) if (!(it.odds > 1)) throw new Error(`Brak kursu dla zdarzenia: ${it.label}.`);
  return journalAdd(stake, tax, items);
}

export function removeCoupon(id: number) {
  journalDelete(id);
}

/** Kurs zamknięcia dla zdarzenia (tylko rynki, które wycenia ESPN). */
function closingFor(marketId: string, summary: unknown): JournalItem['closing'] {
  const o = oddsFromSummary(summary);
  if (!o) return null;
  const f = fairProbs(o);
  if (marketId === '1') return { odds: o.home, fairP: f.home };
  if (marketId === 'X') return { odds: o.draw, fairP: f.draw };
  if (marketId === '2') return { odds: o.away, fairP: f.away };
  if (o.line !== null && f.over !== null) {
    if (marketId === `o${o.line}` && o.over) return { odds: o.over, fairP: f.over };
    if (marketId === `u${o.line}` && o.under) return { odds: o.under, fairP: 1 - f.over };
  }
  return null;
}

/** Dopisuje kursy zamknięcia do zdarzeń, których mecze już się zaczęły (raz, potem są zapisane w dzienniku). */
async function fillClosing(rows: { id: number; list: JournalItem[] }[], now: number) {
  const need = rows.filter((r) =>
    r.list.some((it) => it.closing === undefined && /^(1|X|2|[ou]\d)/.test(it.marketId) && new Date(it.kickoff).getTime() + 2 * 3600_000 < now),
  );
  if (!need.length) return;
  const ids = [...new Set(need.flatMap((r) => r.list.map((it) => it.fixtureId)))];
  const sums = new Map<number, unknown>();
  await Promise.all(ids.map(async (id) => sums.set(id, await getRawSummary(id))));
  for (const r of need) {
    let changed = false;
    for (const it of r.list) {
      if (it.closing !== undefined || new Date(it.kickoff).getTime() + 2 * 3600_000 >= now) continue;
      const s = sums.get(it.fixtureId);
      if (!s) continue;
      it.closing = closingFor(it.marketId, s);
      changed = true;
    }
    if (changed) journalSetItems(r.id, r.list);
  }
}

/** Lista kuponów z rozliczeniem. Mecze, które już się skończyły, sprawdzamy w ESPN (zakończone są w pamięci na stałe). */
export async function listCoupons(): Promise<JournalEntry[]> {
  const rows = journalList();
  const parsed = rows.map((r) => ({ ...r, list: JSON.parse(r.items) as JournalItem[] }));
  const now = Date.now();
  const ids = [
    ...new Set(
      parsed.flatMap((r) => r.list.filter((it) => new Date(it.kickoff).getTime() + 2 * 3600_000 < now).map((it) => it.fixtureId)),
    ),
  ];
  const full = ids.length ? await getFinishedFull(ids) : new Map();
  await fillClosing(parsed, now).catch(() => {});

  return parsed.map((r) => {
    const items = r.list.map((it) => {
      const T = full.get(it.fixtureId);
      let status: ItemStatus = 'pending';
      let score: string | null = null;
      if (T) {
        const st = T.fixture.status.short;
        if (st === 'CANC' || st === 'PST') status = 'void';
        else if (FINISHED.has(st)) {
          score = `${T.goals.home ?? 0}:${T.goals.away ?? 0}`;
          const res = settleMarket(it.marketId, T);
          status = res === null ? 'pending' : res ? 'won' : 'lost';
        }
      }
      return { ...it, status, score };
    });
    const odds = items.reduce((a, it) => a * (it.status === 'void' ? 1 : it.odds), 1);
    const status: ItemStatus = items.some((i) => i.status === 'lost')
      ? 'lost'
      : items.some((i) => i.status === 'pending')
        ? 'pending'
        : items.every((i) => i.status === 'void')
          ? 'void'
          : 'won';
    const taxF = r.tax ? 0.88 : 1;
    let payout = 0;
    if (status === 'won') {
      const gross = r.stake * taxF * odds;
      payout = r.tax && gross > 2280 ? gross * 0.9 : gross;
    } else if (status === 'void') payout = r.stake;
    return { id: r.id, createdAt: r.created_at, stake: r.stake, tax: !!r.tax, items, odds, status, payout };
  });
}
