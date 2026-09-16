/**
 * SEO helpers & site-wide constants.
 * The preview domain is the public surface today; when the site goes live to a
 * custom domain, update SITE_URL and re-publish (canonicals, OG URLs, sitemap
 * all derive from it).
 */
export const SITE_URL = "https://relevatelistingassistant.ctonew.app";
export const SITE_NAME = "Relevate";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const DEFAULT_DESCRIPTION =
  "Generate property descriptions, open house flyers, social media posts, email campaigns, and listing summaries in seconds. Save hours per listing with AI-powered marketing.";

/** Build the standard meta block for a page. */
export function seoMeta(opts: {
  title: string;
  description: string;
  path: string;
  ogType?: string;
  ogImage?: string;
}) {
  const url = `${SITE_URL}${opts.path}`;
  const image = opts.ogImage ?? DEFAULT_OG_IMAGE;
  return [
    { title: opts.title },
    { name: "description", content: opts.description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:type", content: opts.ogType ?? "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
    { name: "twitter:image", content: image },
  ];
}

/** Canonical link entry for a page. */
export function canonical(path: string) {
  return { rel: "canonical", href: `${SITE_URL}${path}` };
}
