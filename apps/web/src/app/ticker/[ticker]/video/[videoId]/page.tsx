import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalystCard } from '@/queries';
import { AnalystCardView } from '@/components/AnalystCardView';

export const revalidate = 300;

export default async function AnalystVideoPage({
  params,
}: {
  params: Promise<{ ticker: string; videoId: string }>;
}) {
  const { ticker, videoId } = await params;
  const card = await getAnalystCard(ticker, videoId);
  if (!card) notFound();

  return (
    <div>
      <Link
        href={`/ticker/${ticker.toUpperCase()}`}
        className="text-[12px] text-slate-400 hover:text-slate-700"
      >
        ← {ticker.toUpperCase()} card
      </Link>
      <div className="mt-2">
        <AnalystCardView card={card} />
      </div>
    </div>
  );
}
