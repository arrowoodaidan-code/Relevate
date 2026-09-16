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
<p>[redacted] [redacted] and I spoke recently, and he suggested I reach out to you directly. He thought Relevate might be something your team could use.</p>
<p>I'm Aidan — a student at Clemson studying engineering. I built Relevate, an AI-powered marketing assistant purpose-built for real estate agents.</p>
<p>Here's how it works: you enter a property's details — address, beds, baths, square footage, price, key features — and Relevate generates all five listing marketing assets in under a minute:</p>
<p>📝 <strong>Property descriptions</strong> — SEO-optimized, in 5 tone options (luxury, professional, modern, warm, urgent), ready for MLS<br>
📋 <strong>Open house flyers</strong> — print-ready with compelling headlines and feature highlights<br>
📱 <strong>Social media posts</strong> — platform-tuned copy for Instagram, Facebook, and LinkedIn<br>
✉️ <strong>Email campaigns</strong> — launch announcements and open house invites that drive showings<br>
📊 <strong>Listing summaries</strong> — MLS-ready bullet points that hit every key selling point</p>
<p>Instead of spending 3–5 hours a week writing marketing content, agents get everything in one shot — no templates to fill out, no writers to hire, no wasted hours. Just enter the address and go.</p>
<p>[redacted] thought this might be worth a look for your team. I'd love to walk you through a quick demo and see if it's a fit for the [redacted] Group. Would you have 15 minutes this week or next?</p>
<p>Best,<br>Aidan Arrowood</p>`;

  const info = await transporter.sendMail({
    from: `Aidan Arrowood <${GMAIL_USER}>`,
    to: "[redacted]",
    subject: "Relevate — [redacted] [redacted] suggested I reach out",
    html,
  });

  console.log("SENT:", info.messageId);
}

main().catch((e) => console.error("FAILED:", e.message));
