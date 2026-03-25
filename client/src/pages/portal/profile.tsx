import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

type ProfileData = {
  nombre: string;
  empresa: string;
  email: string;
  telefono: string | null;
};

export default function PortalProfile() {
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/portal/profile"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-4 border-white/10 border-t-[#2FA4A9] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-white/40">No se pudo cargar el perfil.</p>
      </div>
    );
  }

  const fields = [
    { label: "Nombre", value: data.nombre },
    { label: "Empresa", value: data.empresa },
    { label: "Email", value: data.email },
    { label: "Telefono", value: data.telefono || "No registrado" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Tu perfil</h1>
        <p className="text-white/40 mt-1">Informacion de tu cuenta</p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-[#2FA4A9]/10 flex items-center justify-center">
            <span className="text-xl font-semibold text-[#2FA4A9]">
              {data.nombre.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-lg font-medium text-white">{data.nombre}</p>
            <p className="text-sm text-white/40">{data.empresa}</p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-6 space-y-4">
          {fields.map((field) => (
            <div key={field.label}>
              <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">{field.label}</p>
              <p className="text-sm text-white/70">{field.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
