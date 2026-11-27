'use client';

import { useEffect, useState } from 'react';
import type { LegStats } from '@/lib/backtest';
import { couponLinks } from '@/lib/correlation';
import type { CouponItem } from './CouponProvider';
import { useT } from './LangProvider';

// Zapasowa trafność pojedynczego typu (kurs fair ≥ 1,25), gdy zakładka Skuteczność nie była jeszcze
// przeliczona dla tej wersji modelu. Wartość z testu wstecznego – zob. README.
const FALLBACK_HIT = 0.803;
/** minimalny średni kurs na zdarzenie, żeby kupon z n zdarzeń był na plus */
const needPerLeg = (hit: number, n: number, taxF: number) => Math.pow(1 / (hit * taxF), 1 / n);

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const zl = (x: number, locale = 'pl-PL') => new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(x);
const BANK_KEY = 'kuponlab-budzet';

type Tip = { level: 'bad' | 'warn' | 'info'; text: string };

export default function CouponTips({ items, tax }: { items: CouponItem[]; tax: boolean }) {
  const t = useT();
  const [bank, setBank] = useState('');
  const [legStats, setLegStats] = useState<LegStats | null>(null);
  useEffect(() => {
    try {
      setBank(localStorage.getItem(BANK_KEY) ?? '');
    } catch {}
    fetch('/api/skutecznosc/podsumowanie', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setLegStats(d.stats ?? null))
      .catch(() => {});
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
  // zdarzenia z jednego meczu bywają powiązane: wtedy szansa kuponu to nie zwykły iloczyn
  const links = couponLinks(items);
  const P0 = items.reduce((a, x) => a * x.p, 1);
  const P = Math.min(P0 * links.factor, Math.min(...items.map((x) => x.p)));
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
  if (started.length)
    tips.push({
      level: 'bad',
      text: t(started.length === 1 ? 'Jeden mecz już się zaczął albo zakończył ({list}). Usuń go z kuponu.' : '{n} mecze już się zaczęły albo zakończyły ({list}). Usuń je z kuponu.', { n: started.length, list: started.map((x) => x.match).join(', ') }),
    });
  const counts = new Map<number, number>();
  for (const x of items) counts.set(x.fixtureId, (counts.get(x.fixtureId) ?? 0) + 1);
  if ([...counts.values()].some((c) => c > 1))
    tips.push({ level: 'warn', text: t('Kilka zdarzeń z jednego meczu: bukmacherzy wyceniają takie połączenia z wyższą marżą, a zdarzenia są od siebie zależne. Lepiej po jednym zdarzeniu z meczu.') });
  for (const l of links.pairs) {
    const more = l.lift > 1;
    tips.push({
      level: more ? 'info' : 'warn',
      text: t(
        more
          ? '{a} i {b} z jednego meczu wchodzą razem o {n}% częściej, niż wynika z mnożenia szans. Bukmacher zwykle to wie i w kreatorze zakładów obniża za to kurs.'
          : '{a} i {b} z jednego meczu wchodzą razem o {n}% rzadziej, niż wynika z mnożenia szans. Te zdarzenia sobie przeszkadzają.',
        { a: t(l.a), b: t(l.b), n: Math.abs(Math.round((l.lift - 1) * 100)) },
      ),
    });
  }
  if (Math.abs(links.factor - 1) >= 0.03)
    tips.push({ level: 'info', text: t('Szansa kuponu z uwzględnieniem powiązań: {p} (zwykły iloczyn szans: {p0}).', { p: pct(P), p0: pct(P0) }) });
  const low = legs.filter((l) => l.state === 'low');
  if (low.length)
    tips.push({
      level: 'bad',
      text: t('Za niski kurs: {list}. Poszukaj lepszego kursu albo usuń to zdarzenie.', {
        list: low.map((l) => `${t(l.x.label)} (${l.x.odds?.toFixed(2)}, ${t('potrzeba')} ≥ ${l.min.toFixed(2)})`).join('; '),
      }),
    });
  if (tax && N === 1) tips.push({ level: 'warn', text: t('Pojedynczy zakład z podatkiem: 12% obciąża jedno zdarzenie, więc potrzebny jest wysoki kurs. Z podatkiem najlepiej wypadały kupony z 3 zdarzeń.') });
  if (!tax && N >= 3) tips.push({ level: 'info', text: t('Bez podatku dłuższy kupon nie obniża progu opłacalności, a każde zdarzenie dokłada marżę bukmachera i ryzyko. Rozważ 1–2 zdarzenia. Przy grze bez podatku w Betclic, po przekroczeniu 1000 zł stawek, trzymaj się kuponów z min. 2 zdarzeniami po kursie ≥ 1,20.') });
  if (tax && N >= 5) tips.push({ level: 'warn', text: t('{n} zdarzeń: kupon wejdzie mniej więcej raz na {k} razy. Wymagany kurs na zdarzenie prawie już nie spada, a ryzyko długiej serii przegranych rośnie. Rozważ 3–4 zdarzenia.', { n: N, k: Math.max(2, Math.round(1 / P)) }) });
  if (!tax && N >= 5) tips.push({ level: 'warn', text: t('{n} zdarzeń: kupon wejdzie mniej więcej raz na {k} razy.', { n: N, k: Math.max(2, Math.round(1 / P)) }) });
  const safe = items.filter((x) => x.p > 0.85);
  if (safe.length)
    tips.push({ level: 'info', text: t('„Pewniaki” ({list}) prawie nie podnoszą kursu, a każde zdarzenie dokłada marżę bukmachera i ryzyko niespodzianki.', { list: safe.map((x) => t(x.label)).join(', ') }) });
  const risky = items.filter((x) => x.p < 0.6);
  if (risky.length) tips.push({ level: 'warn', text: t('Niska szansa z modelu (< 60%): {list}.', { list: risky.map((x) => `${t(x.label)} ${pct(x.p)}`).join(', ') }) });
  const weakHist = items.filter((x) => x.hit !== null && x.hit < 0.6);
  if (weakHist.length) tips.push({ level: 'info', text: t('Historia słabo potwierdza: {list}.', { list: weakHist.map((x) => `${t(x.label)} (${pct(x.hit as number)})`).join(', ') }) });
  const resultGoals = items.filter((x) => /^(1|X|2|1X|X2|12|btts|btts-no|[ou]\d|h-o|a-o|ht-o)/.test(x.marketId));
  if (resultGoals.length)
    tips.push({ level: 'info', text: t('Wynik i gole ({list}): na tych rynkach bukmacher jest dokładniejszy od modelu, a test na prawdziwych kursach nie potwierdził przewagi. Najmocniejsze typy modelu to faule, kartki, rożne i strzały celne.', { list: resultGoals.map((x) => t(x.label)).join(', ') }) });
  if (!allOdds) tips.push({ level: 'info', text: t('Wpisz kursy wszystkich zdarzeń, żeby zobaczyć wartość kuponu i sugerowaną stawkę.') });

  // trafność kuponu z n typów z różnych meczów ≈ trafność typu do potęgi n
  const h1 = legStats?.hit ?? FALLBACK_HIT;
  const table = [1, 2, 3, 4, 5, 6].map((n) => ({ n, hit: Math.pow(h1, n) }));

  const verdict =
    ev === null
      ? { cls: 'warn', text: t('Kupon opłaca się, jeśli jego łączny kurs wyniesie co najmniej {k}.', { k: needTotal.toFixed(2) }) }
      : ev > 0
        ? { cls: 'good', text: t('Kupon ma dodatnią wartość: +{v}% ({tax}). Kurs {o} przy potrzebnym {k}.', { v: (ev * 100).toFixed(1), tax: tax ? t('po podatku') : t('bez podatku'), o: O!.toFixed(2), k: needTotal.toFixed(2) }) }
        : { cls: 'err', text: t('Kupon jest na minus: {v}% ({tax}). Kurs {o}, a potrzeba co najmniej {k}. Przy tych kursach lepiej go nie grać.', { v: (ev * 100).toFixed(1), tax: tax ? t('po podatku') : t('bez podatku'), o: O!.toFixed(2), k: needTotal.toFixed(2) }) };

  return (
    <section className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>{t('Podpowiedzi')}</h2>
        <span className="tiny muted">{tax ? t('z podatkiem 12%') : t('bez podatku')}</span>
      </div>

      <div className={verdict.cls === 'good' ? 'ok-box' : verdict.cls === 'err' ? 'err' : 'warn'}>
        <strong>{verdict.text}</strong>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="l">{t('Zdarzenie')}</th>
              <th>{t('Szansa')}</th>
              <th title={t('Minimalny kurs tego zdarzenia, żeby cały kupon był na plus (podatek rozłożony na wszystkie zdarzenia)')}>{t('Min. kurs')}</th>
              <th>{t('Twój kurs')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {legs.map(({ x, min, state }) => (
              <tr key={x.fixtureId + x.marketId}>
                <td className="l" style={{ whiteSpace: 'normal' }}>{t(x.label)}</td>
                <td>{pct(x.p)}</td>
                <td>{min.toFixed(2)}</td>
                <td>{x.odds ? x.odds.toFixed(2) : '–'}</td>
                <td className={state === 'low' ? 'val-neg' : state === 'none' ? 'muted' : 'val-pos'}>
                  {state === 'none' ? t('wpisz kurs') : state === 'low' ? t('za nisko') : state === 'strong' ? t('dobry kurs') : 'ok'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v">{pct(P)}</div>
          <div className="l">{t('Szansa kuponu')}</div>
        </div>
        <div className="kpi">
          <div className="v">{t('{k} z 10', { k: Math.round(P * 10) })}</div>
          <div className="l">{t('Tyle takich kuponów wchodzi średnio')}</div>
        </div>
        <div className="kpi">
          <div className="v">{pct(Math.pow(1 - P, 5))}</div>
          <div className="l">{t('Szansa na 5 przegranych z rzędu')}</div>
        </div>
      </div>

      <div className="row small">
        <label htmlFor="bank">{t('Budżet na zakłady')}</label>
        <input id="bank" inputMode="decimal" value={bank} onChange={(e) => saveBank(e.target.value)} placeholder={t('np. 500')} style={{ width: 100 }} />
        <span className="muted">zł</span>
        {bankNum > 0 && O ? (
          ev !== null && ev > 0 ? (
            <span>
              {t('Sugerowana stawka:')} <strong>{zl(Math.max(1, suggested), t.locale)}</strong>{' '}
              <span className="muted">(¼ Kelly{quarter * bankNum > bankNum * 0.05 ? t(', ograniczona do 5% budżetu') : ''})</span>
            </span>
          ) : (
            <span className="val-neg">{t('Przy ujemnej wartości sugerowana stawka to 0 zł.')}</span>
          )
        ) : (
          <span className="muted">{t('Podaj budżet i kursy, a policzę rozsądną stawkę.')}</span>
        )}
      </div>

      {tips.length > 0 && (
        <ul className="tips">
          {tips.map((tip, i) => (
            <li key={i} className={tip.level}>{tip.text}</li>
          ))}
        </ul>
      )}

      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          {t('Ile zdarzeń dawać?')} {legStats ? t('Trafność typów z ostatnich 30 dni ({n} typów)', { n: legStats.n }) : t('Wyniki testu wstecznego')}
        </summary>
        <div className="tbl-wrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="l">{t('Zdarzeń')}</th>
                <th>{t('Weszło')}</th>
                <th title={t('Średni minimalny kurs bukmachera na zdarzenie, żeby wyjść na plus')}>{t('Kurs na zdarzenie na plus')} {tax ? t('(z podatkiem)') : t('(bez podatku)')}</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.n} className={r.n === Math.min(6, N) ? 'pick' : ''}>
                  <td className="l">
                    {r.n}
                    {(tax ? r.n === 3 : r.n <= 2) ? ` ${t('(polecane)')}` : ''}
                  </td>
                  <td>{pct(r.hit)}</td>
                  <td>{needPerLeg(r.hit, r.n, taxF).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          {legStats
            ? t('Na podstawie zakładki Skuteczność: {n} typów z kursem fair ≥ 1,25 z {m} meczów (weszło {h}, model zakładał {p}). Kupony z typów z różnych meczów.', { n: legStats.n, m: legStats.matches, h: pct(legStats.hit), p: pct(legStats.model) })
            : t('Zakładka Skuteczność nie była jeszcze przeliczona dla tej wersji modelu, więc tabela korzysta z testu wstecznego (trafność typu {h}). Otwórz Skuteczność, a tabela zacznie się aktualizować.', { h: pct(FALLBACK_HIT) })}{' '}
          {tax
            ? t('Z podatkiem im więcej zdarzeń, tym lepiej rozkłada się 12%, ale kupon wchodzi rzadziej. Powyżej 4 zdarzeń zysk na podatku jest już minimalny.')
            : t('Bez podatku próg na zdarzenie jest prawie taki sam dla każdej długości kuponu, więc krótsze kupony są bezpieczniejsze.')}{' '}
          {t('Aktualną skuteczność typów sprawdzisz w zakładce Skuteczność.')}
        </p>
      </details>

      <p className="tiny muted" style={{ margin: 0 }}>
        {t('Szanse pochodzą z modelu, który nie zna składów ani kontuzji. Graj stałymi, małymi stawkami i tylko za pieniądze, które możesz stracić.')}
      </p>
    </section>
  );
}
