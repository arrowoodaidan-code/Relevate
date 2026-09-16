import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Navigation, RelevateMark } from "~/components";
import { getPostBySlug, type BlogPost, type ContentBlock } from "~/lib/blog";
import { canonical, seoMeta, SITE_URL } from "~/lib/seo";

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => {
    const post = loaderData as BlogPost | undefined;
    if (!post) {
      return {
        meta: [
          { title: "Post not found — Relevate Blog" },
          { name: "description", content: "This article could not be found." },
        ],
        links: [canonical("/blog")],
      };
    }
    return {
      meta: seoMeta({
        title: `${post.title} — Relevate Blog`,
        description: post.excerpt,
        path: `/blog/${post.slug}`,
        ogType: "article",
      }),
      links: [canonical(`/blog/${post.slug}`)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            dateModified: post.updated ?? post.date,
            author: { "@type": "Organization", name: "Relevate" },
            publisher: { "@type": "Organization", name: "Relevate" },
            mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a1a0a] px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-emerald-100">Post not found</h1>
        <p className="mt-3 text-emerald-200/60">
          The article you're looking for doesn't exist or was moved.
        </p>
        <Link
          to="/blog"
          className="mt-6 inline-block rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100"
        >
          Back to the blog
        </Link>
      </div>
    </div>
  ),
});

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "h2":
      return <h2 className="mt-12 text-2xl font-bold text-emerald-100 sm:text-3xl">{block.text}</h2>;
    case "h3":
      return <h3 className="mt-8 text-xl font-semibold text-emerald-200">{block.text}</h3>;
    case "p":
      return <p className="mt-5 leading-relaxed text-emerald-200/70">{block.text}</p>;
    case "ul":
      return (
        <ul className="mt-5 space-y-3 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-emerald-200/70">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/60" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="mt-5 space-y-3 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-emerald-200/70">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900/60 text-xs font-bold text-emerald-300">
                {i + 1}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="mt-8 border-l-4 border-amber-500/60 bg-emerald-950/50 py-4 pl-6 pr-4 text-lg italic leading-relaxed text-emerald-100/90">
          {block.text}
        </blockquote>
      );
    case "tip":
      return (
        <div className="mt-8 rounded-xl border border-emerald-600/30 bg-emerald-950/60 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-300">
            {block.title}
          </p>
          <p className="mt-2 leading-relaxed text-emerald-200/80">{block.text}</p>
        </div>
      );
    case "html":
      return (
        <div
          className="mt-8"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
  }
}

function BlogPostPage() {
  const post = Route.useLoaderData();


  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      <Navigation transparent={false} />

      <main className="relative mx-auto max-w-3xl px-6 pb-24 pt-14 sm:pt-20">
        {/* Breadcrumb */}
        <nav className="animate-fade-in-down text-sm text-emerald-300/50">
          <Link to="/blog" className="transition hover:text-emerald-100">
            ← Back to all articles
          </Link>
        </nav>

        {/* Title block */}
        <header className="animate-fade-in-up mt-6">
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
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-emerald-100 sm:text-4xl lg:text-[2.75rem]">
            {post.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-emerald-200/60">{post.excerpt}</p>
        </header>

        {/* Divider */}
        <div className="mt-10 h-px bg-gradient-to-r from-emerald-800/0 via-emerald-700/40 to-emerald-800/0" />

        {/* Body */}
        <article className="animate-fade-in-up stagger-1">
          {post.content.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </article>

        {/* Tags */}
        <div className="mt-12 flex flex-wrap gap-2 border-t border-emerald-800/30 pt-8">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-emerald-800/40 px-3 py-1 text-xs text-emerald-300/50"
            >
              #{tag.replace(/\s+/g, "")}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-emerald-700/30 bg-gradient-to-br from-emerald-950/80 to-[#0d1f0d]/80 p-8 text-center">
          <h2 className="text-2xl font-bold text-emerald-100">
            Write your next listing in 60 seconds
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-emerald-200/60">
            Relevate turns the templates above into a first draft for any
            property — descriptions, flyers, social posts, and emails, all in
            your brand voice.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/signup"
              className="inline-block rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100"
            >
              Start your free trial
            </a>
            <a
              href="/"
              className="inline-block rounded-lg wood-button-dark px-6 py-3 text-sm font-semibold text-emerald-100"
            >
              See how it works
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative bg-[#050f05] px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <RelevateMark className="h-6 w-6" />
            <span className="text-sm font-semibold text-emerald-200/80">Relevate</span>
          </div>
          <nav className="flex gap-6 text-sm text-emerald-300/50">
            <Link to="/blog" className="transition hover:text-emerald-100">
              Blog
            </Link>
            <a href="/pricing" className="transition hover:text-emerald-100">
              Pricing
            </a>
            <a href="/signup" className="transition hover:text-emerald-100">
              Sign up
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
