# Case Studies — Testimonios y Casos Reales IM3

Este archivo se inyecta en el prompt de Claude al generar propuestas. **SOLO los casos/testimonios aquí listados son REALES** y se pueden usar en las propuestas.

**REGLA DE ORO**: Claude NO PUEDE inventar testimonios. Si este archivo está vacío o no hay un caso relevante a la industria del prospect, la sección `testimonials` se OMITE completamente.

---

## Cómo usar este archivo

1. Mateo edita este archivo cuando tiene un testimonio/caso real validado (con permiso del cliente).
2. Cada caso tiene: nombre real del cliente, industria, quote literal, resultado cuantificado.
3. Claude, al generar una propuesta:
   - Revisa la industria del prospect
   - Selecciona 1-3 casos de este archivo que sean **relevantes** por industria o problema similar
   - Si no hay casos relevantes → omite la sección `testimonials` completamente
   - NUNCA inventa un testimonio nuevo ni cambia los quotes existentes

---

## Casos reales disponibles

_Nota para Mateo: llena este archivo con casos reales cuando los tengas. Cada entrada debe estar validada con el cliente._

### Case 1 — [PENDIENTE: agregar primer caso real]

```yaml
nombre_cliente: "[Nombre real con permiso]"
rol: "[Cargo, Empresa]"
industria: "[ej: Logística, E-commerce, Educación]"
tamaño_empresa: "[ej: 50-100 empleados]"
proyecto: "[qué le construimos]"
duracion: "[ej: 16 semanas]"
quote: "[quote literal autorizado por el cliente]"
resultado_cuantificado: "[ej: 'Redujeron 80% el tiempo de procesamiento']"
fecha_entregado: "[YYYY-MM]"
autorizado_para_usar_publicamente: true
```

---

## Estado actual

🚨 **Esta base de datos está vacía.** Hasta que Mateo añada casos reales:
- La sección `testimonials` de todas las propuestas generadas **NO aparecerá**
- Esto es INTENCIONAL — mejor omitir la sección que mentir con testimonios inventados
- Cuando tengas casos reales, edita este archivo y las propuestas futuras los incluirán automáticamente

---

## Instrucciones para Claude

Cuando generes una propuesta:

1. Revisa la industria del prospect (de `meta.industry` o el diagnóstico)
2. Busca en este archivo casos de:
   - **Misma industria** (mejor match)
   - **Problema similar** (fallback)
   - **Tamaño similar** (tercer fallback)
3. Si encuentras 1-3 casos relevantes:
   - Usa los `quote` **literalmente** (no los modifiques)
   - Usa el `nombre_cliente` y `rol` exactos
   - Genera la sección `testimonials` con esos casos
4. Si NO hay casos relevantes o el archivo está vacío:
   - **OMITIR completamente la sección `testimonials`** (devolver `undefined` o no incluir la key)
   - NO inventes testimonios ficticios bajo ningún motivo
   - NO uses "cliente anónimo" ni nombres inventados

## Por qué esta regla es inflexible

- Testimonios inventados = riesgo reputacional catastrófico
- Si un prospect investiga y descubre que el testimonio es falso → pierdes el deal + reputación
- Es mejor una propuesta sin testimonios que una con mentiras
- La autoridad real viene del trabajo entregado, no de quotes ficticios
