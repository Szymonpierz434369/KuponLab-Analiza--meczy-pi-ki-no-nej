import type { MatchAnalysis } from './analysis';
import { hitRate, type Market } from './model';
import type { TeamSummary } from './stats';

// Ten plik nie korzysta z bazy, więc można go używać także w przeglądarce.

const pct = (x: number) => Math.round(x * 100);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Zwięzła wersja analizy dla asystenta AI (mniej danych = taniej i dokładniej). */
export function compactForAi(a: MatchAnalysis) {
  const team = (t: TeamSummary) => ({
    nazwa: t.team.name,
    bilans_10: `${t.record.w}W ${t.record.d}R ${t.record.l}P`,
    forma_od_najnowszego: t.matches.map((m) => m.result).join(''),
    bramki: {
      srednio_strzelone: r1(t.goals.avgFor),
      srednio_stracone: r1(t.goals.avgAgainst),
      u_siebie: `${r1(t.goals.home.avgFor)}:${r1(t.goals.home.avgAgainst)} (${t.goals.home.n} m.)`,
      na_wyjezdzie: `${r1(t.goals.away.avgFor)}:${r1(t.goals.away.avgAgainst)} (${t.goals.away.n} m.)`,
      over25: `${t.goals.overs['2.5']}/${t.goals.n}`,
      btts: `${t.goals.btts}/${t.goals.n}`,
      czyste_konta: t.goals.cleanSheets,
      bez_gola: t.goals.failedToScore,
    },
    srednie_za_przeciw: Object.fromEntries(
      (['shots', 'sot', 'corners', 'yellow', 'red', 'fouls', 'xg'] as const)
        .filter((k) => t.stats[k].n > 0)
        .map((k) => [k, `${r1(t.stats[k].avgFor)} : ${r1(t.stats[k].avgAgainst)} (${t.stats[k].n} m.)`]),
    ),
    mecze: t.matches.map(
      (m) =>
        `${m.date.slice(0, 10)} ${m.venue === 'home' ? 'D' : 'W'} vs ${m.opponent} ${m.gf}:${m.ga}` +
        (m.hasStats
          ? ` | strz ${m.for.shots}:${m.against.shots}, cel ${m.for.sot}:${m.against.sot}, roż ${m.for.corners}:${m.against.corners}, żk ${m.for.yellow}:${m.against.yellow}, ck ${m.for.red}:${m.against.red}`
          : ''),
    ),
  });
  const marketLine = (m: Market) => {
    const hr = hitRate(m);
    return `${m.label}: model ${pct(m.p)}% (kurs fair ${(1 / m.p).toFixed(2)})` +
      (hr !== null ? `, historia ${pct(hr)}% [${m.hitHome?.[0]}/${m.hitHome?.[1]} + ${m.hitAway?.[0]}/${m.hitAway?.[1]}]` : '');
  };
  return {
    mecz: `${a.fixture.home.name} – ${a.fixture.away.name}`,
    fixture_id: a.fixture.id,
    rozgrywki: `${a.fixture.league.name}${a.fixture.league.round ? ', ' + a.fixture.league.round : ''}`,
    termin: a.fixture.date,
    gospodarze: team(a.home),
    goscie: team(a.away),
    h2h: a.h2h.map((h) => `${h.date.slice(0, 10)} ${h.home} ${h.gh}:${h.ga} ${h.away}`),
    model: {
      oczekiwane_gole: `${r1(a.model.lambda.home)} : ${r1(a.model.lambda.away)}`,
      szanse_1x2: `${pct(a.model.outcome.home)}% / ${pct(a.model.outcome.draw)}% / ${pct(a.model.outcome.away)}%`,
      najbardziej_prawdopodobne_wyniki: a.model.scores.slice(0, 5).map((s) => `${s.h}:${s.a} (${pct(s.p)}%)`),
      oczekiwane_rozne: r1(a.model.expected.corners.total),
      oczekiwane_zolte: r1(a.model.expected.yellow.total),
      oczekiwane_celne: r1(a.model.expected.sot.total),
      uwaga: a.model.dataWarning,
    },
    typy_aplikacji: a.picks.map((id) => marketLine(a.markets.find((m) => m.id === id)!)),
    wszystkie_rynki: a.markets.map(marketLine),
  };
}
