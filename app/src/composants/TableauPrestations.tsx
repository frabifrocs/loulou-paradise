import { Fragment, useMemo, useState } from "react";
import type { Prestation } from "../types";
import { LIBELLES_DRAPEAUX } from "../types";
import { dateLisible, euros, montant, valeursDistinctes } from "../utilitaires";
import CelluleEditable from "./CelluleEditable";

type Props = {
  prestations: Prestation[];
  toutes: Prestation[];
  triChamp: keyof Prestation;
  triOrdre: "asc" | "desc";
  onTri: (champ: keyof Prestation) => void;
  onModifierChamp: (id: number, champ: keyof Prestation, valeur: string) => void;
  onModifier: (prestation: Prestation) => void;
  onSupprimer: (prestation: Prestation) => void;
};

const COLONNES: { champ: keyof Prestation; libelle: string; classe?: string }[] = [
  { champ: "date_prestation", libelle: "Date" },
  { champ: "prenom", libelle: "Prénom" },
  { champ: "nom", libelle: "Nom" },
  { champ: "nom_animal", libelle: "Animal" },
  { champ: "race_animal", libelle: "Race" },
  { champ: "adresse", libelle: "Adresse", classe: "cellule-large" },
  { champ: "telephone", libelle: "Téléphone" },
  { champ: "email", libelle: "Email" },
  { champ: "type_prestation", libelle: "Prestation" },
  { champ: "prix_paye", libelle: "Prix", classe: "cellule-nombre" },
  { champ: "mode_paiement", libelle: "Paiement" },
  { champ: "commentaire", libelle: "Commentaire", classe: "cellule-large" },
];

export default function TableauPrestations({
  prestations,
  toutes,
  triChamp,
  triOrdre,
  onTri,
  onModifierChamp,
  onModifier,
  onSupprimer,
}: Props) {
  const [detailOuvert, setDetailOuvert] = useState<number | null>(null);
  const races = useMemo(() => valeursDistinctes(toutes, "race_animal"), [toutes]);
  const types = useMemo(() => valeursDistinctes(toutes, "type_prestation"), [toutes]);
  const paiements = useMemo(() => valeursDistinctes(toutes, "mode_paiement"), [toutes]);

  if (prestations.length === 0) {
    return <p className="vide">Aucune prestation ne correspond à cette recherche.</p>;
  }

  return (
    <div className="tableau-cadre">
      <table className="tableau">
        <thead>
          <tr>
            {COLONNES.map(({ champ, libelle, classe }) => (
              <th key={champ} className={classe}>
                <button type="button" className="tri" onClick={() => onTri(champ)}>
                  {libelle}
                  {triChamp === champ && <span aria-hidden="true">{triOrdre === "asc" ? " ▲" : " ▼"}</span>}
                </button>
              </th>
            ))}
            <th className="cellule-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {prestations.map((p) => {
            const drapeaux = p.a_revoir ? p.a_revoir.split(",").filter(Boolean) : [];
            const ouvert = detailOuvert === p.id;
            return (
              <Fragment key={p.id}>
                <tr className={drapeaux.length > 0 ? "ligne-signalee" : undefined}>
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
                      valeur={p.prenom}
                      ariaLabel="prénom"
                      onChange={(valeur) => onModifierChamp(p.id, "prenom", valeur)}
                    />
                  </td>
                  <td>
                    <CelluleEditable
                      valeur={p.nom}
                      ariaLabel="nom"
                      onChange={(valeur) => onModifierChamp(p.id, "nom", valeur)}
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
                  <td className="cellule-large">
                    <CelluleEditable
                      valeur={p.adresse}
                      ariaLabel="adresse"
                      onChange={(valeur) => onModifierChamp(p.id, "adresse", valeur)}
                    />
                  </td>
                  <td className="cellule-tel">
                    <CelluleEditable
                      type="tel"
                      valeur={p.telephone}
                      ariaLabel="téléphone"
                      onChange={(valeur) => onModifierChamp(p.id, "telephone", valeur)}
                    />
                  </td>
                  <td>
                    <CelluleEditable
                      type="email"
                      valeur={p.email}
                      ariaLabel="email"
                      onChange={(valeur) => onModifierChamp(p.id, "email", valeur)}
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
                  <td className="cellule-nombre">
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
                  <td className="cellule-large">
                    <CelluleEditable
                      valeur={p.commentaire}
                      ariaLabel="commentaire"
                      onChange={(valeur) => onModifierChamp(p.id, "commentaire", valeur)}
                    />
                  </td>
                  <td className="cellule-actions">
                    <button
                      type="button"
                      className="bouton minuscule"
                      onClick={() => setDetailOuvert(ouvert ? null : p.id)}
                      aria-expanded={ouvert}
                    >
                      {ouvert ? "Masquer" : "Détail"}
                    </button>
                    <button type="button" className="bouton minuscule" onClick={() => onModifier(p)}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="bouton minuscule danger"
                      onClick={() => onSupprimer(p)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
                {ouvert && (
                  <tr className="ligne-detail">
                    <td colSpan={COLONNES.length + 1}>
                      <div className="detail">
                        <div>
                          <h4>Texte d'origine</h4>
                          <p className="citation">{p.source_brut}</p>
                          <p className="source">
                            {p.fichier_source} — ligne {p.ligne_source}
                            {p.prix_brut && <> — prix noté : « {p.prix_brut} »</>}
                          </p>
                        </div>
                        {drapeaux.length > 0 && (
                          <div>
                            <h4>Points à vérifier</h4>
                            <ul>
                              {drapeaux.map((drapeau) => (
                                <li key={drapeau}>{LIBELLES_DRAPEAUX[drapeau] ?? drapeau}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {p.complete_depuis_historique && (
                          <div>
                            <h4>Complété automatiquement</h4>
                            <p>
                              Ces champs ont été recopiés depuis une autre fiche du même client :{" "}
                              {p.complete_depuis_historique.split(",").join(", ")}.
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
