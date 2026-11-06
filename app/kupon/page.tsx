'use client';

import { useEffect, useState } from 'react';
import AiChat from '@/components/AiChat';
import { useCoupon } from '@/components/CouponProvider';

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const zl = (x: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(x);

// Polskie zasady: 12% podatku od stawki, 10% od wygranej powyżej 2280 zł
const TAX_STAKE = 0.12;
const TAX_WIN = 0.1;
const TAX_WIN_THRESHOLD = 2280;

export default function CouponPage() {
  const { items, remove, setOdds, clear } = useCoupon();
  const [stake, setStake] = useState('10');
  const [tax, setTax] = useState(true);
  const [analyses, setAnalyses] = useState<unknown[]>([]);

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses ?? []))
      .catch(() => setAnalyses([]));
  }, []);

  const pAll = items.reduce((acc, x) => acc * x.p, 1);
  const allOdds = items.length > 0 && items.every((x) => x.odds && x.odds > 1);
  const totalOdds = allOdds ? items.reduce((acc, x) => acc * (x.odds as number), 1) : null;
  const ev = totalOdds ? pAll * totalOdds - 1 : null;
  const s = parseFloat(stake.replace(',', '.')) || 0;
  const effStake = tax ? s * (1 - TAX_STAKE) : s;
  const gross = totalOdds ? effStake * totalOdds : 0;
  const winTax = tax && gross > TAX_WIN_THRESHOLD ? gross * TAX_WIN : 0;
  const payout = gross - winTax;

  const matchCount = new Map<number, number>();
  for (const x of items) matchCount.set(x.fixtureId, (matchCount.get(x.fixtureId) ?? 0) + 1);
  const sameMatch = [...matchCount.values()].some((c) => c > 1);
  const weakest = items.length > 1 ? items.reduce((w, x) => (x.p < w.p ? x : w), items[0]) : null;

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ fontSize: '1.5rem' }}>Kupon</h1>
        {items.length > 0 && (
          <button className="btn small" onClick={clear}>Wyczyść kupon</button>
        )}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h2>Zdarzenia ({items.length})</h2>
            <span className="tiny muted">wpisz kursy od bukmachera</span>
          </div>
          {items.length === 0 ? (
            <p className="muted small">
              Kupon jest pusty. Otwórz <a href="/">mecz</a> i dodaj zdarzenia przyciskiem „+ Kupon”. Możesz też poprosić asystenta
              obok, żeby zaproponował kupon z meczów, które już przeanalizowałeś.
            </p>
          ) : (
            items.map((x) => (
              <div className="sel" key={x.fixtureId + x.marketId}>
                <div style={{ minWidth: 0 }}>
                  <a href={`/mecz/${x.fixtureId}`} className="small muted">{x.match}</a>
                  <div><strong>{x.label}</strong></div>
                  <div className="tiny muted">
                    szansa {pct(x.p)} · kurs fair {(1 / x.p).toFixed(2)}
                    {x.hit !== null ? ` · historia ${pct(x.hit)}` : ''}
                  </div>
                </div>
                <input
                  id={`kupon-odds-${x.fixtureId}-${x.marketId}`}
                  className="odds"
                  inputMode="decimal"
                  placeholder="kurs"
                  aria-label={`Kurs: ${x.label}`}
                  defaultValue={x.odds ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'));
                    setOdds(x.fixtureId, x.marketId, Number.isFinite(v) && v > 1 ? v : null);
                  }}
                />
                <span className={`small ${x.odds ? (x.p * x.odds > 1 ? 'val-pos' : 'val-neg') : 'muted'}`} style={{ minWidth: 48, textAlign: 'right' }}>
                  {x.odds ? `${x.p * x.odds - 1 > 0 ? '+' : ''}${((x.p * x.odds - 1) * 100).toFixed(0)}%` : '–'}
                </span>
                <button className="btn small" onClick={() => remove(x.fixtureId, x.marketId)} aria-label="Usuń z kuponu">✕</button>
              </div>
            ))
          )}
        </section>

        <section className="card stack">
          <h2>Podsumowanie</h2>
          <div className="kpis">
            <div className="kpi"><div className="v">{items.length ? pct(pAll) : '–'}</div><div className="l">Szansa na wejście</div></div>
            <div className="kpi"><div className="v">{items.length ? (1 / pAll).toFixed(2) : '–'}</div><div className="l">Kurs fair</div></div>
            <div className="kpi"><div className="v">{totalOdds ? totalOdds.toFixed(2) : '–'}</div><div className="l">Kurs kuponu</div></div>
            <div className="kpi">
              <div className={`v ${ev === null ? '' : ev > 0 ? 'val-pos' : 'val-neg'}`}>{ev === null ? '–' : `${ev > 0 ? '+' : ''}${(ev * 100).toFixed(0)}%`}</div>
              <div className="l">Wartość</div>
            </div>
          </div>
          <div className="row">
            <label htmlFor="stake" className="small">Stawka</label>
            <input id="stake" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} style={{ width: 90 }} />
            <span className="small muted">zł</span>
            <label className="small row" style={{ gap: 6 }}>
              <input id="tax" type="checkbox" checked={tax} onChange={(e) => setTax(e.target.checked)} /> podatek PL
            </label>
          </div>
          {totalOdds ? (
            <div className="small">
              Możliwa wypłata: <strong>{zl(payout)}</strong>
              {tax && <span className="muted"> (stawka po podatku 12%: {zl(effStake)}{winTax > 0 ? `, podatek od wygranej ${zl(winTax)}` : ''})</span>}
            </div>
          ) : (
            items.length > 0 && <div className="small muted">Wpisz kursy wszystkich zdarzeń, żeby policzyć wypłatę i wartość kuponu.</div>
          )}
          {items.length > 0 && (
            <div className="stack small" style={{ gap: 6 }}>
              {sameMatch && (
                <div className="warn">
                  Na kuponie są co najmniej dwa zdarzenia z jednego meczu. Są od siebie zależne, więc łączna szansa może się różnić od
                  wyliczonej.
                </div>
              )}
              {items.length >= 5 && (
                <div className="warn">
                  {items.length} zdarzeń: nawet przy wysokich szansach pojedynczych typów łączna szansa szybko spada. Rozważ krótszy kupon.
                </div>
              )}
              {weakest && <div className="muted">Najsłabsze ogniwo: {weakest.label} ({pct(weakest.p)}).</div>}
            </div>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>
            Szansa kuponu to iloczyn szans zdarzeń. Wartość dodatnia oznacza, że kurs jest wyższy niż wynika z modelu.
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Asystent kuponu</h2>
          <span className="tiny muted">przeanalizowane nadchodzące mecze: {analyses.length}</span>
        </div>
        <AiChat
          mode="coupon"
          context={() => ({ kupon: items, przeanalizowane_mecze: analyses })}
          intro="Asystent widzi Twój kupon i wszystkie mecze, które otworzyłeś w aplikacji (nadchodzące). Im więcej meczów przeanalizujesz, tym więcej ma z czego wybierać."
          suggestions={[
            'Oceń mój kupon',
            'Zbuduj bezpieczny kupon na kurs około 3',
            'Zbuduj kupon z rożnych i kartek',
            'Które zdarzenie usunąć z kuponu?',
          ]}
        />
      </section>
    </div>
  );
}
