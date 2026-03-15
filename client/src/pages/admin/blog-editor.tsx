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
  List, ListOrdered, Quote, Code, Link2, ImageIcon, Undo, Redo, Loader2,
  Plus, Trash2, ExternalLink
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
  references: Array<{ title: string; url: string; author?: string; date?: string }>;
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
  const [references, setReferences] = useState<Array<{ title: string; url: string; author?: string; date?: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"generate" | "improve">("generate");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkAsRef, setLinkAsRef] = useState(false);

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
      setReferences(existingPost.references || []);
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
        references,
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
      if (data.references) setReferences(data.references);
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

  const openLinkDialog = () => {
    const selectedText = editor?.state.selection.empty ? "" : editor?.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) || "";
    setLinkText(selectedText);
    setLinkUrl("");
    setLinkAsRef(false);
    setShowLinkDialog(true);
  };

  const applyLink = () => {
    if (!linkUrl || !editor) return;
    if (editor.state.selection.empty && linkText) {
      editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    }
    if (linkAsRef) {
      setReferences(prev => [...prev, { title: linkText || linkUrl, url: linkUrl }]);
    }
    setShowLinkDialog(false);
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
                {references.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-semibold mb-3">Referencias</h3>
                    <ol className="list-decimal list-inside space-y-1.5">
                      {references.map((ref, i) => (
                        <li key={i} className="text-sm text-gray-600">
                          <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-[#2FA4A9] hover:underline">{ref.title}</a>
                          {ref.author && <span> — {ref.author}</span>}
                          {ref.date && <span> ({ref.date})</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
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
                <ToolbarButton onClick={openLinkDialog} title="Enlace">
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

          {/* References Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Referencias</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReferences(prev => [...prev, { title: "", url: "" }])}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
              {references.length === 0 && (
                <p className="text-xs text-gray-400">Sin referencias. Agrega fuentes para dar credibilidad al artículo.</p>
              )}
              {references.map((ref, i) => (
                <div key={i} className="space-y-1.5 p-2.5 bg-gray-50 rounded-lg relative group">
                  <button
                    type="button"
                    onClick={() => setReferences(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    value={ref.title}
                    onChange={(e) => setReferences(prev => prev.map((r, idx) => idx === i ? { ...r, title: e.target.value } : r))}
                    placeholder="Título de la fuente"
                    className="text-xs h-7"
                  />
                  <Input
                    value={ref.url}
                    onChange={(e) => setReferences(prev => prev.map((r, idx) => idx === i ? { ...r, url: e.target.value } : r))}
                    placeholder="https://..."
                    className="text-xs h-7"
                  />
                  <div className="flex gap-1.5">
                    <Input
                      value={ref.author || ""}
                      onChange={(e) => setReferences(prev => prev.map((r, idx) => idx === i ? { ...r, author: e.target.value || undefined } : r))}
                      placeholder="Autor (opcional)"
                      className="text-xs h-7 flex-1"
                    />
                    <Input
                      value={ref.date || ""}
                      onChange={(e) => setReferences(prev => prev.map((r, idx) => idx === i ? { ...r, date: e.target.value || undefined } : r))}
                      placeholder="Fecha"
                      className="text-xs h-7 w-24"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[#2FA4A9]" /> Insertar enlace
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500">URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Texto (opcional)</Label>
              <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Texto del enlace" className="text-sm" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={linkAsRef} onChange={(e) => setLinkAsRef(e.target.checked)} className="rounded border-gray-300" />
              <span className="text-sm text-gray-600">Agregar también como referencia</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancelar</Button>
            <Button onClick={applyLink} disabled={!linkUrl} className="bg-[#2FA4A9] hover:bg-[#238b8f]">
              <ExternalLink className="h-4 w-4 mr-1" /> Insertar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
