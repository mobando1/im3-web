// Sistema de motion compartido del admin — dirección "Teal Instrument".
// Reglas: solo transform + opacity, cap de 300ms, easings consistentes.
// La accesibilidad (prefers-reduced-motion) se maneja globalmente envolviendo
// el shell del admin en <MotionConfig reducedMotion="user">; useMotionPrefs()
// queda para casos manuales (replica el patrón dur() de confirmed.tsx).
import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

/** Duraciones en segundos. 0.3s es el tope duro. */
export const DURATION = {
  micro: 0.12, // hover / press
  fast: 0.15,
  base: 0.2, // entrada / cambio de estado
  slow: 0.3, // paneles / transición de ruta (cap)
} as const;

type Cubic = [number, number, number, number];

/** Easings como cubic-bezier. */
export const EASE: Record<"entrance" | "interaction" | "standard", Cubic> = {
  entrance: [0.23, 1, 0.32, 1], // settle suave (entradas)
  interaction: [0.32, 0.72, 0, 1], // snappy (interacción)
  standard: [0.4, 0, 0.2, 1],
};

/** Springs preconfigurados. `drag` para el asentamiento de cards del pipeline. */
export const SPRING: Record<"soft" | "snappy" | "drag", Transition> = {
  soft: { type: "spring", stiffness: 220, damping: 30 },
  snappy: { type: "spring", stiffness: 400, damping: 32 },
  drag: { type: "spring", stiffness: 600, damping: 38 },
};

/** Entrada de página/ruta (usada en el shell del admin). */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.entrance },
  },
};

/** Contenedor de stagger para listas/grids (solo primer paint). */
export const listContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

/** Ítem de stagger. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.entrance },
  },
};

/** Fade simple para skeleton→contenido (sin desplazamiento). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
};

/**
 * Helpers conscientes de reduced-motion para uso manual.
 * Replica el patrón dur() de client/src/pages/confirmed.tsx.
 */
export function useMotionPrefs() {
  const reduce = useReducedMotion();
  const dur = (d: number) => (reduce ? 0 : d);
  const transition = (t: Transition = {}): Transition =>
    reduce
      ? { duration: 0 }
      : { duration: DURATION.base, ease: EASE.entrance, ...t };
  return { reduce, dur, transition };
}
