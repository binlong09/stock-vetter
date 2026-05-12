import { signIn } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === '1';
  // Auth.js sends ?error=AccessDenied when the signIn callback returns false
  // (i.e. the email isn't on the allowlist), and ?error=Verification when a
  // magic link is expired/already-used.
  const error = params.error;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your email and we&apos;ll send you a magic link.
      </p>

      {sent && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Check your email for a sign-in link.
        </p>
      )}
      {error === 'AccessDenied' && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          That email isn&apos;t allowed to access this app.
        </p>
      )}
      {error && error !== 'AccessDenied' && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Couldn&apos;t sign you in ({error}). Try requesting a new link.
        </p>
      )}

      <form
        action={async (formData) => {
          'use server';
          const email = String(formData.get('email') ?? '').trim();
          await signIn('resend', { email, redirectTo: '/' });
        }}
        className="mt-5 space-y-3"
      >
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Send magic link
        </button>
      </form>
    </div>
  );
}
