#!/usr/bin/env tsx
/**
 * Manage the web viewer's sign-in allowlist (the `allowed_emails` table in
 * Turso). Adding a reader is one command — no env-var change, no Vercel
 * redeploy. The web app's auth.ts checks this table at sign-in time.
 *
 * Usage:
 *   pnpm allow-email <addr> [note...]   # add (or update note for) an email
 *   pnpm allow-email --list             # list the current allowlist
 *   pnpm allow-email --remove <addr>    # remove an email
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment (.env).
 */

import 'dotenv/config';
import {
  isTursoConfigured,
  addAllowedEmail,
  removeAllowedEmail,
  listAllowedEmails,
} from '@stock-vetter/pipeline';

function usage(): never {
  console.error(
    'Usage:\n' +
      '  pnpm allow-email <addr> [note...]   add (or update note for) an email\n' +
      '  pnpm allow-email --list             list the current allowlist\n' +
      '  pnpm allow-email --remove <addr>    remove an email',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  if (!isTursoConfigured()) {
    throw new Error(
      'Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.',
    );
  }

  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();

  if (cmd === '--list') {
    const rows = await listAllowedEmails();
    if (!rows.length) {
      console.log('Allowlist is empty — nobody can sign in (fails closed).');
      return;
    }
    console.log(`${rows.length} allowed email(s):\n`);
    for (const r of rows) {
      const note = r.note ? `  — ${r.note}` : '';
      console.log(`  ${r.email}${note}   (added ${r.addedAt.slice(0, 10)})`);
    }
    return;
  }

  if (cmd === '--remove') {
    const email = rest[0];
    if (!email) usage();
    const removed = await removeAllowedEmail(email);
    console.log(removed ? `Removed ${email.toLowerCase().trim()}.` : `${email} was not on the allowlist.`);
    return;
  }

  // Otherwise: cmd is the email to add; remaining args are an optional note.
  const email = cmd;
  const note = rest.length ? rest.join(' ') : undefined;
  await addAllowedEmail(email, note);
  console.log(`Allowed ${email.toLowerCase().trim()}${note ? ` (${note})` : ''}. Takes effect on next sign-in — no redeploy needed.`);
}

main().catch((err) => {
  console.error(`allow-email failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
