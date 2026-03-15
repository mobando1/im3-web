import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export function BlogCTA() {
  return (
    <div className="mt-16 p-8 rounded-2xl bg-gradient-to-br from-[#2FA4A9]/10 via-[#2FA4A9]/5 to-transparent border border-[#2FA4A9]/20 text-center">
      <h3 className="text-xl font-bold text-foreground mb-2">
        ¿Listo para transformar tu operación?
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Agenda un diagnóstico gratuito y descubre cómo la IA puede impulsar tu negocio.
      </p>
      <Link href="/booking">
        <button className="inline-flex items-center gap-2 px-6 py-3 bg-[#2FA4A9] text-white font-medium rounded-xl hover:bg-[#238b8f] transition-colors">
          Solicitar diagnóstico gratis <ArrowRight className="h-4 w-4" />
        </button>
      </Link>
    </div>
  );
}
