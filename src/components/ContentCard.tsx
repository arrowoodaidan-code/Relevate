import { useState, useCallback } from "react";
import { cn } from "~/lib/utils";

interface ContentCardProps {
  title: string;
  content: string;
  contentType?: string;
  onRegenerate?: () => void;
  className?: string;
  color?: "emerald" | "amber" | "teal" | "stone" | "lime";
}

const colorMap = {
  emerald: "border-l-emerald-600",
  amber: "border-l-amber-600",
  teal: "border-l-teal-600",
  stone: "border-l-stone-500",
  lime: "border-l-lime-600",
};

const bgMap = {
  emerald: "bg-emerald-900/10",
  amber: "bg-amber-900/10",
  teal: "bg-teal-900/10",
  stone: "bg-stone-800/10",
  lime: "bg-lime-900/10",
};

export function ContentCard({
  title,
  content,
  contentType,
  onRegenerate,
  className,
  color = "emerald",
}: ContentCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, title]);

  return (
    <div
      className={cn(
        "group rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-5 shadow-sm transition-all duration-300 hover:border-emerald-600/40 hover:shadow-lg",
        "border-l-4",
        colorMap[color],
        bgMap[color],
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-emerald-100">{title}</h3>
          {contentType && (
            <span className="badge-shimmer rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300/80">
              {contentType}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 max-h-60 overflow-y-auto rounded-lg bg-[#050f05]/60 p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-emerald-200/80">{content}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-emerald-800/40 px-3.5 py-2 text-xs font-medium text-emerald-300/70 transition-all duration-300 hover:border-emerald-600/50 hover:bg-emerald-900/20 hover:text-emerald-100"
        >
          {copied ? "Copied!" : "Copy"}
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg border border-emerald-800/40 px-3.5 py-2 text-xs font-medium text-emerald-300/70 transition-all duration-300 hover:border-emerald-600/50 hover:bg-emerald-900/20 hover:text-emerald-100"
        >
          Download
        </button>

        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="ml-auto rounded-lg wood-button-dark px-3.5 py-2 text-xs font-medium text-emerald-200/80"
          >
            Regenerate
          </button>
        )}
      </div>
    </div>
  );
}