import { useState, useEffect } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const LS_DISMISSED = "newsletter_popup_dismissed";
const LS_SUBSCRIBED = "newsletter_subscribed";

export function NewsletterPopup() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_DISMISSED) || localStorage.getItem(LS_SUBSCRIBED)) return;

    const timer = setTimeout(() => setOpen(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(LS_DISMISSED, "1");
  };

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

      localStorage.setItem(LS_SUBSCRIBED, "1");
      setOpen(false);
    } catch {
      toast.error(t.newsletter.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-sm rounded-2xl border-[hsl(var(--divider))] bg-[hsl(var(--surface))] p-5">
        <div className="space-y-3">
          <p className="text-lg font-display font-bold text-[hsl(var(--text-primary))] leading-snug">
            {t.newsletter.popupTitle}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.newsletter.popupDescription}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.newsletter.placeholder}
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[hsl(var(--divider))] bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--teal))]/40 focus:border-[hsl(var(--teal))]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2.5 rounded-lg bg-[hsl(var(--teal))] text-white font-semibold text-sm hover:bg-[hsl(var(--teal))]/90 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            {t.newsletter.subscribe}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <button
          onClick={dismiss}
          className="text-xs text-muted-foreground hover:text-[hsl(var(--text-primary))] transition-colors mt-1 mx-auto block"
        >
          {t.newsletter.dismiss}
        </button>
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
        localStorage.setItem(LS_SUBSCRIBED, "1");
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
