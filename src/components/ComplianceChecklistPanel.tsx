import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADVERTISING_RULES,
  ADVERTISING_RULES_META,
  COMPLIANCE_PANEL_DISCLAIMERS,
  FORMAT_LABEL,
  buildChecklist,
  jurisdictionLabel,
  ruleCondition,
  ruleSummary,
  type AdvertisingRule,
  type ChecklistGroupId,
  type DesignSurfaceKind,
} from "~/lib/advertising-rules";

/**
 * Advertising-compliance checklist panel for the custom design editor.
 * ====================================================================
 * Sits directly above the design canvas (see src/routes/app.tsx, "Design from
 * scratch") so the agent can work down the list while they build the graphic.
 *
 * EVERYTHING here is driven by data in ~/lib/advertising-rules.ts — which is a
 * verbatim copy of the compliance researcher's advertising-rules.json. Groups,
 * ordering, counts, jurisdiction labels, conditions, sources and dates all come
 * from the data, so adding a rule to that file shows up here with no UI change.
 *
 * HONESTY RULES THIS COMPONENT ENFORCES
 *  1. No verdicts. There is no pass/fail, no "compliant" state, no green check
 *     and no auto-claim. A tick is the agent's own note, nothing more.
 *  2. `confidence: "unverified"` rules are grouped separately under "Not yet
 *     verified — confirm with your broker" and are labelled per item. They are
 *     never presented as hard requirements.
 *  3. Rules that only apply to another format (e.g. social-only targeting rules
 *     while designing a flyer) are listed separately, marked as not applying to
 *     this format — never shown as a requirement for it.
 *  4. Conditional rules show their condition alongside the bullet.
 *  5. Rule text is quoted, not rewritten. Bullets are faithful compressions and
 *     the full verbatim requirement is one click away.
 */

/** localStorage bucket — tick state is per output format (the checklist applies
 *  to a format, not to one canvas). See the note at the bottom of the panel. */
const TICKS_KEY_PREFIX = "relevate.compliance.ticks.v1:";

const unverified = (r: AdvertisingRule) => r.confidence === "unverified";

interface Props {
  /** The format the design is being made for (the editor's output preset). */
  format: DesignSurfaceKind;
  className?: string;
}

export function ComplianceChecklistPanel({ format, className }: Props) {
  const checklist = useMemo(() => buildChecklist(ADVERTISING_RULES, format), [format]);

  const [open, setOpen] = useState(true);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showOther, setShowOther] = useState(false);

  // Tick state: per format, in localStorage (the DesignDoc is a shared renderer
  // contract, so we keep product-only state out of it).
  const storageKey = TICKS_KEY_PREFIX + format;
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setTicks(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setTicks({});
    }
  }, [storageKey]);

  const setTick = useCallback(
    (ruleId: string, value: boolean) => {
      setTicks((prev) => {
        const next = { ...prev, [ruleId]: value };
        if (!value) delete next[ruleId];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* localStorage unavailable (private mode / disabled) — ticks stay in memory */
        }
        return next;
      });
    },
    [storageKey],
  );

  const clearTicks = useCallback(() => {
    setTicks({});
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const tickedCount = checklist.sections
    .flatMap((s) => s.rules)
    .filter((r) => ticks[r.id]).length;
  const shownCount = checklist.sections.reduce((n, s) => n + s.rules.length, 0);

  return (
    <section
      className={`mb-3 rounded-lg border border-emerald-700/40 bg-[#071307]/80 ${className ?? ""}`}
      aria-label="Advertising compliance checklist"
      data-compliance-panel
    >
      {/* ---- Header: always visible ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800/30 px-3 py-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <span aria-hidden>📋</span> Advertising compliance checklist
            <span className="rounded border border-emerald-700/40 bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200/80">
              research aid — not legal advice
            </span>
          </h3>
          <p className="mt-0.5 text-[11px] text-emerald-300/60" data-compliance-meta>
            {shownCount} of {checklist.totalRules} researched rules apply to this{" "}
            {FORMAT_LABEL[format]} · rules v{ADVERTISING_RULES_META.version} · researched{" "}
            {ADVERTISING_RULES_META.generated} · {tickedCount} ticked by you
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearTicks}
            disabled={tickedCount === 0}
            className="rounded border border-emerald-800/40 px-2 py-1 text-[11px] text-emerald-200/70 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear my ticks
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded border border-emerald-700/40 bg-emerald-900/40 px-2 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-800/50"
          >
            {open ? "Collapse checklist" : "Show checklist"}
          </button>
        </div>
      </div>

      {/* ---- Checklist body ---- */}
      {open && (
        <div className="max-h-[40vh] overflow-y-auto overscroll-contain px-3 py-2.5" data-compliance-body>
          {checklist.sections.map((section) => (
            <ChecklistGroup
              key={section.group.id}
              groupId={section.group.id}
              title={section.group.title}
              blurb={section.group.blurb}
              rules={section.rules}
              ticks={ticks}
              expanded={expanded}
              onToggleTick={setTick}
              onToggleDetail={(id) => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
            />
          ))}

          {/* Rules for other formats — never requirements for this one. */}
          {checklist.notForThisFormat.length > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-900/40 bg-[#050f05]/60 p-2.5">
              <button
                type="button"
                onClick={() => setShowOther((v) => !v)}
                aria-expanded={showOther}
                className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-wide text-emerald-300/50"
              >
                <span>
                  Not for this format ({checklist.notForThisFormat.length}) — other surfaces only
                </span>
                <span className="text-emerald-400/70">{showOther ? "▲" : "▼"}</span>
              </button>
              <p className="mt-1 text-[11px] text-emerald-300/45">
                These researched rules do not apply to a {FORMAT_LABEL[format]}. They are listed for
                context only and are <span className="text-emerald-200/70">not requirements for this design</span>.
              </p>
              {showOther && (
                <ul className="mt-1.5 space-y-1.5" data-compliance-other-list>
                  {checklist.notForThisFormat.map((rule) => (
                    <li key={rule.id} className="rounded border border-emerald-900/40 px-2 py-1.5">
                      <div className="text-[11px] leading-snug text-emerald-300/60">{ruleSummary(rule)}</div>
                      <div className="mt-0.5 text-[10px] text-emerald-400/40">
                        {jurisdictionLabel(rule.jurisdiction)} · surfaces: {rule.surface.join(", ")} ·{" "}
                        <span className="uppercase">{rule.id}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-snug text-emerald-300/40" data-compliance-ticks-note>
            Ticks are saved in this browser for {FORMAT_LABEL[format]} designs. {COMPLIANCE_PANEL_DISCLAIMERS.noVerdict}
          </p>
        </div>
      )}

      {/* ---- Always-visible disclaimers (shown even when collapsed) ---- */}
      <div
        className="border-t border-emerald-800/30 bg-[#050f05]/60 px-3 py-2 text-[11px] leading-snug text-emerald-300/60"
        data-compliance-disclaimers
      >
        <p>{COMPLIANCE_PANEL_DISCLAIMERS.notLegalAdvice}</p>
        <p className="mt-1">{COMPLIANCE_PANEL_DISCLAIMERS.ehoFooter}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ChecklistGroup({
  groupId,
  title,
  blurb,
  rules,
  ticks,
  expanded,
  onToggleTick,
  onToggleDetail,
}: {
  groupId: ChecklistGroupId;
  title: string;
  blurb: string;
  rules: AdvertisingRule[];
  ticks: Record<string, boolean>;
  expanded: Record<string, boolean>;
  onToggleTick: (id: string, value: boolean) => void;
  onToggleDetail: (id: string) => void;
}) {
  const tone =
    groupId === "must_appear"
      ? "border-l-emerald-500/60"
      : groupId === "must_avoid"
        ? "border-l-red-400/60"
        : groupId === "unverified"
          ? "border-l-amber-400/60"
          : "border-l-emerald-700/50";

  return (
    <div className="mb-3" data-compliance-group={groupId}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
          {title}{" "}
          <span className="font-normal text-emerald-300/50">
            ({rules.length})
          </span>
        </h4>
        <span className="text-[10px] text-emerald-400/50">{blurb}</span>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {rules.map((rule) => (
          <RuleItem
            key={rule.id}
            rule={rule}
            tone={tone}
            ticked={Boolean(ticks[rule.id])}
            open={Boolean(expanded[rule.id])}
            onToggleTick={onToggleTick}
            onToggleDetail={onToggleDetail}
          />
        ))}
      </ul>
    </div>
  );
}

function RuleItem({
  rule,
  tone,
  ticked,
  open,
  onToggleTick,
  onToggleDetail,
}: {
  rule: AdvertisingRule;
  tone: string;
  ticked: boolean;
  open: boolean;
  onToggleTick: (id: string, value: boolean) => void;
  onToggleDetail: (id: string) => void;
}) {
  const condition = ruleCondition(rule);
  const isUnverified = unverified(rule);

  return (
    <li
      className={`rounded border border-emerald-900/50 border-l-2 ${tone} bg-[#050f05]/50 px-2 py-1.5`}
      data-compliance-rule={rule.id}
      data-rule-confidence={rule.confidence}
      data-rule-type={rule.type}
      data-rule-severity={rule.severity}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => onToggleTick(rule.id, e.target.checked)}
          aria-label={`My note: ${ruleSummary(rule)}`}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-emerald-100">{ruleSummary(rule)}</p>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-emerald-800/50 bg-emerald-900/25 px-1.5 py-[1px] text-[10px] text-emerald-200/80">
              {jurisdictionLabel(rule.jurisdiction)}
            </span>
            {rule.severity === "best practice" && (
              <span className="rounded border border-emerald-800/50 px-1.5 py-[1px] text-[10px] text-emerald-300/60">
                best practice
              </span>
            )}
            {isUnverified && (
              <span
                className="rounded border border-amber-500/50 bg-amber-900/25 px-1.5 py-[1px] text-[10px] font-semibold text-amber-200"
                data-rule-unverified-badge
              >
                NOT YET VERIFIED — confirm with your broker
              </span>
            )}
            <button
              type="button"
              onClick={() => onToggleDetail(rule.id)}
              aria-expanded={open}
              className="rounded px-1 py-[1px] text-[10px] text-emerald-300/70 underline decoration-dotted hover:bg-emerald-900/40"
            >
              {open ? "Hide details" : "Details: why, source & date"}
            </button>
          </div>

          {condition && (
            <p className="mt-1 text-[10px] leading-snug text-amber-200/80" data-rule-condition={rule.id}>
              {condition}
            </p>
          )}

          {open && (
            <dl className="mt-1.5 space-y-1 border-t border-emerald-900/40 pt-1.5 text-[10px] leading-snug" data-rule-detail={rule.id}>
              <Detail label="Requirement (verbatim from the research file)" value={rule.requirement} />
              <Detail label="Why" value={rule.why} />
              <Detail label="What satisfies it" value={rule.satisfied_by} />
              <Detail label="Jurisdiction" value={`${jurisdictionLabel(rule.jurisdiction)} (${rule.jurisdiction})`} />
              <Detail
                label="Researcher confidence"
                value={
                  isUnverified
                    ? "unverified — the researcher could not confirm this from a primary source. Not a requirement; confirm with your broker."
                    : "verified against a primary source in-session"
                }
              />
              {rule.notes && <Detail label="Researcher notes" value={rule.notes} />}
              <Detail label="Surfaces in the research file" value={rule.surface.join(", ")} />
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-emerald-400/50">Source:</dt>
                <dd className="text-emerald-200/80">
                  {rule.source_url === "n/a" ? (
                    <span>no public source (n/a {isUnverified ? "— unverified" : ""})</span>
                  ) : (
                    <a
                      href={rule.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all underline decoration-dotted hover:text-emerald-100"
                    >
                      {rule.source_url}
                    </a>
                  )}
                  <span className="text-emerald-400/50"> · accessed {rule.accessed}</span>
                </dd>
              </div>
              <Detail label="Rule id" value={rule.id} />
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="shrink-0 text-emerald-400/50">{label}:</dt>
      <dd className="min-w-0 flex-1 text-emerald-200/80">{value}</dd>
    </div>
  );
}
