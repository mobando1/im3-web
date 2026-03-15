import { useState, useEffect } from "react";
import { Mail, ArrowRight, Sparkles, Check, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const BENEFITS_ES = [
  "Resumen semanal de IA y automatización",
  "Fuentes verificadas (TechCrunch, MIT, etc.)",
  "Aplicación práctica para tu negocio",
];

const BENEFITS_EN = [
  "Weekly AI & automation digest",
  "Verified sources (TechCrunch, MIT, etc.)",
  "Practical takeaways for your business",
];

export function NewsletterPopup() {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const benefits = language === "es" ? BENEFITS_ES : BENEFITS_EN;

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => setOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();

      if (data.alreadySubscribed) {
        toast.info(t.newsletter.alreadySubscribed);
      } else {
        toast.success(t.newsletter.success);
      }

      setOpen(false);
    } catch {
      toast.error(t.newsletter.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-[420px] p-0 rounded-2xl border-0 overflow-hidden shadow-2xl bg-transparent [&>button]:hidden">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-6 pt-7 pb-6 text-center">
          {/* Close button */}
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Decorative dots */}
          <div className="absolute top-4 left-6 flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/20" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400/10" />
          </div>

          {/* Icon */}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/20 backdrop-blur-sm border border-blue-400/20 mb-4">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white leading-tight mb-2">
            {t.newsletter.popupTitle}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            {t.newsletter.popupDescription}
          </p>
        </div>

        {/* Body */}
        <div className="bg-[hsl(var(--surface))] px-6 py-5 space-y-5">
          {/* Benefits */}
          <ul className="space-y-2.5">
            {benefits.map((benefit, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[hsl(var(--text-primary))]">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-500" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.newsletter.placeholder}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[hsl(var(--divider))] bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-sm hover:from-blue-500 hover:to-blue-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
            >
              {t.newsletter.subscribe}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="text-xs text-muted-foreground hover:text-[hsl(var(--text-primary))] transition-colors mx-auto block"
          >
            {t.newsletter.dismiss}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useNewsletterSubscribe() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const subscribe = async (email: string) => {
    if (!email || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();

      if (data.alreadySubscribed) {
        toast.info(t.newsletter.alreadySubscribed);
      } else {
        toast.success(t.newsletter.success);
      }
      return true;
    } catch {
      toast.error(t.newsletter.error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { subscribe, loading };
}
