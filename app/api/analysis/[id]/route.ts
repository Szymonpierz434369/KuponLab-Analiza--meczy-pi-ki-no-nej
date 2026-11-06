import { buildAnalysis } from '@/lib/analysis';
import { DataError } from '@/lib/espn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Zwraca strumień NDJSON: linie {type:'progress'} a na końcu {type:'result'} lub {type:'error'}.
// Pierwsze pobranie meczu to ok. 25 zapytań do ESPN; kolejne korzystają z lokalnego cache.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const fixtureId = Number(id);
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        send({ type: 'error', message: 'Nieprawidłowy numer meczu.' });
        controller.close();
        return;
      }
      try {
        const result = await buildAnalysis(fixtureId, (step, done, total) => send({ type: 'progress', step, done, total }));
        send({ type: 'result', result });
      } catch (e) {
        const message = e instanceof DataError ? e.message : `Analiza nie powiodła się: ${(e as Error).message}`;
        send({ type: 'error', message });
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
