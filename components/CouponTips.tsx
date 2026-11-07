'use client';

import { useEffect, useState } from 'react';
import type { CouponItem } from './CouponProvider';

// Wyniki testu wstecznego (1448 typów z kursem fair ≥ 1,30, mecze 26.09–6.11.2026):
// kupony z typów z różnych meczów tego samego dnia. Zaktualizuj po kolejnych testach.
const BACKTEST = [
  { n: 1, hit: 0.745, needPerLeg: 1.53 },
  { n: 2, hit: 0.557, needPerLeg: 1.43 },
  { n: 3, hit: 0.43, needPerLeg: 1.38 },
  { n: 4, hit: 0.324, needPerLeg: 1.37 },
  { n: 5, hit: 0.248, needPerLeg: 1.36 },
  { n: 6, hit: 0.189, needPerLeg: 1.35 },
];

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const zl = (x: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(x);
const BANK_KEY = 'kuponlab-budzet';

type Tip = { level: 'bad' | 'warn' | 'info'; text: string };

export default function CouponTips({ items, tax }: { items: CouponItem[]; tax: boolean }) {
  const [bank, setBank] = useState('');
  useEffect(() => {
    try {
      setBank(localStorage.getItem(BANK_KEY) ?? '');
    } catch {}
  }, []);
  const saveBank = (v: string) => {
    setBank(v);
    try {
      localStorage.setItem(BANK_KEY, v);
    } catch {}
  };

  const N = items.length;
  if (N === 0) return null;

  const taxF = tax ? 0.88 : 1;
  const share = Math.pow(taxF, 1 / N); // podatek rozłożony po równo na zdarzenia
  const P = items.reduce((a, x) => a * x.p, 1);
  const needTotal = 1 / (P * taxF);
  const allOdds = items.every((x) => x.odds && x.odds > 1);
  const O = allOdds ? items.reduce((a, x) => a * (x.odds as number), 1) : null;
  const ev = O ? P * O * taxF - 1 : null;

  // Kelly: ułamek budżetu przy przewadze; pokazujemy 1/4, bo model może się mylić
  const b = O ? O * taxF - 1 : 0;
  const kelly = O && b > 0 ? Math.max(0, (b * P - (1 - P)) / b) : 0;
  const quarter = kelly / 4;
  const bankNum = parseFloat(bank.replace(',', '.')) || 0;
  const suggested = Math.min(bankNum * quarter, bankNum * 0.05);

  const legs = items.map((x) => {
    const min = 1 / (x.p * share);
    const state = !x.odds ? 'none' : x.odds >= min * 1.05 ? 'strong' : x.odds >= min ? 'ok' : 'low';
    return { x, min, state };
  });

  const tips: Tip[] = [];
  const now = Date.now();
  const started = items.filter((x) => new Date(x.kickoff).getTime() < now);
  if (started.length) tips.push({ level: 'bad', text: `${started.length === 1 ? 'Jeden mecz już się zaczął' : `${started.length} mecze już się zaczęły`} albo zakończył (${started.map((x) => x.match).join(', ')}). Usuń je z kuponu.` });
  const counts = new Map<number, number>();
  for (const x of items) counts.set(x.fixtureId, (counts.get(x.fixtureId) ?? 0) + 1);
  if ([...counts.values()].some((c) => c > 1))
    tips.push({ level: 'warn', text: 'Kilka zdarzeń z jednego meczu: bukmacherzy wyceniają takie połączenia z wyższą marżą, a zdarzenia są od siebie zależne. Lepiej po jednym zdarzeniu z meczu.' });
  const low = legs.filter((l) => l.state === 'low');
  if (low.length)
    tips.push({ level: 'bad', text: `Za niski kurs: ${low.map((l) => `${l.x.label} (${l.x.odds?.toFixed(2)}, potrzeba ≥ ${l.min.toFixed(2)})`).join('; ')}. Poszukaj lepszego kursu albo usuń to zdarzenie.` });
  if (N === 1) tips.push({ level: 'warn', text: 'Pojedynczy zakład: podatek 12% obciąża jedno zdarzenie, więc potrzebny jest wysoki kurs. W teście najlepiej wypadały kupony z 3 zdarzeń.' });
  if (N >= 5) tips.push({ level: 'warn', text: `${N} zdarzeń: kupon wejdzie mniej więcej raz na ${Math.max(2, Math.round(1 / P))} razy. Wymagany kurs na zdarzenie prawie już nie spada, a ryzyko długiej serii przegranych rośnie. Rozważ 3–4 zdarzenia.` });
  const safe = items.filter((x) => x.p > 0.85);
  if (safe.length)
    tips.push({ level: 'info', text: `„Pewniaki” (${safe.map((x) => x.label).join(', ')}) prawie nie podnoszą kursu, a każde zdarzenie dokłada marżę bukmachera i ryzyko niespodzianki.` });
  const risky = items.filter((x) => x.p < 0.6);
  if (risky.length) tips.push({ level: 'warn', text: `Niska szansa z modelu (< 60%): ${risky.map((x) => `${x.label} ${pct(x.p)}`).join(', ')}.` });
  const weakHist = items.filter((x) => x.hit !== null && x.hit < 0.6);
  if (weakHist.length) tips.push({ level: 'info', text: `Historia słabo potwierdza: ${weakHist.map((x) => `${x.label} (${pct(x.hit as number)})`).join(', ')}.` });
  if (!allOdds) tips.push({ level: 'info', text: 'Wpisz kursy wszystkich zdarzeń, żeby zobaczyć wartość kuponu i sugerowaną stawkę.' });

  const verdict =
    ev === null
      ? { cls: 'warn', text: `Kupon opłaca się, jeśli jego łączny kurs wyniesie co najmniej ${needTotal.toFixed(2)}.` }
      : ev > 0
        ? { cls: 'good', text: `Kupon ma dodatnią wartość: +${(ev * 100).toFixed(1)}% (po podatku). Kurs ${O!.toFixed(2)} przy potrzebnym ${needTotal.toFixed(2)}.` }
        : { cls: 'err', text: `Kupon jest na minus: ${(ev * 100).toFixed(1)}% (po podatku). Kurs ${O!.toFixed(2)}, a potrzeba co najmniej ${needTotal.toFixed(2)}. Przy tych kursach lepiej go nie grać.` };

  return (
    <section className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Podpowiedzi</h2>
        <span className="tiny muted">{tax ? 'z podatkiem 12%' : 'bez podatku'}</span>
      </div>

      <div className={verdict.cls === 'good' ? 'ok-box' : verdict.cls === 'err' ? 'err' : 'warn'}>
        <strong>{verdict.text}</strong>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l">Zdarzenie</th>
              <th>Szansa</th>
              <th title="Minimalny kurs tego zdarzenia, żeby cały kupon był na plus (podatek rozłożony na wszystkie zdarzenia)">Min. kurs</th>
              <th>Twój kurs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {legs.map(({ x, min, state }) => (
              <tr key={x.fixtureId + x.marketId}>
                <td className="l" style={{ whiteSpace: 'normal' }}>{x.label}</td>
                <td>{pct(x.p)}</td>
                <td>{min.toFixed(2)}</td>
                <td>{x.odds ? x.odds.toFixed(2) : '–'}</td>
                <td className={state === 'low' ? 'val-neg' : state === 'none' ? 'muted' : 'val-pos'}>
                  {state === 'none' ? 'wpisz kurs' : state === 'low' ? 'za nisko' : state === 'strong' ? 'dobry kurs' : 'ok'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v">{pct(P)}</div>
          <div className="l">Szansa kuponu</div>
        </div>
        <div className="kpi">
          <div className="v">{Math.round(P * 10)} z 10</div>
          <div className="l">Tyle takich kuponów wchodzi średnio</div>
        </div>
        <div className="kpi">
          <div className="v">{pct(Math.pow(1 - P, 5))}</div>
          <div className="l">Szansa na 5 przegranych z rzędu</div>
        </div>
      </div>

      <div className="row small">
        <label htmlFor="bank">Budżet na zakłady</label>
        <input id="bank" inputMode="decimal" value={bank} onChange={(e) => saveBank(e.target.value)} placeholder="np. 500" style={{ width: 100 }} />
        <span className="muted">zł</span>
        {bankNum > 0 && O ? (
          ev !== null && ev > 0 ? (
            <span>
              Sugerowana stawka: <strong>{zl(Math.max(1, suggested))}</strong>{' '}
              <span className="muted">(¼ Kelly{quarter * bankNum > bankNum * 0.05 ? ', ograniczona do 5% budżetu' : ''})</span>
            </span>
          ) : (
            <span className="val-neg">Przy ujemnej wartości sugerowana stawka to 0 zł.</span>
          )
        ) : (
          <span className="muted">Podaj budżet i kursy, a policzę rozsądną stawkę.</span>
        )}
      </div>

      {tips.length > 0 && (
        <ul className="tips">
          {tips.map((t, i) => (
            <li key={i} className={t.level}>{t.text}</li>
          ))}
        </ul>
      )}

      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>Ile zdarzeń dawać? Wyniki testu na 1448 typach</summary>
        <div className="tbl-wrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="l">Zdarzeń</th>
                <th>Weszło</th>
                <th title="Średni minimalny kurs bukmachera na zdarzenie, żeby wyjść na plus z podatkiem">Kurs na zdarzenie na plus</th>
              </tr>
            </thead>
            <tbody>
              {BACKTEST.map((r) => (
                <tr key={r.n} className={r.n === Math.min(6, N) ? 'pick' : ''}>
                  <td className="l">{r.n}{r.n === 3 ? ' (polecane)' : ''}</td>
                  <td>{pct(r.hit)}</td>
                  <td>{r.needPerLeg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Typy z kursem fair ≥ 1,30 z różnych meczów, mecze 26.09–6.11.2026. Im więcej zdarzeń, tym lepiej rozkłada się podatek, ale kupon
          wchodzi rzadziej. Powyżej 4 zdarzeń zysk na podatku jest już minimalny. Aktualną skuteczność typów sprawdzisz w zakładce
          Skuteczność.
        </p>
      </details>

      <p className="tiny muted" style={{ margin: 0 }}>
        Szanse pochodzą z modelu, który nie zna składów ani kontuzji. Graj stałymi, małymi stawkami i tylko za pieniądze, które możesz stracić.
      </p>
    </section>
  );
}
