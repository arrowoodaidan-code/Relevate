#!/usr/bin/env bash
#
# Relevate preflight gate — run BEFORE any publish (publish_site / per-host
# deploy), from the tree that is about to be published, and before opening a
# PR that touches src/.
#
# Fails loudly on the failure classes that have actually broken main:
#   1. dirty git tree — uncommitted edits in the deploy tree get swept into
#      other people's commits (how the duplicate EHO_LEGEND/REALTOR_MARK
#      declarations reached main on 2026-09-17);
#   2. NEW TypeScript errors vs the committed baseline scripts/tsc-baseline.txt
#      (counts per file + error code); duplicate-declaration errors
#      (TS2300/TS2323/TS2451) are never baselined and always fail;
#   3. duplicate top-level declarations in src/ (esbuild "symbol X has already
#      been declared" class) — scripts/check-duplicate-declarations.ts;
#   4. a failing production build (`bun run build`);
#   5. any vendor analytics connection reappearing — scripts/check-no-vendor-analytics.ts
#      (PostHog removal is an owner directive; a hit must be reviewed, never shipped);
#   6. secrets in the tracked tree (a tracked .env* file or a secret-shaped value) —
#      scripts/check-no-committed-secrets.ts.
#
# On success it prints the branch + HEAD sha it validated, so the publish that
# follows is traceable to an exact commit.
#
# Usage:
#   bash scripts/preflight.sh                    # full gate
#   bash scripts/preflight.sh --update-baseline  # maintenance: regenerate the
#                                                # tsc baseline after an
#                                                # intentional refactor
#
# Requirements: bun + git on PATH, node_modules installed (`bun install`).
set -uo pipefail

# TSC_BASELINE=<path> overrides the baseline location (testing/multi-tree use).
BASELINE="${TSC_BASELINE:-scripts/tsc-baseline.txt}"
UPDATE_BASELINE=0
[ "${1:-}" = "--update-baseline" ] && UPDATE_BASELINE=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { echo "FATAL: cannot cd to repo root"; exit 2; }

FAILED=0
FAILED_CHECKS=()
note_fail() {
  FAILED=1
  FAILED_CHECKS+=("$1")
  echo "!! FAIL: $1"
}

echo "=============================================================="
echo " Relevate preflight gate — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=============================================================="

command -v bun >/dev/null 2>&1 || { echo "FATAL: bun not on PATH"; exit 2; }
command -v git >/dev/null 2>&1 || { echo "FATAL: git not on PATH"; exit 2; }

echo
echo "--- 1/6 Tree identity ---"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || {
  echo "FATAL: not a git repository"
  exit 2
}
SHA="$(git rev-parse HEAD)"
echo "branch: $BRANCH"
echo "HEAD:   $SHA"
if [ "$BRANCH" != "main" ]; then
  echo "NOTE: not on main — publishes must happen from main (WORKFLOW.md)."
fi

echo
echo "--- 2/6 Clean working tree ---"
PORCELAIN="$(git status --porcelain)"
if [ -n "$PORCELAIN" ]; then
  echo "$PORCELAIN"
  note_fail "working tree is dirty — commit or remove every entry above (including untracked files; 'git add -A' sweeps those too). Refusing to gate a tree that is not what a publish would ship."
else
  echo "clean"
fi

echo
echo "--- 3/6 Dependencies ---"
if [ -d node_modules ]; then
  echo "node_modules present"
else
  note_fail "node_modules missing — run 'bun install' first (a gate without real dependencies proves nothing)"
fi

echo
echo "--- 4/6 Typecheck vs baseline ($BASELINE) ---"
TSC_LOG="$(mktemp)"
CUR="$(mktemp)"
DIFF_LOG="$(mktemp)"
trap 'rm -f "$TSC_LOG" "$CUR" "$DIFF_LOG"' EXIT

bunx tsc --noEmit >"$TSC_LOG" 2>&1

# Duplicate declarations must NEVER be absorbed by the baseline.
if grep -qE 'error TS(2300|2323|2451)\b' "$TSC_LOG"; then
  grep -E 'error TS(2300|2323|2451)\b' "$TSC_LOG"
  note_fail "duplicate-declaration TypeScript errors present — these must never be baselined (this exact class broke main on 2026-09-17)"
fi

# Normalize "path(line,col): error TSxxxx: message" -> counts per "path TSxxxx".
grep -oE '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+' "$TSC_LOG" \
  | sed -E 's/\([0-9]+,[0-9]+\): error / /' \
  | sort | uniq -c | awk '{print $2, $3, $1}' | sort -k1,1 -k2,2 > "$CUR"

if [ "$UPDATE_BASELINE" -eq 1 ]; then
  if [ "$FAILED" -ne 0 ]; then
    echo "refusing to update baseline while earlier checks failed"
  else
    cp "$CUR" "$BASELINE"
    echo "baseline updated ($BASELINE):"
    cat "$BASELINE"
  fi
  trap - EXIT
  rm -f "$TSC_LOG" "$CUR" "$DIFF_LOG"
  [ "$FAILED" -eq 0 ] || exit 1
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  note_fail "missing $BASELINE — generate it with: bash scripts/preflight.sh --update-baseline"
else
  # NEW = a file+code pair not in the baseline, or a higher count than baselined.
  # IMPROVED = fewer than baselined (fine; reported, not failed).
  # FILENAME comparison (not NR==FNR) so an EMPTY baseline file still compares —
  # with NR==FNR an empty first file makes every current line look like baseline.
  awk -v baseline_file="$BASELINE" '
    FILENAME == baseline_file { base[$1" "$2] = $3; next }
    {
      k = $1" "$2
      if (!(k in base))            { print "  NEW:       " $0; new_errs = 1 }
      else if ($3 > base[k])       { print "  INCREASED: " $0 " (baseline " base[k] ")"; new_errs = 1 }
      else if ($3 < base[k])       { print "  improved:  " k " " base[k] " -> " $3 }
    }
    END { exit new_errs ? 1 : 0 }
  ' "$BASELINE" "$CUR" > "$DIFF_LOG"
  if [ $? -ne 0 ]; then
    cat "$DIFF_LOG"
    note_fail "new TypeScript errors vs baseline (see NEW/INCREASED above)"
  else
    TOTAL="$(awk '{s+=$3} END{print s+0}' "$CUR")"
    if [ "$TOTAL" -eq 0 ]; then
      echo "0 TypeScript errors — below baseline, nothing new"
    else
      cat "$DIFF_LOG"
      echo "typecheck matches baseline ($TOTAL known error(s), nothing new)"
    fi
  fi
fi

echo
echo "--- 5/6 Production build ---"
if bun run build; then
  echo "build OK"
else
  note_fail "bun run build failed"
fi

echo
echo "--- 6/6 No vendor analytics / no committed secrets ---"
# Both gates decide their own pass/fail and print their own findings; preflight
# only records the outcome so a single run covers every publish-blocking class.
if bun scripts/check-no-vendor-analytics.ts; then
  echo "vendor-analytics gate OK"
else
  note_fail "vendor analytics connection detected (check output above) — PostHog removal is an owner directive; a hit needs a reviewed decision, not a silent publish"
fi
if bun scripts/check-no-committed-secrets.ts; then
  echo "committed-secrets gate OK"
else
  note_fail "tracked .env file or secret-shaped value detected (check output above) — remove it from the tracked tree and rotate the credential"
fi

echo
echo "=============================================================="
if [ "$FAILED" -ne 0 ]; then
  printf 'PREFLIGHT FAILED (%s):\n' "${#FAILED_CHECKS[@]}"
  for c in "${FAILED_CHECKS[@]}"; do echo "  - $c"; done
  echo "Do NOT publish. Fix the failures above on a clean tree, then re-run."
  echo "=============================================================="
  exit 1
fi
echo "PREFLIGHT PASSED — $SHA on $BRANCH is safe to publish."
echo "=============================================================="
exit 0
