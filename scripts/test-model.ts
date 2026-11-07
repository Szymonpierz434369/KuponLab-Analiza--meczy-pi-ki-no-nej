// Szybki test modelu na wymyślonych danych (bez API): npm run test:model
import { summarize, toTeamMatch } from '../lib/stats.ts';
import { buildModel, hitRate, nbOver, poissonPmf, pOver } from '../lib/model.ts';
import type { ApiFixture } from '../lib/types.ts';

function fake(id: number, homeId: number, awayId: number, gh: number, ga: number, st: [number, number, number, number, number][]): ApiFixture {
  const block = (teamId: number, s: [number, number, number, number, number]) => ({
    team: { id: teamId, name: `T${teamId}` },
    statistics: [
      { type: 'Total Shots', value: s[0] },
      { type: 'Shots on Goal', value: s[1] },
      { type: 'Corner Kicks', value: s[2] },
      { type: 'Yellow Cards', value: s[3] || null }, // API zwraca null zamiast 0
      { type: 'Red Cards', value: s[4] || null },
      { type: 'Ball Possession', value: '52%' },
    ],
  });
  return {
    fixture: { id, date: new Date(Date.UTC(2026, 9, 30 - id)).toISOString(), timestamp: 1_790_000_000 - id * 86400, status: { short: 'FT', long: 'Match Finished' } },
    league: { id: 'eng.1', name: 'Premier League', country: 'England', logo: '', season: 2026 },
    teams: { home: { id: homeId, name: `T${homeId}`, logo: '' }, away: { id: awayId, name: `T${awayId}`, logo: '' } },
    goals: { home: gh, away: ga },
    score: { halftime: { home: Math.floor(gh / 2), away: Math.floor(ga / 2) }, fulltime: { home: gh, away: ga } },
    statistics: [block(homeId, st[0]), block(awayId, st[1])],
  };
}

const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const pois = (l: number) => { let k = 0, p = Math.exp(-l), c = p; const u = rnd(); while (u > c) { k++; p *= l / k; c += p; } return k; };

const H: ApiFixture[] = [];
const A: ApiFixture[] = [];
for (let i = 1; i <= 10; i++) {
  const home = i % 2 === 0;
  H.push(home ? fake(i, 1, 100 + i, pois(2), pois(0.9), [[16, 6, 7, 1, 0], [9, 3, 4, 2, 0]]) : fake(i, 100 + i, 1, pois(1), pois(1.7), [[10, 3, 4, 2, 0], [14, 5, 6, 2, 0]]));
  A.push(home ? fake(50 + i, 2, 200 + i, pois(1.2), pois(1.3), [[11, 4, 5, 2, 0], [12, 4, 5, 3, i === 3 ? 1 : 0]]) : fake(50 + i, 200 + i, 2, pois(1.5), pois(1), [[13, 5, 6, 2, 0], [10, 3, 4, 3, 0]]));
}

const hs = summarize({ id: 1, name: 'Gospodarze', logo: '' }, H.map((f) => toTeamMatch(f, 1)));
const as = summarize({ id: 2, name: 'Goście', logo: '' }, A.map((f) => toTeamMatch(f, 2)));
const { model, markets, picks } = buildModel(hs, as);

let ok = true;
const check = (name: string, cond: boolean) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false; };

check('NB z r=∞ to Poisson', Math.abs(nbOver(9.5, 10, Infinity) - pOver(9.5, 10)) < 1e-12);
check('NB przy dużym r zbliża się do Poissona', Math.abs(nbOver(9.5, 10, 1e6) - pOver(9.5, 10)) < 1e-4);
check('NB ma grubsze ogony (r=7, linia 7.5 przy średniej 10)', nbOver(7.5, 10, 7) < pOver(7.5, 10));
check('NB sumuje się do 1 (ogon po 200 ≈ 0)', nbOver(200.5, 10, 7) < 1e-9);
let sum = 0; for (let k = 0; k < 40; k++) sum += poissonPmf(k, 2.7);
check('Poisson sumuje się do 1', Math.abs(sum - 1) < 1e-9);
check('P(>2.5) dla λ=2.5 ≈ 0.456', Math.abs(pOver(2.5, 2.5) - 0.4562) < 0.001);
check('1X2 sumuje się do 1', Math.abs(model.outcome.home + model.outcome.draw + model.outcome.away - 1) < 1e-9);
check('Kartki null liczone jako 0', hs.stats.red.n === 10 && hs.stats.red.avgFor === 0);
check('Over i Under 2.5 sumują się do 1', Math.abs(markets.find((m) => m.id === 'o2.5')!.p + markets.find((m) => m.id === 'u2.5')!.p - 1) < 1e-9);
const c95 = markets.find((m) => m.id === 'c-o9.5')!;
check('Skuteczność rożnych policzona z 10+10 meczów', c95.hitHome![1] === 10 && c95.hitAway![1] === 10);

console.log('\nOczekiwane gole:', model.lambda.home.toFixed(2), ':', model.lambda.away.toFixed(2));
console.log('1X2:', [model.outcome.home, model.outcome.draw, model.outcome.away].map((x) => (x * 100).toFixed(1) + '%').join(' / '));
console.log('Rożne:', model.expected.corners.total.toFixed(1), ' Żółte:', model.expected.yellow.total.toFixed(1), ' Celne:', model.expected.sot.total.toFixed(1));
console.log('Typy:');
for (const id of picks) {
  const m = markets.find((x) => x.id === id)!;
  console.log(`  ${m.label}: ${(m.p * 100).toFixed(0)}% (hist ${(hitRate(m)! * 100).toFixed(0)}%)`);
}
process.exit(ok ? 0 : 1);
