'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BacktestPick, BacktestRow } from '@/lib/backtest';

type Load =
  | { kind: 'loading'; done: number; total: number; step: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: BacktestRow[] };

interface Flat extends BacktestPick {
  fixtureId: number;
  date: string;
  league: string;
  match: string;
  score: string;
}

const TAX = 0.88;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' }).format(new Date(iso));

function stats(list: Flat[]) {
  const n = list.length;
  const h = list.filter((x) => x.hit).length;
  const exp = n ? list.reduce((a, x) => a + x.p, 0) / n : 0;
  const fair = n ? list.reduce((a, x) => a + x.fair, 0) / n : 0;
  const roi = n ? list.reduce((a, x) => a + (x.hit ? x.fair : 0), 0) / n - 1 : 0;
  return { n, h, rate: n ? h / n : 0, exp, fair, roi };
}

function groupBy(list: Flat[], key: (x: Flat) => string) {
  const m = new Map<string, Flat[]>();
  for (const x of list) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m.entries()].map(([k, v]) => ({ k, ...stats(v) })).sort((a, b) => b.n - a.n);
}

export default function SkutecznoscPage() {
  const [days, setDays] = useState(21);
  const [minFair, setMinFair] = useState(1.3);
  const [group, setGroup] = useState('Wszystkie');
  const [load, setLoad] = useState<Load>({ kind: 'loading', done: 0, total: 1, step: 'Łączę się' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading', done: 0, total: 1, step: 'Łączę się' });
    (async () => {
      try {
        const res = await fetch(`/api/skutecznosc?days=${days}`, { cache: 'no-store' });
        const reader = res.body!.getReader();
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
            if (msg.type === 'progress') setLoad({ kind: 'loading', done: msg.done, total: Math.max(1, msg.total), step: msg.step });
            if (msg.type === 'result') setLoad({ kind: 'ready', rows: msg.rows });
            if (msg.type === 'error') setLoad({ kind: 'error', message: msg.message });
          }
        }
      } catch (e) {
        if (!cancelled) setLoad({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, reload]);

  const all: Flat[] = useMemo(() => {
    if (load.kind !== 'ready') return [];
    return load.rows.flatMap((r) =>
      r.picks.map((p) => ({ ...p, fixtureId: r.fixtureId, date: r.date, league: r.leagueName, match: `${r.home} – ${r.away}`, score: r.score })),
    );
  }, [load]);

  const groups = useMemo(() => ['Wszystkie', ...new Set(all.map((x) => x.group))], [all]);
  const list = all.filter((x) => x.fair >= minFair && (group === 'Wszystkie' || x.group === group));
  const s = stats(list);
  const needOdds = s.rate > 0 ? 1 / (s.rate * TAX) : null;
  const matches = load.kind === 'ready' ? load.rows.length : 0;
  const bucket = (x: Flat) => (x.p < 0.65 ? '60–65%' : x.p < 0.7 ? '65–70%' : x.p < 0.75 ? '70–75%' : x.p < 0.8 ? '75–80%' : x.p < 0.85 ? '80–85%' : '85%+');

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: '1.5rem' }}>Skuteczność typów</h1>
        <p className="muted small" style={{ margin: '4px 0 0', maxWidth: 760 }}>
          Dla każdego rozegranego meczu z wybranych lig aplikacja liczy „Typy z najwyższą zgodnością” tak, jak pokazałaby je przed
          meczem (tylko na danych sprzed spotkania), i sprawdza, czy weszły.
        </p>
      </div>

      <div className="row">
        <label className="small row" style={{ gap: 6 }}>
          Okres
          <select id="bt-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 21, 30].map((d) => (
              <option key={d} value={d}>ostatnie {d} dni</option>
            ))}
          </select>
        </label>
        <label className="small row" style={{ gap: 6 }}>
          Kurs fair od
          <select id="bt-fair" value={minFair} onChange={(e) => setMinFair(Number(e.target.value))}>
            {[1.0, 1.2, 1.3, 1.4, 1.5].map((f) => (
              <option key={f} value={f}>{f === 1 ? 'wszystkie' : f.toFixed(2)}</option>
            ))}
          </select>
        </label>
        <label className="small row" style={{ gap: 6 }}>
          Rodzaj
          <select id="bt-group" value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <button className="btn small" onClick={() => setReload((x) => x + 1)} disabled={load.kind === 'loading'}>
          Odśwież
        </button>
      </div>

      {load.kind === 'loading' && (
        <div className="card stack">
          <div className="progress">
            <i style={{ width: `${Math.max(4, (load.done / load.total) * 100)}%` }} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {load.step} ({load.done}/{load.total}). Pierwsze przeliczenie kilku tygodni trwa 2–5 minut. Wyniki zapisują się, więc
            następnym razem liczone są tylko nowe mecze.
          </p>
        </div>
      )}
      {load.kind === 'error' && (
        <div className="err">
          <strong>Błąd.</strong> {load.message}
        </div>
      )}

      {load.kind === 'ready' && (
        <>
          <section className="card stack">
            <div className="kpis">
              <div className="kpi">
                <div className="v" style={{ color: 'var(--accent)' }}>{s.n ? pct(s.rate) : '–'}</div>
                <div className="l">Weszło ({s.h} z {s.n})</div>
              </div>
              <div className="kpi">
                <div className="v">{s.n ? pct(s.exp) : '–'}</div>
                <div className="l">Model zakładał</div>
              </div>
              <div className="kpi">
                <div className="v">{s.n ? s.fair.toFixed(2) : '–'}</div>
                <div className="l">Średni kurs fair</div>
              </div>
              <div className="kpi">
                <div className={`v ${s.roi >= 0 ? 'val-pos' : 'val-neg'}`}>{s.n ? `${s.roi >= 0 ? '+' : ''}${(s.roi * 100).toFixed(1)}%` : '–'}</div>
                <div className="l">Wynik po kursie fair</div>
              </div>
              <div className="kpi">
                <div className="v">{needOdds ? needOdds.toFixed(2) : '–'}</div>
                <div className="l">Kurs na plus (z podatkiem)</div>
              </div>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              {matches} meczów, {s.n} typów po filtrach. „Kurs na plus” to minimalny średni kurs bukmachera, przy którym przy tej
              skuteczności i podatku 12% wychodzisz na plus. Przy kilkuset typach wynik może się wahać o ok. ±3 punkty procentowe.
            </p>
          </section>

          <div className="grid2" style={{ alignItems: 'start' }}>
            <Table title="Według rodzaju" rows={groupBy(list, (x) => x.group)} />
            <Table title="Według szansy z modelu" rows={groupBy(list, bucket).sort((a, b) => a.k.localeCompare(b.k))} note="Kalibracja: w dobrze ustawionym modelu „weszło” jest blisko „model”." />
          </div>
          <Table title="Według typu" rows={groupBy(list, (x) => x.type.replace(/\d+\.5/, 'X.5'))} />
          <Table title="Według ligi" rows={groupBy(list, (x) => x.league)} />

          <section className="card">
            <div className="card-head">
              <h2>Ostatnie typy</h2>
              <span className="tiny muted">{Math.min(80, list.length)} z {list.length}</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="l">Data</th>
                    <th className="l">Mecz</th>
                    <th>Wynik</th>
                    <th className="l">Typ</th>
                    <th>Szansa</th>
                    <th>Kurs fair</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 80).map((x) => (
                    <tr key={`${x.fixtureId}-${x.id}`}>
                      <td className="l muted">{fmtDate(x.date)}</td>
                      <td className="l">{x.match}</td>
                      <td>{x.score}</td>
                      <td className="l">{x.label}</td>
                      <td>{pct(x.p)}</td>
                      <td>{x.fair.toFixed(2)}</td>
                      <td>
                        <span className={`res ${x.hit ? 'W' : 'L'}`}>{x.hit ? '✓' : '✗'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Table({ title, rows, note }: { title: string; rows: ({ k: string } & ReturnType<typeof stats>)[]; note?: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l" />
              <th>Typów</th>
              <th>Weszło</th>
              <th>Model</th>
              <th>Różnica</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.rate - r.exp;
              return (
                <tr key={r.k}>
                  <td className="l">{r.k}</td>
                  <td>{r.n}</td>
                  <td style={{ fontWeight: 700 }}>
                    {pct(r.rate)}
                    <span className="pbar"><i style={{ width: pct(r.rate) }} /></span>
                  </td>
                  <td className="muted">{pct(r.exp)}</td>
                  <td className={r.n < 30 ? 'muted' : diff >= 0 ? 'val-pos' : 'val-neg'}>
                    {diff >= 0 ? '+' : ''}
                    {(diff * 100).toFixed(1)} pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        {note ? `${note} ` : ''}Przy mniej niż 30 typach różnica jest szara: to za mało, żeby wyciągać wnioski.
      </p>
    </section>
  );
}
