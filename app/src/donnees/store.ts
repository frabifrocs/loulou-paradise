import type { Prestation } from "../types";

/**
 * Accès aux données.
 *
 * Les prestations vivent uniquement dans le navigateur (localStorage).
 * Le registre initial s'importe depuis un CSV, jamais depuis le dépôt public.
 */

const CLE = "loulou-paradise.prestations.v1";

function normaliser(ligne: Partial<Prestation>, index: number): Prestation {
  return {
    id: ligne.id ?? index + 1,
    date_prestation: ligne.date_prestation ?? "",
    prenom: ligne.prenom ?? "",
    nom: ligne.nom ?? "",
    nom_animal: ligne.nom_animal ?? "",
    race_animal: ligne.race_animal ?? "",
    adresse: ligne.adresse ?? "",
    telephone: ligne.telephone ?? "",
    email: ligne.email ?? "",
    type_prestation: ligne.type_prestation ?? "",
    prix_paye: ligne.prix_paye ?? "",
    mode_paiement: ligne.mode_paiement ?? "",
    commentaire: ligne.commentaire ?? "",
    declaree: ligne.declaree === "oui" || ligne.declaree === "non" ? ligne.declaree : "",
    client_id: ligne.client_id ?? "",
    complete_depuis_historique: ligne.complete_depuis_historique ?? "",
    prix_brut: ligne.prix_brut ?? "",
    fichier_source: ligne.fichier_source ?? "",
    ligne_source: ligne.ligne_source ?? "",
    source_brut: ligne.source_brut ?? "",
    a_revoir: ligne.a_revoir ?? "",
  };
}

function lireStockageLocal(): Prestation[] | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const lues = JSON.parse(brut) as Partial<Prestation>[];
    return Array.isArray(lues) && lues.length > 0 ? lues.map(normaliser) : null;
  } catch {
    return null;
  }
}

export async function charger(): Promise<Prestation[]> {
  return lireStockageLocal() ?? [];
}

export function enregistrerTout(prestations: Prestation[]): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(prestations));
  } catch (erreur) {
    console.error("Enregistrement impossible", erreur);
    alert(
      "Les modifications n'ont pas pu être enregistrées : l'espace de stockage du navigateur est plein.",
    );
  }
}

export function prochainIdentifiant(prestations: Prestation[]): number {
  return prestations.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}
