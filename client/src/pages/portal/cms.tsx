import AdminCmsEditor from "@/pages/admin/cms-editor";

// Editor del sitio para clientes (acceso por magic-link). Reusa el mismo editor
// que el admin en modo "client": los endpoints van a /api/portal/cms/* (scoped a
// su sitio por sesión), sin chat IA ni historial en V1, y sin sidebar de admin.
export default function PortalCms() {
  return <AdminCmsEditor mode="client" />;
}
