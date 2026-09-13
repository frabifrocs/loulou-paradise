import { useMemo, useState } from "react";
import type { Prestation } from "../types";
import {
  aplatir,
  cleClient,
  dateLisible,
  euros,
  montant,
  nomClient,
  valeursDistinctes,
} from "../utilitaires";
import CelluleEditable from "./CelluleEditable";

type Props = {
  prestations: Prestation[];
  onModifierChamp: (id: number, champ: keyof Prestation, valeur: string) => void;
  onModifierClient: (cle: string, champ: keyof Prestation, valeur: string) => void;
  onAjouterPrestation: (fiche: Fiche) => void;
};

type Fiche = {
  cle: string;
  nom: string;
  prenom: string;
  nomFamille: string;
  telephone: string;
  adresse: string;
  email: string;
  animaux: string[];
  visites: number;
  total: number;
  derniereVisite: string;
  premiereVisite: string;
  historique: Prestation[];
};

const CHAMPS_FICHE: { champ: keyof Prestation; libelle: string; type?: "email" | "tel" }[] = [
  { champ: "prenom", libelle: "Prénom" },
  { champ: "nom", libelle: "Nom" },
  { champ: "telephone", libelle: "Téléphone", type: "tel" },
  { champ: "email", libelle: "Email", type: "email" },
  { champ: "adresse", libelle: "Adresse" },
];

export default function Clients({
  prestations,
  onModifierChamp,
  onModifierClient,
  onAjouterPrestation,
}: Props) {
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const fiches = useMemo(() => construireFiches(prestations), [prestations]);
  const races = useMemo(() => valeursDistinctes(prestations, "race_animal"), [prestations]);
  const types = useMemo(() => valeursDistinctes(prestations, "type_prestation"), [prestations]);
  const paiements = useMemo(() => valeursDistinctes(prestations, "mode_paiement"), [prestations]);

  const visibles = useMemo(() => {
    const termes = aplatir(recherche).split(/\s+/).filter(Boolean);
    if (termes.length === 0) return fiches;
    return fiches.filter((fiche) => {
      const foin = aplatir(
        [fiche.nom, fiche.telephone, fiche.adresse, fiche.email, fiche.animaux.join(" ")].join(" "),
      );
      return termes.every((terme) => foin.includes(terme));
    });
  }, [fiches, recherche]);

  return (
    <div className="clients">
      <div className="filtre-recherche autonome">
        <label htmlFor="recherche-client">Rechercher un client</label>
        <input
          id="recherche-client"
          type="search"
          placeholder="Nom, téléphone, animal, commune…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <p className="legende">
        {visibles.length} client{visibles.length > 1 ? "s" : ""} sur {fiches.length}. Cliquez une
        fiche pour corriger les coordonnées (appliquées à toutes les visites) ou une ligne
        d&apos;historique. L&apos;enregistrement est immédiat.
      </p>

      <ul className="liste-clients">
        {visibles.map((fiche) => (
          <li key={fiche.cle} className="carte-client">
            <button
              type="button"
              className="entete-client"
              onClick={() => setOuvert(ouvert === fiche.cle ? null : fiche.cle)}
              aria-expanded={ouvert === fiche.cle}
            >
              <span className="client-nom">{fiche.nom}</span>
              <span className="client-meta">
                {fiche.visites} visite{fiche.visites > 1 ? "s" : ""} · {euros(fiche.total)}
              </span>
              <span className="client-detail">
                {fiche.animaux.slice(0, 3).join(", ")}
                {fiche.animaux.length > 3 && ` +${fiche.animaux.length - 3}`}
              </span>
              <span className="client-date">dernière visite {dateLisible(fiche.derniereVisite)}</span>
            </button>

            {ouvert === fiche.cle && (
              <div className="corps-client">
                <dl className="coordonnees">
                  {CHAMPS_FICHE.map(({ champ, libelle, type }) => {
                    const valeursFiche: Record<string, string> = {
                      prenom: fiche.prenom,
                      nom: fiche.nomFamille,
                      telephone: fiche.telephone,
                      email: fiche.email,
                      adresse: fiche.adresse,
                    };
                    return (
                      <div key={champ} className="coordonnee">
                        <dt>{libelle}</dt>
                        <dd>
                          <CelluleEditable
                            type={type}
                            valeur={valeursFiche[champ] ?? ""}
                            ariaLabel={libelle}
                            onChange={(valeur) => onModifierClient(fiche.cle, champ, valeur)}
                          />
                        </dd>
                      </div>
                    );
                  })}
                  <div className="coordonnee">
                    <dt>Client depuis</dt>
                    <dd>{dateLisible(fiche.premiereVisite)}</dd>
                  </div>
                  <div className="coordonnee">
                    <dt>Panier moyen</dt>
                    <dd>{euros(fiche.total / fiche.visites)}</dd>
                  </div>
                </dl>

                <div className="tableau-cadre">
                <table className="tableau-simple">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Animal</th>
                      <th>Race</th>
                      <th>Prestation</th>
                      <th>Prix</th>
                      <th>Paiement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiche.historique.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <CelluleEditable
                            type="date"
                            valeur={p.date_prestation}
                            affichage={dateLisible(p.date_prestation)}
                            ariaLabel="date"
                            onChange={(valeur) => onModifierChamp(p.id, "date_prestation", valeur)}
                          />
                        </td>
                        <td>
                          <CelluleEditable
                            valeur={p.nom_animal}
                            ariaLabel="nom de l'animal"
                            onChange={(valeur) => onModifierChamp(p.id, "nom_animal", valeur)}
                          />
                        </td>
                        <td>
                          <CelluleEditable
                            valeur={p.race_animal}
                            suggestions={races}
                            ariaLabel="race"
                            onChange={(valeur) => onModifierChamp(p.id, "race_animal", valeur)}
                          />
                        </td>
                        <td>
                          <CelluleEditable
                            valeur={p.type_prestation}
                            suggestions={types}
                            ariaLabel="prestation"
                            onChange={(valeur) => onModifierChamp(p.id, "type_prestation", valeur)}
                          />
                        </td>
                        <td>
                          <CelluleEditable
                            type="decimal"
                            valeur={p.prix_paye}
                            affichage={p.prix_paye ? euros(montant(p.prix_paye)) : ""}
                            ariaLabel="prix"
                            onChange={(valeur) => onModifierChamp(p.id, "prix_paye", valeur)}
                          />
                        </td>
                        <td>
                          <CelluleEditable
                            valeur={p.mode_paiement}
                            suggestions={paiements}
                            ariaLabel="mode de paiement"
                            onChange={(valeur) => onModifierChamp(p.id, "mode_paiement", valeur)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            <div className="pied-client">
              <button
                type="button"
                className="bouton minuscule principal"
                onClick={() => {
                  setOuvert(fiche.cle);
                  onAjouterPrestation(fiche);
                }}
              >
                Ajouter une prestation
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function construireFiches(prestations: Prestation[]): Fiche[] {
  const groupes = new Map<string, Prestation[]>();
  for (const p of prestations) {
    const cle = cleClient(p);
    const groupe = groupes.get(cle) ?? [];
    groupe.push(p);
    groupes.set(cle, groupe);
  }

  const fiches: Fiche[] = [];
  for (const [cle, groupe] of groupes) {
    const parDate = [...groupe].sort((a, b) => b.date_prestation.localeCompare(a.date_prestation));
    const premier = (champ: keyof Prestation) =>
      String(groupe.find((p) => p[champ])?.[champ] ?? "");

    fiches.push({
      cle,
      nom: nomClient(parDate[0]),
      prenom: premier("prenom"),
      nomFamille: premier("nom"),
      telephone: premier("telephone"),
      adresse: premier("adresse"),
      email: premier("email"),
      animaux: [
        ...new Set(
          groupe
            .map((p) => p.nom_animal || p.race_animal)
            .filter(Boolean)
            .map((valeur) => valeur.trim()),
        ),
      ],
      visites: groupe.length,
      total: groupe.reduce((somme, p) => somme + montant(p.prix_paye), 0),
      derniereVisite: parDate[0].date_prestation,
      premiereVisite: parDate[parDate.length - 1].date_prestation,
      historique: parDate,
    });
  }

  return fiches.sort((a, b) => b.derniereVisite.localeCompare(a.derniereVisite));
}
