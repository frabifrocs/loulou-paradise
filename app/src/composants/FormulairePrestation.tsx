import { useEffect, useMemo, useState } from "react";
import type { Prestation } from "../types";
import { valeursDistinctes } from "../utilitaires";

type Props = {
  prestation: Prestation | null;
  identifiantPropose: number;
  prestationsExistantes: Prestation[];
  onValider: (prestation: Prestation) => void;
  onAnnuler: () => void;
};

function vide(id: number): Prestation {
  return {
    id,
    date_prestation: new Date().toISOString().slice(0, 10),
    prenom: "",
    nom: "",
    nom_animal: "",
    race_animal: "",
    adresse: "",
    telephone: "",
    email: "",
    type_prestation: "",
    prix_paye: "",
    mode_paiement: "Espèces",
    commentaire: "",
    declaree: "",
    client_id: "",
    complete_depuis_historique: "",
    prix_brut: "",
    fichier_source: "saisie manuelle",
    ligne_source: "",
    source_brut: "",
    a_revoir: "",
  };
}

export function prestationVide(id: number): Prestation {
  return vide(id);
}

export default function FormulairePrestation({
  prestation,
  identifiantPropose,
  prestationsExistantes,
  onValider,
  onAnnuler,
}: Props) {
  const [valeurs, setValeurs] = useState<Prestation>(prestation ?? vide(identifiantPropose));
  const [erreur, setErreur] = useState("");
  const existante = Boolean(
    prestation && prestationsExistantes.some((p) => p.id === prestation.id),
  );

  const races = useMemo(
    () => valeursDistinctes(prestationsExistantes, "race_animal"),
    [prestationsExistantes],
  );
  const prestationsConnues = useMemo(
    () => valeursDistinctes(prestationsExistantes, "type_prestation"),
    [prestationsExistantes],
  );
  const paiements = useMemo(
    () => valeursDistinctes(prestationsExistantes, "mode_paiement"),
    [prestationsExistantes],
  );

  useEffect(() => {
    function surEchap(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") onAnnuler();
    }
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [onAnnuler]);

  function modifier(champ: keyof Prestation, valeur: string) {
    setValeurs({ ...valeurs, [champ]: valeur });
  }

  /** Réutilise les coordonnées déjà connues quand on retrouve le téléphone saisi. */
  function completerDepuisTelephone(telephone: string) {
    const chiffres = telephone.replace(/\D/g, "").slice(-9);
    if (chiffres.length < 9) return;
    const anterieure = prestationsExistantes.find(
      (p) => p.telephone.replace(/\D/g, "").slice(-9) === chiffres,
    );
    if (!anterieure) return;
    setValeurs((actuelles) => ({
      ...actuelles,
      prenom: actuelles.prenom || anterieure.prenom,
      nom: actuelles.nom || anterieure.nom,
      adresse: actuelles.adresse || anterieure.adresse,
      email: actuelles.email || anterieure.email,
      client_id: actuelles.client_id || anterieure.client_id,
    }));
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!valeurs.date_prestation) {
      setErreur("La date est obligatoire.");
      return;
    }
    if (!valeurs.nom && !valeurs.prenom && !valeurs.telephone) {
      setErreur("Indiquez au moins un nom, un prénom ou un téléphone pour identifier le client.");
      return;
    }
    const prix = valeurs.prix_paye.replace(",", ".");
    if (prix && !Number.isFinite(Number.parseFloat(prix))) {
      setErreur("Le prix doit être un nombre, par exemple 55 ou 55.50.");
      return;
    }
    if (!existante && valeurs.declaree !== "oui" && valeurs.declaree !== "non") {
      setErreur("Indiquez si la prestation est déclarée ou non.");
      return;
    }
    onValider({ ...valeurs, prix_paye: prix });
  }

  return (
    <div className="voile" role="dialog" aria-modal="true" aria-labelledby="titre-formulaire">
      <form className="panneau" onSubmit={soumettre}>
        <h2 id="titre-formulaire">
          {existante ? "Modifier la prestation" : "Nouvelle prestation"}
        </h2>

        <div className="grille-champs">
          <Champ libelle="Date" obligatoire>
            <input
              type="date"
              required
              value={valeurs.date_prestation}
              onChange={(e) => modifier("date_prestation", e.target.value)}
            />
          </Champ>

          <Champ libelle="Téléphone">
            <input
              type="tel"
              placeholder="06.12.34.56.78"
              value={valeurs.telephone}
              onChange={(e) => modifier("telephone", e.target.value)}
              onBlur={(e) => completerDepuisTelephone(e.target.value)}
            />
          </Champ>

          <Champ libelle="Prénom">
            <input value={valeurs.prenom} onChange={(e) => modifier("prenom", e.target.value)} />
          </Champ>

          <Champ libelle="Nom">
            <input value={valeurs.nom} onChange={(e) => modifier("nom", e.target.value)} />
          </Champ>

          <Champ libelle="Nom de l'animal">
            <input
              value={valeurs.nom_animal}
              onChange={(e) => modifier("nom_animal", e.target.value)}
            />
          </Champ>

          <Champ libelle="Race">
            <input
              list="liste-races"
              value={valeurs.race_animal}
              onChange={(e) => modifier("race_animal", e.target.value)}
            />
            <datalist id="liste-races">
              {races.map((race) => (
                <option key={race} value={race} />
              ))}
            </datalist>
          </Champ>

          <Champ libelle="Adresse" large>
            <input value={valeurs.adresse} onChange={(e) => modifier("adresse", e.target.value)} />
          </Champ>

          <Champ libelle="Email">
            <input
              type="email"
              value={valeurs.email}
              onChange={(e) => modifier("email", e.target.value)}
            />
          </Champ>

          <Champ libelle="Prestation">
            <input
              list="liste-prestations"
              value={valeurs.type_prestation}
              onChange={(e) => modifier("type_prestation", e.target.value)}
            />
            <datalist id="liste-prestations">
              {prestationsConnues.map((valeur) => (
                <option key={valeur} value={valeur} />
              ))}
            </datalist>
          </Champ>

          <Champ libelle="Prix payé (€)">
            <input
              inputMode="decimal"
              placeholder="55"
              value={valeurs.prix_paye}
              onChange={(e) => modifier("prix_paye", e.target.value)}
            />
          </Champ>

          <Champ libelle="Mode de paiement">
            <input
              list="liste-paiements"
              value={valeurs.mode_paiement}
              onChange={(e) => modifier("mode_paiement", e.target.value)}
            />
            <datalist id="liste-paiements">
              {paiements.map((valeur) => (
                <option key={valeur} value={valeur} />
              ))}
            </datalist>
          </Champ>

          <fieldset className="champ large choix-declaration">
            <legend>Déclaration{!existante && <em aria-hidden="true"> *</em>}</legend>
            <div className="choix-declaration-options">
              <label className={valeurs.declaree === "oui" ? "actif" : undefined}>
                <input
                  type="radio"
                  name="declaree"
                  value="oui"
                  checked={valeurs.declaree === "oui"}
                  onChange={() => modifier("declaree", "oui")}
                />
                Déclaré
              </label>
              <label className={valeurs.declaree === "non" ? "actif" : undefined}>
                <input
                  type="radio"
                  name="declaree"
                  value="non"
                  checked={valeurs.declaree === "non"}
                  onChange={() => modifier("declaree", "non")}
                />
                Non déclaré
              </label>
            </div>
          </fieldset>

          <Champ libelle="Commentaire" large>
            <textarea
              rows={3}
              value={valeurs.commentaire}
              onChange={(e) => modifier("commentaire", e.target.value)}
            />
          </Champ>
        </div>

        {erreur && <p className="erreur">{erreur}</p>}

        <div className="panneau-actions">
          <button type="button" className="bouton discret" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="bouton principal">
            {existante ? "Enregistrer les modifications" : "Ajouter la prestation"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Champ({
  libelle,
  children,
  large,
  obligatoire,
}: {
  libelle: string;
  children: React.ReactNode;
  large?: boolean;
  obligatoire?: boolean;
}) {
  return (
    <label className={large ? "champ large" : "champ"}>
      <span>
        {libelle}
        {obligatoire && <em aria-hidden="true"> *</em>}
      </span>
      {children}
    </label>
  );
}
