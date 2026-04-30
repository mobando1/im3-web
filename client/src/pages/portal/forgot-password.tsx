import { useState } from "react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/portal/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        credentials: "include",
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center, #0f2438 0%, #0B1C2D 50%, #060e18 100%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/im3-logo.png" alt="IM3" className="h-10 mb-4 opacity-90" />
          <p className="text-[13px] tracking-[0.2em] uppercase text-[#2FA4A9]/70 font-medium">
            Recuperar acceso
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <p className="text-white/80 text-sm">
                Si tu email está registrado, te enviamos un link para restablecer tu contraseña.
              </p>
              <p className="text-white/40 text-xs">El link es válido por 1 hora.</p>
              <Link href="/portal/login" className="inline-block text-[#2FA4A9] text-sm hover:underline mt-2">
                ← Volver a ingresar
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-white/60 text-sm">
                Ingresa tu email y te enviaremos un link para restablecer tu contraseña.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-white/40 uppercase tracking-wider">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-[#2FA4A9] hover:bg-[#2FA4A9]/90 text-white">
                {loading ? "Enviando..." : "Enviar link"}
              </Button>
              <div className="text-center">
                <Link href="/portal/login" className="text-xs text-white/40 hover:text-[#2FA4A9]">
                  ← Volver
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
