import { addCoupon, listCoupons, removeCoupon, type JournalItem } from '@/lib/journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ entries: await listCoupons() });
  } catch (e) {
    return Response.json({ error: `Nie udało się wczytać dziennika: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { stake: number; tax: boolean; items: JournalItem[] };
    const id = addCoupon(Number(b.stake), !!b.tax, b.items ?? []);
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'Brak numeru kuponu.' }, { status: 400 });
  removeCoupon(id);
  return Response.json({ ok: true });
}
