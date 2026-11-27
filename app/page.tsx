import { getFixturesByDate, warsawDate } from '@/lib/data';
import { DataError } from '@/lib/espn';
import { LEAGUE_ORDER, LEAGUES } from '@/lib/leagues';
import { ApiFixture, FINISHED, NOT_STARTED } from '@/lib/types';
import { getT } from '@/lib/i18n-server';
import type { T } from '@/lib/i18n';

function nextDays(n: number, t: T) {
  const wd = new Intl.DateTimeFormat(t.locale, { weekday: 'short', timeZone: 'UTC' });
  const out: { iso: string; label: string; sub: string }[] = [];
  const today = warsawDate();
  for (let i = 0; i < n; i++) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      iso,
      label: i === 0 ? t('Dziś') : i === 1 ? t('Jutro') : wd.format(d).replace('.', ''),
      sub: `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    });
  }
  return out;
}

function time(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export default async function Home({ searchParams }: { searchParams: Promise<{ d?: string; all?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  const days = nextDays(7, t);
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : days[0].iso;
  const showAll = sp.all === '1';

  let fixtures: ApiFixture[] = [];
  let error: string | null = null;
  try {
    fixtures = await getFixturesByDate(date, showAll);
  } catch (e) {
    error = t(e instanceof DataError ? e.message : `Nie udało się pobrać meczów: ${(e as Error).message}`);
  }

  const filtered = fixtures;
  const groups = new Map<string, ApiFixture[]>();
  for (const f of filtered) {
    const g = groups.get(f.league.id) ?? [];
    g.push(f);
    groups.set(f.league.id, g);
  }
  const ordered = [...groups.entries()].sort(([a, fa], [b, fb]) => {
    const oa = LEAGUE_ORDER.get(a) ?? 999;
    const ob = LEAGUE_ORDER.get(b) ?? 999;
    return oa - ob || fa[0].league.country.localeCompare(fb[0].league.country);
  });
  for (const [, list] of ordered) list.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);

  const q = (d: string, all: boolean) => `/?d=${d}${all ? '&all=1' : ''}`;

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h1 style={{ fontSize: '1.5rem' }}>{t('Mecze')}</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {t('Wybierz mecz, żeby zobaczyć statystyki z 10 ostatnich spotkań obu drużyn, szanse i typy.')}
          </p>
        </div>
        <div className="chips">
          <a className={`chip ${!showAll ? 'on' : ''}`} href={q(date, false)}>
            {t('Wybrane ligi ({n})', { n: LEAGUES.length })}
          </a>
          <a className={`chip ${showAll ? 'on' : ''}`} href={q(date, true)}>
            {t('Wszystkie')}
          </a>
        </div>
      </div>

      <nav className="chips" aria-label={t('Dzień')}>
        {days.map((d) => (
          <a key={d.iso} href={q(d.iso, showAll)} className={`chip center ${d.iso === date ? 'on' : ''}`}>
            {d.label}
            <small>{d.sub}</small>
          </a>
        ))}
      </nav>

      {error && (
        <div className="err">
          <strong>{t('Brak danych.')}</strong> {error}
        </div>
      )}

      {!error && ordered.length === 0 && (
        <div className="card muted">
          {t('Brak meczów w wybranych ligach tego dnia.')} {!showAll && <a href={q(date, true)}>{t('Pokaż wszystkie ligi')}</a>}
        </div>
      )}

      {ordered.map(([leagueId, list]) => (
        <section key={leagueId} className="card league">
          <div className="league-head">
            {list[0].league.logo && <img src={list[0].league.logo} alt="" />}
            <span>{t(list[0].league.name)}</span>
            <span className="muted small" style={{ fontWeight: 500 }}>
              {t(list[0].league.country)}
            </span>
          </div>
          {list.map((f) => {
            const st = f.fixture.status.short;
            const started = !NOT_STARTED.has(st);
            return (
              <a key={f.fixture.id} href={`/mecz/${f.fixture.id}`} className="fx">
                <span className="time">
                  {time(f.fixture.date, t.locale)}
                  {started && !FINISHED.has(st) && <span className="tiny" style={{ display: 'block', color: 'var(--bad)' }}>{st}</span>}
                </span>
                <span className="team home">
                  <span>{f.teams.home.name}</span>
                  <img className="logo" src={f.teams.home.logo} alt="" />
                </span>
                <span className="score">{started ? `${f.goals.home ?? 0}:${f.goals.away ?? 0}` : '–'}</span>
                <span className="team away">
                  <img className="logo" src={f.teams.away.logo} alt="" />
                  <span>{f.teams.away.name}</span>
                </span>
                <span className="go btn small">{t('Analiza')}</span>
              </a>
            );
          })}
        </section>
      ))}
    </div>
  );
}
