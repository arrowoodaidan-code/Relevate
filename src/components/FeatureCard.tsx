import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
  variant?: "default" | "compact" | "centered";
}

export function FeatureCard({
  icon,
  title,
  description,
  className,
  variant = "default",
}: FeatureCardProps) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "group flex items-start gap-4 rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-5 shadow-sm transition-all duration-300 hover:border-emerald-600/40 hover:shadow-lg card-tilt",
          className,
        )}
      >
        <div className="icon-bounce-hover flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 text-emerald-400 shadow-sm transition-all duration-300">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-100">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-emerald-300/60">{description}</p>
        </div>
      </div>
    );
  }

  if (variant === "centered") {
    return (
      <div
        className={cn(
          "group rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-8 text-center shadow-sm transition-all duration-300 hover:border-emerald-600/40 hover:shadow-lg card-tilt",
          className,
        )}
      >
        <div className="icon-bounce-hover mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 text-emerald-400 shadow-sm transition-all duration-300">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-emerald-100">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-emerald-300/60">{description}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-6 shadow-sm transition-all duration-300 hover:border-emerald-600/40 hover:shadow-lg card-tilt animate-fade-in-up opacity-0",
        className,
      )}
      style={{ animationFillMode: "forwards" }}
    >
      <div className="icon-bounce-hover mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-900/60 to-emerald-950/60 text-emerald-400 shadow-sm transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-emerald-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-emerald-300/60">{description}</p>
    </div>
  );
}