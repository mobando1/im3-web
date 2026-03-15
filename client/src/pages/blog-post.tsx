import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ReadingProgress } from "@/components/blog/ReadingProgress";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { ShareButtons } from "@/components/blog/ShareButtons";
import { BlogCTA } from "@/components/blog/BlogCTA";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";

type BlogPostData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageUrl: string | null;
  authorName: string;
  publishedAt: string | null;
  readTimeMinutes: number;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  category: { id: string; name: string; slug: string } | null;
  relatedPosts: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    featuredImageUrl: string | null;
    publishedAt: string | null;
    readTimeMinutes: number;
    categoryId: string | null;
  }>;
};

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const { isDark } = useDarkMode();

  const { data: post, isLoading, error } = useQuery<BlogPostData>({
    queryKey: ["/api/blog/posts", params?.slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/posts/${params!.slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!params?.slug,
  });

  // Update document title and meta tags
  useEffect(() => {
    if (!post) return;
    const originalTitle = document.title;
    document.title = post.metaTitle || post.title;

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        if (name.startsWith("og:")) el.setAttribute("property", name);
        else el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("description", post.metaDescription || post.excerpt);
    setMeta("og:title", post.metaTitle || post.title);
    setMeta("og:description", post.metaDescription || post.excerpt);
    setMeta("og:type", "article");
    setMeta("og:url", `https://www.im3systems.com/blog/${post.slug}`);
    if (post.featuredImageUrl) setMeta("og:image", post.featuredImageUrl);

    return () => { document.title = originalTitle; };
  }, [post]);

  // Scroll to top
  useEffect(() => { window.scrollTo(0, 0); }, [params?.slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2FA4A9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-xl font-semibold text-muted-foreground">Artículo no encontrado</p>
        <Link href="/blog">
          <button className="text-[#2FA4A9] hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver al blog
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <ReadingProgress />

      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <span className="flex items-center gap-3 cursor-pointer">
              <img src="/assets/im3-logo.png" alt="IM3" className={`h-7 ${isDark ? "brightness-0 invert" : ""}`} />
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Blog</span>
            </span>
          </Link>
          <Link href="/blog">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Todos los artículos
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-12">
          {/* Article */}
          <article className="max-w-3xl">
            {/* Category */}
            {post.category && (
              <Link href={`/blog?category=${post.category.id}`}>
                <span className="inline-block px-3 py-1 bg-[#2FA4A9]/10 text-[#2FA4A9] text-xs font-medium rounded-full mb-4 cursor-pointer hover:bg-[#2FA4A9]/20 transition-colors">
                  {post.category.name}
                </span>
              </Link>
            )}

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" /> {post.authorName}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {new Date(post.publishedAt).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {post.readTimeMinutes} min lectura
              </span>
            </div>

            {/* Share */}
            <div className="mb-8">
              <ShareButtons title={post.title} url={`/blog/${post.slug}`} />
            </div>

            {/* Featured image */}
            {post.featuredImageUrl && (
              <img
                src={post.featuredImageUrl}
                alt={post.title}
                className="w-full rounded-2xl mb-10 max-h-[400px] object-cover"
              />
            )}

            {/* Content */}
            <div
              data-blog-content
              className="prose prose-lg max-w-none dark:prose-invert
                prose-headings:font-bold prose-headings:text-foreground
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-a:text-[#2FA4A9] prose-a:no-underline hover:prose-a:underline
                prose-strong:text-foreground
                prose-blockquote:border-l-[#2FA4A9] prose-blockquote:text-muted-foreground
                prose-ul:text-muted-foreground prose-ol:text-muted-foreground
                prose-code:text-[#2FA4A9] prose-code:bg-[#2FA4A9]/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                prose-img:rounded-xl"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex items-center gap-2 mt-10 flex-wrap">
                {post.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Bottom share */}
            <div className="mt-8 pt-8 border-t border-border">
              <ShareButtons title={post.title} url={`/blog/${post.slug}`} />
            </div>

            {/* CTA */}
            <BlogCTA />

            {/* Related posts */}
            {post.relatedPosts && post.relatedPosts.length > 0 && (
              <div className="mt-16">
                <h2 className="text-2xl font-bold text-foreground mb-6">Artículos relacionados</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {post.relatedPosts.map(rp => (
                    <BlogPostCard key={rp.id} {...rp} category={null} />
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Sidebar — TOC */}
          <aside className="hidden lg:block">
            <TableOfContents content={post.content} />
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 text-center">
        <Link href="/">
          <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            © {new Date().getFullYear()} IM3 Systems
          </span>
        </Link>
      </footer>
    </div>
  );
}
