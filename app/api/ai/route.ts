import Anthropic from '@anthropic-ai/sdk';
import { makeT } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_RULES = `Jesteś analitykiem statystyk piłkarskich w aplikacji Kursor. Piszesz po polsku, konkretnie i bez lania wody.

Zasady:
- Opierasz się WYŁĄCZNIE na danych w sekcji DANE (statystyki z ostatnich meczów i wyliczenia modelu Poissona). Nie wymyślaj kontuzji, składów, newsów ani kursów, których nie ma w danych. Jeśli czegoś brakuje, powiedz to wprost.
- Podawaj liczby: szansę z modelu, skuteczność historyczną (np. 7/10), średnie. Wskazuj, gdy model i historia się nie zgadzają.
- Zwracaj uwagę na wielkość próby (mało meczów, brak statystyk w części rozgrywek, mecze z innych rozgrywek o innej wadze).
- Nigdy nie obiecuj wygranej i nie nazywaj typów "pewniakami". Szansa 75% oznacza przegraną średnio w co czwartym przypadku.
- Kupon wielozdarzeniowy: przypominaj, że łączna szansa to iloczyn szans, a zdarzenia z jednego meczu są zależne. Preferuj krótkie kupony (2–4 zdarzenia).
- "Wartość" zakładu istnieje tylko, gdy szansa × kurs > 1. Bez kursów od użytkownika możesz podać kurs fair (1/szansa) jako próg opłacalności.
- Jeśli użytkownik pisze o odrabianiu strat, długach lub graniu za pieniądze, których nie może stracić, zasugeruj przerwę i odpowiedzialną grę.
- Formatowanie: krótkie akapity, listy z "- ", pogrubienia **tak**. Bez tabel.
- Odpowiadaj zwięźle (zwykle do ok. 250 słów). Dłużej tylko, gdy użytkownik prosi o pełną analizę.`;

const MATCH_RULES = `Tryb: analiza jednego meczu. Na prośbę o pełną analizę omów kolejno: formę i bilans, bramki (strzelone/stracone, u siebie/na wyjeździe, over/BTTS), strzały i strzały celne, rzuty rożne, kartki, wnioski z modelu, a na końcu 2–4 typy z uzasadnieniem i poziomem ryzyka (niskie/średnie/wysokie).`;

const COUPON_RULES = `Tryb: budowa i ocena kuponu. Masz kupon użytkownika i streszczenia meczów przeanalizowanych w aplikacji. Proponując kupon, wybieraj zdarzenia z sekcji "typy_aplikacji" lub "mocne_rynki" z wysoką szansą modelu i zgodną historią, z różnych meczów. Dla każdego zdarzenia podaj mecz, zdarzenie, szansę i kurs fair, a na końcu łączną szansę i łączny kurs fair kuponu. Jeśli nie ma przeanalizowanych meczów, poproś użytkownika, by otworzył kilka meczów w aplikacji.`;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// Odchudzenie kontekstu kuponu. Każdy przeanalizowany mecz to kilka KB danych; przy kilkudziesięciu
// meczach zapytanie miało dziesiątki tysięcy tokenów, przez co odpowiedź szła bardzo długo albo
// przekraczała minutowy limit konta API. Zostawiamy mecze jeszcze nierozegrane, najbliższe w czasie,
// i z każdego tylko typy aplikacji oraz kilka najmocniejszych rynków.
const MAX_MATCHES = 15;
const MAX_MARKETS = 8;

function slimCoupon(ctx: { kupon?: unknown; przeanalizowane_mecze?: Record<string, unknown>[] }) {
  const now = Date.now();
  const upcoming = (ctx.przeanalizowane_mecze ?? [])
    .filter((m) => {
      const t = Date.parse(String(m.termin ?? ''));
      return !Number.isFinite(t) || t > now - 15 * 60_000;
    })
    .sort((a, b) => Date.parse(String(a.termin ?? '')) - Date.parse(String(b.termin ?? '')))
    .slice(0, MAX_MATCHES);
  return {
    kupon: ctx.kupon ?? [],
    pominieto_meczow: Math.max(0, (ctx.przeanalizowane_mecze?.length ?? 0) - upcoming.length),
    przeanalizowane_mecze: upcoming.map((m) => {
      const model = (m.model ?? {}) as Record<string, unknown>;
      const strong = ((m.wszystkie_rynki as string[]) ?? [])
        .map((line) => ({
          line,
          p: Number(/model (\d+)%/.exec(line)?.[1] ?? 0),
          h: Number(/historia (\d+)%/.exec(line)?.[1] ?? 0),
        }))
        .filter((x) => x.p >= 60 && x.p <= 90 && x.h >= 60)
        .sort((a, b) => b.p + b.h - (a.p + a.h))
        .slice(0, MAX_MARKETS)
        .map((x) => x.line);
      return {
        mecz: m.mecz,
        termin: m.termin,
        rozgrywki: m.rozgrywki,
        model: {
          oczekiwane_gole: model.oczekiwane_gole,
          szanse_1x2: model.szanse_1x2,
          oczekiwane_rozne: model.oczekiwane_rozne,
          oczekiwane_zolte: model.oczekiwane_zolte,
          oczekiwane_faule: model.oczekiwane_faule,
          uwaga: model.uwaga,
        },
        typy_aplikacji: m.typy_aplikacji,
        mocne_rynki: strong,
      };
    }),
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('Asystent AI jest wyłączony: brak ANTHROPIC_API_KEY w pliku .env.local. Wpisz klucz i uruchom aplikację ponownie.', {
      status: 400,
    });
  }

  let body: { mode?: 'match' | 'coupon'; lang?: string; context?: unknown; messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Nieprawidłowe zapytanie.', { status: 400 });
  }

  const mode = body.mode === 'coupon' ? 'coupon' : 'match';
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response('Brak pytania.', { status: 400 });
  }
  const context = mode === 'coupon' ? slimCoupon((body.context ?? {}) as Parameters<typeof slimCoupon>[0]) : body.context;

  const today = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'full' }).format(new Date());
  const es = body.lang === 'es';
  const t = makeT(es ? 'es' : 'pl');
  const langRule = es
    ? '\n\nJĘZYK: odpowiadaj wyłącznie po hiszpańsku (español), także gdy dane są po polsku. Nazwy zdarzeń tłumacz na hiszpański (np. „Powyżej 2.5 gola” → „Más de 2.5 goles”, rożne → córners, kartki → tarjetas, faule → faltas, strzały celne → tiros a puerta, kupon → boleto/combinada, kurs fair → cuota justa).'
    : '';
  const system = `${BASE_RULES}\n\n${mode === 'coupon' ? COUPON_RULES : MATCH_RULES}${langRule}\n\nDzisiaj jest ${today}.\n\nDANE:\n${JSON.stringify(context)}`;

  // maxRetries 1: przy przekroczonym limicie lepiej szybko pokazać komunikat niż czekać minutami na kolejne próby
  const client = new Anthropic({ maxRetries: 1, timeout: 90_000 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 1800,
          // Bez trybu „myślenia”: przy nim model długo milczy przed pierwszym słowem,
          // a przy limicie tokenów potrafi zużyć go całego na myślenie i nie oddać odpowiedzi.
          thinking: { type: 'between_tools' },
          // pamięć podręczna promptu: kolejne pytania w ciągu kilku minut nie przesyłają danych od nowa
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages,
        });
        let sent = 0;
        for await (const ev of s) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            sent += ev.delta.text.length;
            controller.enqueue(enc.encode(ev.delta.text));
          }
        }
        const fin = await s.finalMessage();
        const why = fin.stop_reason;
        console.log(`[asystent] stop=${why} wej=${fin.usage.input_tokens} cache=${fin.usage.cache_read_input_tokens ?? 0} wyj=${fin.usage.output_tokens}`);
        if (!sent) {
          controller.enqueue(enc.encode(t('Asystent nie zwrócił tekstu (powód: {why}). Spróbuj zadać pytanie jeszcze raz.', { why: why ?? '?' })));
        } else if (why === 'max_tokens') {
          controller.enqueue(enc.encode(`\n\n_(${t('Odpowiedź ucięta, bo była za długa. Poproś o krótszą wersję albo o dokończenie.')})_`));
        } else if (why && why !== 'end_turn' && why !== 'stop_sequence') {
          controller.enqueue(enc.encode(`\n\n_(${t('Asystent przerwał odpowiedź, powód: {why}. Spróbuj zadać pytanie jeszcze raz.', { why: String(why) })})_`));
        }
      } catch (e) {
        let msg = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}` : (e as Error).message;
        if (e instanceof Anthropic.RateLimitError)
          msg = t('przekroczony limit zapytań na minutę na Twoim koncie API. Odczekaj minutę i spróbuj ponownie.');
        else if (e instanceof Anthropic.APIConnectionTimeoutError) msg = t('Claude nie odpowiedział w ciągu 90 sekund. Spróbuj ponownie.');
        else if (e instanceof Anthropic.APIError && e.status === 400 && /credit/i.test(e.message))
          msg = t('brak środków na koncie API (console.anthropic.com → Billing).');
        controller.enqueue(enc.encode(`\n\n${t('Błąd asystenta AI:')} ${msg}`));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
