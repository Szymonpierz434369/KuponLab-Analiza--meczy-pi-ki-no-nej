import MatchView from '@/components/MatchView';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchView id={Number(id)} />;
}
