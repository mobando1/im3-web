import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background px-4">
      <h1 className="text-6xl font-display font-bold text-foreground mb-2">404</h1>
      <p className="text-lg text-muted-foreground mb-8">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
