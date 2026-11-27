'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MatchAnalysis } from '@/lib/analysis';
import { compactForAi } from '@/lib/aiContext';
import { buildModel, hitRate, type Market, type MarketGroup, type RefereeInput } from '@/lib/model';
import { STAT_LABELS, type StatKey, type TeamSummary } from '@/lib/stats';
import AiChat from './AiChat';
import { useCoupon } from './CouponProvider';
import { useT } from './LangProvider';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => x.toFixed(1);
const fmtDate = (iso: string, withTime = true, locale = 'pl-PL') =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: withTime ? undefined : '2-digit',
    weekday: withTime ? 'long' : undefined,
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
  }).format(new Date(iso));

type LoadState =
  | { kind: 'loading'; step: string; done: number; total: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: MatchAnalysis };

export default function MatchView({ id }: { id: number }) {
  const t = useT();
  const [state, setState] = useState<LoadState>({ kind: 'loading', step: 'Łączę się', done: 0, total: 24 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/analysis/${id}`, { cache: 'no-store' });
        if (!res.body) throw new Error(t('Pusta odpowiedź serwera'));
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim() || cancelled) continue;
            const msg = JSON.parse(line);
            if (msg.type === 'progress') setState({ kind: 'loading', step: msg.step, done: msg.done, total: msg.total });
            if (msg.type === 'error') setState({ kind: 'error', message: msg.message });
            if (msg.type === 'result') setState({ kind: 'ready', data: msg.result });
          }
        }
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') {
    return (
      <div className="card stack" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2>{t('Przygotowuję analizę')}</h2>
        <div className="progress">
          <i style={{ width: `${Math.max(6, (state.done / state.total) * 100)}%` }} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {t(state.step)}. {t('Pierwsze otwarcie meczu trwa kilka–kilkanaście sekund, kolejne są natychmiastowe.')}
        </p>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="stack" style={{ maxWidth: 640, margin: '40px auto' }}>
        <div className="err">
          <strong>{t('Nie udało się przygotować analizy.')}</strong> {t(state.message)}
        </div>
        <a className="btn" href="/">{t('← Wróć do listy meczów')}</a>
      </div>
    );
  }
  return <Analysis a={state.data} />;
}

function Form({ t: team }: { t: TeamSummary }) {
  const t = useT();
  const map = { W: t('W'), D: t('R'), L: t('P') } as const;
  return (
    <div className="form" title={t('Forma: od najnowszego meczu')}>
      {team.matches.map((m) => (
        <b key={m.fixtureId} className={m.result}>{map[m.result]}</b>
      ))}
    </div>
  );
}

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function Analysis({ a: base }: { a: MatchAnalysis }) {
  const t = useT();
  // Średnie sędziego wpisane ręcznie – model przeliczamy w przeglądarce
  const refKey = `kuponlab-sedzia-${base.fixture.id}`;
  const [refY, setRefY] = useState('');
  const [refF, setRefF] = useState('');
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(refKey) ?? '{}');
      setRefY(saved.y ?? '');
      setRefF(saved.f ?? '');
    } catch {}
  }, [refKey]);
  const saveRef = (y: string, f: string) => {
    setRefY(y);
    setRefF(f);
    try {
      localStorage.setItem(refKey, JSON.stringify({ y, f }));
    } catch {}
  };
  const referee: RefereeInput = { yellow: num(refY), fouls: num(refF) };
  const a = useMemo(() => {
    if (!referee.yellow && !referee.fouls) return base;
    return { ...base, ...buildModel(base.home, base.away, { referee }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, referee.yellow, referee.fouls]);
  const { home: H, away: A, model } = a;
  const byId = useMemo(() => new Map(a.markets.map((m) => [m.id, m])), [a.markets]);
  const picks = a.picks.map((id) => byId.get(id)!).filter(Boolean);

  return (
    <div className="stack">
      <a href="/" className="muted small">{t('← Lista meczów')}</a>

      <section className="card stack">
        <div className="row spread small muted">
          <span className="row" style={{ gap: 6 }}>
            {a.fixture.league.logo && <img className="logo" src={a.fixture.league.logo} alt="" />}
            {t(a.fixture.league.name)}
            {a.fixture.league.round ? ` · ${a.fixture.league.round}` : ''}
          </span>
          <span>{fmtDate(a.fixture.date, true, t.locale)}</span>
        </div>
        <div className="match-hero">
          <div className="side">
            <img src={H.team.logo} alt="" />
            <h1>{H.team.name}</h1>
            <Form t={H} />
            <span className="tiny muted">{t('{w}W {d}R {l}P · {p} pkt z {n}', { w: H.record.w, d: H.record.d, l: H.record.l, p: H.points, n: H.matches.length })}</span>
          </div>
          <div className="mid">
            <div style={{ fontSize: '2rem', fontWeight: 800 }}>
              {a.fixture.status === 'NS' || a.fixture.goals.home === null ? 'vs' : `${a.fixture.goals.home}:${a.fixture.goals.away}`}
            </div>
            <div className="tiny muted">{t('oczekiwane gole')}</div>
            <div style={{ fontWeight: 700 }}>{f1(model.lambda.home)} : {f1(model.lambda.away)}</div>
          </div>
          <div className="side">
            <img src={A.team.logo} alt="" />
            <h1>{A.team.name}</h1>
            <Form t={A} />
            <span className="tiny muted">{t('{w}W {d}R {l}P · {p} pkt z {n}', { w: A.record.w, d: A.record.d, l: A.record.l, p: A.points, n: A.matches.length })}</span>
          </div>
        </div>
        {(a.fixture.venue || a.fixture.referee) && (
          <div className="tiny muted center">
            {a.fixture.venue}
            {a.fixture.referee ? ` · ${t('sędzia')}: ${a.fixture.referee}` : ''}
          </div>
        )}
      </section>

      {model.dataWarning && <div className="warn small">{t(model.dataWarning)}</div>}

      <RefereeCard a={base} y={refY} f={refF} onChange={saveRef} />

      <section className="card stack">
        <div className="card-head">
          <h2>{t('Szanse według modelu')}</h2>
          <span className="tiny muted">{t('Poisson z ostatnich 10 meczów')}{model.goalsFromXg ? ' + xG' : ''}</span>
        </div>
        <div className="prob3" role="img" aria-label={`1: ${pct(model.outcome.home)}, X: ${pct(model.outcome.draw)}, 2: ${pct(model.outcome.away)}`}>
          <div className="h" style={{ width: pct(model.outcome.home) }}>1 · {pct(model.outcome.home)}</div>
          <div className="d" style={{ width: pct(model.outcome.draw) }}>X · {pct(model.outcome.draw)}</div>
          <div className="a" style={{ width: pct(model.outcome.away) }}>2 · {pct(model.outcome.away)}</div>
        </div>
        <div className="kpis">
          <Kpi v={f1(model.lambda.home + model.lambda.away)} l={t('Gole w meczu')} />
          <Kpi v={pct(byId.get('btts')?.p ?? 0)} l={t('Obie strzelą')} />
          <Kpi v={pct(byId.get('o2.5')?.p ?? 0)} l={t('Powyżej 2.5')} />
          {byId.has('c-o9.5') && <Kpi v={f1(model.expected.corners.total)} l={t('Rożne (oczek.)')} />}
          {byId.has('y-o3.5') && <Kpi v={f1(model.expected.yellow.total)} l={t('Żółte (oczek.)')} />}
          {byId.has('s-o8.5') && <Kpi v={f1(model.expected.sot.total)} l={t('Celne (oczek.)')} />}
          {byId.has('f-o23.5') && <Kpi v={f1(model.expected.fouls.total)} l={t('Faule (oczek.)')} />}
        </div>
        <div className="row small">
          <span className="muted">{t('Najbardziej prawdopodobne wyniki:')}</span>
          {model.scores.slice(0, 6).map((s) => (
            <span key={`${s.h}-${s.a}`} className="chip">
              {s.h}:{s.a} <span className="muted">{pct(s.p)}</span>
            </span>
          ))}
        </div>
      </section>

      {a.market && <MarketCard a={a} />}

      <section className="card">
        <div className="card-head">
          <h2>{t('Typy z najwyższą zgodnością')}</h2>
          <span className="tiny muted">{t('model 65–88% i zdarzenie wystąpiło w ≥ 60% ostatnich meczów obu drużyn')}</span>
        </div>
        {picks.length === 0 ? (
          <p className="muted small">{t('Brak zdarzeń, w których model i historia wyraźnie się zgadzają. To też informacja: ten mecz lepiej sobie odpuścić albo grać pojedynczo po wartość.')}</p>
        ) : (
          <div className="picks">
            {picks.map((m) => (
              <PickCard key={m.id} m={m} a={a} />
            ))}
          </div>
        )}
      </section>

      <Compare a={a} />

      <TeamDetails a={a} />

      {a.h2h.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>{t('Bezpośrednie mecze')}</h2>
            <span className="tiny muted">{t('ostatnie {n}', { n: a.h2h.length })}</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <tbody>
                {a.h2h.map((h, i) => (
                  <tr key={i}>
                    <td className="l muted">{fmtDate(h.date, false, t.locale)}</td>
                    <td className="l muted">{t(h.league)}</td>
                    <td>{h.home}</td>
                    <td className="center" style={{ fontWeight: 700 }}>{h.gh}:{h.ga}</td>
                    <td className="l">{h.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Markets a={a} />

      <section className="card">
        <div className="card-head">
          <h2>{t('Asystent AI')}</h2>
        </div>
        <AiChat
          mode="match"
          context={() => compactForAi(a)}
          intro={t('Asystent widzi wszystkie statystyki z tej strony i wyliczenia modelu. Odpowiada na podstawie danych, bez obietnic wygranej.')}
          suggestions={[
            t('Zrób pełną analizę tego meczu'),
            t('Co warto zagrać w tym meczu?'),
            t('Jakie są największe ryzyka?'),
            t('Rożne czy kartki – co pewniejsze?'),
          ]}
        />
      </section>
    </div>
  );
}

function MarketCard({ a }: { a: MatchAnalysis }) {
  const t = useT();
  const m = a.market!;
  const byId = new Map(a.markets.map((x) => [x.id, x]));
  const rows: { label: string; odds: number | null; market: number | null; model: number | null }[] = [
    { label: `1 · ${a.fixture.home.name}`, odds: m.odds.home, market: m.probs.home, model: a.model.outcome.home },
    { label: `X · ${t('remis')}`, odds: m.odds.draw, market: m.probs.draw, model: a.model.outcome.draw },
    { label: `2 · ${a.fixture.away.name}`, odds: m.odds.away, market: m.probs.away, model: a.model.outcome.away },
  ];
  if (m.odds.line !== null) {
    const o = byId.get(`o${m.odds.line}`);
    const u = byId.get(`u${m.odds.line}`);
    rows.push({ label: t(`Powyżej ${m.odds.line} gola`), odds: m.odds.over, market: m.probs.over, model: o?.p ?? null });
    rows.push({ label: t(`Poniżej ${m.odds.line} gola`), odds: m.odds.under, market: m.probs.over === null ? null : 1 - m.probs.over, model: u?.p ?? null });
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Kursy rynkowe')}</h2>
        <span className="tiny muted">{t('{p}, przez ESPN', { p: m.odds.provider })}</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l">{t('Zdarzenie')}</th>
              <th>{t('Kurs')}</th>
              <th title={t('Szansa wynikająca z kursów po usunięciu marży bukmachera')}>{t('Rynek')}</th>
              <th>{t('Model')}</th>
              <th>{t('Różnica')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.market !== null && r.model !== null ? r.model - r.market : null;
              return (
                <tr key={r.label}>
                  <td className="l">{r.label}</td>
                  <td>{r.odds ? r.odds.toFixed(2) : '–'}</td>
                  <td>{r.market !== null ? pct(r.market) : '–'}</td>
                  <td>{r.model !== null ? pct(r.model) : '–'}</td>
                  <td className={diff === null ? 'muted' : Math.abs(diff) >= 0.08 ? 'val-neg' : 'muted'}>
                    {diff === null ? '–' : `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(0)} pp`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {t('Na wyniku meczu i liniach goli bukmacher jest dokładniejszy od modelu: w teście na ok. 1100 meczach zakłady, w których model widział przewagę nad tymi kursami, dały ok. −16%. Duża różnica (czerwona) częściej oznacza, że model czegoś nie wie (skład, kontuzje), niż że kurs jest okazją. Model jest najmocniejszy na faulach, kartkach, rożnych i strzałach celnych.')}
      </p>
    </section>
  );
}

function RefereeCard({ a, y, f, onChange }: { a: MatchAnalysis; y: string; f: string; onChange: (y: string, f: string) => void }) {
  const teamsY = (a.home.stats.yellow.avgFor + a.away.stats.yellow.avgAgainst) / 2 + (a.away.stats.yellow.avgFor + a.home.stats.yellow.avgAgainst) / 2;
  const teamsF = (a.home.stats.fouls.avgFor + a.away.stats.fouls.avgAgainst) / 2 + (a.away.stats.fouls.avgFor + a.home.stats.fouls.avgAgainst) / 2;
  const active = !!(num(y) || num(f));
  const t = useT();
  return (
    <section className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>{t('Sędzia')}</h2>
        <span className={`tiny ${active ? 'val-pos' : 'muted'}`}>{active ? t('uwzględniony w kartkach i faulach') : t('nieuwzględniony')}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {a.fixture.referee ? `${t('Sędzia')}: ${a.fixture.referee}. ` : t('ESPN nie podaje sędziów, więc model domyślnie liczy kartki i faule tylko ze statystyk drużyn.') + ' '}
        {t('Wpisz średnie sędziego z ostatnich meczów (np. ze Sofascore, WhoScored albo worldfootball.net), a kartki i faule przeliczą się jako średnia: połowa z drużyn, połowa z sędziego.')}
      </p>
      <div className="row small">
        <label htmlFor="ref-y">{t('Żółte kartki na mecz')}</label>
        <input id="ref-y" inputMode="decimal" className="odds" placeholder={teamsY.toFixed(1)} value={y} onChange={(e) => onChange(e.target.value, f)} />
        <label htmlFor="ref-f">{t('Faule na mecz')}</label>
        <input id="ref-f" inputMode="decimal" className="odds" placeholder={teamsF.toFixed(1)} value={f} onChange={(e) => onChange(y, e.target.value)} />
        {active && (
          <button type="button" className="btn small" onClick={() => onChange('', '')}>
            {t('Wyczyść')}
          </button>
        )}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {t('W polach widać średnie wynikające z samych drużyn ({y} kartki, {f} fauli). Waga sędziego 50% to założenie: bez danych o sędziach nie dało się jej sprawdzić testem wstecznym.', { y: teamsY.toFixed(1), f: teamsF.toFixed(1) })}
      </p>
    </section>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return (
    <div className="kpi">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function AddButton({ m, a, odds }: { m: Market; a: MatchAnalysis; odds?: number | null }) {
  const { add, remove, has } = useCoupon();
  const t = useT();
  const on = has(a.fixture.id, m.id);
  return (
    <button
      type="button"
      className={`btn small ${on ? 'primary' : ''}`}
      onClick={() =>
        on
          ? remove(a.fixture.id, m.id)
          : add({
              fixtureId: a.fixture.id,
              match: `${a.fixture.home.name} – ${a.fixture.away.name}`,
              kickoff: a.fixture.date,
              marketId: m.id,
              label: m.label,
              p: m.p,
              hit: hitRate(m),
              odds: odds ?? null,
            })
      }
    >
      {on ? t('✓ Na kuponie') : t('+ Kupon')}
    </button>
  );
}

function HitText({ m }: { m: Market }) {
  return (
    <>
      {m.hitHome ? `${m.hitHome[0]}/${m.hitHome[1]}` : '–'} · {m.hitAway ? `${m.hitAway[0]}/${m.hitAway[1]}` : '–'}
    </>
  );
}

function PickCard({ m, a }: { m: Market; a: MatchAnalysis }) {
  const hr = hitRate(m);
  const t = useT();
  return (
    <div className="pick-card">
      <span className="tiny muted">{t(m.group)}</span>
      <strong>{t(m.label)}</strong>
      <div className="row spread">
        <span className="p">{pct(m.p)}</span>
        <span className="small muted right">
          {t('kurs fair')} {(1 / m.p).toFixed(2)}
          <br />
          {t('historia')} {hr !== null ? pct(hr) : '–'} (<HitText m={m} />)
        </span>
      </div>
      <AddButton m={m} a={a} />
    </div>
  );
}

// --- Porównanie średnich ---
function Compare({ a }: { a: MatchAnalysis }) {
  const t = useT();
  const { home: H, away: A } = a;
  const rows: { label: string; h: number; a: number; n?: [number, number]; digits?: number }[] = [
    { label: t('Gole strzelone'), h: H.goals.avgFor, a: A.goals.avgFor },
    { label: t('Gole stracone'), h: H.goals.avgAgainst, a: A.goals.avgAgainst },
    { label: t('Gole w 1. połowie'), h: H.goals.ht.avgFor, a: A.goals.ht.avgFor },
  ];
  const keys: StatKey[] = ['xg', 'shots', 'sot', 'corners', 'yellow', 'red', 'fouls', 'offsides', 'poss'];
  for (const k of keys) {
    if (H.stats[k].n === 0 && A.stats[k].n === 0) continue;
    rows.push({ label: `${t(STAT_LABELS[k])} (${t('za')})`, h: H.stats[k].avgFor, a: A.stats[k].avgFor, n: [H.stats[k].n, A.stats[k].n], digits: k === 'red' || k === 'xg' ? 2 : 1 });
    if (k !== 'poss') rows.push({ label: `${t(STAT_LABELS[k])} (${t('przeciw')})`, h: H.stats[k].avgAgainst, a: A.stats[k].avgAgainst, n: [H.stats[k].n, A.stats[k].n], digits: k === 'red' || k === 'xg' ? 2 : 1 });
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Średnie na mecz')}</h2>
        <span className="tiny muted">
          <span style={{ color: 'var(--home)' }}>■</span> {H.team.name} · <span style={{ color: 'var(--away)' }}>■</span> {A.team.name}
        </span>
      </div>
      {rows.map((r) => {
        const max = Math.max(r.h, r.a, 0.0001);
        return (
          <div className="cmp" key={r.label}>
            <span className="val">{r.h.toFixed(r.digits ?? 1)}</span>
            <div className="bar rev"><i className="h" style={{ width: `${(r.h / max) * 100}%` }} /></div>
            <span className="lab">{r.label}</span>
            <div className="bar"><i className="a" style={{ width: `${(r.a / max) * 100}%` }} /></div>
            <span className="val right">{r.a.toFixed(r.digits ?? 1)}</span>
          </div>
        );
      })}
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {t('„Za” = ile drużyna miała sama, „przeciw” = ile miał rywal. Szczegółowe statystyki z {h} i {a} meczów (nie każde rozgrywki je udostępniają).', { h: H.statsN, a: A.statsN })}
      </p>
    </section>
  );
}

function Spark({ fors, againsts }: { fors: number[]; againsts?: number[] }) {
  const max = Math.max(1, ...fors, ...(againsts ?? []));
  return (
    <div className="spark" aria-hidden>
      {fors.map((v, i) => (
        <i key={'f' + i} style={{ height: `${(v / max) * 100}%` }} title={String(v)} />
      ))}
    </div>
  );
}

function TeamDetails({ a }: { a: MatchAnalysis }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const tr = useT();
  const t = side === 'home' ? a.home : a.away;
  const g = t.goals;
  const sparkKeys: StatKey[] = ['shots', 'sot', 'corners', 'yellow', 'fouls'];
  return (
    <section className="card">
      <div className="tabs" role="tablist">
        <button role="tab" className={side === 'home' ? 'on' : ''} onClick={() => setSide('home')}>{a.home.team.name}</button>
        <button role="tab" className={side === 'away' ? 'on' : ''} onClick={() => setSide('away')}>{a.away.team.name}</button>
      </div>

      <div className="grid3">
        <div className="stack" style={{ gap: 8 }}>
          <h3>{tr('Bramki w {n} meczach', { n: g.n })}</h3>
          <div className="small">
            {tr('Średnio')} <strong>{f1(g.avgFor)}</strong> {tr('strzelone')}, <strong>{f1(g.avgAgainst)}</strong> {tr('stracone')}, {f1(g.avgTotal)} {tr('w meczu')}
          </div>
          <div className="small muted">
            {tr('U siebie')} {f1(g.home.avgFor)}:{f1(g.home.avgAgainst)} ({g.home.n} {tr('m.')}) · {tr('Na wyjeździe')} {f1(g.away.avgFor)}:{f1(g.away.avgAgainst)} ({g.away.n} {tr('m.')})
          </div>
          <div className="small muted">{tr('1. połowa')}: {f1(g.ht.avgFor)}:{f1(g.ht.avgAgainst)}</div>
          <Spark fors={g.fors.map((v, i) => v + g.againsts[i])} />
          <span className="tiny muted">{tr('gole w meczu, od najstarszego')}</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <tbody>
              {(['0.5', '1.5', '2.5', '3.5', '4.5'] as const).map((l) => (
                <tr key={l}>
                  <td className="l">{tr('Powyżej {l}', { l })}</td>
                  <td>{g.overs[l]}/{g.n}</td>
                  <td className="muted">{pct(g.overs[l] / Math.max(1, g.n))}</td>
                </tr>
              ))}
              <tr><td className="l">{tr('Obie strzeliły')}</td><td>{g.btts}/{g.n}</td><td className="muted">{pct(g.btts / Math.max(1, g.n))}</td></tr>
              <tr><td className="l">{tr('Czyste konto')}</td><td>{g.cleanSheets}/{g.n}</td><td className="muted">{pct(g.cleanSheets / Math.max(1, g.n))}</td></tr>
              <tr><td className="l">{tr('Bez strzelonego gola')}</td><td>{g.failedToScore}/{g.n}</td><td className="muted">{pct(g.failedToScore / Math.max(1, g.n))}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th className="l">{tr('Statystyka')}</th><th>{tr('Za')}</th><th>{tr('Przeciw')}</th><th>{tr('Min–max łącznie')}</th></tr>
            </thead>
            <tbody>
              {sparkKeys.concat(['red'] as StatKey[]).filter((k) => t.stats[k].n > 0).map((k) => (
                <tr key={k}>
                  <td className="l">{tr(STAT_LABELS[k])}</td>
                  <td>{f1(t.stats[k].avgFor)}</td>
                  <td>{f1(t.stats[k].avgAgainst)}</td>
                  <td className="muted">{t.stats[k].minTotal}–{t.stats[k].maxTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 style={{ margin: '20px 0 8px' }}>{tr('Ostatnie mecze')}</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l">{tr('Data')}</th>
              <th className="l">{tr('Rozgrywki')}</th>
              <th className="l">{tr('Rywal')}</th>
              <th>{tr('Wynik')}</th>
              <th>{tr('Do przerwy')}</th>
              <th title={tr('Strzały za:przeciw')}>{tr('Strzały')}</th>
              <th title={tr('Strzały celne za:przeciw')}>{tr('Celne')}</th>
              <th title={tr('Rzuty rożne za:przeciw')}>{tr('Rożne')}</th>
              <th title={tr('Żółte kartki za:przeciw')}>{tr('Żółte')}</th>
              <th title={tr('Czerwone kartki za:przeciw')}>{tr('Czerw.')}</th>
              <th title={tr('Faule za:przeciw')}>{tr('Faule')}</th>
              <th>{tr('Posiad.')}</th>
              <th>xG</th>
            </tr>
          </thead>
          <tbody>
            {t.matches.map((m) => {
              const pair = (k: StatKey) => (m.hasStats && m.for[k] !== null ? `${m.for[k]}:${m.against[k]}` : '–');
              return (
                <tr key={m.fixtureId}>
                  <td className="l muted">{fmtDate(m.date, false, tr.locale)}</td>
                  <td className="l muted" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr(m.league)}</td>
                  <td className="l">
                    <span className="muted tiny">{m.venue === 'home' ? (tr.lang === 'es' ? 'L' : 'D') : tr.lang === 'es' ? 'V' : 'W'}</span> {m.opponent}
                  </td>
                  <td>
                    <span className={`res ${m.result}`}>{m.result === 'W' ? tr('W') : m.result === 'D' ? tr('R') : tr('P')}</span> {m.gf}:{m.ga}
                  </td>
                  <td className="muted">{m.htgf !== null ? `${m.htgf}:${m.htga}` : '–'}</td>
                  <td>{pair('shots')}</td>
                  <td>{pair('sot')}</td>
                  <td>{pair('corners')}</td>
                  <td>{pair('yellow')}</td>
                  <td>{pair('red')}</td>
                  <td>{pair('fouls')}</td>
                  <td>{m.for.poss !== null ? `${m.for.poss}%` : '–'}</td>
                  <td>{m.for.xg !== null ? `${m.for.xg.toFixed(2)}:${(m.against.xg ?? 0).toFixed(2)}` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>{tr('D = u siebie, W = na wyjeździe. Pary liczb to: drużyna : rywal.')}</p>
    </section>
  );
}

// --- Wszystkie rynki z kursem i wartością ---
function Markets({ a }: { a: MatchAnalysis }) {
  const t = useT();
  const groups = [...new Set(a.markets.map((m) => m.group))] as MarketGroup[];
  const [group, setGroup] = useState<MarketGroup>(groups[0]);
  const [odds, setOdds] = useState<Record<string, string>>({});
  const pickSet = new Set(a.picks);
  const list = a.markets.filter((m) => m.group === group);

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Wszystkie zdarzenia')}</h2>
        <span className="tiny muted">{t('Wpisz kurs bukmachera, żeby zobaczyć wartość zakładu')}</span>
      </div>
      <div className="tabs" role="tablist">
        {groups.map((g) => (
          <button key={g} role="tab" className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{t(g)}</button>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l">{t('Zdarzenie')}</th>
              <th>{t('Szansa')}</th>
              <th>{t('Kurs fair')}</th>
              <th title={t('Ile razy zdarzenie wystąpiło: {h} · {a}', { h: a.home.team.name, a: a.away.team.name })}>{t('Historia')}</th>
              <th>{t('Kurs buka')}</th>
              <th title={t('Wartość = szansa × kurs − 1. Dodatnia oznacza, że kurs jest wyższy niż wynika z modelu.')}>{t('Wartość')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const o = parseFloat((odds[m.id] ?? '').replace(',', '.'));
              const ev = Number.isFinite(o) && o > 1 ? m.p * o - 1 : null;
              return (
                <tr key={m.id} className={pickSet.has(m.id) ? 'pick' : ''}>
                  <td className="l">{t(m.label)}</td>
                  <td>
                    {pct(m.p)}
                    <span className="pbar"><i style={{ width: pct(m.p) }} /></span>
                  </td>
                  <td>{(1 / m.p).toFixed(2)}</td>
                  <td className="muted"><HitText m={m} /></td>
                  <td>
                    <input
                      id={`odds-${m.id}`}
                      className="odds"
                      inputMode="decimal"
                      placeholder={t('np. 1.85')}
                      aria-label={`${t('Kurs bukmachera')}: ${t(m.label)}`}
                      value={odds[m.id] ?? ''}
                      onChange={(e) => setOdds({ ...odds, [m.id]: e.target.value })}
                    />
                  </td>
                  <td className={ev === null ? 'muted' : ev > 0 ? 'val-pos' : 'val-neg'}>
                    {ev === null ? '–' : `${ev > 0 ? '+' : ''}${(ev * 100).toFixed(0)}%`}
                  </td>
                  <td><AddButton m={m} a={a} odds={Number.isFinite(o) && o > 1 ? o : null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {t('Podświetlone wiersze to typy z najwyższą zgodnością. Kurs fair = 1 / szansa. Liczby w kolumnie „Historia”: ile razy zdarzenie wystąpiło w meczach {h} · {a}, z perspektywy tego meczu.', { h: a.home.team.name, a: a.away.team.name })}
      </p>
    </section>
  );
}
