import { runBacktest } from '@/lib/backtest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Strumień NDJSON: {type:'progress'} … {type:'result', rows} albo {type:'error'}.
// Pierwsze przeliczenie 3 tygodni to kilka tysięcy zapytań do ESPN (2–5 minut), potem tylko nowe mecze.
export async function GET(req: Request) {
  const days = Math.min(60, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 21));
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const rows = await runBacktest(days, (done, total, step) => send({ type: 'progress', done, total, step }));
        send({ type: 'result', rows, days });
      } catch (e) {
        send({ type: 'error', message: `Nie udało się policzyć skuteczności: ${(e as Error).message}` });
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
