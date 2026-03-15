import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Save, Eye, Send, Sparkles, Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link2, ImageIcon, Undo, Redo, Loader2
} from "lucide-react";

type BlogCategory = {
  id: string;
  name: string;
  slug: string;
};

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  authorName: string;
  status: string;
  language: string;
  metaTitle: string | null;
  metaDescription: string | null;
  readTimeMinutes: number;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ToolbarButton({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? "bg-[#2FA4A9]/20 text-[#2FA4A9]" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
    >
      {children}
    </button>
  );
}

export default function BlogEditor() {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const isEditing = !!params?.id;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagsStr, setTagsStr] = useState("");
  const [featuredImageUrl, setFeaturedImageUrl] = useState("");
  const [authorName, setAuthorName] = useState("Equipo IM3");
  const [language, setLanguage] = useState("es");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"generate" | "improve">("generate");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: "Escribe tu artículo aquí..." }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[400px] focus:outline-none p-4",
      },
    },
  });

  const { data: categories = [] } = useQuery<BlogCategory[]>({
    queryKey: ["/api/admin/blog/categories"],
  });

  const { data: existingPost } = useQuery<BlogPost>({
    queryKey: ["/api/admin/blog/posts", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/blog/posts/${params!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingPost && editor) {
      setTitle(existingPost.title);
      setSlug(existingPost.slug);
      setSlugManual(true);
      setExcerpt(existingPost.excerpt);
      setCategoryId(existingPost.categoryId || "");
      setTagsStr((existingPost.tags || []).join(", "));
      setFeaturedImageUrl(existingPost.featuredImageUrl || "");
      setAuthorName(existingPost.authorName);
      setLanguage(existingPost.language);
      setMetaTitle(existingPost.metaTitle || "");
      setMetaDescription(existingPost.metaDescription || "");
      editor.commands.setContent(existingPost.content);
    }
  }, [existingPost, editor]);

  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    if (!slugManual) setSlug(slugify(value));
  }, [slugManual]);

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const content = editor?.getHTML() || "";
      const body = {
        title, slug, excerpt, content,
        categoryId: categoryId || null,
        tags: tagsStr.split(",").map(t => t.trim()).filter(Boolean),
        featuredImageUrl: featuredImageUrl || null,
        authorName,
        status,
        language,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
      };

      if (isEditing) {
        await apiRequest("PATCH", `/api/admin/blog/posts/${params!.id}`, body);
      } else {
        await apiRequest("POST", "/api/admin/blog/posts", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog/posts"] });
      navigate("/admin/blog");
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/blog/ai/generate", { prompt: aiPrompt, language });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.title) setTitle(data.title);
      if (data.title && !slugManual) setSlug(slugify(data.title));
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.content && editor) editor.commands.setContent(data.content);
      if (data.metaTitle) setMetaTitle(data.metaTitle);
      if (data.metaDescription) setMetaDescription(data.metaDescription);
      if (data.tags) setTagsStr(data.tags.join(", "));
      setShowAiDialog(false);
      setAiPrompt("");
    },
  });

  const aiImproveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/blog/ai/improve", {
        content: editor?.getHTML() || "",
        instruction: aiPrompt,
        language,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.content && editor) editor.commands.setContent(data.content);
      setShowAiDialog(false);
      setAiPrompt("");
    },
  });

  const addLink = () => {
    const url = prompt("URL del enlace:");
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = prompt("URL de la imagen:");
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/blog")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <h1 className="text-xl font-bold text-gray-900">
            {isEditing ? "Editar artículo" : "Nuevo artículo"}
          </h1>
          {existingPost && (
            <Badge variant={existingPost.status === "published" ? "default" : "secondary"} className={existingPost.status === "published" ? "bg-green-100 text-green-700" : ""}>
              {existingPost.status === "published" ? "Publicado" : "Borrador"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-1" /> {showPreview ? "Editor" : "Preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || !title || !slug}>
            <Save className="h-4 w-4 mr-1" /> Guardar borrador
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate("published")} disabled={saveMutation.isPending || !title || !slug || !excerpt} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Publicar
          </Button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
          Error: {(saveMutation.error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Editor (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Título del artículo"
            className="text-xl font-bold h-12"
          />

          {showPreview ? (
            /* Preview mode */
            <Card>
              <CardContent className="p-6">
                <h1 className="text-3xl font-bold mb-4">{title}</h1>
                <p className="text-gray-500 mb-6">{excerpt}</p>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }}
                />
              </CardContent>
            </Card>
          ) : (
            /* TipTap Editor */
            <Card>
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-100 flex-wrap">
                <ToolbarButton active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrita">
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Cursiva">
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <ToolbarButton active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título H2">
                  <Heading2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton active={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo H3">
                  <Heading3 className="h-4 w-4" />
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <ToolbarButton active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista">
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada">
                  <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Cita">
                  <Quote className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} title="Código">
                  <Code className="h-4 w-4" />
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <ToolbarButton onClick={addLink} title="Enlace">
                  <Link2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={addImage} title="Imagen">
                  <ImageIcon className="h-4 w-4" />
                </ToolbarButton>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} title="Deshacer">
                  <Undo className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} title="Rehacer">
                  <Redo className="h-4 w-4" />
                </ToolbarButton>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAiMode(editor?.getHTML() && editor.getHTML().length > 20 ? "improve" : "generate"); setShowAiDialog(true); }}
                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                >
                  <Sparkles className="h-4 w-4 mr-1" /> AI
                </Button>
              </div>
              <EditorContent editor={editor} />
            </Card>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <Label className="text-xs text-gray-500">Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                  placeholder="url-del-articulo"
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-500">Extracto</Label>
                <Textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Resumen breve del artículo..."
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">{excerpt.length}/160</p>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin categoría</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Tags (separados por coma)</Label>
                <Input
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="ia, automatización, negocio"
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-500">Imagen destacada (URL)</Label>
                <Input
                  value={featuredImageUrl}
                  onChange={(e) => setFeaturedImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="text-sm"
                />
                {featuredImageUrl && (
                  <img src={featuredImageUrl} alt="Preview" className="mt-2 rounded-lg w-full h-32 object-cover" />
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-500">Idioma</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Autor</Label>
                <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* SEO Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SEO</p>
              <div>
                <Label className="text-xs text-gray-500">Meta título</Label>
                <Input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={title || "Título SEO"}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">{(metaTitle || title).length}/60</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Meta descripción</Label>
                <Textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={excerpt || "Descripción para buscadores..."}
                  rows={2}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">{(metaDescription || excerpt).length}/155</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Dialog */}
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {aiMode === "generate" ? "Generar artículo con IA" : "Mejorar contenido con IA"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={aiMode === "generate"
                ? "Describe el tema del artículo. Ej: 'Cómo la IA puede automatizar el servicio al cliente en empresas de logística'"
                : "Describe qué quieres mejorar. Ej: 'Hazlo más conciso y agrega más ejemplos prácticos'"
              }
              rows={4}
            />
            <p className="text-xs text-gray-400">
              Idioma: {language === "es" ? "Español" : "English"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => aiMode === "generate" ? aiGenerateMutation.mutate() : aiImproveMutation.mutate()}
              disabled={!aiPrompt || aiGenerateMutation.isPending || aiImproveMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {(aiGenerateMutation.isPending || aiImproveMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generando...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> {aiMode === "generate" ? "Generar" : "Mejorar"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
