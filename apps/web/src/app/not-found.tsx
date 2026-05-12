import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mt-16 text-center">
      <p className="text-sm text-slate-600">Not found.</p>
      <Link href="/" className="mt-2 inline-block text-sm text-slate-900 underline">
        Back to all tickers
      </Link>
    </div>
  );
}
