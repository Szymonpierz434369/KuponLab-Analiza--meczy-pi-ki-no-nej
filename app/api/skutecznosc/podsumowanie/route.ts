import { cachedLegStats } from '@/lib/backtest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Szybkie podsumowanie z zapisanych wyników zakładki Skuteczność (bez nowych zapytań do ESPN).
export async function GET() {
  return Response.json({ stats: cachedLegStats(30, 1.25) }, { headers: { 'cache-control': 'no-store' } });
}
