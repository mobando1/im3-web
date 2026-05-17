import { db } from "./db";
import { proposals, stackServices, contacts } from "@shared/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { OperationalCostsData } from "@shared/proposal-template/types";

/**
 * Detección de deriva de precios.
 *
 * Cuando el admin edita un precio en /admin/stack-catalog, las propuestas
 * activas que ya usan ese servicio quedan con precios viejos. Este reporte
 * cruza la fecha de actualización del catálogo con la fecha de la propuesta
 * y marca cuáles propuestas tienen servicios con precios actualizados
 * DESPUÉS de la última edición de la propuesta.
 *
 * Estrategia de match: por nombre case-insensitive, con fallback a substring
 * (porque Claude a veces reformatea "Supabase" como "Supabase Pro" o similar).
 */

export type DriftedService = {
  name: string;            // nombre como aparece en la propuesta
  catalogName: string;     // nombre como aparece en el catálogo (match)
  lastPriceUpdate: Date;
};

export type DriftedProposal = {
  proposalId: string;
  title: string;
  contactId: string;
  contactName: string | null;
  contactEmpresa: string | null;
  status: string;
  proposalUpdatedAt: Date;
  driftedServices: DriftedService[];
};

let cached: { result: { total: number; proposals: DriftedProposal[] }; ts: number } | null = null;
const TTL_MS = 60_000; // 1 minuto — invalidado al editar catálogo

export function invalidateDriftCache() {
  cached = null;
}

export async function detectStackDriftReport(opts?: { skipCache?: boolean }): Promise<{ total: number; proposals: DriftedProposal[] }> {
  if (!db) return { total: 0, proposals: [] };

  if (!opts?.skipCache && cached && Date.now() - cached.ts < TTL_MS) {
    return cached.result;
  }

  // Propuestas activas: status sent/viewed/accepted, no deleted
  const activeProposals = await db.select().from(proposals)
    .where(and(
      inArray(proposals.status, ["sent", "viewed", "accepted"]),
      isNull(proposals.deletedAt),
    ));

  if (activeProposals.length === 0) {
    cached = { result: { total: 0, proposals: [] }, ts: Date.now() };
    return cached.result;
  }

  // Catálogo activo
  const catalog = await db.select().from(stackServices)
    .where(eq(stackServices.isActive, true));

  if (catalog.length === 0) {
    cached = { result: { total: 0, proposals: [] }, ts: Date.now() };
    return cached.result;
  }

  // Index por nombre lowercase para match O(1)
  const catalogByName = new Map(catalog.map(s => [s.name.toLowerCase(), s]));

  // Lista de tuplas [normalized name, service] para fallback substring
  const catalogList = catalog.map(s => ({ name: s.name.toLowerCase(), service: s }));

  // Cargar contactos en bulk
  const contactIds = Array.from(new Set(activeProposals.map(p => p.contactId)));
  const contactRows = contactIds.length > 0
    ? await db.select({ id: contacts.id, nombre: contacts.nombre, empresa: contacts.empresa })
        .from(contacts).where(inArray(contacts.id, contactIds))
    : [];
  const contactById = new Map(contactRows.map(c => [c.id, c]));

  const drifted: DriftedProposal[] = [];

  for (const proposal of activeProposals) {
    const sections = (proposal.sections as Record<string, unknown> | null) || {};
    const opCosts = sections.operationalCosts as OperationalCostsData | undefined;
    if (!opCosts || !opCosts.groups || opCosts.groups.length === 0) continue;

    const proposalUpdated = proposal.updatedAt;
    const driftedHere: DriftedService[] = [];
    const seenNames = new Set<string>();

    for (const group of opCosts.groups) {
      for (const cat of group.categories || []) {
        for (const item of cat.items || []) {
          if (!item.service) continue;
          const itemName = item.service.toLowerCase();

          // Match exacto primero, luego substring
          let match = catalogByName.get(itemName);
          if (!match) {
            const fuzzy = catalogList.find(c =>
              itemName.includes(c.name) || c.name.includes(itemName)
            );
            match = fuzzy?.service;
          }
          if (!match || !match.lastPriceUpdate) continue;

          // Deriva: catálogo actualizado DESPUÉS de la propuesta
          if (match.lastPriceUpdate > proposalUpdated) {
            // Evitar duplicados si el mismo servicio aparece en varios grupos
            const key = `${match.id}:${item.service}`;
            if (seenNames.has(key)) continue;
            seenNames.add(key);
            driftedHere.push({
              name: item.service,
              catalogName: match.name,
              lastPriceUpdate: match.lastPriceUpdate,
            });
          }
        }
      }
    }

    if (driftedHere.length > 0) {
      const contact = contactById.get(proposal.contactId);
      drifted.push({
        proposalId: proposal.id,
        title: proposal.title,
        contactId: proposal.contactId,
        contactName: contact?.nombre || null,
        contactEmpresa: contact?.empresa || null,
        status: proposal.status,
        proposalUpdatedAt: proposalUpdated,
        driftedServices: driftedHere,
      });
    }
  }

  // Orden: más servicios derivados primero, luego más reciente
  drifted.sort((a, b) => {
    if (b.driftedServices.length !== a.driftedServices.length) {
      return b.driftedServices.length - a.driftedServices.length;
    }
    return b.proposalUpdatedAt.getTime() - a.proposalUpdatedAt.getTime();
  });

  const result = { total: drifted.length, proposals: drifted };
  cached = { result, ts: Date.now() };
  return result;
}
