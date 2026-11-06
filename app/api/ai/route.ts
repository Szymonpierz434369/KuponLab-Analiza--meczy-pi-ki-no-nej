import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_RULES = `Jesteś analitykiem statystyk piłkarskich w aplikacji KuponLab. Piszesz po polsku, konkretnie i bez lania wody.

Zasady:
- Opierasz się WYŁĄCZNIE na danych w sekcji DANE (statystyki z ostatnich meczów i wyliczenia modelu Poissona). Nie wymyślaj kontuzji, składów, newsów ani kursów, których nie ma w danych. Jeśli czegoś brakuje, powiedz to wprost.
- Podawaj liczby: szansę z modelu, skuteczność historyczną (np. 7/10), średnie. Wskazuj, gdy model i historia się nie zgadzają.
- Zwracaj uwagę na wielkość próby (mało meczów, brak statystyk w części rozgrywek, mecze z innych rozgrywek o innej wadze).
- Nigdy nie obiecuj wygranej i nie nazywaj typów "pewniakami". Szansa 75% oznacza przegraną średnio w co czwartym przypadku.
- Kupon wielozdarzeniowy: przypominaj, że łączna szansa to iloczyn szans, a zdarzenia z jednego meczu są zależne. Preferuj krótkie kupony (2–4 zdarzenia).
- "Wartość" zakładu istnieje tylko, gdy szansa × kurs > 1. Bez kursów od użytkownika możesz podać kurs fair (1/szansa) jako próg opłacalności.
- Jeśli użytkownik pisze o odrabianiu strat, długach lub graniu za pieniądze, których nie może stracić, zasugeruj przerwę i odpowiedzialną grę.
- Formatowanie: krótkie akapity, listy z "- ", pogrubienia **tak**. Bez tabel.`;

const MATCH_RULES = `Tryb: analiza jednego meczu. Na prośbę o pełną analizę omów kolejno: formę i bilans, bramki (strzelone/stracone, u siebie/na wyjeździe, over/BTTS), strzały i strzały celne, rzuty rożne, kartki, wnioski z modelu, a na końcu 2–4 typy z uzasadnieniem i poziomem ryzyka (niskie/średnie/wysokie).`;

const COUPON_RULES = `Tryb: budowa i ocena kuponu. Masz kupon użytkownika i streszczenia meczów przeanalizowanych w aplikacji. Proponując kupon, wybieraj zdarzenia z sekcji "typy_aplikacji" lub "wszystkie_rynki" z wysoką szansą modelu i zgodną historią, z różnych meczów. Dla każdego zdarzenia podaj mecz, zdarzenie, szansę i kurs fair, a na końcu łączną szansę i łączny kurs fair kuponu. Jeśli nie ma przeanalizowanych meczów, poproś użytkownika, by otworzył kilka meczów w aplikacji.`;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// Odchudzenie kontekstu kuponu: zostawiamy tylko to, co potrzebne do wyboru zdarzeń
function slimCoupon(ctx: { kupon?: unknown; przeanalizowane_mecze?: Record<string, unknown>[] }) {
  return {
    kupon: ctx.kupon ?? [],
    przeanalizowane_mecze: (ctx.przeanalizowane_mecze ?? []).map((m) => ({
      mecz: m.mecz,
      termin: m.termin,
      rozgrywki: m.rozgrywki,
      model: m.model,
      typy_aplikacji: m.typy_aplikacji,
      wszystkie_rynki: ((m.wszystkie_rynki as string[]) ?? []).filter((line) => {
        const p = Number(/model (\d+)%/.exec(line)?.[1] ?? 0);
        return p >= 55;
      }),
    })),
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('Asystent AI jest wyłączony: brak ANTHROPIC_API_KEY w pliku .env.local. Wpisz klucz i uruchom aplikację ponownie.', {
      status: 400,
    });
  }

  let body: { mode?: 'match' | 'coupon'; context?: unknown; messages?: Msg[] };
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
  const system = `${BASE_RULES}\n\n${mode === 'coupon' ? COUPON_RULES : MATCH_RULES}\n\nDzisiaj jest ${today}.\n\nDANE:\n${JSON.stringify(context)}`;

  const client = new Anthropic();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.messages.stream({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 2500,
          system,
          messages,
        });
        for await (const ev of s) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(ev.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Anthropic.APIError ? `${e.status ?? ''} ${e.message}` : (e as Error).message;
        controller.enqueue(enc.encode(`\n\nBłąd asystenta AI: ${msg}`));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
