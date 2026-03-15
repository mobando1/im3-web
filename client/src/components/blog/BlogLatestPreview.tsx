import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BlogPostCard } from "./BlogPostCard";
import { useI18n } from "@/lib/i18n";
import { ArrowRight } from "lucide-react";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImageUrl: string | null;
  publishedAt: string | null;
  readTimeMinutes: number;
  category: { id: string; name: string; slug: string } | null;
};

export function BlogLatestPreview() {
  const { t } = useI18n();

  const { data: posts = [] } = useQuery<BlogPost[]>({
    queryKey: ["/api/blog/latest"],
  });

  if (posts.length === 0) return null;

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3">{t.blog.sectionTitle}</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{t.blog.sectionSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {posts.map(post => (
            <BlogPostCard key={post.id} {...post} />
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/blog">
            <button className="inline-flex items-center gap-2 px-6 py-3 border border-[#2FA4A9] text-[#2FA4A9] font-medium rounded-xl hover:bg-[#2FA4A9] hover:text-white transition-colors">
              {t.blog.viewAll} <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}
