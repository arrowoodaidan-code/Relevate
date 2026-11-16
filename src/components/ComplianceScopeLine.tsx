/**
 * The site's single statement of compliance scope.
 *
 * Scope is deliberately narrow: federal law plus South Carolina, and nothing
 * else. The rule text the product shows is quoted from the sources it cites,
 * and the in-app checklist flags the items a listing is missing. It is a
 * research aid, never legal advice, and it never certifies compliance.
 *
 * Every public footer renders this one component so the wording cannot drift
 * between pages, and so the reel captions can quote it verbatim.
 *
 * Do not add a jurisdiction we do not cover, a rule count, a statistic, or any
 * wording that implies the output is legally cleared.
 */
export function ComplianceScopeLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-emerald-300/40 ${className}`.trim()}>
      Relevate&apos;s compliance checks cover federal law and South Carolina only. Rule text is quoted from
      the sources it cites, and the items a listing is missing are flagged — a research aid, not legal
      advice. Relevate never certifies compliance.
    </p>
  );
}
