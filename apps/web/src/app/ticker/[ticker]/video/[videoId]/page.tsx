import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalystCard, getNormalizedTranscript } from '@/queries';
import { AnalystCardView } from '@/components/AnalystCardView';
import { TranscriptView } from '@/components/TranscriptView';
import { DeepSection } from '@/components/DeepSection';
import { parseAvTranscriptId } from '@/lib/transcript-source';

export const revalidate = 300;

export default async function AnalystVideoPage({
  params,
}: {
  params: Promise<{ ticker: string; videoId: string }>;
}) {
  const { ticker, videoId } = await params;
  const card = await getAnalystCard(ticker, videoId);
  if (!card) notFound();

  // An `av:<TICKER>:<quarter>` card is an earnings-call transcript we host in
  // Turso, not a YouTube video — fetch the hosted transcript so its "source"
  // link resolves to the actual text. Real videoIds parse to null and skip this.
  const avRef = parseAvTranscriptId(videoId);
  const transcript = avRef ? await getNormalizedTranscript(avRef.ticker, avRef.quarter) : null;

  return (
    <div>
      <Link
        href={`/ticker/${ticker.toUpperCase()}`}
        className="text-[12px] text-slate-400 hover:text-slate-700"
      >
        ← {ticker.toUpperCase()} card
      </Link>
      <div className="mt-2">
        <AnalystCardView card={card} isTranscript={avRef != null} />
      </div>
      {transcript && avRef && (
        <div className="mt-3">
          <DeepSection title="Earnings-call transcript">
            <TranscriptView
              quarter={avRef.quarter}
              normalizedText={transcript.normalizedText}
              turns={transcript.turns}
              normalizedAt={transcript.normalizedAt}
            />
          </DeepSection>
        </div>
      )}
    </div>
  );
}
