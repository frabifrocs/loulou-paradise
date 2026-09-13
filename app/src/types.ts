export type Prestation = {
  id: number;
  date_prestation: string;
  prenom: string;
  nom: string;
  nom_animal: string;
  race_animal: string;
  adresse: string;
  telephone: string;
  email: string;
  type_prestation: string;
  prix_paye: string;
  mode_paiement: string;
  commentaire: string;
  /** "oui", "non", ou vide pour les anciennes lignes. */
  declaree: string;
  client_id: string;
  /** Champs recopiés depuis une autre fiche du même client. */
  complete_depuis_historique: string;
  /** Texte exact du prix dans le fichier d'origine, pour pouvoir vérifier. */
  prix_brut: string;
  fichier_source: string;
  ligne_source: string | number;
  /** Bloc de texte d'origine, conservé pour lever un doute. */
  source_brut: string;
  /** Liste des points signalés lors de la consolidation, séparés par des virgules. */
  a_revoir: string;
};

export type Colonne = keyof Prestation;

export type Filtres = {
  recherche: string;
  annee: string;
  mois: string;
  prestation: string;
  paiement: string;
  race: string;
  seulementAVerifier: boolean;
};

export const FILTRES_VIDES: Filtres = {
  recherche: "",
  annee: "",
  mois: "",
  prestation: "",
  paiement: "",
  race: "",
  seulementAVerifier: false,
};

export const LIBELLES_DRAPEAUX: Record<string, string> = {
  prestation_absente: "Prestation non notée dans le fichier d'origine",
  plusieurs_animaux: "Plusieurs animaux sur ce rendez-vous",
  prix_a_verifier: "Prix composé de plusieurs montants, à confirmer",
  proprietaire_absent: "Propriétaire non noté dans le fichier d'origine",
  paiement_absent: "Mode de paiement non noté",
  race_absente: "Race non notée dans le fichier d'origine",
  ligne_non_classee: "Une ligne du fichier n'a pas pu être interprétée",
  prix_absent: "Aucun prix noté",
  nom_prenom_a_verifier: "Ordre prénom / nom à confirmer",
};
