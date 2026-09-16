import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";
import {
  canonical,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
} from "~/lib/seo";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Relevate — AI-Powered Marketing for Real Estate Agents",
      },
      {
        name: "description",
        content: DEFAULT_DESCRIPTION,
      },
      // --- Open Graph (global defaults; pages override title/desc/url) ---
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: "Relevate — AI-Powered Marketing for Real Estate Agents" },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: DEFAULT_OG_IMAGE },
      // --- Twitter Card ---
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Relevate — AI-Powered Marketing for Real Estate Agents" },
      { name: "twitter:description", content: DEFAULT_DESCRIPTION },
      { name: "twitter:image", content: DEFAULT_OG_IMAGE },
      // --- Misc ---
      { name: "theme-color", content: "#0a1a0a" },
      { name: "robots", content: "index, follow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/relevate-favicon.svg" },
      canonical("/"),
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
    scripts: [
      // PostHog analytics — loads lazily, degrades gracefully without keys
      {
        children: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups getFeatureFlagPayloads onFeatureFlags register_once".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init('${process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ""}', {
              api_host: '${process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"}',
              autocapture: true,
              capture_pageview: true,
              capture_pageleave: false,
            })`,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: SITE_NAME,
          url: SITE_URL,
          logo: `${SITE_URL}/relevate-mark.svg`,
          description: DEFAULT_DESCRIPTION,
          sameAs: [],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description: DEFAULT_DESCRIPTION,
        }),
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a1a0a]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-emerald-100">Page not found</h1>
        <a href="/" className="mt-4 inline-block wood-button rounded-lg px-6 py-3 text-sm font-semibold text-emerald-100">
          Go Home
        </a>
      </div>
    </div>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#0a1a0a]">
        {children}
        {/* Scroll animation observer + parallax mouse effect */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener("DOMContentLoaded", function() {
                // Scroll-triggered animations
                const observer = new IntersectionObserver(
                  (entries) => {
                    entries.forEach((entry) => {
                      if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                      }
                    });
                  },
                  { threshold: 0.1 }
                );
                document.querySelectorAll(".animate-on-scroll").forEach((el) => {
                  observer.observe(el);
                });

                // === Scroll parallax: scenic forest layers ===
                const scene = document.querySelector(".parallax-scene");
                if (scene) {
                  const layers = scene.querySelectorAll(".parallax-layer");
                  // Speed multipliers per depth layer
                  const speeds = [0.08, 0.15, 0.25, 0.35, 0.45];

                  function updateParallaxScroll() {
                    const scrollY = window.scrollY;
                    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
                    const scrollFraction = scrollY / maxScroll;

                    layers.forEach((layer, i) => {
                      const speed = speeds[i % speeds.length];
                      const yOffset = scrollY * speed * -0.6;
                      const xOffset = scrollFraction * speed * 20;
                      layer.style.transform = "translate3d(" + xOffset + "px, " + yOffset + "px, 0)";
                    });

                    // Celestial glow lateral drift
                    const glow = document.getElementById("celestial-glow");
                    if (glow) {
                      const glowSpeed = 0.03;
                      const glowX = scrollFraction * glowSpeed * 100;
                      const glowY = scrollY * glowSpeed * -0.3;
                      glow.style.transform = "translate3d(" + glowX + "px, " + glowY + "px, 0)";
                    }
                  }

                  updateParallaxScroll();
                  window.addEventListener("scroll", updateParallaxScroll, { passive: true });
                  window.addEventListener("resize", updateParallaxScroll);
                }

                // Subtle mouse parallax on decorative elements
                const container = document.querySelector(".parallax-container");
                if (container) {
                  const leaves = container.querySelectorAll(".parallax-leaf, .parallax-dot");
                  document.addEventListener("mousemove", (e) => {
                    const xFactor = (e.clientX / window.innerWidth - 0.5) * 2;
                    const yFactor = (e.clientY / window.innerHeight - 0.5) * 2;
                    leaves.forEach((el, i) => {
                      const speed = 0.02 + (i % 5) * 0.008;
                      const x = xFactor * 15 * speed * 100;
                      const y = yFactor * 15 * speed * 100;
                      el.style.transform = "translate(" + x + "px, " + y + "px)";
                    });
                  });
                }
              });
            `,
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}