import { Link } from "wouter";
import { Calendar, Clock } from "lucide-react";

type BlogPostCardProps = {
  slug: string;
  title: string;
  excerpt: string;
  featuredImageUrl: string | null;
  category: { name: string; slug: string } | null;
  publishedAt: string | null;
  readTimeMinutes: number;
  featured?: boolean;
};

export function BlogPostCard({ slug, title, excerpt, featuredImageUrl, category, publishedAt, readTimeMinutes, featured }: BlogPostCardProps) {
  return (
    <Link href={`/blog/${slug}`}>
      <article className={`group cursor-pointer bg-white dark:bg-[hsl(var(--ink))] rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${featured ? "md:col-span-2 md:grid md:grid-cols-2" : ""}`}>
        {/* Image */}
        <div className={`relative overflow-hidden bg-gradient-to-br from-[#2FA4A9]/10 to-[#2FA4A9]/5 ${featured ? "h-64 md:h-full" : "h-48"}`}>
          {featuredImageUrl ? (
            <img
              src={featuredImageUrl}
              alt={title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-[#2FA4A9]/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-[#2FA4A9]">{title.charAt(0)}</span>
              </div>
            </div>
          )}
          {category && (
            <span className="absolute top-3 left-3 px-3 py-1 bg-[#2FA4A9] text-white text-xs font-medium rounded-full">
              {category.name}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className={`font-bold text-foreground group-hover:text-[#2FA4A9] transition-colors line-clamp-2 ${featured ? "text-xl mb-3" : "text-base mb-2"}`}>
            {title}
          </h3>
          <p className={`text-muted-foreground line-clamp-2 ${featured ? "text-sm mb-4" : "text-sm mb-3"}`}>
            {excerpt}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {publishedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(publishedAt).toLocaleDateString("es-CO", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {readTimeMinutes} min
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
