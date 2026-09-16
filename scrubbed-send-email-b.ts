import nodemailer from "nodemailer";

const GMAIL_USER = "arrowood.aidan@gmail.com";
const GMAIL_PASS = "simfxapolfwxlkrq";

async function main() {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  const html = `<p>Hi [redacted],</p>
<p>We spoke briefly today — I caught you while you were at the gym, so I'll keep this just as quick.</p>
<p>I'm Aidan, a student at Clemson studying engineering. I built Relevate, an AI-powered marketing assistant purpose-built for real estate agents. You enter a property's details once, and it generates all five listing marketing assets in under a minute:</p>
<p>📝 Property descriptions — SEO-optimized, 5 tone options, MLS-ready<br>
📋 Open house flyers — print-ready with feature highlights<br>
📱 Social media posts — platform-tuned for Instagram, Facebook, LinkedIn<br>
✉️ Email campaigns — launch announcements and open house invites<br>
📊 Listing summaries — quick-reference sheets for showings</p>
<p>Instead of spending 3–5 hours a week on marketing content, agents get everything in one shot — no templates, no writers, no wasted hours.</p>
<p>I'd love to chat more when you have a minute and see if Relevate could be useful for you. Open to a quick call or I can send over more details — whatever works.</p>
<p>Best,<br>Aidan Arrowood</p>`;

  const info = await transporter.sendMail({
    from: `Aidan Arrowood <${GMAIL_USER}>`,
    to: "[redacted]",
    subject: "Relevate — quick follow-up from our call",
    html,
  });

  console.log("SENT:", info.messageId);
}

main().catch((e) => console.error("FAILED:", e.message));
