import { useMemo, useState } from "react";
import type { Prestation } from "../types";
import { MOIS_FR, euros, montant } from "../utilitaires";

const MOIS_COURT = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];

type Props = { prestations: Prestation[] };

type CumulMois = {
  total: number;
  declare: number;
  nonDeclare: number;
  nombre: number;
};

export default function Statistiques({ prestations }: Props) {
  const [moisActif, setMoisActif] = useState<string | null>(null);

  const parMois = useMemo(() => {
    const cumul = new Map<string, CumulMois>();
    for (const p of prestations) {
      const cle = p.date_prestation.slice(0, 7);
      if (!cle) continue;
      const actuel = cumul.get(cle) ?? { total: 0, declare: 0, nonDeclare: 0, nombre: 0 };
      const prix = montant(p.prix_paye);
      cumul.set(cle, {
        total: actuel.total + prix,
        declare: actuel.declare + (p.declaree === "oui" ? prix : 0),
        nonDeclare: actuel.nonDeclare + (p.declaree === "non" ? prix : 0),
        nombre: actuel.nombre + 1,
      });
    }
    return [...cumul.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [prestations]);

  const parAnnee = useMemo(() => {
    const cumul = new Map<string, { total: number; nombre: number }>();
    for (const p of prestations) {
      const cle = p.date_prestation.slice(0, 4);
      if (!cle) continue;
      const actuel = cumul.get(cle) ?? { total: 0, nombre: 0 };
      cumul.set(cle, { total: actuel.total + montant(p.prix_paye), nombre: actuel.nombre + 1 });
    }
    return [...cumul.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [prestations]);

  const repartitionPaiement = useMemo(() => classer(prestations, (p) => p.mode_paiement), [prestations]);
  const topRaces = useMemo(() => classer(prestations, (p) => p.race_animal).slice(0, 10), [prestations]);

  const topClients = useMemo(() => {
    const cumul = new Map<string, { total: number; nombre: number; nom: string }>();
    for (const p of prestations) {
      const nom = [p.prenom, p.nom].filter(Boolean).join(" ").trim();
      const cle = p.client_id || nom;
      if (!cle) continue;
      const actuel = cumul.get(cle) ?? { total: 0, nombre: 0, nom: nom || cle };
      cumul.set(cle, {
        total: actuel.total + montant(p.prix_paye),
        nombre: actuel.nombre + 1,
        nom: actuel.nom || nom,
      });
    }
    return [...cumul.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [prestations]);

  const maximumMensuel = Math.max(1, ...parMois.map(([, v]) => v.total));
  const total = parAnnee.reduce((somme, [, v]) => somme + v.total, 0);
  const nombre = parAnnee.reduce((somme, [, v]) => somme + v.nombre, 0);
  const detail = moisActif ? parMois.find(([cle]) => cle === moisActif) : undefined;

  return (
    <div className="statistiques">
      <section className="indicateurs">
        <div className="indicateur">
          <strong>{euros(total)}</strong>
          <span>encaissé au total</span>
        </div>
        <div className="indicateur">
          <strong>{nombre}</strong>
          <span>prestations enregistrées</span>
        </div>
        <div className="indicateur">
          <strong>{nombre ? euros(total / nombre) : "—"}</strong>
          <span>prix moyen par prestation</span>
        </div>
        <div className="indicateur">
          <strong>{parMois.length ? euros(total / parMois.length) : "—"}</strong>
          <span>moyenne mensuelle</span>
        </div>
      </section>

      <section className="carte">
        <h3>Chiffre d'affaires par mois</h3>
        <div className="graphique" role="list" aria-label="Histogramme du chiffre d'affaires mensuel">
          {parMois.map(([cle, valeur]) => {
            const [annee, mois] = cle.split("-");
            const hauteur = (valeur.total / maximumMensuel) * 100;
            return (
              <button
                key={cle}
                type="button"
                className={moisActif === cle ? "barre-colonne active" : "barre-colonne"}
                onClick={() => setMoisActif(moisActif === cle ? null : cle)}
                aria-pressed={moisActif === cle}
                aria-label={`${MOIS_FR[Number.parseInt(mois, 10) - 1]} ${annee}`}
              >
                <span
                  className="barre"
                  style={{ height: `${Math.max(hauteur, 1)}%` }}
                />
                {mois === "01" && <span className="barre-annee">{annee}</span>}
              </button>
            );
          })}
        </div>
        <ul className="ca-par-mois">
          {parMois.map(([cle, valeur]) => {
            const [annee, mois] = cle.split("-");
            return (
              <li key={cle}>
                <button
                  type="button"
                  className={moisActif === cle ? "actif" : undefined}
                  onClick={() => setMoisActif(moisActif === cle ? null : cle)}
                >
                  <strong>
                    {MOIS_COURT[Number.parseInt(mois, 10) - 1]} {annee.slice(2)}
                  </strong>
                  <span>{euros(valeur.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {detail && (
          <dl className="detail-mois">
            <div>
              <dt>Mois</dt>
              <dd>{etiquetteMois(detail[0])}</dd>
            </div>
            <div>
              <dt>CA globale</dt>
              <dd>{euros(detail[1].total)}</dd>
            </div>
            <div>
              <dt>CA déclaré</dt>
              <dd>{euros(detail[1].declare)}</dd>
            </div>
            <div>
              <dt>CA non déclaré</dt>
              <dd>{euros(detail[1].nonDeclare)}</dd>
            </div>
            <div>
              <dt>Prestations</dt>
              <dd>{detail[1].nombre}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="colonnes">
        <section className="carte">
          <h3>Par année</h3>
          <table className="tableau-simple">
            <thead>
              <tr>
                <th>Année</th>
                <th>Prestations</th>
                <th>Chiffre d'affaires</th>
                <th>Prix moyen</th>
              </tr>
            </thead>
            <tbody>
              {parAnnee.map(([annee, valeur]) => (
                <tr key={annee}>
                  <td>{annee}</td>
                  <td>{valeur.nombre}</td>
                  <td>{euros(valeur.total)}</td>
                  <td>{euros(valeur.total / valeur.nombre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="carte">
          <h3>Modes de paiement</h3>
          <ul className="barres-horizontales">
            {repartitionPaiement.map(({ cle, nombre: n }) => (
              <li key={cle}>
                <span className="barre-libelle">{cle}</span>
                <span className="barre-piste">
                  <span
                    className="barre-remplissage"
                    style={{ width: `${(n / repartitionPaiement[0].nombre) * 100}%` }}
                  />
                </span>
                <span className="barre-valeur">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="colonnes">
        <section className="carte">
          <h3>Races les plus fréquentes</h3>
          <ul className="barres-horizontales">
            {topRaces.map(({ cle, nombre: n }) => (
              <li key={cle}>
                <span className="barre-libelle">{cle}</span>
                <span className="barre-piste">
                  <span
                    className="barre-remplissage"
                    style={{ width: `${(n / topRaces[0].nombre) * 100}%` }}
                  />
                </span>
                <span className="barre-valeur">{n}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="carte">
          <h3>Meilleurs clients</h3>
          <table className="tableau-simple">
            <thead>
              <tr>
                <th>Client</th>
                <th>Visites</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {topClients.map((client) => (
                <tr key={client.nom}>
                  <td>{client.nom}</td>
                  <td>{client.nombre}</td>
                  <td>{euros(client.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function classer(prestations: Prestation[], extraire: (p: Prestation) => string) {
  const compte = new Map<string, number>();
  for (const p of prestations) {
    const cle = extraire(p).trim();
    if (cle) compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([cle, nombre]) => ({ cle, nombre }))
    .sort((a, b) => b.nombre - a.nombre);
}

function etiquetteMois(cle: string | undefined): string {
  if (!cle) return "—";
  const [annee, mois] = cle.split("-");
  return `${MOIS_FR[Number.parseInt(mois, 10) - 1]} ${annee}`;
}
