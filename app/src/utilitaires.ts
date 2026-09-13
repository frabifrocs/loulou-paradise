import type { Filtres, Prestation } from "./types";

export const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function montant(valeur: string | number): number {
  const nombre = typeof valeur === "number" ? valeur : Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}

export function euros(valeur: number): string {
  return valeur.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: valeur % 1 === 0 ? 0 : 2,
  });
}

export function dateLisible(iso: string): string {
  if (!iso) return "";
  const [annee, mois, jour] = iso.split("-");
  const index = Number.parseInt(mois, 10) - 1;
  if (!MOIS_FR[index]) return iso;
  return `${Number.parseInt(jour, 10)} ${MOIS_FR[index]} ${annee}`;
}

export function nomClient(p: Prestation): string {
  const complet = [p.prenom, p.nom].filter(Boolean).join(" ").trim();
  return complet || "Client non identifié";
}

export function cleClient(p: Prestation): string {
  return p.client_id || aplatir(nomClient(p)) || `ligne-${p.id}`;
}

const DRAPEAUX_PAR_CHAMP: Partial<Record<keyof Prestation, string[]>> = {
  prenom: ["proprietaire_absent", "nom_prenom_a_verifier"],
  nom: ["proprietaire_absent", "nom_prenom_a_verifier"],
  telephone: ["proprietaire_absent"],
  race_animal: ["race_absente"],
  type_prestation: ["prestation_absente"],
  prix_paye: ["prix_absent", "prix_a_verifier"],
  mode_paiement: ["paiement_absent"],
};

/** Applique une correction saisie et retire les drapeaux devenus obsolètes. */
export function appliquerCorrection(
  prestation: Prestation,
  champ: keyof Prestation,
  valeur: string,
): Prestation {
  const suivante: Prestation = { ...prestation, [champ]: valeur };
  const aRetirer = valeur.trim() ? (DRAPEAUX_PAR_CHAMP[champ] ?? []) : [];
  if (aRetirer.length > 0) {
    suivante.a_revoir = prestation.a_revoir
      .split(",")
      .filter((drapeau) => drapeau && !aRetirer.includes(drapeau))
      .join(",");
  }
  return suivante;
}

/** Sans accents ni majuscules : la recherche doit trouver « Tuléar » en tapant « tulear ». */
export function normaliserDeclaration(valeur: string): string {
  const cle = aplatir(valeur).trim();
  if (cle === "oui" || cle === "o" || cle === "yes") return "oui";
  if (cle === "non" || cle === "n" || cle === "no") return "non";
  return "";
}

export function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function valeursDistinctes(prestations: Prestation[], champ: keyof Prestation): string[] {
  const compte = new Map<string, number>();
  for (const p of prestations) {
    const valeur = String(p[champ] ?? "").trim();
    if (valeur) compte.set(valeur, (compte.get(valeur) ?? 0) + 1);
  }
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([valeur]) => valeur);
}

const CHAMPS_RECHERCHE: (keyof Prestation)[] = [
  "prenom", "nom", "nom_animal", "race_animal", "adresse",
  "telephone", "email", "type_prestation", "mode_paiement", "commentaire",
];

export function filtrer(prestations: Prestation[], filtres: Filtres): Prestation[] {
  const termes = aplatir(filtres.recherche).split(/\s+/).filter(Boolean);

  return prestations.filter((p) => {
    if (filtres.annee && !p.date_prestation.startsWith(filtres.annee)) return false;
    if (filtres.mois && p.date_prestation.slice(5, 7) !== filtres.mois) return false;
    if (filtres.paiement && p.mode_paiement !== filtres.paiement) return false;
    if (filtres.race && p.race_animal !== filtres.race) return false;
    if (filtres.prestation && !p.type_prestation.includes(filtres.prestation)) return false;
    if (filtres.seulementAVerifier && !p.a_revoir) return false;

    if (termes.length > 0) {
      const foin = aplatir(CHAMPS_RECHERCHE.map((champ) => p[champ]).join(" "));
      // Tous les mots saisis doivent apparaître, dans n'importe quel ordre.
      if (!termes.every((terme) => foin.includes(terme))) return false;
    }
    return true;
  });
}

export function trier(
  prestations: Prestation[],
  champ: keyof Prestation,
  ordre: "asc" | "desc",
): Prestation[] {
  const signe = ordre === "asc" ? 1 : -1;
  return [...prestations].sort((a, b) => {
    if (champ === "prix_paye") return signe * (montant(a.prix_paye) - montant(b.prix_paye));
    if (champ === "id") return signe * (a.id - b.id);
    return signe * String(a[champ]).localeCompare(String(b[champ]), "fr", { numeric: true });
  });
}

const COLONNES_EXPORT: (keyof Prestation)[] = [
  "date_prestation", "prenom", "nom", "nom_animal", "race_animal", "adresse",
  "telephone", "email", "type_prestation", "prix_paye", "mode_paiement", "commentaire",
  "declaree", "id", "client_id", "a_revoir",
];

const ENTETES_EXPORT = [
  "Date", "Prénom", "Nom", "Animal", "Race", "Adresse", "Téléphone",
  "Email", "Prestation", "Prix payé", "Mode de paiement", "Commentaire",
  "Déclaré", "Id", "Client", "À revoir",
];

export const DESTINATAIRE_CSV = "alexane.duriez06@gmail.com";

const ALIAS_COLONNES: Record<string, keyof Prestation> = {
  date: "date_prestation",
  date_prestation: "date_prestation",
  prenom: "prenom",
  nom: "nom",
  animal: "nom_animal",
  nom_animal: "nom_animal",
  race: "race_animal",
  race_animal: "race_animal",
  adresse: "adresse",
  telephone: "telephone",
  tel: "telephone",
  email: "email",
  prestation: "type_prestation",
  type_prestation: "type_prestation",
  prix_paye: "prix_paye",
  prix: "prix_paye",
  mode_de_paiement: "mode_paiement",
  mode_paiement: "mode_paiement",
  commentaire: "commentaire",
  declare: "declaree",
  declaree: "declaree",
  declaration: "declaree",
  id: "id",
  client: "client_id",
  client_id: "client_id",
  a_revoir: "a_revoir",
};

function decouperCsv(texte: string): string[][] {
  const delim = (texte.match(/;/g) ?? []).length >= (texte.match(/,/g) ?? []).length ? ";" : ",";
  const lignes: string[][] = [];
  let champs: string[] = [];
  let champ = "";
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i += 1) {
    const car = texte[i];
    if (dansGuillemets) {
      if (car === '"' && texte[i + 1] === '"') {
        champ += '"';
        i += 1;
      } else if (car === '"') {
        dansGuillemets = false;
      } else {
        champ += car;
      }
    } else if (car === '"') {
      dansGuillemets = true;
    } else if (car === delim) {
      champs.push(champ);
      champ = "";
    } else if (car === "\n") {
      champs.push(champ.replace(/\r$/, ""));
      if (champs.some((valeur) => valeur.trim())) lignes.push(champs);
      champs = [];
      champ = "";
    } else {
      champ += car;
    }
  }
  champs.push(champ.replace(/\r$/, ""));
  if (champs.some((valeur) => valeur.trim())) lignes.push(champs);
  return lignes;
}

/** Relit un CSV exporté par l'app (séparateur ; ou ,). */
export function analyserCsv(texte: string): Prestation[] {
  const lignes = decouperCsv(texte.replace(/^\uFEFF/, ""));
  if (lignes.length < 2) return [];

  const colonnes = lignes[0].map((entete, index) => {
    const cle = aplatir(entete).replace(/\s+/g, "_").replace(/[éèê]/g, "e");
    return { index, champ: ALIAS_COLONNES[cle] };
  });

  return lignes.slice(1).map((valeurs, index) => {
    const ligne: Partial<Prestation> = {};
    for (const { index: i, champ } of colonnes) {
      if (!champ) continue;
      const valeur = (valeurs[i] ?? "").trim();
      if (champ === "id") {
        const id = Number.parseInt(valeur, 10);
        if (Number.isFinite(id)) ligne.id = id;
        continue;
      }
      ligne[champ] = valeur;
    }
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
      declaree: normaliserDeclaration(ligne.declaree ?? ""),
      client_id: ligne.client_id ?? "",
      complete_depuis_historique: "",
      prix_brut: ligne.prix_paye ?? "",
      fichier_source: "import-csv",
      ligne_source: index + 2,
      source_brut: "",
      a_revoir: ligne.a_revoir ?? "",
    };
  });
}

export function nomFichierCsv(): string {
  const jour = new Date().toISOString().slice(0, 10);
  return `prestations-loulou-paradise-${jour}.csv`;
}

export function fabriquerCsv(prestations: Prestation[]): Blob {
  const echapper = (valeur: string) => `"${String(valeur).replace(/"/g, '""')}"`;
  const lignes = [
    ENTETES_EXPORT.map(echapper).join(";"),
    ...prestations.map((p) => COLONNES_EXPORT.map((champ) => echapper(String(p[champ]))).join(";")),
  ];
  // Le BOM permet à Excel de reconnaître l'UTF-8 et d'afficher les accents.
  return new Blob(["\uFEFF" + lignes.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
}

export function exporterCsv(prestations: Prestation[], nomFichier: string): void {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(fabriquerCsv(prestations));
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

export async function envoyerCsvParMail(prestations: Prestation[]): Promise<void> {
  const nom = nomFichierCsv();
  const fichier = new File([fabriquerCsv(prestations)], nom, { type: "text/csv;charset=utf-8;" });
  const sujet = `Registre Loulou Paradise — ${nom}`;
  const corps =
    `Bonjour,\n\nVoici l'export CSV du registre Loulou Paradise (${prestations.length} ligne${prestations.length > 1 ? "s" : ""}).\n\n` +
    `Fichier : ${nom}\n`;

  const partageable = { files: [fichier], title: sujet, text: corps } as ShareData;
  if (navigator.canShare?.(partageable)) {
    try {
      await navigator.share(partageable);
      return;
    } catch (erreur) {
      if (erreur instanceof DOMException && erreur.name === "AbortError") return;
    }
  }

  exporterCsv(prestations, nom);
  const mailto =
    `mailto:${DESTINATAIRE_CSV}` +
    `?subject=${encodeURIComponent(sujet)}` +
    `&body=${encodeURIComponent(`${corps}\nLe fichier ${nom} a été téléchargé. Joignez-le à ce message avant d'envoyer.\n`)}`;
  window.location.href = mailto;
}
