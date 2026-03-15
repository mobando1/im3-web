import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, Trash2, Eye, EyeOff, BookOpen } from "lucide-react";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  language: string;
  publishedAt: string | null;
  createdAt: string;
  readTimeMinutes: number;
  category: { id: string; name: string; slug: string } | null;
};

type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export default function AdminBlog() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/admin/blog/posts", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/blog/posts?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<BlogCategory[]>({
    queryKey: ["/api/admin/blog/categories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/blog/posts/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/posts"] }),
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "publish" | "unpublish" }) => {
      await apiRequest("POST", `/api/admin/blog/posts/${id}/${action}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/posts"] }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      await apiRequest("POST", "/api/admin/blog/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/categories"] });
      setShowCategoryDialog(false);
      setNewCatName("");
      setNewCatSlug("");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/blog/categories/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/categories"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
          <p className="text-sm text-gray-500 mt-1">{posts.length} artículos</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCategoryDialog(true)}>
            Categorías ({categories.length})
          </Button>
          <Button size="sm" onClick={() => navigate("/admin/blog/new")} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            <Plus className="h-4 w-4 mr-1" /> Nuevo artículo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar artículos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Borradores</SelectItem>
            <SelectItem value="published">Publicados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posts list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg font-medium">No hay artículos aún</p>
            <p className="text-gray-400 text-sm mt-1">Crea tu primer artículo para comenzar</p>
            <Button className="mt-4 bg-[#2FA4A9] hover:bg-[#238b8f]" onClick={() => navigate("/admin/blog/new")}>
              <Plus className="h-4 w-4 mr-1" /> Crear artículo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 px-5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{post.title}</h3>
                    <Badge variant={post.status === "published" ? "default" : "secondary"} className={post.status === "published" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                      {post.status === "published" ? "Publicado" : "Borrador"}
                    </Badge>
                    {post.category && (
                      <Badge variant="outline" className="text-xs">{post.category.name}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs uppercase">{post.language}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{post.excerpt}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {post.publishedAt
                      ? `Publicado ${new Date(post.publishedAt).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })}`
                      : `Creado ${new Date(post.createdAt).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })}`
                    }
                    {" · "}{post.readTimeMinutes} min lectura
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {post.status === "published" ? (
                    <Button variant="ghost" size="sm" onClick={() => publishMutation.mutate({ id: post.id, action: "unpublish" })} title="Despublicar">
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => publishMutation.mutate({ id: post.id, action: "publish" })} title="Publicar">
                      <Eye className="h-4 w-4 text-green-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/blog/${post.id}/edit`)} title="Editar">
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("¿Eliminar este artículo?")) deleteMutation.mutate(post.id); }} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Categories Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorías del Blog</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing categories */}
            {categories.length > 0 && (
              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{cat.name}</p>
                      <p className="text-xs text-gray-400">/{cat.slug}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("¿Eliminar categoría?")) deleteCategoryMutation.mutate(cat.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* New category form */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Nueva categoría</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    value={newCatName}
                    onChange={(e) => {
                      setNewCatName(e.target.value);
                      setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }}
                    placeholder="Inteligencia Artificial"
                  />
                </div>
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input value={newCatSlug} onChange={(e) => setNewCatSlug(e.target.value)} placeholder="inteligencia-artificial" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={!newCatName || !newCatSlug}
              onClick={() => createCategoryMutation.mutate({ name: newCatName, slug: newCatSlug })}
              className="bg-[#2FA4A9] hover:bg-[#238b8f]"
            >
              Crear categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
