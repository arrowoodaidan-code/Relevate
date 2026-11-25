/**
 * The three legal-page links every public footer carries, next to the
 * compliance scope line: Terms of Service, Privacy Policy, and Compliance &
 * Legal Notices.
 *
 * Rendered beside <ComplianceScopeLine /> in each footer so the links cannot
 * drift between pages. A link added here must point at a page that exists —
 * a footer link that 404s is the defect this fixes.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-emerald-300/40 ${className}`.trim()}
    >
      <a href="/terms" className="transition hover:text-emerald-100">
        Terms of Service
      </a>
      <a href="/privacy" className="transition hover:text-emerald-100">
        Privacy Policy
      </a>
      <a href="/legal" className="transition hover:text-emerald-100">
        Compliance &amp; Legal Notices
      </a>
    </nav>
  );
}
