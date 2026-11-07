import { toTeamMatch } from './stats';
import type { ApiFixture } from './types';

type Side = 'h' | 'a' | 't';
type Key = 'corners' | 'yellow' | 'red' | 'sot' | 'shots';

/**
 * Rozlicza zdarzenie (id z lib/model.ts) na faktycznym wyniku zakończonego meczu.
 * true = weszło, false = nie weszło, null = brak danych (np. mecz bez statystyk).
 */
export function settleMarket(id: string, T: ApiFixture): boolean | null {
  const gh = T.goals.home ?? 0;
  const ga = T.goals.away ?? 0;
  const tot = gh + ga;
  const hh = T.score.halftime.home;
  const ha = T.score.halftime.away;
  const m = toTeamMatch(T, T.teams.home.id);
  const stat = (k: Key, side: Side): number | null => {
    if (!m.hasStats) return null;
    const h = m.for[k];
    const a = m.against[k];
    if (h === null || a === null) return null;
    return side === 'h' ? h : side === 'a' ? a : h + a;
  };
  const line = Number((id.match(/(\d+\.5)$/) || [])[1]);
  const cmp = (v: number | null, op: 'o' | 'u') => (v === null ? null : op === 'o' ? v > line : v < line);

  switch (id) {
    case '1': return gh > ga;
    case 'X': return gh === ga;
    case '2': return gh < ga;
    case '1X': return gh >= ga;
    case 'X2': return gh <= ga;
    case '12': return gh !== ga;
    case 'btts': return gh > 0 && ga > 0;
    case 'btts-no': return !(gh > 0 && ga > 0);
    case 'red': {
      const r = stat('red', 't');
      return r === null ? null : r > 0;
    }
  }
  const prefix = id.replace(/\d+\.5$/, '');
  const rules: Record<string, () => boolean | null> = {
    o: () => cmp(tot, 'o'),
    u: () => cmp(tot, 'u'),
    'h-o': () => cmp(gh, 'o'),
    'a-o': () => cmp(ga, 'o'),
    'ht-o': () => (hh === null || ha === null ? null : cmp(hh + ha, 'o')),
    'c-o': () => cmp(stat('corners', 't'), 'o'),
    'c-u': () => cmp(stat('corners', 't'), 'u'),
    'hc-o': () => cmp(stat('corners', 'h'), 'o'),
    'ac-o': () => cmp(stat('corners', 'a'), 'o'),
    'y-o': () => cmp(stat('yellow', 't'), 'o'),
    'y-u': () => cmp(stat('yellow', 't'), 'u'),
    'hy-o': () => cmp(stat('yellow', 'h'), 'o'),
    'ay-o': () => cmp(stat('yellow', 'a'), 'o'),
    's-o': () => cmp(stat('sot', 't'), 'o'),
    'hs-o': () => cmp(stat('sot', 'h'), 'o'),
    'as-o': () => cmp(stat('sot', 'a'), 'o'),
    'sh-o': () => cmp(stat('shots', 't'), 'o'),
  };
  return rules[prefix] ? rules[prefix]() : null;
}
