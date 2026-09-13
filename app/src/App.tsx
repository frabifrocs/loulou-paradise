import { useEffect, useMemo, useRef, useState } from "react";
import type { Filtres, Prestation } from "./types";
import { FILTRES_VIDES } from "./types";
import { charger, enregistrerTout, prochainIdentifiant } from "./donnees/store";
import {
  analyserCsv,
  appliquerCorrection,
  cleClient,
  envoyerCsvParMail,
  euros,
  filtrer,
  montant,
  trier,
} from "./utilitaires";
import BarreFiltres from "./composants/BarreFiltres";
import TableauPrestations from "./composants/TableauPrestations";
import FormulairePrestation, { prestationVide } from "./composants/FormulairePrestation";
import Statistiques from "./composants/Statistiques";
import Clients from "./composants/Clients";

type Onglet = "prestations" | "clients" | "statistiques";

const PAR_PAGE = 50;

export default function App() {
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [triChamp, setTriChamp] = useState<keyof Prestation>("date_prestation");
  const [triOrdre, setTriOrdre] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [onglet, setOnglet] = useState<Onglet>("prestations");
  const [enEdition, setEnEdition] = useState<Prestation | "nouvelle" | null>(null);
  const horsLignePret = useHorsLignePret();
  const champCsv = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let actif = true;
    charger()
      .then((liste) => {
        if (!actif) return;
        setPrestations(liste);
        setErreurChargement("");
      })
      .catch((erreur: unknown) => {
        if (!actif) return;
        setErreurChargement(erreur instanceof Error ? erreur.message : "Chargement impossible");
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  const filtrees = useMemo(() => filtrer(prestations, filtres), [prestations, filtres]);
  const triees = useMemo(() => trier(filtrees, triChamp, triOrdre), [filtrees, triChamp, triOrdre]);

  const nombrePages = Math.max(1, Math.ceil(triees.length / PAR_PAGE));
  const pageCourante = Math.min(page, nombrePages);
  const visibles = triees.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  const totalFiltre = filtrees.reduce((somme, p) => somme + montant(p.prix_paye), 0);
  const aVerifier = prestations.filter((p) => p.a_revoir).length;

  function majFiltres(nouveaux: Filtres) {
    setFiltres(nouveaux);
    setPage(1);
  }

  function changerTri(champ: keyof Prestation) {
    if (champ === triChamp) {
      setTriOrdre(triOrdre === "asc" ? "desc" : "asc");
    } else {
      setTriChamp(champ);
      setTriOrdre(champ === "date_prestation" || champ === "prix_paye" ? "desc" : "asc");
    }
  }

  function persister(liste: Prestation[]) {
    setPrestations(liste);
    enregistrerTout(liste);
  }

  function enregistrer(prestation: Prestation) {
    const existe = prestations.some((p) => p.id === prestation.id);
    persister(
      existe
        ? prestations.map((p) => (p.id === prestation.id ? prestation : p))
        : [...prestations, prestation],
    );
    setEnEdition(null);
  }

  function modifierChamp(id: number, champ: keyof Prestation, valeur: string) {
    persister(
      prestations.map((p) => (p.id === id ? appliquerCorrection(p, champ, valeur) : p)),
    );
  }

  function modifierClient(cle: string, champ: keyof Prestation, valeur: string) {
    persister(
      prestations.map((p) =>
        cleClient(p) === cle ? appliquerCorrection(p, champ, valeur) : p,
      ),
    );
  }

  function ajouterPourClient(fiche: {
    cle: string;
    prenom: string;
    nomFamille: string;
    telephone: string;
    adresse: string;
    email: string;
    historique: Prestation[];
  }) {
    const derniere = fiche.historique[0];
    setEnEdition({
      ...prestationVide(prochainIdentifiant(prestations)),
      prenom: fiche.prenom,
      nom: fiche.nomFamille,
      telephone: fiche.telephone,
      adresse: fiche.adresse,
      email: fiche.email,
      client_id: fiche.cle,
      nom_animal: derniere?.nom_animal ?? "",
      race_animal: derniere?.race_animal ?? "",
    });
  }

  async function importerCsv(fichier: File) {
    const lues = analyserCsv(await fichier.text());
    if (lues.length === 0) {
      alert("Aucune prestation trouvée dans ce fichier.");
      return;
    }
    if (
      prestations.length > 0 &&
      !confirm(`Remplacer les ${prestations.length} prestations actuelles par les ${lues.length} lignes du fichier ?`)
    ) {
      return;
    }
    persister(lues);
  }

  function supprimer(prestation: Prestation) {
    const nom = [prestation.nom_animal, prestation.race_animal].filter(Boolean).join(" ");
    if (!confirm(`Supprimer définitivement la prestation du ${prestation.date_prestation} (${nom}) ?`)) {
      return;
    }
    persister(prestations.filter((p) => p.id !== prestation.id));
  }

  return (
    <div className="application">
      <header className="entete">
        <div className="entete-titre">
          <span className="entete-logo" aria-hidden="true">
            🐾
          </span>
          <div>
            <h1>Loulou Paradise</h1>
            <p className={horsLignePret ? "entete-hors-ligne" : undefined}>
              {horsLignePret
                ? "Disponible hors ligne — tu peux te déconnecter"
                : "Registre des prestations de toilettage"}
            </p>
          </div>
        </div>

        <nav className="onglets" aria-label="Sections">
          {(
            [
              ["prestations", "Prestations"],
              ["clients", "Clients"],
              ["statistiques", "Statistiques"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              className={onglet === cle ? "onglet actif" : "onglet"}
              onClick={() => setOnglet(cle)}
            >
              {libelle}
            </button>
          ))}
        </nav>
      </header>

      <main className="contenu">
        {chargement && <p className="vide">Chargement des prestations…</p>}
        {erreurChargement && <p className="vide">{erreurChargement}</p>}

        {!chargement && !erreurChargement && onglet === "prestations" && (
          <>
            <section className="indicateurs">
              <Indicateur valeur={String(filtrees.length)} libelle="prestations affichées" />
              <Indicateur valeur={euros(totalFiltre)} libelle="encaissé sur la sélection" />
              <Indicateur
                valeur={filtrees.length ? euros(totalFiltre / filtrees.length) : "—"}
                libelle="prix moyen"
              />
              <Indicateur valeur={String(aVerifier)} libelle="lignes à vérifier" accent />
            </section>

            <BarreFiltres
              prestations={prestations}
              filtres={filtres}
              onChange={majFiltres}
              nombreResultats={filtrees.length}
            />

            <div className="actions">
              <button type="button" className="bouton principal" onClick={() => setEnEdition("nouvelle")}>
                Nouvelle prestation
              </button>
              <button type="button" className="bouton" onClick={() => champCsv.current?.click()}>
                Importer un CSV
              </button>
              <button
                type="button"
                className="bouton"
                disabled={prestations.length === 0}
                onClick={() => {
                  void envoyerCsvParMail(triees);
                }}
              >
                Envoyer le CSV par mail
              </button>
              <input
                ref={champCsv}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(evenement) => {
                  const fichier = evenement.target.files?.[0];
                  evenement.target.value = "";
                  if (fichier) void importerCsv(fichier);
                }}
              />
              <p className="legende actions-legende">
                {prestations.length === 0
                  ? "Importe le fichier CSV pour retrouver le registre. Ensuite tout reste sur cet appareil."
                  : "Cliquez une cellule pour la corriger. L'enregistrement est immédiat."}
              </p>
            </div>

            {prestations.length === 0 ? (
              <p className="vide">Aucune prestation. Importe le CSV pour charger le registre.</p>
            ) : (
              <>
                <TableauPrestations
                  prestations={visibles}
                  toutes={prestations}
                  triChamp={triChamp}
                  triOrdre={triOrdre}
                  onTri={changerTri}
                  onModifierChamp={modifierChamp}
                  onModifier={setEnEdition}
                  onSupprimer={supprimer}
                />

                {nombrePages > 1 && (
                  <nav className="pagination" aria-label="Pages de résultats">
                    <button
                      type="button"
                      className="bouton discret"
                      disabled={pageCourante === 1}
                      onClick={() => setPage(pageCourante - 1)}
                    >
                      Précédent
                    </button>
                    <span>
                      Page {pageCourante} sur {nombrePages}
                    </span>
                    <button
                      type="button"
                      className="bouton discret"
                      disabled={pageCourante === nombrePages}
                      onClick={() => setPage(pageCourante + 1)}
                    >
                      Suivant
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}

        {!chargement && !erreurChargement && onglet === "clients" && (
          <Clients
            prestations={prestations}
            onModifierChamp={modifierChamp}
            onModifierClient={modifierClient}
            onAjouterPrestation={ajouterPourClient}
          />
        )}
        {!chargement && !erreurChargement && onglet === "statistiques" && (
          <Statistiques prestations={prestations} />
        )}
      </main>

      {enEdition && (
        <FormulairePrestation
          key={enEdition === "nouvelle" ? "nouvelle" : enEdition.id}
          prestation={enEdition === "nouvelle" ? null : enEdition}
          identifiantPropose={prochainIdentifiant(prestations)}
          prestationsExistantes={prestations}
          onValider={enregistrer}
          onAnnuler={() => setEnEdition(null)}
        />
      )}
    </div>
  );
}

function useHorsLignePret() {
  const [pret, setPret] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const actualiser = () => setPret(Boolean(navigator.serviceWorker.controller));
    actualiser();
    navigator.serviceWorker.addEventListener("controllerchange", actualiser);
    void navigator.serviceWorker.ready.then(actualiser);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", actualiser);
    };
  }, []);

  return pret;
}

function Indicateur({
  valeur,
  libelle,
  accent,
}: {
  valeur: string;
  libelle: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "indicateur accent" : "indicateur"}>
      <strong>{valeur}</strong>
      <span>{libelle}</span>
    </div>
  );
}
