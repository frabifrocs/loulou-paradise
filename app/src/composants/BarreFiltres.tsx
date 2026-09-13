import { useMemo } from "react";
import type { Filtres, Prestation } from "../types";
import { FILTRES_VIDES } from "../types";
import { MOIS_FR, valeursDistinctes } from "../utilitaires";

type Props = {
  prestations: Prestation[];
  filtres: Filtres;
  onChange: (filtres: Filtres) => void;
  nombreResultats: number;
};

export default function BarreFiltres({ prestations, filtres, onChange, nombreResultats }: Props) {
  const annees = useMemo(
    () => [...new Set(prestations.map((p) => p.date_prestation.slice(0, 4)).filter(Boolean))].sort().reverse(),
    [prestations],
  );

  // Les prestations combinées (« Tonte + Coupe ciseaux ») sont éclatées pour que
  // le filtre « Tonte » retrouve aussi les rendez-vous combinés.
  const prestationsUnitaires = useMemo(() => {
    const compte = new Map<string, number>();
    for (const p of prestations) {
      for (const morceau of p.type_prestation.split("+").map((m) => m.trim())) {
        if (morceau) compte.set(morceau, (compte.get(morceau) ?? 0) + 1);
      }
    }
    return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([valeur]) => valeur);
  }, [prestations]);

  const races = useMemo(() => valeursDistinctes(prestations, "race_animal"), [prestations]);
  const paiements = useMemo(() => valeursDistinctes(prestations, "mode_paiement"), [prestations]);

  const actif =
    filtres.recherche !== "" ||
    filtres.annee !== "" ||
    filtres.mois !== "" ||
    filtres.prestation !== "" ||
    filtres.paiement !== "" ||
    filtres.race !== "" ||
    filtres.seulementAVerifier;

  function modifier<C extends keyof Filtres>(champ: C, valeur: Filtres[C]) {
    onChange({ ...filtres, [champ]: valeur });
  }

  return (
    <section className="filtres" aria-label="Filtres">
      <div className="filtre-recherche">
        <label htmlFor="recherche">Rechercher</label>
        <input
          id="recherche"
          type="search"
          placeholder="Nom, animal, race, adresse, téléphone…"
          value={filtres.recherche}
          onChange={(e) => modifier("recherche", e.target.value)}
        />
      </div>

      <div className="filtre">
        <label htmlFor="annee">Année</label>
        <select id="annee" value={filtres.annee} onChange={(e) => modifier("annee", e.target.value)}>
          <option value="">Toutes</option>
          {annees.map((annee) => (
            <option key={annee} value={annee}>
              {annee}
            </option>
          ))}
        </select>
      </div>

      <div className="filtre">
        <label htmlFor="mois">Mois</label>
        <select id="mois" value={filtres.mois} onChange={(e) => modifier("mois", e.target.value)}>
          <option value="">Tous</option>
          {MOIS_FR.map((nom, index) => (
            <option key={nom} value={String(index + 1).padStart(2, "0")}>
              {nom}
            </option>
          ))}
        </select>
      </div>

      <div className="filtre">
        <label htmlFor="prestation">Prestation</label>
        <select
          id="prestation"
          value={filtres.prestation}
          onChange={(e) => modifier("prestation", e.target.value)}
        >
          <option value="">Toutes</option>
          {prestationsUnitaires.map((valeur) => (
            <option key={valeur} value={valeur}>
              {valeur}
            </option>
          ))}
        </select>
      </div>

      <div className="filtre">
        <label htmlFor="race">Race</label>
        <select id="race" value={filtres.race} onChange={(e) => modifier("race", e.target.value)}>
          <option value="">Toutes</option>
          {races.map((valeur) => (
            <option key={valeur} value={valeur}>
              {valeur}
            </option>
          ))}
        </select>
      </div>

      <div className="filtre">
        <label htmlFor="paiement">Paiement</label>
        <select
          id="paiement"
          value={filtres.paiement}
          onChange={(e) => modifier("paiement", e.target.value)}
        >
          <option value="">Tous</option>
          {paiements.map((valeur) => (
            <option key={valeur} value={valeur}>
              {valeur}
            </option>
          ))}
        </select>
      </div>

      <label className="filtre-case">
        <input
          type="checkbox"
          checked={filtres.seulementAVerifier}
          onChange={(e) => modifier("seulementAVerifier", e.target.checked)}
        />
        À vérifier uniquement
      </label>

      {actif && (
        <button type="button" className="bouton discret" onClick={() => onChange(FILTRES_VIDES)}>
          Effacer les filtres ({nombreResultats})
        </button>
      )}
    </section>
  );
}
