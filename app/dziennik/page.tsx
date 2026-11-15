'use client';

import { Fragment, useEffect, useState } from 'react';
import type { JournalEntry, ItemStatus } from '@/lib/journal';

const zl = (x: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(x);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (iso: string) =>
  new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
const LABEL: Record<ItemStatus, string> = { won: 'wygrany', lost: 'przegrany', pending: 'w toku', void: 'zwrot' };
const CLS: Record<ItemStatus, string> = { won: 'W', lost: 'L', pending: 'D', void: 'D' };

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = () => {
    setError(null);
    fetch('/api/dziennik', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setEntries(d.entries)))
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const remove = async (id: number) => {
    await fetch(`/api/dziennik?id=${id}`, { method: 'DELETE' });
    setConfirmId(null);
    load();
  };

  const settled = (entries ?? []).filter((e) => e.status !== 'pending');
  const staked = settled.reduce((a, e) => a + e.stake, 0);
  const paid = settled.reduce((a, e) => a + e.payout, 0);
  const wins = settled.filter((e) => e.status === 'won').length;
  const legs = settled.flatMap((e) => e.items).filter((i) => i.status === 'won' || i.status === 'lost');
  const legHit = legs.length ? legs.filter((i) => i.status === 'won').length / legs.length : 0;
  const legModel = legs.length ? legs.reduce((a, i) => a + i.p, 0) / legs.length : 0;
  const expWins = settled.filter((e) => e.status !== 'void').reduce((a, e) => a + e.items.reduce((x, i) => x * (i.status === 'void' ? 1 : i.p), 1), 0);
  const pending = (entries ?? []).filter((e) => e.status === 'pending');

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: '1.5rem' }}>Dziennik kuponów</h1>
        <p className="muted small" style={{ margin: '4px 0 0', maxWidth: 760 }}>
          Kupony zapisane ze strony Kupon, z kursami, które naprawdę dostałeś. Po meczach aplikacja sama je rozlicza na podstawie
          wyników i statystyk z ESPN.
        </p>
      </div>

      {error && <div className="err">{error}</div>}
      {!entries && !error && <div className="card muted small">Wczytuję i rozliczam kupony…</div>}

      {entries && entries.length === 0 && (
        <div className="card muted small">
          Dziennik jest pusty. Na stronie <a href="/kupon">Kupon</a> wpisz kursy i stawkę, a potem kliknij „Zapisz do dziennika”.
        </div>
      )}

      {entries && entries.length > 0 && (
        <>
          <section className="card stack">
            <div className="kpis">
              <div className="kpi">
                <div className={`v ${paid - staked >= 0 ? 'val-pos' : 'val-neg'}`}>{zl(paid - staked)}</div>
                <div className="l">Wynik (rozliczone)</div>
              </div>
              <div className="kpi">
                <div className="v">{staked ? `${(((paid - staked) / staked) * 100).toFixed(1)}%` : '–'}</div>
                <div className="l">Zwrot z postawionych</div>
              </div>
              <div className="kpi">
                <div className="v">
                  {wins} z {settled.length}
                </div>
                <div className="l">Wygrane kupony (model: {expWins.toFixed(1)})</div>
              </div>
              <div className="kpi">
                <div className="v">{legs.length ? pct(legHit) : '–'}</div>
                <div className="l">Trafione zdarzenia (model {legs.length ? pct(legModel) : '–'})</div>
              </div>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Postawione {zl(staked)}, wypłaty {zl(paid)}. W toku: {pending.length}{' '}
              {pending.length === 1 ? 'kupon' : 'kupony'} za {zl(pending.reduce((a, e) => a + e.stake, 0))}. Gdy zdarzenia wchodzą
              częściej niż zakłada model, a wynik jest na plus, model i Twój wybór kursów działają. Wnioski wyciągaj po 30–50 kuponach.
            </p>
          </section>

          <section className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="l">Data</th>
                    <th className="l">Zdarzenia</th>
                    <th>Kurs</th>
                    <th>Stawka</th>
                    <th>Wypłata</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <Fragment key={e.id}>
                      <tr>
                        <td className="l muted">{fmt(e.createdAt)}</td>
                        <td className="l">
                          <button type="button" className="btn small" onClick={() => setOpen(open === e.id ? null : e.id)}>
                            {e.items.length} {e.items.length === 1 ? 'zdarzenie' : 'zdarzenia'} {open === e.id ? '▴' : '▾'}
                          </button>
                        </td>
                        <td>{e.odds.toFixed(2)}</td>
                        <td>{zl(e.stake)}</td>
                        <td className={e.status === 'won' ? 'val-pos' : e.status === 'lost' ? 'val-neg' : 'muted'}>
                          {e.status === 'pending' ? '–' : zl(e.payout)}
                        </td>
                        <td>
                          <span className={`res ${CLS[e.status]}`} style={{ width: 'auto', padding: '0 6px' }}>
                            {LABEL[e.status]}
                          </span>
                        </td>
                        <td>
                          {confirmId === e.id ? (
                            <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                              <button type="button" className="btn small" onClick={() => remove(e.id)}>
                                Usuń
                              </button>
                              <button type="button" className="btn small" onClick={() => setConfirmId(null)}>
                                Anuluj
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="btn small" onClick={() => setConfirmId(e.id)} aria-label="Usuń kupon">
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                      {open === e.id &&
                        e.items.map((i) => (
                          <tr key={`${e.id}-${i.fixtureId}-${i.marketId}`} className="muted">
                            <td />
                            <td className="l" style={{ whiteSpace: 'normal' }}>
                              {i.match}
                              {i.score ? ` (${i.score})` : ''}: <strong style={{ color: 'var(--fg)' }}>{i.label}</strong>
                            </td>
                            <td>{i.odds.toFixed(2)}</td>
                            <td>{pct(i.p)}</td>
                            <td />
                            <td>{LABEL[i.status]}</td>
                            <td />
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              {entries.some((e) => e.tax) ? 'Kupony z podatkiem: wypłata po 12% od stawki i 10% od wygranej powyżej 2280 zł. ' : ''}
              Zdarzenia rozliczane są po wyniku po 90 minutach z doliczonym czasem.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
