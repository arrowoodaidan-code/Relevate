import { createFileRoute, Link } from "@tanstack/react-router";
import { Navigation, RelevateMark } from "~/components";
import { getAllPosts } from "~/lib/blog";
import { canonical, seoMeta } from "~/lib/seo";

export const Route = createFileRoute("/blog/")({
  component: BlogIndexPage,
  head: () => ({
    meta: seoMeta({
      title: "Relevate Blog — Real Estate Marketing Tips & Templates",
      description:
        "Practical real estate marketing advice: listing description templates, open house ideas, social media strategies, and AI tools for agents.",
      path: "/blog",
    }),
    links: [canonical("/blog")],
  }),
});

function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      <Navigation transparent={false} />

      <main className="relative mx-auto max-w-4xl px-6 pb-24 pt-16 sm:pt-24">
        {/* Header */}
        <header className="animate-fade-in-down text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1.5 text-sm font-medium text-emerald-200/80">
            <RelevateMark className="h-4 w-4" />
            The Relevate Blog
          </p>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-emerald-100 sm:text-5xl">
            Marketing tips for agents who{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-amber-300 bg-clip-text text-transparent">
              actually sell
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-emerald-200/60">
            Listing copy, open house playbooks, social strategy, and AI workflows —
            written for real estate agents who'd rather be closing deals than
            writing about them.
          </p>
        </header>

        {/* Post list */}
        <div className="mt-14 flex flex-col gap-6">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="animate-fade-in-up group relative overflow-hidden rounded-2xl border border-emerald-800/30 bg-[#0d1f0d]/80 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-600/40 hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)]"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-emerald-300/60">
                <span className="rounded-full bg-emerald-900/50 px-3 py-1 capitalize text-emerald-300/80">
                  {post.category}
                </span>
                <time dateTime={post.date}>
                  {new Date(post.date + "T00:00:00").toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <span>·</span>
                <span>{post.readTime}</span>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-emerald-100 transition-colors group-hover:text-emerald-300">
                <Link to="/blog/$slug" params={{ slug: post.slug }}>
                  {post.title}
                </Link>
              </h2>

              <p className="mt-3 leading-relaxed text-emerald-200/60">{post.excerpt}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-emerald-800/40 px-2.5 py-0.5 text-xs text-emerald-300/50"
                  >
                    #{tag.replace(/\s+/g, "")}
                  </span>
                ))}
              </div>

              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-colors hover:text-emerald-100"
              >
                Read the article
                <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </article>
          ))}
        </div>

        {/* Newsletter CTA */}
        <div className="mt-16 rounded-2xl border border-emerald-700/30 bg-gradient-to-br from-emerald-950/80 to-[#0d1f0d]/80 p-8 text-center">
          <h2 className="text-2xl font-bold text-emerald-100">
            Put this advice on autopilot
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-200/60">
            Relevate generates your listing descriptions, flyers, social posts,
            and emails in under a minute — so every listing ships with
            copy that sells.
          </p>
          <a
            href="/signup"
            className="mt-6 inline-block rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100"
          >
            Create a free account
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative bg-[#050f05] px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <RelevateMark className="h-6 w-6" />
            <span className="text-sm font-semibold text-emerald-200/80">Relevate</span>
          </div>
          <p className="text-sm text-emerald-300/30">
            &copy; {new Date().getFullYear()} Relevate. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
