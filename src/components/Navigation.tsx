import { useState } from "react";
import { cn } from "~/lib/utils";
import { RelevateMark } from "./Logo";

interface NavLink {
  label: string;
  href: string;
}

interface NavigationProps {
  logo?: string;
  links?: NavLink[];
  ctaText?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
  transparent?: boolean;
}

const defaultLinks: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
];

export function Navigation({
  logo = "Relevate",
  links = defaultLinks,
  ctaText = "Schedule a Demo",
  ctaHref = "/demo",
  onCtaClick,
  className,
  transparent = false,
}: NavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all animate-fade-in-down",
        transparent
          ? "border-transparent bg-transparent"
          : "border-emerald-900/30 bg-[#0a1a0a]/95 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2 group">
          <RelevateMark className="h-8 w-8 drop-shadow-[0_0_8px_rgba(52,211,153,0.25)] transition-transform duration-300 group-hover:scale-110" />
          <span className="text-lg font-bold text-emerald-100">{logo}</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-link-leaf"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {onCtaClick ? (
          <button
            type="button"
            onClick={onCtaClick}
            className="hidden rounded-lg wood-button px-5 py-2.5 text-sm font-semibold text-emerald-100 shadow-sm md:inline-block"
          >
            {ctaText}
          </button>
        ) : (
          <a
            href={ctaHref}
            className="hidden rounded-lg wood-button px-5 py-2.5 text-sm font-semibold text-emerald-100 shadow-sm md:inline-block"
          >
            {ctaText}
          </a>
        )}

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-emerald-300/70 hover:bg-emerald-900/30 hover:text-emerald-100 md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="animate-fade-in border-t border-emerald-900/30 bg-[#0a1a0a]/98 px-6 pb-6 pt-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-emerald-300/70 transition hover:text-emerald-100"
              >
                {link.label}
              </a>
            ))}
            {onCtaClick ? (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onCtaClick();
                }}
                className="mt-2 w-full rounded-lg wood-button px-5 py-2.5 text-sm font-semibold text-emerald-100 shadow-sm"
              >
                {ctaText}
              </button>
            ) : (
              <a
                href={ctaHref}
                onClick={() => setMobileOpen(false)}
                className="mt-2 w-full rounded-lg wood-button px-5 py-2.5 text-center text-sm font-semibold text-emerald-100 shadow-sm"
              >
                {ctaText}
              </a>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}