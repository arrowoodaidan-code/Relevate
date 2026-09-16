/**
 * Blog content infrastructure for Relevate.
 *
 * Posts are defined as structured data (not markdown) so the renderer can
 * produce clean, semantic HTML for SEO. Add a new post by appending to the
 * `posts` array; the blog index and sitemap pick it up automatically.
 */

export type ContentBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "tip"; title: string; text: string }
  | { type: "html"; html: string };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO date
  updated?: string;
  readTime: string;
  category: string;
  tags: string[];
  content: ContentBlock[];
}

export const posts: BlogPost[] = [

  {
    slug: "how-to-write-real-estate-listing-description",
    title: "How to Write a Real Estate Listing Description That Sells (10 Templates)",
    excerpt:
      "Most listing descriptions read like feature sheets. The ones that sell read like stories. Here's the exact formula — plus 10 copy-and-paste templates you can use today.",
    date: "2026-08-05",
    readTime: "8 min read",
    category: "Listing Copy",
    tags: ["listing description", "real estate marketing", "copywriting", "templates"],
    content: [
      {
        type: "p",
        text: "Buyers scroll past hundreds of listings in a single evening. The ones that stop them aren't the ones with the most square footage — they're the ones that make them feel something. Your listing description is the only place in the transaction where you get to write the story. Here's how to make it count.",
      },
      { type: "h2", text: "Why listing descriptions actually matter" },
      {
        type: "p",
        text: "On Zillow, Realtor.com, and your local MLS, the description is what separates a saved listing from a skipped one. Data consistently shows that listings with well-written descriptions get more clicks, more showings, and more offers. It's also one of the few places you control the narrative — the photos show the house, but the words sell the life that happens inside it.",
      },
      {
        type: "ul",
        items: [
          "Buyers spend an average of under a minute on a listing before deciding to save or skip it.",
          "Most searches start broad — your description is what helps your listing surface for the right searches.",
          "A strong description reduces showing fatigue: the right buyers self-select before they book.",
        ],
      },
      { type: "h2", text: "The anatomy of a listing that sells" },
      {
        type: "p",
        text: "Every high-performing listing description follows the same four-beat structure. You don't need to be a writer to use it — you need to fill in the blanks.",
      },
      {
        type: "ol",
        items: [
          "The hook — one sentence that paints the fantasy. (\"Sunday mornings on this porch are the neighborhood's best-kept secret.\")",
          "The lifestyle — two or three sentences about who lives here and how their days go, not just room dimensions.",
          "The features — the practical details buyers need: beds, baths, lot size, upgrades, systems, location perks.",
          "The close — a soft call to action that invites the next step. (\"Come see it before the weekend is gone.\")",
        ],
      },
      { type: "h2", text: "Three mistakes that kill listings" },
      {
        type: "ul",
        items: [
          "The feature dump — \"3 bed, 2 bath, 1,850 sq ft, new roof, hardwood floors, granite counters…\" A spec sheet is not a story. Lead with feeling, then confirm with facts.",
          "The cliché pile-up — \"charming,\" \"cozy,\" \"must see,\" \"one of a kind.\" These words are invisible to buyers now. Replace them with specifics.",
          "Writing for the house instead of the buyer — every home is a solution to someone's problem. A condo near transit solves a commute. A fenced yard solves a dog. Write to the person.",
        ],
      },
      { type: "h2", text: "10 listing description templates" },
      {
        type: "p",
        text: "Adapt these to the specific home. Swap in real details — a morning light angle, a garden that survived a drought, the walk to the corner café. Specificity is what makes a template sound like you.",
      },
      { type: "h3", text: "1. The luxury listing" },
      {
        type: "p",
        text: "\"Privacy, proportion, and finish — this is a home designed for the way you actually live. The great room opens to a terrace that catches the afternoon sun, the chef's kitchen is as serious as it is beautiful, and the primary suite feels like a retreat from the rest of the week. Wrapped in mature landscaping on a quiet cul-de-sac, minutes from the club and the interstate.\"",
      },
      { type: "h3", text: "2. The first-time buyer" },
      {
        type: "p",
        text: "\"Your first home shouldn't feel like a compromise. This one has the walkable downtown location, the sunny kitchen, and the low-maintenance yard that means weekends stay yours. Move-in ready, priced to start, and a five-minute walk to the farmers market.\"",
      },
      { type: "h3", text: "3. The suburban family home" },
      {
        type: "p",
        text: "\"Cul-de-sac kids, backyard dinners, and a school run that doesn't involve the highway. This four-bedroom sits on a quiet street in the [district] school zone, with a rec room that absorbs the chaos and a kitchen built for feeding a crowd. The swing set stays.\"",
      },
      { type: "h3", text: "4. The downtown condo" },
      {
        type: "p",
        text: "\"Lock-and-leave living in the heart of it all. Steps from [street] dining, the [venue], and transit — this one-bedroom + den comes with a parking spot, a balcony that actually gets sun, and a building with a gym and rooftop lounge. Perfect for the professional who'd rather live than commute.\"",
      },
      { type: "h3", text: "5. The fixer-upper with potential" },
      {
        type: "p",
        text: "\"This is the one the flippers wish they'd found first. Sound bones, original character, and a price that leaves room for your vision. The neighborhood has already turned — your timing hasn't. Bring your contractor, or your imagination.\"",
      },
      { type: "h3", text: "6. The waterfront escape" },
      {
        type: "p",
        text: "\"The alarm clock is optional here. Waking up to water views, coffee on the dock, kayaks at the ready — this home is the weekend you keep canceling plans for. Deep-water access, a screened porch for summer evenings, and sunsets that never get old.\"",
      },
      { type: "h3", text: "7. The investment property" },
      {
        type: "p",
        text: "\"Numbers first: current rent [X], projected cap rate [Y], tenant in place through [month]. This duplex has been maintained like a portfolio asset, not a rental — new HVAC, updated electrical, separate meters. A turnkey addition to any income strategy.\"",
      },
      { type: "h3", text: "8. The relocation move" },
      {
        type: "p",
        text: "\"Moving across the country is stressful enough — the house shouldn't add to it. This home is the 'we made the right call' moment: great schools, a 20-minute commute to [employer hub], and a neighborhood where neighbors still introduce themselves. Move-in ready so your family can settle before work starts.\"",
      },
      { type: "h3", text: "9. The open house announcement" },
      {
        type: "p",
        text: "\"This Sunday, 1–4 PM: see the home that's been the talk of the street. Freshly painted, staged, and priced to move — stop by for a tour and stay for the neighborhood. Light refreshments served, serious buyers and curious neighbors equally welcome.\"",
      },
      { type: "h3", text: "10. The short, punchy listing" },
      {
        type: "p",
        text: "\"Sometimes less is the point. 2,400 sq ft of light-filled calm on a half-acre lot. New kitchen, new bath, zero to do. Priced $15K under recent comps. Yes, it'll go fast — that's the point.\"",
      },
      { type: "h2", text: "How AI fits in (and where it doesn't)" },
      {
        type: "p",
        text: "The best listing writers treat AI the way they treat a great stager: it sets the table, and the agent brings the personality. Tools like Relevate generate a complete, structurally sound first draft in seconds — hook, lifestyle, features, and close — so you start from a blank page never, and a strong draft always. Then you swap in the details only you know: the seller's story, the neighborhood quirks, the reason this house matters.",
      },
      {
        type: "quote",
        text: "The goal isn't to sound like a machine wrote it. The goal is to spend your time on the sentences only you can write — and let AI handle the other three hundred.",
      },
      { type: "h2", text: "Your next step" },
      {
        type: "p",
        text: "If you list more than a handful of properties a year, you already know how much time this takes. Relevate generates property descriptions, open house flyers, social posts, email campaigns, and listing summaries — all on-brand, all in under a minute. Start your free trial and write your first listing in the next ten minutes.",
      },
    ],
  },
  {
    slug: "relevate-launches-on-product-hunt",
    title: "Relevate Is Now Live on Product Hunt — AI Marketing for Real Estate Agents",
    excerpt:
      "We just launched Relevate on Product Hunt: an AI-powered marketing assistant that generates property descriptions, flyers, social posts, email campaigns, and listing summaries in under 60 seconds. Claim 50% off with code LAUNCH50.",
    date: "2026-08-11",
    readTime: "4 min read",
    category: "Announcement",
    tags: ["product hunt", "launch", "relevate", "AI marketing", "real estate"],
    content: [
      {
        type: "html",
        html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; max-width: 500px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
    <img alt="Relevate" src="https://relevatelistingassistant.ctonew.app/favicon.svg" style="width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: #0a1a0a;">
    <div style="flex: 1; min-width: 0;">
      <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a; line-height: 1.3;">Relevate</h3>
      <p style="margin: 4px 0 0; font-size: 14px; color: #666; line-height: 1.4;">Turn your listings into marketing that sells — in minutes.</p>
    </div>
  </div>
  <a href="https://www.producthunt.com/products/prompted-journal-with-one-prompt-per-day" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; padding: 8px 16px; background: #ff6154; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Check it out on Product Hunt →</a>
</div>`,
      },
      {
        type: "p",
        text: "Today, I'm thrilled to share that Relevate is officially live on Product Hunt. 🚀",
      },
      {
        type: "p",
        text: "Relevate is an AI-powered marketing assistant purpose-built for real estate agents. Instead of spending hours writing property descriptions, designing flyers, and crafting social posts, you input your listing details once and get all five marketing assets generated in under 60 seconds.",
      },
      { type: "h2", text: "How we got here" },
      {
        type: "p",
        text: "I built Relevate because I kept hearing the same complaint from real estate agents: they love selling homes, but they hate the marketing grind that comes with every listing. Writing five different content formats per property — descriptions, flyers, social posts, emails, and summaries — eats up 3-5 hours per listing.",
      },
      {
        type: "p",
        text: "That's creative energy being spent on admin work instead of selling. The problem isn't that agents can't write — it's that the volume is unsustainable. Relevate handles the repetitive marketing so agents can focus on what they do best: showing homes and closing deals.",
      },
      { type: "h2", text: "What Relevate generates" },
      {
        type: "ul",
        items: [
          "Property descriptions — SEO-optimized, in 5 tone options (luxury, professional, modern, warm, urgent)",
          "Open house flyers — print-ready with compelling headlines and feature highlights",
          "Social media posts — platform-tuned copy for Instagram, Facebook, and LinkedIn",
          "Email campaigns — launch announcements and open house invites that drive showings",
          "Listing summaries — MLS-ready bullets that hit every key selling point",
        ],
      },
      { type: "h2", text: "Launch offer: 50% off for 3 months" },
      {
        type: "p",
        text: "To celebrate the launch, we're offering 50% off any plan for your first 3 months. Use code LAUNCH50 at checkout.",
      },
      {
        type: "tip",
        title: "Launch pricing",
        text: "Starter: ~$14.50/mo | Pro: ~$39.50/mo | Team: ~$99.50/mo for your first 3 months with code LAUNCH50. Cancel anytime.",
      },
      { type: "h2", text: "What's next" },
      {
        type: "p",
        text: "This launch is just the beginning. We're actively building based on agent feedback — MLS integrations, branded template libraries, and Team plan analytics are all on the roadmap. If you're an agent listing 10+ properties a year, I'd love your feedback on Product Hunt.",
      },
      {
        type: "p",
        text: "Try it free at relevatelistingassistant.ctonew.app/signup — no credit card required. Your first listing takes less than 60 seconds.",
      },
    ],
  },
  {
    slug: "the-3-second-open-house-flyer",
    title: "The 3-Second Flyer: What Makes an Open House Flyer Worth Keeping (and What Gets It Recycled)",
    excerpt:
      "Your open house flyer has one job, and it's not to sell the house — the buyer is already in the driveway. Here's what earns the walk-through in three seconds, and what gets recycled.",
    date: "2026-09-04",
    readTime: "6 min read",
    category: "Flyer Design",
    tags: ["open house flyer", "flyer design", "real estate marketing", "open house tips"],
    content: [
      {
        type: "p",
        text: "Your open house flyer has one job, and it's not to sell the house — the buyer is already standing in the driveway. In the three seconds before they decide to fold it into their pocket or drop it in the recycling bin, it has to earn the walk-through and make you look worth calling. Most flyers fail both. Here's the fix.",
      },
      { type: "h2", text: "The flyer's real job" },
      {
        type: "p",
        text: "A flyer that only describes the house is doing a third of its job. Every open house flyer actually serves three audiences at once.",
      },
      {
        type: "ul",
        items: [
          "The buyer who drove by — they saw the sign, pulled over, and walked in on impulse. The flyer is their take-home memory of the house: the thing on the kitchen counter that decides whether they call you Monday or forget the address by Sunday night.",
          "The neighbor who's curious about their own home value — neighbors show up to every open house, and they're not buying, they're benchmarking. A sharp, professional flyer tells them exactly who to call when it's their turn to list. Some of your best future listings start as a neighbor holding your flyer.",
          "Your brand — long after the details fade, the flyer is the physical artifact of how you market homes. Clean hierarchy, great photography, and a clear call to action win listing appointments. Flimsy layout and blurry photos lose them.",
        ],
      },
      {
        type: "p",
        text: "So the flyer isn't selling the house. It's selling the walk-through — and you.",
      },
      { type: "h2", text: "The 3-second test" },
      {
        type: "p",
        text: "Here's a reader's exercise, not a statistic: pull out your current flyer, cover it, and uncover it for three seconds. Now look away. What do you remember?",
      },
      {
        type: "p",
        text: "If the answer is the price and the one standout feature — the wraparound porch, the renovated kitchen, the half-acre lot — your hierarchy works. If what stuck was a wall of text, four same-sized photos, or a headline that says “Welcome Home!”, the hierarchy is broken.",
      },
      {
        type: "p",
        text: "Three elements carry the whole pitch in those three seconds: the headline, the hero photo, and the price band. Everything else is supporting detail for the people who decide to keep reading. Design accordingly — one dominant photo instead of a collage, one headline that names the standout feature instead of a greeting, and a price that's impossible to miss. Buyers don't read flyers. They glance, they sort, they keep or they recycle. Win the glance and you earn the read.",
      },
      { type: "h2", text: "The six facts every flyer must carry" },
      {
        type: "p",
        text: "Before anything decorative, make sure the essentials are all there. Every kept flyer answers these six questions.",
      },
      {
        type: "ol",
        items: [
          "Price — prominent, unmissable, no “call for price” games.",
          "Beds, baths, and square footage — the three numbers every buyer filters on.",
          "The one standout feature — not twelve features, the one that makes this house memorable.",
          "Date and time — if it's an open house flyer, the event details need to survive a glance.",
          "Agent name and phone number — the whole point is the call. Make it easy.",
          "A QR code or short link — the bridge to the full listing, the photo gallery, or your contact card.",
        ],
      },
      {
        type: "p",
        text: "Missing any one of these is a missed walk-in or a missed call. Run your current flyer against this list before your next open house — most flyers fail at least one.",
      },
      { type: "h2", text: "Five mistakes that get flyers recycled" },
      {
        type: "ul",
        items: [
          "The vague headline — “Welcome Home!” and “Charming 3-Bed!” describe ten thousand houses. A headline should name the standout: “Wraparound Porch on Half an Acre” gives a buyer a reason to walk inside. Generic headlines give them a reason to recycle.",
          "The photo collage with no hierarchy — four equal-sized photos competing for attention means none of them wins. One hero photo does more work than a grid of thumbnails. Pick the single strongest image and let it dominate.",
          "The wall of text — paragraphs belong in the MLS description, not on a single-page flyer. If your flyer has more sentences than a postcard, buyers won't read any of them. Short lines, bullet highlights, breathing room.",
          "Missing logistics — a beautiful flyer with no open house date, no address clarity, or no agent phone number is a dead end. The buyer is interested and has nowhere to go. Every flyer should make the next step obvious.",
          "No call to action — “Schedule your private showing” or “Scan for the full gallery.” Tell the reader what to do. Flyers without a CTA assume motivation that a three-second glance hasn't built yet.",
        ],
      },
      { type: "h2", text: "Print realities agents forget" },
      {
        type: "p",
        text: "What looks crisp on your laptop can fall apart on paper, and most flyer advice lives entirely on screens. A few realities worth knowing.",
      },
      {
        type: "ul",
        items: [
          "Low-resolution photos turn muddy in print — a photo that looks fine at phone size can go soft and grainy on an 8.5×11 sheet. Start from the highest-resolution originals you have.",
          "Paper weight is part of the message — a thin, flimsy sheet feels cheap at the door no matter how good the design is. Stepping up the stock is one of the cheapest brand upgrades in the business.",
          "Home printers crop full-bleed designs — if agents or buyers print your flyer at home, edge-to-edge designs lose their margins. Keep critical text and logos comfortably inside the page.",
          "Contrast is what keeps a flyer readable on a sunny kitchen counter — light text over a bright photo washes out; dark text over a dark photo disappears. The fix is photo-adaptive contrast: dark text on light photos, light text on dark ones, with a soft wash behind the words when the photo needs it.",
        ],
      },
      {
        type: "p",
        text: "This is the unglamorous craft that separates a keeper from recycling-bin filler. No hype — just print knowledge that almost nobody writes down.",
      },
      { type: "h2", text: "The 30-minute flyer workflow" },
      {
        type: "p",
        text: "Here's where AI genuinely fits, honestly framed: the slow parts of flyer-making are drafting the copy and laying out a clean design. Those now take minutes. The judgment parts — picking the hero photo, sharpening the headline, catching the wrong bed count — are still yours, and they always will be.",
      },
      {
        type: "p",
        text: "A realistic workflow: enter the listing details once, let AI draft the copy and lay out a designed flyer, then spend your time where it counts — choosing the photo that sells, editing the headline until it names the standout, and proofing the six facts. Print on decent stock. Done in about thirty minutes. The agent's eye is the quality control. AI just clears the blank page so your eye gets to work faster.",
      },
      { type: "h2", text: "The flyer checklist" },
      {
        type: "p",
        text: "Run your current flyer through this before your next open house. Every “no” is a fix worth making.",
      },
      {
        type: "ul",
        items: [
          "Headline names the standout feature, not a greeting",
          "One dominant hero photo (no competing collage)",
          "Price is prominent and unmissable",
          "Beds, baths, and square footage all present",
          "Date and time included (for open house flyers)",
          "Agent name and phone number easy to find",
          "QR code or short link to the full listing",
          "Clear call to action telling the reader what to do next",
          "Text readable over every photo (contrast checked)",
          "Proofread: address, price, bed/bath count all correct",
        ],
      },
      {
        type: "p",
        text: "Ten yeses, and your flyer earns the pocket instead of the recycling bin. Design a flyer that earns the walk-through — try Relevate free at relevatelistingassistant.ctonew.app/signup and generate your first listing's full marketing kit in under a minute.",
      },
    ],
  },
  {
    slug: "same-listing-five-ways-tone-demo",
    title: "We Ran the Same Listing 5 Ways: What Tone Actually Does to Your Copy",
    excerpt:
      "One fictional 3-bed craftsman, five tones — luxury, modern, cozy, professional, casual. Same facts in, wildly different first impressions out. Here's what tone really is: targeting.",
    date: "2026-09-04",
    readTime: "4 min read",
    category: "Listing Copy",
    tags: ["listing description", "copywriting", "AI tones", "demo"],
    content: [
      {
        type: "p",
        text: "Here's a small experiment you can try in about two minutes. Take one listing — the sample below is a made-up 3-bed craftsman we invented purely for demo purposes — and generate the description in five different tones. Relevate offers five built-in tones: luxury, modern, cozy, professional, and casual. Same facts in, wildly different first impressions out. Watch what changes, what doesn't, and which one you'd actually send to your buyer list.",
      },
      { type: "h2", text: "The sample listing (demo only)" },
      {
        type: "p",
        text: "To keep this honest: the property below is fictional, written just to show how tone works. The details are deliberately ordinary — 3 beds, 2 baths, 1,850 sq ft, wraparound porch, renovated kitchen, half-acre lot, $485,000 — because ordinary listings are where tone does the most work.",
      },
      { type: "h3", text: "1. Professional" },
      {
        type: "p",
        text: "“Well-maintained 3-bedroom, 2-bath craftsman offering 1,850 sq ft of updated living space on a half-acre lot. The renovated kitchen features quartz counters and stainless appliances; the wraparound porch and fenced yard add everyday versatility. Offered at $485,000 — schedule your showing today.” Clear, confident, factual. This is the default for a reason: it works for almost any buyer and almost any price point. If you only ever use one tone, make it this one.",
      },
      { type: "h3", text: "2. Luxury" },
      {
        type: "p",
        text: "“Behind mature maples, a meticulously reimagined craftsman unfolds across 1,850 square feet of refined living. The chef-caliber kitchen pairs quartz surfaces with stainless precision, while the wraparound porch frames half an acre of rare privacy. Offered at $485,000 — an appointment is strongly advised.” Same facts, elevated diction. Notice how luxury tone doesn't add features — it adds weight to the features. Save it for homes where the finish level backs up the language, or the gap between copy and reality will read as hype.",
      },
      { type: "h3", text: "3. Modern" },
      {
        type: "p",
        text: "“Clean lines, smart updates, zero wasted space. This 1,850 sq ft craftsman pairs a renovated kitchen — quartz, stainless, done right — with a half-acre lot and a wraparound porch built for slow evenings. At $485,000, it's turnkey and ready for what's next.” Short sentences, forward energy, no ornament. Modern tone works best on updated homes and younger buyer pools — anywhere “fresh and move-in ready” is the actual pitch.",
      },
      { type: "h3", text: "4. Cozy" },
      {
        type: "p",
        text: "“Some houses just feel like home from the first step onto the porch. This 3-bed, 2-bath craftsman wraps 1,850 sq ft of warmth around a renovated kitchen made for slow weekend breakfasts — plus a half-acre yard with room for the dog, the garden, and the hammock. Yours for $485,000.” Warmth-first: feelings before facts, “home” before “house.” Cozy tone earns its keep on starter homes, family neighborhoods, and anywhere the buyer is imagining their life, not their investment return.",
      },
      { type: "h3", text: "5. Casual" },
      {
        type: "p",
        text: "“Okay, the porch alone is worth the tour — wraparound, shady, built for lemonade weather. Inside: 3 beds, 2 baths, 1,850 sq ft with a renovated kitchen you'll actually want to cook in, all on half an acre. $485,000 and move-in ready. Come see it this weekend?” Conversational, relaxed, a little playful. Casual tone fits social posts and email campaigns especially well — anywhere the buyer relationship already feels personal rather than formal.",
      },
      { type: "h2", text: "What actually changed (and what didn't)" },
      {
        type: "p",
        text: "The facts never moved: 3 beds, 2 baths, 1,850 sq ft, porch, kitchen, half-acre, $485,000. What changed was the buyer each version is talking to — the investor-minded reader gets professional, the aspirational reader gets luxury, the young family gets cozy.",
      },
      {
        type: "p",
        text: "That's the real lesson: tone isn't decoration, it's targeting. Match the tone to the buyer, not to your mood that morning. A luxury estate in cozy tone undersells it; a starter home in luxury tone oversells it. The wrong tone doesn't just sound off — it attracts the wrong showing requests. Try all five tones on your own listing — start free with Relevate at relevatelistingassistant.ctonew.app/signup and generate your first description in under a minute.",
      },
    ],
  },
  {
    slug: "listing-photos-captions-agents-get-wrong",
    title: "What Agents Get Wrong About Listing Photos (and the Captions That Fix Them)",
    excerpt:
      "Photos sell the listing — but photos plus the words attached to them sell it twice. Five mistakes agents make with listing photos and captions, and the checklist that fixes them.",
    date: "2026-09-04",
    readTime: "4 min read",
    category: "Visual Marketing",
    tags: ["listing photos", "photo captions", "real estate marketing"],
    content: [
      {
        type: "p",
        text: "Everyone knows photos sell the listing. What fewer agents think about is that photos plus the words attached to them sell it twice — the gallery caption, the flyer highlight, the social post that carries a single image out into the world. Here's where that pairing usually goes wrong, and how to fix it.",
      },
      { type: "h2", text: "Mistake 1: Letting great photos carry blank captions" },
      {
        type: "p",
        text: "“Living room.” “Kitchen.” “Backyard.” These captions describe what the buyer can already see, adding exactly zero information. Every caption is a chance to add what the photo can't show: the southern exposure that floods the room until 4 PM, the quartz counters installed last spring, the half-acre lot that backs to greenbelt.",
      },
      {
        type: "tip",
        title: "Rule of thumb",
        text: "If the caption works on any photo of any room, it works on none of them. Name the specific, unseeable fact.",
      },
      { type: "h2", text: "Mistake 2: Leading with your weakest room" },
      {
        type: "p",
        text: "Galleries get ordered the way photos come off the camera — exterior, living room, kitchen, bedrooms, and eventually the blurry hallway shot nobody meant to upload. But buyers decide in the first three images whether to keep scrolling. Open with the single strongest photo you have — golden-hour exterior, renovated kitchen, the view — and cut anything that weakens the sequence. Ten great photos beat twenty mixed ones.",
      },
      { type: "h2", text: "Mistake 3: Uploading photos and writing copy separately" },
      {
        type: "p",
        text: "The usual workflow: photos go to the MLS, copy gets written from memory at a desk later. The result is generic descriptions that miss the home's best visual details — the arched doorway, the reading nook under the stairs, the tile work — because the writer wasn't looking at them.",
      },
      {
        type: "p",
        text: "This is the workflow problem worth fixing. Relevate's property-photo workflow lets agents upload listing photos alongside the details, analyzes the images, and weaves what it actually sees into the generated copy. The description mentions the wraparound porch because the porch is in the photo, not because someone remembered to type it. Photos in, photo-aware copy out — one workflow instead of two disconnected ones.",
      },
      { type: "h2", text: "Mistake 4: Using the same caption everywhere" },
      {
        type: "p",
        text: "The MLS caption, the flyer highlight, and the Instagram caption have different jobs. MLS rewards searchable specifics (“renovated kitchen, quartz counters, stainless appliances”). Flyers need the single standout line. Social needs voice and a hook. Write the fact once, then reshape it for the channel — or generate all three variants from the same input and pick.",
      },
      { type: "h2", text: "Mistake 5: Forgetting the human in the frame" },
      {
        type: "p",
        text: "Photos show rooms; captions should hint at life. “Wraparound porch” is a feature. “Sunday coffee on the wraparound porch” is a morning routine the buyer can already feel. You don't need lifestyle fluff in every line — one or two human moments per listing is enough to turn square footage into a place someone wants to live.",
      },
      { type: "h2", text: "The photo-caption checklist" },
      {
        type: "ul",
        items: [
          "Every caption adds an unseeable fact, not a room label",
          "Gallery opens with the single strongest image",
          "Weak or duplicate photos cut, not kept out of guilt",
          "Copy written with the photos visible (or photo-aware tooling)",
          "Captions reshaped per channel: MLS, flyer, social",
          "At least one “life moment” line per listing",
        ],
      },
      {
        type: "p",
        text: "Fix the pairing and the photos you already pay for start working twice as hard. Upload your listing photos and get photo-aware copy in seconds — try Relevate free at relevatelistingassistant.ctonew.app/signup and generate your first listing's full kit in under a minute.",
      },
    ],
  },
];



export function getAllPosts(): BlogPost[] {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
