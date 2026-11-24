// Simulates the failure shapes the host can send and asserts what the client
// shows the agent. Run with: bun scripts/verify-api-response.ts
// Covers the live-diagnostic defect (plain-text 503 → parser error on screen)
// and the guard the fix must not regress (402 trial-ended upgrade prompt).
import { readApiResponse } from "../src/lib/api-response";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`PASS ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const WARMING = "The service is warming up — please try again in a moment.";

// 1. The exact live defect: plain-text 503, the body res.json() used to choke on.
const r503 = await readApiResponse(
  new Response("Upstream unavailable", { status: 503 }),
);
check("503 plain-text -> not ok", r503.ok, false);
check("503 plain-text -> friendly copy, no parser error", r503.message, WARMING);
check("503 plain-text -> no data", r503.data, null);

// 2. The paywall: 402 with a valid JSON envelope must keep its upgrade prompt.
const body402 = {
  success: false,
  code: "TRIAL_ENDED",
  error: "Your 14-day trial has ended. Upgrade to keep generating.",
  upgrade: { url: "https://buy.stripe.com/example", label: "Upgrade to Starter" },
};
const r402 = await readApiResponse(
  new Response(JSON.stringify(body402), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  }),
);
check("402 trial-ended -> not ok", r402.ok, false);
check("402 trial-ended -> server's own error copy", r402.message, body402.error);
check(
  "402 trial-ended -> upgrade prompt data intact",
  (r402.data as any)?.upgrade?.url,
  body402.upgrade.url,
);
check("402 trial-ended -> code readable", (r402.data as any)?.code, "TRIAL_ENDED");

// 3. Success envelope unchanged.
const r200 = await readApiResponse(
  new Response(JSON.stringify({ success: true, data: { content: "A charming 3-bed…" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }),
);
check("200 success -> ok", r200.ok, true);
check("200 success -> content readable", (r200.data as any)?.data?.content, "A charming 3-bed…");
check("200 success -> no message", r200.message, "");

// 4. Other 5xx (plain text or JSON) -> our side-failure copy.
const r500 = await readApiResponse(new Response("boom", { status: 500 }));
check("500 plain-text -> side-failure copy", r500.message, "Something went wrong on our side. Please try again.");
const r502json = await readApiResponse(
  new Response(JSON.stringify({ error: "Bad gateway details" }), { status: 502 }),
);
check("502 json -> side-failure copy (server text not shown)", r502json.message, "Something went wrong on our side. Please try again.");

// 5. 4xx with the server's JSON error -> server's copy.
const r400 = await readApiResponse(
  new Response(JSON.stringify({ success: false, error: "Email is required" }), { status: 400 }),
);
check("400 json error -> server copy", r400.message, "Email is required");

// 6. 4xx with a non-JSON body -> generic copy, never raw text.
const r400text = await readApiResponse(new Response("Bad Request", { status: 400 }));
check("400 plain-text -> generic copy", r400text.message, "Something went wrong. Please try again.");

// 7. 200 with a non-JSON body (defensive) -> not ok, generic copy.
const r200text = await readApiResponse(new Response("OK-ish", { status: 200 }));
check("200 non-json -> not ok", r200text.ok, false);
check("200 non-json -> generic copy", r200text.message, "Something went wrong. Please try again.");

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`);
}
console.log("ALL-CHECKS-PASSED");
