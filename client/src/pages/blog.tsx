import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BlogPostCard } from "@/components/blog/BlogPostCard";
import { Search, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";

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

type BlogCategory = {
  id: string;
  name: string;
  slug: string;
};

export default function BlogPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const { isDark } = useDarkMode();

  const { data: categoriesData = [] } = useQuery<BlogCategory[]>({
    queryKey: ["/api/blog/categories"],
  });

  const { data, isLoading } = useQuery<{ posts: BlogPost[]; total: number; totalPages: number; page: number }>({
    queryKey: ["/api/blog/posts", search, categoryFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("page", String(page));
      params.set("limit", "12");
      const res = await fetch(`/api/blog/posts?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const posts = data?.posts || [];
  const totalPages = data?.totalPages || 1;
  const featuredPost = page === 1 && !search && !categoryFilter ? posts[0] : undefined;
  const gridPosts = featuredPost ? posts.slice(1) : posts;

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <span className="flex items-center gap-3 cursor-pointer">
              <img src="/assets/im3-logo.png" alt="IM3" className={`h-7 ${isDark ? "brightness-0 invert" : ""}`} />
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Blog</span>
            </span>
          </Link>
          <Link href="/">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al sitio
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-foreground mb-3">Blog</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Artículos sobre IA, automatización y tecnología para empresas
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar artículos..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#2FA4A9]/30 focus:border-[#2FA4A9]"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => { setCategoryFilter(""); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !categoryFilter ? "bg-[#2FA4A9] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas
            </button>
            {categoriesData.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCategoryFilter(cat.id); setPage(1); }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  categoryFilter === cat.id ? "bg-[#2FA4A9] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Posts grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-72 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl font-semibold text-muted-foreground">No se encontraron artículos</p>
            <p className="text-sm text-muted-foreground mt-2">Prueba con otra búsqueda o categoría</p>
          </div>
        ) : (
          <>
            {/* Featured post */}
            {featuredPost && (
              <div className="mb-8">
                <BlogPostCard {...featuredPost} featured />
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {gridPosts.map(post => (
                <BlogPostCard key={post.id} {...post} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-12">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      p === page ? "bg-[#2FA4A9] text-white" : "border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Newsletter CTA */}
        <div className="mt-20 text-center p-10 rounded-2xl bg-gradient-to-br from-[#2FA4A9]/10 to-transparent border border-[#2FA4A9]/20">
          <h2 className="text-2xl font-bold text-foreground mb-2">No te pierdas ningún artículo</h2>
          <p className="text-muted-foreground mb-6">Recibe las últimas novedades sobre IA y automatización directo en tu inbox.</p>
          <Link href="/#newsletter">
            <button className="px-6 py-3 bg-[#2FA4A9] text-white font-medium rounded-xl hover:bg-[#238b8f] transition-colors">
              Suscribirme al newsletter
            </button>
          </Link>
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
