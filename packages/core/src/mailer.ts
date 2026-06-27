// mailer.ts — a generic Resend email sender usable from any context, including
// the cron (track.ts). The web app's magic-link email stays inside next-auth's
// Resend provider (auth.ts); there was no standalone mailer to extract, so this
// is the shared one. It calls Resend's REST API directly via fetch — no SDK
// dependency — reusing the same AUTH_RESEND_KEY / EMAIL_FROM env the web auth
// uses.
//
// Returns false (a no-op) when the mail env isn't configured, mirroring the
// Turso helpers — so a cron without mail set up just doesn't send, rather than
// throwing. Throws only on an actual send failure.

export function isMailerConfigured(): boolean {
  return Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return true;
}
