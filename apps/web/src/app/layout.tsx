import type { Metadata } from 'next';
import './globals.css';
import { auth, signOut } from '@/auth';

export const metadata: Metadata = {
  title: 'Stock Vetter',
  description: 'Value-investing decision cards',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <a href="/" className="text-sm font-semibold tracking-tight text-slate-900">
              Stock&nbsp;Vetter
            </a>
            {session?.user?.email ? (
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/signin' });
                }}
              >
                <button
                  type="submit"
                  className="text-xs text-slate-500 hover:text-slate-800"
                  title={session.user.email}
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
