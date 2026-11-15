import { saveAnalysisSummary } from './db';
import { getFinishedFull, getFixture, getOpponentForms, getRawSummary, getTeamFinished, headToHead } from './data';
import { fairProbs, oddsFromSummary, type MarketOdds } from './market';
import { compactForAi } from './aiContext';
import { buildModel, Market, ModelOutput } from './model';
import { attachOpponentFactors, HISTORY_MATCHES, needsOpponentForms, optsForTeam, summarize, toTeamMatch, TeamSummary } from './stats';

export interface MatchAnalysis {
  fixture: {
    id: number;
    date: string;
    status: string;
    league: { id: string; name: string; country: string; logo: string; round?: string; season: number };
    venue: string | null;
    referee: string | null;
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
    goals: { home: number | null; away: number | null };
  };
  home: TeamSummary;
  away: TeamSummary;
  h2h: { date: string; home: string; away: string; gh: number | null; ga: number | null; league: string }[];
  model: ModelOutput;
  markets: Market[];
  picks: string[];
  /** kursy bukmacherskie z ESPN (DraftKings) – tylko do porównania */
  market: { odds: MarketOdds; probs: { home: number; draw: number; away: number; over: number | null } } | null;
  generatedAt: string;
}

export type Progress = (step: string, done: number, total: number) => void;

export async function buildAnalysis(fixtureId: number, progress: Progress = () => {}): Promise<MatchAnalysis> {
  const total = 24;
  progress('Pobieram dane meczu', 0, total);
  const fx = await getFixture(fixtureId);
  if (!fx) throw new Error('Nie znaleziono meczu o tym numerze.');

  const season = fx.league.season;
  const before = fx.fixture.timestamp;
  progress(`Szukam ostatnich meczów: ${fx.teams.home.name} i ${fx.teams.away.name}`, 1, total);
  const [homeAll, awayAll] = await Promise.all([
    getTeamFinished(fx.teams.home.id, season, before),
    getTeamFinished(fx.teams.away.id, season, before),
  ]);
  const homeLast = homeAll.slice(0, HISTORY_MATCHES);
  const awayLast = awayAll.slice(0, HISTORY_MATCHES);

  const ids = [...new Set([...homeLast, ...awayLast].map((f) => f.fixture.id))];
  const full = await getFinishedFull(ids, (done, n) => progress(`Pobieram statystyki meczów (${done}/${n})`, 2 + Math.round((done / Math.max(1, n)) * 20), total));
  const h2hRaw = headToHead(homeAll, fx.teams.away.id);

  const toMatches = (list: typeof homeLast, teamId: number) => list.map((f) => toTeamMatch(full.get(f.fixture.id) ?? f, teamId));
  const hm = toMatches(homeLast, fx.teams.home.id);
  const am = toMatches(awayLast, fx.teams.away.id);
  if (needsOpponentForms()) {
    progress('Sprawdzam siłę rywali z ostatnich meczów', 22, total);
    const form = await getOpponentForms([...hm, ...am].map((m) => m.opponentId), season, before);
    attachOpponentFactors(hm, form);
    attachOpponentFactors(am, form);
  }
  const home = summarize({ id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo }, hm, optsForTeam(hm));
  const away = summarize({ id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo }, am, optsForTeam(am));

  const raw = await getRawSummary(fixtureId).catch(() => null);
  const odds = raw ? oddsFromSummary(raw) : null;
  const fp = odds ? fairProbs(odds) : null;
  const market = odds && fp ? { odds, probs: { home: fp.home, draw: fp.draw, away: fp.away, over: fp.over } } : null;

  progress('Liczę model', total, total);
  const { model, markets, picks } = buildModel(home, away);

  const analysis: MatchAnalysis = {
    fixture: {
      id: fx.fixture.id,
      date: fx.fixture.date,
      status: fx.fixture.status.short,
      league: { id: fx.league.id, name: fx.league.name, country: fx.league.country, logo: fx.league.logo, round: fx.league.round, season },
      venue: fx.fixture.venue?.name ? [fx.fixture.venue.name, fx.fixture.venue.city].filter(Boolean).join(', ') : null,
      referee: fx.fixture.referee ?? null,
      home: { id: fx.teams.home.id, name: fx.teams.home.name, logo: fx.teams.home.logo },
      away: { id: fx.teams.away.id, name: fx.teams.away.name, logo: fx.teams.away.logo },
      goals: fx.goals,
    },
    home,
    away,
    h2h: h2hRaw.map((f) => ({
      date: f.fixture.date,
      home: f.teams.home.name,
      away: f.teams.away.name,
      gh: f.goals.home,
      ga: f.goals.away,
      league: f.league.name,
    })),
    model,
    markets,
    picks,
    market,
    generatedAt: new Date().toISOString(),
  };

  saveAnalysisSummary(fixtureId, fx.fixture.date, compactForAi(analysis));
  return analysis;
}

