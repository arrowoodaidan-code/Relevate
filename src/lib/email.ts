import nodemailer from "nodemailer";

const GMAIL_USER = "relevaterealestate.auto@gmail.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const appPassword = process.env.GMAIL_APP_PASSWORD;
    if (!appPassword) {
      throw new Error("GMAIL_APP_PASSWORD is not set");
    }
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: GMAIL_USER,
        pass: appPassword,
      },
    });
  }
  return transporter;
}

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  // Awaitable + hard-capped: on serverless, an unawaited fire-and-forget send is
  // frozen/killed the moment the response returns (this silently dropped lead
  // notifications). Every send must resolve INSIDE the request, bounded so a
  // hung SMTP connection can't stall the endpoint.
  const SEND_TIMEOUT_MS = 9_000;
  try {
    const transport = getTransporter();
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`SMTP send timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
      // Don't let the pending timer keep the process alive after the race settles.
      (t as any)?.unref?.();
    });
    const info = await Promise.race([
      transport.sendMail({
        from: `Relevate <${GMAIL_USER}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
      timeout,
    ]);

    // Explicit success marker (messageId) so runtime logs prove delivery acceptance.
    console.log(`[email] SENT to=${opts.to} subject="${opts.subject}" messageId=${info.messageId}`);
    return { success: true, id: info.messageId };
  } catch (err: any) {
    console.error(
      "[email] SEND FAILED",
      JSON.stringify({ to: opts.to, subject: opts.subject, error: err?.message || String(err) })
    );
    return { success: false, error: err?.message || "Unknown error" };
  }
}
