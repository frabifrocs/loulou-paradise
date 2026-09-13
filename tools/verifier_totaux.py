"""Compare les totaux calculés aux montants déclarés en fin de fichier.

Certains fichiers se terminent par une ligne de bilan (« 1424 déclaré », « 465 euros
déclaré »). Ce contrôle indépendant permet de savoir si l'extraction des prix tombe
juste, mois par mois.

Usage : py tools/verifier_totaux.py
"""

import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_prestations import lire_odt, mois_annee_du_fichier, norm

SRC = "Source de données"

RE_DECLARE = re.compile(r"(\d[\d\s.,]{1,7})\s*(?:euros?)?\s*(?:net\s*)?(?:declare|a declarer)")


def montants_declares(lignes):
    trouves = []
    for ligne in lignes:
        n = norm(ligne)
        for m in RE_DECLARE.finditer(n):
            brut = m.group(1).replace(" ", "").replace(",", ".").rstrip(".")
            try:
                valeur = float(brut)
            except ValueError:
                continue
            if 50 <= valeur <= 50000:
                trouves.append((valeur, ligne.strip()))
    return trouves


def main():
    calcule = {}
    with open(os.path.join("data", "prestations.csv"), encoding="utf-8-sig") as handle:
        for ligne in csv.DictReader(handle, delimiter=";"):
            cle = ligne["fichier_source"]
            if ligne["prix_paye"]:
                calcule[cle] = calcule.get(cle, 0.0) + float(ligne["prix_paye"])

    print("%-32s %10s %10s %8s" % ("fichier", "calculé", "déclaré", "écart"))
    print("-" * 64)
    ecarts = []
    sans_declaration = []

    for nom_fichier in sorted(os.listdir(SRC), key=lambda n: mois_annee_du_fichier(n)[::-1]):
        if not nom_fichier.lower().endswith(".odt"):
            continue
        declares = montants_declares(lire_odt(os.path.join(SRC, nom_fichier)))
        total_calcule = calcule.get(nom_fichier, 0.0)
        if not declares:
            sans_declaration.append(nom_fichier)
            continue
        total_declare = max(v for v, _ in declares)
        ecart = total_calcule - total_declare
        ecarts.append((nom_fichier, total_calcule, total_declare, ecart))
        print("%-32s %10.0f %10.0f %8.0f" % (nom_fichier, total_calcule, total_declare, ecart))

    print()
    print("%d fichiers comportent un montant déclaré, %d n'en ont pas."
          % (len(ecarts), len(sans_declaration)))
    if ecarts:
        proches = sum(1 for _, _, d, e in ecarts if d and abs(e) / d <= 0.05)
        print("%d sur %d à moins de 5 %% d'écart." % (proches, len(ecarts)))
    print()
    print("Total général calculé : %.0f €" % sum(calcule.values()))


if __name__ == "__main__":
    main()
