import { upcomingAnalysisSummaries } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streszczenia meczów przeanalizowanych w aplikacji (nadchodzące) – kontekst dla asystenta kuponu
export async function GET() {
  return Response.json({ analyses: upcomingAnalysisSummaries() });
}
