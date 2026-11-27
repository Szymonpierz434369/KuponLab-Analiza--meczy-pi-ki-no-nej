'use client';

import { useEffect, useState } from 'react';
import AiChat from '@/components/AiChat';
import CouponTips from '@/components/CouponTips';
import { useCoupon } from '@/components/CouponProvider';
import { couponLinks } from '@/lib/correlation';
import { useT } from '@/components/LangProvider';

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const zl = (x: number, locale = 'pl-PL') => new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(x);

// Polskie zasady: 12% podatku od stawki, 10% od wygranej powyżej 2280 zł
const TAX_STAKE = 0.12;
const TAX_WIN = 0.1;
const TAX_WIN_THRESHOLD = 2280;

export default function CouponPage() {
  const { items, remove, setOdds, clear } = useCoupon();
  const t = useT();
  const z = (x: number) => zl(x, t.locale);
  const [stake, setStake] = useState('10');
  const [tax, setTax] = useState(true);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // zapamiętujemy, czy liczyć z podatkiem (np. bez podatku w promocji Betclic)
  useEffect(() => {
    try {
      const v = localStorage.getItem('kuponlab-podatek');
      if (v !== null) setTax(v === '1');
    } catch {}
  }, []);
  const changeTax = (v: boolean) => {
    setTax(v);
    try {
      localStorage.setItem('kuponlab-podatek', v ? '1' : '0');
    } catch {}
  };

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses ?? []))
      .catch(() => setAnalyses([]));
  }, []);

  // zdarzenia z jednego meczu bywają powiązane – wtedy szansa kuponu to nie zwykły iloczyn
  const links = couponLinks(items);
  const pProduct = items.reduce((acc, x) => acc * x.p, 1);
  const pAll = items.length ? Math.min(pProduct * links.factor, Math.min(...items.map((x) => x.p))) : 1;
  const linked = Math.abs(links.factor - 1) >= 0.03;
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
        <h1 style={{ fontSize: '1.5rem' }}>{t('Kupon')}</h1>
        {items.length > 0 && (
          <button className="btn small" onClick={clear}>{t('Wyczyść kupon')}</button>
        )}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head">
            <h2>{t('Zdarzenia ({n})', { n: items.length })}</h2>
            <span className="tiny muted">{t('wpisz kursy od bukmachera')}</span>
          </div>
          {items.length === 0 ? (
            <p className="muted small">
              {t('Kupon jest pusty.')} <a href="/">{t('Otwórz mecz')}</a> {t('i dodaj zdarzenia przyciskiem „+ Kupon”. Możesz też poprosić asystenta obok, żeby zaproponował kupon z meczów, które już przeanalizowałeś.')}
            </p>
          ) : (
            items.map((x) => (
              <div className="sel" key={x.fixtureId + x.marketId}>
                <div style={{ minWidth: 0 }}>
                  <a href={`/mecz/${x.fixtureId}`} className="small muted">{x.match}</a>
                  <div><strong>{t(x.label)}</strong></div>
                  <div className="tiny muted">
                    {t('szansa')} {pct(x.p)} · {t('kurs fair')} {(1 / x.p).toFixed(2)}
                    {x.hit !== null ? ` · ${t('historia')} ${pct(x.hit)}` : ''}
                  </div>
                </div>
                <input
                  id={`kupon-odds-${x.fixtureId}-${x.marketId}`}
                  className="odds"
                  inputMode="decimal"
                  placeholder={t('kurs')}
                  aria-label={`${t('Kurs')}: ${t(x.label)}`}
                  defaultValue={x.odds ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'));
                    setOdds(x.fixtureId, x.marketId, Number.isFinite(v) && v > 1 ? v : null);
                  }}
                />
                <span className={`small ${x.odds ? (x.p * x.odds > 1 ? 'val-pos' : 'val-neg') : 'muted'}`} style={{ minWidth: 48, textAlign: 'right' }}>
                  {x.odds ? `${x.p * x.odds - 1 > 0 ? '+' : ''}${((x.p * x.odds - 1) * 100).toFixed(0)}%` : '–'}
                </span>
                <button className="btn small" onClick={() => remove(x.fixtureId, x.marketId)} aria-label={t('Usuń z kuponu')}>✕</button>
              </div>
            ))
          )}
        </section>

        <section className="card stack">
          <h2>{t('Podsumowanie')}</h2>
          <div className="kpis">
            <div className="kpi"><div className="v">{items.length ? pct(pAll) : '–'}</div><div className="l">{t('Szansa na wejście')}</div></div>
            <div className="kpi"><div className="v">{items.length ? (1 / pAll).toFixed(2) : '–'}</div><div className="l">{t('Kurs fair')}</div></div>
            <div className="kpi"><div className="v">{totalOdds ? totalOdds.toFixed(2) : '–'}</div><div className="l">{t('Kurs kuponu')}</div></div>
            <div className="kpi">
              <div className={`v ${ev === null ? '' : ev > 0 ? 'val-pos' : 'val-neg'}`}>{ev === null ? '–' : `${ev > 0 ? '+' : ''}${(ev * 100).toFixed(0)}%`}</div>
              <div className="l">{t('Wartość')}</div>
            </div>
          </div>
          <div className="row">
            <label htmlFor="stake" className="small">{t('Stawka')}</label>
            <input id="stake" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} style={{ width: 90 }} />
            <span className="small muted">zł</span>
            <label className="small row" style={{ gap: 6 }}>
              <input id="tax" type="checkbox" checked={tax} onChange={(e) => changeTax(e.target.checked)} /> {t('podatek PL')}
            </label>
          </div>
          {totalOdds ? (
            <div className="small">
              {t('Możliwa wypłata:')} <strong>{z(payout)}</strong>
              {tax && <span className="muted"> ({t('stawka po podatku 12%:')} {z(effStake)}{winTax > 0 ? `, ${t('podatek od wygranej')} ${z(winTax)}` : ''})</span>}
            </div>
          ) : (
            items.length > 0 && <div className="small muted">{t('Wpisz kursy wszystkich zdarzeń, żeby policzyć wypłatę i wartość kuponu.')}</div>
          )}
          {items.length > 0 && (
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={!totalOdds || !(s > 0)}
                onClick={async () => {
                  setSaveMsg(null);
                  const res = await fetch('/api/dziennik', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      stake: s,
                      tax,
                      items: items.map((x) => ({ fixtureId: x.fixtureId, match: x.match, kickoff: x.kickoff, marketId: x.marketId, label: x.label, p: x.p, odds: x.odds })),
                    }),
                  }).then((r) => r.json()).catch((e) => ({ error: e.message }));
                  setSaveMsg(res.error ? t(res.error) : 'OK');
                }}
              >
                {t('Zapisz do dziennika')}
              </button>
              {saveMsg ? (
                <span className="small">
                  {saveMsg === 'OK' ? t('Zapisano w dzienniku.') : saveMsg} {saveMsg === 'OK' && <a href="/dziennik">{t('Otwórz dziennik')}</a>}
                </span>
              ) : (
                !totalOdds && <span className="small muted">{t('Wpisz kursy wszystkich zdarzeń, żeby zapisać kupon.')}</span>
              )}
            </div>
          )}
          {items.length > 0 && (
            <div className="stack small" style={{ gap: 6 }}>
              {sameMatch && (
                <div className="warn">
                  {linked
                    ? t('Na kuponie są co najmniej dwa zdarzenia z jednego meczu. Są od siebie zależne: szansa uwzględnia to, jak często takie zdarzenia wchodziły razem (zwykły iloczyn: {p}).', { p: pct(pProduct) })
                    : t('Na kuponie są co najmniej dwa zdarzenia z jednego meczu. Są od siebie zależne, więc łączna szansa może się różnić od wyliczonej.')}
                </div>
              )}
              {items.length >= 5 && (
                <div className="warn">
                  {t('{n} zdarzeń: nawet przy wysokich szansach pojedynczych typów łączna szansa szybko spada. Rozważ krótszy kupon.', { n: items.length })}
                </div>
              )}
              {weakest && <div className="muted">{t('Najsłabsze ogniwo:')} {t(weakest.label)} ({pct(weakest.p)}).</div>}
            </div>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>
            {t('Szansa kuponu to iloczyn szans zdarzeń (dla zdarzeń z jednego meczu poprawiony o ich powiązanie). Wartość dodatnia oznacza, że kurs jest wyższy niż wynika z modelu.')}
          </p>
        </section>
      </div>

      <CouponTips items={items} tax={tax} />

      <section className="card">
        <div className="card-head">
          <h2>{t('Asystent kuponu')}</h2>
          <span className="tiny muted">{t('przeanalizowane nadchodzące mecze: {n}', { n: analyses.length })}</span>
        </div>
        <AiChat
          mode="coupon"
          context={() => ({ kupon: items, przeanalizowane_mecze: analyses })}
          intro={t('Asystent widzi Twój kupon i wszystkie mecze, które otworzyłeś w aplikacji (nadchodzące). Im więcej meczów przeanalizujesz, tym więcej ma z czego wybierać.')}
          suggestions={[t('Oceń mój kupon'), t('Zbuduj bezpieczny kupon na kurs około 3'), t('Zbuduj kupon z rożnych i kartek'), t('Które zdarzenie usunąć z kuponu?')]}
        />
      </section>
    </div>
  );
}
