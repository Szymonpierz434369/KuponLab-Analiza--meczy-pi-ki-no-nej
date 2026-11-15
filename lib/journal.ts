import { journalAdd, journalDelete, journalList } from './db';
import { getFinishedFull } from './data';
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
