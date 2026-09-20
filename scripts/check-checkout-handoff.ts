/**
 * Gate: no checkout CTA may silently move a buyer to another hostname.
 *
 * Run: bun scripts/check-checkout-handoff.ts   (exit 0 = pass, 1 = fail)
 *
 * Checks (static, no network):
 *  1. src/lib/product-checkout.ts contains no assignment of a literal/cross-host URL to
 *     window.location — i.e. the old `window.location.href = CANONICAL_PRODUCT_URL` silent
 *     redirect cannot come back.
 *  2. The module takes its plan keys from src/lib/price-keys.ts (single source of truth) and
 *     does not carry its own copy of the six keys.
 *  3. Every startCheckout call site handles the `handoff` outcome.
 *  4. The confirmation component names the destination host to the visitor.
 */
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const failures: string[] = [];
const notes: string[] = [];
function check(ok: boolean, label: string) {
  (ok ? notes : failures).push(`${ok ? "OK  " : "FAIL"} ${label}`);
}

const checkout = read("src/lib/product-checkout.ts");
const pricing = read("src/routes/pricing.tsx");
const home = read("src/routes/index.tsx");
const dialog = read("src/components/CheckoutHandoffDialog.tsx");

/* 1. No silent cross-host navigation. */
const locationAssignments = [...checkout.matchAll(/window\.location\.(?:href\s*=|assign\()([^;]*)/g)].map(
  (m) => m[1].trim(),
);
check(
  locationAssignments.length > 0,
  "product-checkout.ts still performs the real in-place navigation",
);
const suspicious = locationAssignments.filter(
  (rhs) => /CANONICAL_PRODUCT_URL|https?:\/\//.test(rhs),
);
check(
  suspicious.length === 0,
  "product-checkout.ts never assigns a cross-host URL to window.location" +
    (suspicious.length ? ` (found: ${suspicious.join(" | ")})` : ""),
);
check(
  !/window\.location\.href\s*=\s*`/.test(checkout),
  "product-checkout.ts has no template-literal redirect to a product URL",
);

/* 2. Price keys come from price-keys.ts only. */
check(
  /from\s+["']\.\/price-keys["']/.test(checkout),
  "product-checkout.ts imports its plan keys from ./price-keys (single source of truth)",
);
check(
  !/starter_monthly|pro_annual|team_annual/.test(checkout),
  "product-checkout.ts carries no hard-coded plan key of its own",
);

/* 3. Call sites handle the handoff outcome. */
for (const [name, src] of [
  ["src/routes/pricing.tsx", pricing],
  ["src/routes/index.tsx", home],
] as const) {
  check(
    /outcome === "handoff"/.test(src),
    `${name} renders the explicit handoff when the host cannot take a payment`,
  );
  check(
    /CheckoutHandoffDialog/.test(src),
    `${name} includes the confirmation component`,
  );
}

/* 4. The visitor is told the destination host, and nothing is claimed about payment. */
check(
  /\{handoff\.host\}/.test(dialog),
  "the confirmation names the destination host to the visitor",
);
check(
  /Nothing has been charged/.test(dialog),
  "the confirmation states that nothing has been charged",
);
check(
  !/guarantee|secure\[|100% safe/i.test(dialog),
  "the confirmation makes no guarantee claim about the other host",
);

/* 5. The Vercel host alias is declared in exactly one place. */
const aliasHits = [checkout, pricing, home, dialog].filter((s) => /site-gray-five-32/.test(s));
check(
  aliasHits.length === 1 && aliasHits[0] === checkout,
  "the product host alias lives only in src/lib/product-checkout.ts",
);

console.log(notes.join("\n"));
if (failures.length > 0) {
  console.log(failures.join("\n"));
  console.error(`\ncheck-checkout-handoff: ${failures.length} check(s) FAILED`);
  process.exit(1);
}
console.log(`\ncheck-checkout-handoff: all ${notes.length} checks passed`);
