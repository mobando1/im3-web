import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { SimpleMarkdown } from "@/lib/simple-markdown";

type PublicContract = {
  id: string;
  title: string;
  source: "generated" | "uploaded";
  bodyMarkdown: string | null;
  fileUrl: string | null;
  status: string;
  signedAt: string | null;
  signedBy: string | null;
  contactName: string | null;
  contactEmpresa: string | null;
};

/**
 * Página pública del contrato — acceso por token (sin auth).
 * Usada por:
 *  - Puppeteer (con ?pdf=1) para generar el PDF
 *  - El admin que quiere ver el contrato como lo vería el cliente
 *  - Opcionalmente el cliente final si se le manda el link
 */
export default function AdminContractPreview() {
  const { token } = useParams<{ token: string }>();
  const isPdfMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pdf") === "1";

  const { data: contract, isLoading, error } = useQuery<PublicContract>({
    queryKey: [`/api/contract/${token}`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-gray-200 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contrato no disponible</h1>
          <p className="text-sm text-gray-600">Este link no es válido. Contacta al equipo de IM3 si crees que es un error.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="contract-preview-page min-h-screen bg-white">
      <div className={isPdfMode ? "max-w-3xl mx-auto px-0 py-0" : "max-w-3xl mx-auto px-8 py-12"}>
        {!isPdfMode && contract.signedAt && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
            ✓ Firmado por <strong>{contract.signedBy}</strong> el {new Date(contract.signedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}
        {contract.source === "uploaded" ? (
          <div className="text-center py-12">
            <h1 className="text-xl font-bold text-gray-900 mb-2">{contract.title}</h1>
            <p className="text-sm text-gray-500 mb-5">Contrato firmado disponible como documento.</p>
            {contract.fileUrl && (
              <a href={contract.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2FA4A9] text-white text-sm hover:bg-[#238b8f]">
                Abrir documento
              </a>
            )}
          </div>
        ) : (
          <article className="prose max-w-none">
            <SimpleMarkdown source={contract.bodyMarkdown ?? ""} className="text-[15px] leading-relaxed text-gray-900" />
          </article>
        )}
      </div>
    </div>
  );
}
