import { cn } from "@/lib/utils";

// Skeletons isomórficos (mismas alturas/columnas que el contenido final) con
// shimmer izq→der. Reemplaza los bloques animate-pulse ad-hoc por página.

export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-[var(--radius-control)]", className)} />;
}

export function SkeletonRow({ cols = 5, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 px-4 h-12 border-b border-border last:border-0", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBar key={i} className={cn("h-3.5", i === 0 ? "w-40 shrink-0" : "flex-1 max-w-[7rem]")} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-border bg-card overflow-hidden", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-border bg-card p-4 space-y-3", className)}>
      <SkeletonBar className="h-3 w-24" />
      <SkeletonBar className="h-7 w-32" />
      <SkeletonBar className="h-3 w-full" />
    </div>
  );
}

export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
