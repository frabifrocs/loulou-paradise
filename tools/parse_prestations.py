"""Transforme les 46 fichiers .odt de « Source de données » en un tableau structuré.

Produit :
  - data/prestations.csv   le tableau consolidé (séparateur ;, UTF-8 BOM, lisible par Excel)
  - data/prestations.json  les mêmes données pour l'application web
  - tools/_rapport.txt     le diagnostic : tout ce que le parseur n'a pas su interpréter

Le principe : les fichiers sont du texte libre, donc chaque bloc de lignes
correspondant à un rendez-vous est découpé en mots, puis les races et les
prestations sont reconnues par séquences de mots (et non par expressions
régulières sur la ligne entière, ce qui alignait mal les positions).

Usage : py tools/parse_prestations.py
"""

import csv
import datetime
import json
import os
import re
import sys
import unicodedata
import zipfile
from xml.etree import ElementTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vocabulaire import (
    ALIAS_RACES,
    ANNEE_PAR_DEFAUT,
    CIVILITES,
    COMMUNES,
    COUPURES_NOM,
    GENERIQUES,
    JOURS,
    LIBELLES,
    MOIS,
    MOTS_ADRESSE,
    MOTS_COURANTS,
    MOTS_DEPENSE,
    MOTS_SYNTHESE,
    PAIEMENTS,
    PARTICULES,
    PRENOMS,
    PRESTATIONS,
    RACES,
)

SRC = "Source de données"
DATA = "data"
RAPPORT = os.path.join("tools", "_rapport.txt")

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}


def tag(name):
    prefix, local = name.split(":")
    return "{%s}%s" % (NS[prefix], local)


P_TAGS = {tag("text:p"), tag("text:h")}


# --------------------------------------------------------------------------
# Lecture des fichiers .odt
# --------------------------------------------------------------------------

def node_text(node):
    parts = []

    def walk(elem):
        if elem.tag == tag("text:line-break"):
            parts.append("\n")
        elif elem.tag == tag("text:tab"):
            parts.append(" ")
        elif elem.tag == tag("text:s"):
            count = elem.get(tag("text:c"))
            parts.append(" " * (int(count) if count else 1))
        if elem.text:
            parts.append(elem.text)
        for child in elem:
            walk(child)
            if child.tail:
                parts.append(child.tail)

    walk(node)
    return "".join(parts)


def lire_odt(path):
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("content.xml"))
    corps = root.find(tag("office:body")).find(tag("office:text"))
    lignes = []
    for node in corps.iter():
        if node.tag in P_TAGS:
            for morceau in node_text(node).split("\n"):
                morceau = morceau.replace("\u00a0", " ").replace("\u2019", "'")
                lignes.append(morceau.strip())
    return lignes


# --------------------------------------------------------------------------
# Normalisation
# --------------------------------------------------------------------------

def sans_accents(texte):
    decompose = unicodedata.normalize("NFD", texte)
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


def norm(texte):
    """Minuscules, sans accents, sans ponctuation : la forme sur laquelle portent les règles."""
    texte = sans_accents(texte.lower())
    texte = texte.replace("€", " euro ").replace("&", " et ")
    texte = texte.replace("'", " ").replace("-", " ").replace("/", " ")
    texte = re.sub(r"[^a-z0-9+.,:x@\s]", " ", texte)
    return re.sub(r"\s+", " ", texte).strip()


RE_TEL = re.compile(r"(?:\+\d{2}[\s.\-]?)?0?\s?\d(?:[\s.\-]?\d{2}){4}")
RE_TEL_FR = re.compile(r"0\s?\d(?:[\s.\-]?\d{2}){4}")
RE_TEL_INTL = re.compile(r"\+\d{2}[\s.\-]?\d[\d\s.\-]{7,15}")
RE_MAIL = re.compile(r"[\w.\-+]+@[\w.\-]+\.\w{2,}")

RE_JOUR = re.compile(
    r"^[\-•*]?\s*(?:le\s+)?"
    r"(?:(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*)?"
    r"(\d{1,2})\s*(?:er|eme|e)?\s*"
    r"(?:(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b)?"
    r"\s*:?\s*$"
)

RE_TITRE = re.compile(r"^(clients?|rendez\s*vous)\b", flags=re.I)
RE_AGE = re.compile(r"^\d+\s*(ans?|mois|semaines?|jours?)\b")

RE_PRODUIT = re.compile(r"(\d{1,2})\s*x\s*(\d{1,3}(?:[.,]\d{1,2})?)")
RE_NOMBRE = re.compile(r"\d{1,4}(?:[.,]\d{1,2})?")

UNITES_NON_PRIX = {
    "ans", "an", "mois", "mm", "cm", "kg", "h", "heure", "heures", "min",
    "eme", "e", "semaines", "semaine", "jours", "jour", "bis", "ter",
    "f", "%", "a", "b", "c", "d", "g",
}

# Un nombre précédé de l'un de ces mots est une date ou un repère, pas un montant.
MOTS_AVANT_NON_PRIX = {"du", "au", "le", "la", "vers", "code", "porte", "numero", "no", "n"}

MOTS_NON_PRIX = {"code", "porte", "interphone", "appartement", "etage", "batiment", "bat", "digicode"}

RESEAUX = ("instagram", "insta", "messenger", "facebook", "whatsapp", "snap", "sms", "leboncoin")

SEPARATEURS = {"et", "+"}

PONCTUATION_BORD = " \t.,;:!?()[]{}\"'«»…-*>•"


def mots_et_normes(texte):
    """Découpe en jetons alignés : chaque jeton d'origine a sa forme normalisée.

    Barres obliques, virgules et traits d'union sont traités comme des espaces :
    « bain/brushing » et « Chow-chow » doivent pouvoir correspondre aux expressions
    « bain brushing » et « chow chow ».
    """
    bruts = re.findall(r"[&+]|[^\s/,;&+\-]+", texte)
    normes = []
    for mot in bruts:
        if mot == "&":
            normes.append("et")
        elif mot == "+":
            normes.append("+")
        else:
            normes.append(norm(mot.strip(PONCTUATION_BORD)))
    return bruts, normes


def fenetre_correspond(normes, debut, cibles):
    if debut + len(cibles) > len(normes):
        return False
    for decalage, cible in enumerate(cibles):
        mot = normes[debut + decalage]
        if decalage == len(cibles) - 1:
            if not re.fullmatch(re.escape(cible) + r"(s|e|es|ne|nne|nnes|ns)?", mot):
                return False
        elif mot != cible:
            return False
    return True


def chercher_sequences(normes, expressions):
    """Occurrences non chevauchantes, les expressions les plus longues d'abord."""
    pris = [False] * len(normes)
    trouves = []
    ordonnees = sorted(expressions, key=lambda e: (-len(e.split()), -len(e)))
    for expression in ordonnees:
        cibles = expression.split()
        for debut in range(len(normes) - len(cibles) + 1):
            if any(pris[debut:debut + len(cibles)]):
                continue
            if fenetre_correspond(normes, debut, cibles):
                for index in range(debut, debut + len(cibles)):
                    pris[index] = True
                trouves.append((debut, debut + len(cibles), expression))
    trouves.sort()
    return trouves


# Les sigles et fautes de frappe (« ckg », « berded ») sont cherchés au même titre
# que les races, puis ramenés à leur race de référence.
RACES_RECHERCHEES = list(dict.fromkeys(list(RACES) + list(ALIAS_RACES.keys())))
PREMIERS_MOTS_RACE = {expression.split()[0] for expression in RACES_RECHERCHEES}


def contient_race(texte):
    """Test rapide puis confirmation : la ligne nomme-t-elle une race ?"""
    _, normes = mots_et_normes(texte)
    if not any(re.sub(r"(s|e|es|ne|nne|nnes|ns)$", "", n) in PREMIERS_MOTS_RACE
               or n in PREMIERS_MOTS_RACE for n in normes):
        return False
    return bool(chercher_sequences(normes, RACES_RECHERCHEES))


def libelle(expression):
    expression = ALIAS_RACES.get(expression, expression)
    expression = norm(expression)
    if expression in LIBELLES:
        return LIBELLES[expression]
    return expression[:1].upper() + expression[1:]


# --------------------------------------------------------------------------
# Classification des lignes
# --------------------------------------------------------------------------

def a_prefixe_adresse(ligne):
    return bool(re.match(r"^\s*adresse\s*:?", ligne, flags=re.I))


def est_mail(ligne):
    return bool(RE_MAIL.search(ligne)) or bool(re.match(r"^\s*(e-?)?mail\s*:", ligne, flags=re.I))


def est_prix(ligne_norm):
    if re.search(r"\b(offert|gratuit)\b", ligne_norm):
        return True
    if "echange de service" in ligne_norm:
        return True
    if re.search(r"\d\s*euros?\b", ligne_norm):
        return True
    if not re.search(r"\d", ligne_norm):
        return False
    return any(motif.strip() in ligne_norm for motif, _ in PAIEMENTS)


def a_civilite(ligne_norm):
    for civ in sorted(CIVILITES, key=len, reverse=True):
        if re.match(r"^" + re.escape(civ).replace(r"\ ", r"\s+") + r"\b\.?", ligne_norm):
            return True
    return False


def a_telephone(ligne):
    return bool(RE_TEL_FR.search(ligne) or RE_TEL_INTL.search(ligne))


def a_reseau(ligne_norm):
    if "contact sur" in ligne_norm or "contact par" in ligne_norm:
        return True
    return any(re.search(r"\b" + r + r"\b", ligne_norm) for r in RESEAUX)


def contient_mot(texte_norm, mots):
    return any(re.search(r"\b" + re.escape(m) + r"\b", texte_norm) for m in mots)


def ressemble_adresse(ligne_norm):
    if re.search(r"\b\d{5}\b", ligne_norm):
        return True
    if contient_mot(ligne_norm, MOTS_ADRESSE):
        return True
    nettoye = re.sub(r"\s+", " ", re.sub(r"[^a-z\s]", " ", ligne_norm)).strip()
    if nettoye in COMMUNES:
        return True
    # « Casino de Deauville », « Marinas Deauville » : un lieu suivi d'une commune.
    return len(nettoye.split()) <= 5 and contient_mot(nettoye, COMMUNES)


def classer_ligne(ligne):
    """Première passe : les catégories certaines."""
    nue = ligne.lstrip("> -•*").strip()
    nue_norm = norm(nue)
    if est_mail(nue):
        return "mail", nue
    if a_prefixe_adresse(nue):
        return "adresse", re.sub(r"^\s*adresse\s*:?\s*", "", nue, flags=re.I)
    if est_prix(nue_norm):
        return "prix", nue
    if a_civilite(nue_norm) or a_telephone(nue) or a_reseau(nue_norm):
        return "contact", nue
    if ressemble_adresse(nue_norm):
        return "adresse", nue
    return "indetermine", nue


def est_synthese(ligne_norm):
    """Ligne de bilan mensuel (« 1424 déclaré », « Rien à déclarer »)."""
    if ligne_norm.startswith("rien a declar"):
        return True
    if re.match(r"^\d+\s*(euros?)?\s*(declare|a declarer|net|brut)\b", ligne_norm):
        return True
    if re.fullmatch(r"\d{3,5}\s*(euros?)?", ligne_norm):
        return True
    return any(ligne_norm.startswith(m) for m in MOTS_SYNTHESE)


def est_depense(ligne_norm):
    premier = ligne_norm.split()[0] if ligne_norm.split() else ""
    return premier in MOTS_DEPENSE


def contient_prenom(ligne_norm):
    """Ligne courte sans chiffre comportant un prénom connu : « Christiane Doucet »."""
    if re.search(r"\d", ligne_norm):
        return False
    mots = [m for m in ligne_norm.split() if m not in SEPARATEURS]
    if not mots or len(mots) > 6:
        return False
    return any(m in PRENOMS or m.replace(" ", "-") in PRENOMS for m in mots)


def mot_unique_inconnu(ligne_norm):
    """Ligne d'un seul mot qui n'est ni une commune ni un mot courant : « Cassou »."""
    mots = [m for m in ligne_norm.split() if m not in SEPARATEURS]
    return (
        len(mots) == 1
        and not re.search(r"\d", ligne_norm)
        and mots[0] not in MOTS_COURANTS
        and mots[0] not in COMMUNES
    )


# --------------------------------------------------------------------------
# Extraction du prix
# --------------------------------------------------------------------------

def norm_prix(texte):
    """Comme norm(), mais conserve « - », « = » et « % », porteurs de sens sur un prix."""
    texte = sans_accents(texte.lower())
    texte = texte.replace("€", " euro ").replace("&", " et ")
    texte = texte.replace("'", " ").replace("/", " ")
    texte = re.sub(r"[^a-z0-9+.,:x@=%\-\s]", " ", texte)
    return re.sub(r"\s+", " ", texte).strip()


def montants_bruts(texte):
    """Tous les nombres du texte qui peuvent être des montants, dans l'ordre."""
    valeurs = []
    for m in RE_NOMBRE.finditer(texte):
        if m.start() > 0 and texte[m.start() - 1].isalpha():
            continue  # « 1h30 », « 7F » : le nombre fait partie d'un mot
        valeur = float(m.group(0).replace(",", "."))
        if not 1 <= valeur <= 999:
            continue
        suite = texte[m.end():m.end() + 16].strip()
        mot_suivant = re.split(r"[^a-z%]", suite, 1)[0]
        if mot_suivant in UNITES_NON_PRIX or mot_suivant in MOIS:
            continue
        contexte = texte[max(0, m.start() - 18):m.start()]
        # « -36 euros en pharmacie » : une dépense retranchée, pas une recette.
        if contexte.rstrip().endswith("-"):
            continue
        avant = contexte.strip().split()
        if avant and avant[-1] in MOTS_AVANT_NON_PRIX:
            continue
        valeurs.append(valeur)
    return valeurs


def extraire_montants(ligne_brute):
    """Renvoie (total, montants, methode).

    Le texte reçu est la ligne d'origine : les numéros de téléphone y sont retirés
    avant toute recherche de nombre, sinon « 06.13.08.83.59 » produirait des montants.
    """
    sans_tel = RE_TEL_INTL.sub(" ", RE_TEL_FR.sub(" ", ligne_brute))
    texte = norm_prix(sans_tel)

    # « 55-30% = 38.50 euros » : seul le résultat du calcul a été encaissé.
    if "=" in texte:
        apres = montants_bruts(texte.rsplit("=", 1)[1])
        if apres:
            return apres[0], apres, "resultat-calcul"

    # « 80 euros au lieu de 90 » : le second montant est le tarif habituel.
    if "au lieu de" in texte:
        avant = montants_bruts(texte.split("au lieu de")[0])
        if avant:
            return sum(avant), avant, "remise"

    # « 100-120 espèce ?? » : fourchette, on retient la borne basse.
    if re.search(r"\d\s*-\s*\d", texte) and "+" not in texte:
        valeurs = montants_bruts(texte)
        if valeurs:
            return valeurs[0], valeurs, "fourchette"

    produits = []
    for m in RE_PRODUIT.finditer(texte):
        quantite = int(m.group(1))
        unitaire = float(m.group(2).replace(",", "."))
        if 1 <= quantite <= 12 and 1 <= unitaire <= 999:
            produits.append(quantite * unitaire)
    texte = RE_PRODUIT.sub(" ", texte)
    simples = montants_bruts(texte)

    # « 175 euros en espèce 5x35 de l'heure » : le produit est le détail du total,
    # pas un montant supplémentaire.
    for produit in produits:
        if produit in simples:
            simples.remove(produit)

    montants = produits + simples
    if not montants:
        return None, [], "aucun"
    if len(montants) == 1:
        return montants[0], montants, "simple"

    autres_sauf_dernier = sum(montants[:-1])
    autres_sauf_premier = sum(montants[1:])

    # « 40, 50, 50, 40, 40, 60   280 euros » : le dernier nombre récapitule les autres.
    if len(montants) >= 3 and abs(autres_sauf_dernier - montants[-1]) < 0.01:
        return montants[-1], montants, "total-recapitulatif"
    if len(montants) >= 3 and abs(autres_sauf_premier - montants[0]) < 0.01:
        return montants[0], montants, "total-en-tete"

    # « 140€ en chèque 70 cocker et 65 labrador » : le premier montant est le total
    # encaissé, les suivants n'en sont que la ventilation par animal. Le mode de
    # paiement doit suivre immédiatement le premier montant, sans autre nombre entre
    # les deux, sinon « 55+55€ par chèque » serait lu comme un total de 55.
    if len(montants) >= 3:
        premier = re.search(r"\d[\d.,]*", texte)
        if premier:
            apres = texte[premier.end():]
            avant_prochain_nombre = re.split(r"\d", apres, 1)[0]
            suit_un_paiement = any(m.strip() in avant_prochain_nombre for m, _ in PAIEMENTS)
            if suit_un_paiement and montants[0] > 0:
                if abs(autres_sauf_premier - montants[0]) / montants[0] <= 0.2:
                    return montants[0], montants, "total-en-tete"

    return sum(montants), montants, "somme"


MOTS_PAIEMENT = {
    "espece", "especes", "cheque", "cheques", "virement", "virements", "cb",
    "carte", "bancaire", "bleue", "liquide", "offert", "gratuit", "cadeau",
    "echange", "service", "services", "troc", "paypal", "lydia", "euro",
    "euros", "paiement", "regle", "regles", "en", "par", "de", "du", "et",
    "pour", "le", "la", "sur", "au",
}


def sans_partie_prix(ligne):
    """Retire montants et modes de paiement, en conservant téléphone et nom.

    Le filtrage est fait mot à mot sur la forme sans accents : « chèque » et
    « cheque » doivent être écartés de la même façon.
    """
    telephones = RE_TEL_FR.findall(ligne) + RE_TEL_INTL.findall(ligne)
    gardes = []
    for mot in ligne.split():
        if any(tel in mot for tel in telephones):
            gardes.append(mot)
            continue
        nu = norm(mot.strip(PONCTUATION_BORD))
        if not nu or nu in MOTS_PAIEMENT:
            continue
        if re.fullmatch(r"\d+(?:[.,]\d{1,2})?", nu):
            continue
        gardes.append(mot)
    return re.sub(r"\s+", " ", " ".join(gardes)).strip(" ,;:-.+")


def extraire_paiement(lignes_norm):
    trouves = []
    for ligne in lignes_norm:
        for motif, label in PAIEMENTS:
            if motif.strip() in ligne and label not in trouves:
                trouves.append(label)
    return " + ".join(trouves)


# --------------------------------------------------------------------------
# Nom et prénom du propriétaire
# --------------------------------------------------------------------------

def nettoyer_proprietaire(ligne):
    """Isole le nom du propriétaire. Renvoie (nom, téléphones, mails, notes, adresses)."""
    reste = ligne
    adresses = []

    # « Degouzon 06.11.72.07.35 Adresse: Résidence du parc » : contact et adresse
    # sur la même ligne.
    coupe_adresse = re.split(r"\badresse\s*:?", reste, maxsplit=1, flags=re.I)
    if len(coupe_adresse) == 2:
        reste = coupe_adresse[0]
        if coupe_adresse[1].strip():
            adresses.append(coupe_adresse[1].strip())

    telephones = RE_TEL_FR.findall(reste) + RE_TEL_INTL.findall(reste)
    reste = RE_TEL_INTL.sub(" ", RE_TEL_FR.sub(" ", reste))
    mails = RE_MAIL.findall(reste)
    reste = RE_MAIL.sub(" ", reste)

    notes = []
    m = re.search(r"contact\s+(?:sur|par)\s+([\wéèà]+)", reste, flags=re.I)
    if m:
        notes.append("contact sur " + m.group(1).lower())
        reste = reste[:m.start()] + " " + reste[m.end():]
    for reseau in RESEAUX:
        if re.search(r"\b" + reseau + r"\b", norm(reste)):
            note = "contact " + reseau
            if note not in notes:
                notes.append(note)
            reste = re.sub(reseau, " ", reste, flags=re.I)

    for civ in sorted(CIVILITES, key=len, reverse=True):
        motif = r"^\s*" + re.escape(civ).replace(r"\ ", r"\s+") + r"\b\.?"
        nouveau = re.sub(motif, " ", reste, flags=re.I)
        if nouveau != reste:
            reste = nouveau
            break

    # Un second interlocuteur sur la même ligne (« Mme Guittet ... Mr Guittet ... »).
    for civ in ("madame", "monsieur", "mme", "mr"):
        m = re.search(r"\s" + civ + r"\b", reste, flags=re.I)
        if m:
            notes.append(reste[m.start():].strip(" ,;-"))
            reste = reste[: m.start()]
            break

    # Ce qui suit un lien de parenté, un métier ou « et » appartient au commentaire.
    # Découpage sur les espaces uniquement, pour préserver « Anne-Laure ».
    mots_bruts = reste.split()
    coupure = None
    for index, mot in enumerate(mots_bruts):
        nu = norm(mot.strip(PONCTUATION_BORD))
        # « Levy. Clients très gentils » : un mot courant ne fait pas partie d'un nom.
        if nu in COUPURES_NOM or nu in MOTS_COURANTS or nu == "et" or "(" in mot:
            coupure = index
            break

    if coupure is not None:
        notes.append(" ".join(mots_bruts[coupure:]).strip(" ,;-"))
        mots_bruts = mots_bruts[:coupure]
        # « Cousin Sandrine », « Maman » : le mot de coupure est ici le seul nom
        # disponible, mieux vaut le garder que de perdre le client.
        if not mots_bruts and coupure == 0 and "(" not in reste:
            mots_bruts = reste.split()
            notes.pop()

    # Un nom de plus de trois mots contient forcément une annotation.
    if len(mots_bruts) > 3:
        notes.append(" ".join(mots_bruts[3:]))
        mots_bruts = mots_bruts[:3]

    nom_complet = re.sub(r"\s+", " ", " ".join(mots_bruts)).strip(" ,;:-.?")
    return nom_complet, telephones, mails, [n for n in notes if n.strip()], adresses


def est_prenom(mot):
    n = norm(mot.strip(PONCTUATION_BORD))
    if n in PRENOMS or n.replace(" ", "-") in PRENOMS:
        return True
    # Prénom composé (« Pierre-Emmanuelle », « Anne-Laure ») : la première partie suffit.
    parties = n.split()
    return len(parties) > 1 and parties[0] in PRENOMS


RE_INITIALE = re.compile(r"^[A-ZÉÈÀÂÎÔÛ]\.?$")


def separer_nom_prenom(texte):
    """Décide de l'ordre nom/prénom. Renvoie (prenom, nom, ambigu)."""
    mots = [m.strip(",;:()?") for m in texte.split()]
    # « Madame x Valla » : une lettre isolée en minuscule n'est pas une initiale.
    mots = [m for m in mots if m and m not in (".", "-") and not (len(m) == 1 and m.islower())]
    if not mots:
        return "", "", False

    # « De Guerry », « Van Damme » : la particule appartient au nom de famille.
    if norm(mots[0].rstrip(".")) in PARTICULES and len(mots) > 1:
        return "", " ".join(mots), False

    if len(mots) == 1:
        mot = mots[0]
        if est_prenom(mot) or RE_INITIALE.match(mot):
            return mot, "", False
        return "", mot, False

    # Une initiale isolée (« Madame F. Laîné ») tient lieu de prénom.
    initiales = [i for i, m in enumerate(mots) if RE_INITIALE.match(m)]
    if len(initiales) == 1 and not any(est_prenom(m) for m in mots):
        i = initiales[0]
        return mots[i], " ".join(m for j, m in enumerate(mots) if j != i), False

    indices = [i for i, m in enumerate(mots) if est_prenom(m)]
    if not indices:
        # Aucun prénom reconnu : la convention majoritaire du corpus est « Nom Prénom ».
        return mots[-1], " ".join(mots[:-1]), True

    if indices == list(range(len(mots))):
        # Que des prénoms : prénom composé écrit en deux mots (« Marie Jo »).
        return " ".join(mots), "", False

    # Prénoms consécutifs en tête (« Marie Christine Huvé ») ou en fin
    # (« Santa Regina Sara ») : le bloc de prénoms est le prénom, le reste le nom.
    if indices == list(range(len(indices))):
        return " ".join(mots[: len(indices)]), " ".join(mots[len(indices):]), False
    if indices == list(range(len(mots) - len(indices), len(mots))):
        debut = len(mots) - len(indices)
        return " ".join(mots[debut:]), " ".join(mots[:debut]), False

    i = indices[0]
    return mots[i], " ".join(m for j, m in enumerate(mots) if j != i), True


# --------------------------------------------------------------------------
# Découpage d'un fichier en blocs
# --------------------------------------------------------------------------

def mois_annee_du_fichier(nom_fichier):
    base = norm(os.path.splitext(nom_fichier)[0])
    mois = None
    for label, numero in MOIS.items():
        if label in base:
            mois = numero
            break
    m = re.search(r"\b(20\d{2})\b", base)
    annee = int(m.group(1)) if m else ANNEE_PAR_DEFAUT.get(base.strip())
    return mois, annee


def decouper(lignes, mois_fichier, annee_fichier):
    blocs = []
    courant = []
    date_courante = None
    ligne_debut = 0
    anomalies = []
    ignorees = []
    date_vue = False

    detail_vu = False

    def fermer():
        nonlocal courant, detail_vu
        if courant:
            blocs.append((date_courante, ligne_debut, courant))
        courant = []
        detail_vu = False

    for numero, brute in enumerate(lignes, start=1):
        ligne = brute.strip()
        ligne_norm = norm(ligne)

        if not ligne:
            fermer()
            continue

        m = RE_JOUR.match(ligne_norm)
        if m and (m.group(1) or m.group(3)):
            fermer()
            jour_semaine, jour, mois_nom = m.group(1), int(m.group(2)), m.group(3)
            mois = MOIS[mois_nom] if mois_nom else mois_fichier
            if mois_nom and mois != mois_fichier:
                anomalies.append(
                    "ligne %d : mois « %s » différent du mois du fichier" % (numero, mois_nom)
                )
            try:
                date_courante = datetime.date(annee_fichier, mois, jour)
            except ValueError:
                anomalies.append("ligne %d : date impossible (« %s »)" % (numero, ligne))
                date_courante = None
                continue
            date_vue = True
            if jour_semaine and JOURS[jour_semaine] != date_courante.weekday():
                attendu = [j for j, n in JOURS.items() if n == date_courante.weekday()][0]
                anomalies.append(
                    "ligne %d : « %s » or le %s était un %s"
                    % (numero, ligne, date_courante.isoformat(), attendu)
                )
            continue

        # Tout ce qui précède la première date est le titre du document.
        if not date_vue:
            if not RE_TITRE.match(ligne):
                anomalies.append("ligne %d ignorée avant la première date : « %s »" % (numero, ligne))
            continue

        # Bilan mensuel ou achat de matériel : ni l'un ni l'autre n'est une prestation.
        if not courant and (est_synthese(ligne_norm) or est_depense(ligne_norm)):
            ignorees.append("ligne %d : « %s »" % (numero, ligne))
            continue

        categorie, _ = classer_ligne(ligne)
        nouveau = bool(re.match(r"^[\-•*]\s*", ligne)) and categorie == "indetermine"
        # Deux rendez-vous collés sans ligne vide : une fois les détails commencés,
        # une ligne libre qui nomme une race ouvre un nouveau rendez-vous.
        if not nouveau and categorie == "indetermine" and detail_vu and contient_race(ligne):
            nouveau = True
        if nouveau and courant:
            fermer()

        if not courant:
            ligne_debut = numero
        courant.append(ligne)
        if categorie != "indetermine":
            detail_vu = True

    fermer()
    return blocs, anomalies, ignorees


# --------------------------------------------------------------------------
# Analyse d'un bloc
# --------------------------------------------------------------------------

MOTS_VIDES_ANIMAL = {
    "le", "la", "les", "un", "une", "des", "de", "du", "et", "en", "pour",
    "type", "typee", "croise", "croisee", "x", "male", "femelle", "environ",
    "mr", "mme", "madame", "monsieur", "dit", "dite", "alias", "avec", "sans",
    "son", "sa", "ses", "au", "aux", "sur", "dans", "puis",
}

MOTS_PRESTATION = set()
for _presta in PRESTATIONS:
    MOTS_PRESTATION.update(_presta.split())


def analyser_bloc(date, numero_ligne, lignes, fichier):
    drapeaux = []
    commentaires = []

    # --- séparation description / détails --------------------------------
    description = []
    details = []
    vu_detail = False
    for ligne in lignes:
        categorie, _ = classer_ligne(ligne)
        if not vu_detail and categorie == "indetermine":
            description.append(ligne)
        else:
            vu_detail = True
            details.append(ligne)
    description_est_prix = False
    if not description and details:
        # Rendez-vous écrit sur une seule ligne : « Agathe pour griffes et démêlage
        # berger australien 20€ espèce ». La description porte alors aussi le prix.
        description = [details.pop(0)]
        description_est_prix = est_prix(norm(description[0]))

    texte_description = " ".join(description).strip(" -•*>")

    # --- première passe sur les détails ----------------------------------
    lignes_prix, adresses, contacts, mails, indetermines = [], [], [], [], []
    for ligne in details:
        categorie, contenu = classer_ligne(ligne)
        if categorie == "prix":
            lignes_prix.append(contenu)
            # « Françoise et Jean Blot 06.76.05.72.23  200 euros par chèque » :
            # la même ligne porte le prix et le client. On en retire d'abord les
            # montants et le mode de paiement, sinon « 60€ en chèque » deviendrait un nom.
            if a_telephone(contenu):
                contacts.append(sans_partie_prix(contenu))
        elif categorie == "adresse":
            adresses.append(contenu)
        elif categorie == "contact":
            contacts.append(contenu)
        elif categorie == "mail":
            mails.append(contenu)
        else:
            indetermines.append(contenu)

    # --- seconde passe sur les lignes indéterminées ----------------------
    notes_prestation = []
    for contenu in indetermines:
        contenu_norm = norm(contenu)
        _, normes = mots_et_normes(contenu)
        utiles = [n for n in normes if n not in SEPARATEURS]
        if utiles and all(n in MOTS_PRESTATION or n in MOTS_VIDES_ANIMAL for n in utiles):
            notes_prestation.append(contenu)
            continue
        if RE_AGE.match(contenu_norm):
            commentaires.append(contenu)
            continue
        # Un prénom connu prime sur l'adresse : « Marine Lalycan (Golf de saint gatien) »
        # contient une commune mais désigne bien une personne.
        if contient_prenom(contenu_norm):
            contacts.append(contenu)
            continue
        if ressemble_adresse(contenu_norm):
            adresses.append(contenu)
            continue
        if not contacts and mot_unique_inconnu(contenu_norm):
            contacts.append(contenu)
            continue
        commentaires.append(contenu)
        drapeaux.append("ligne_non_classee")

    # --- prix et paiement -------------------------------------------------
    if description_est_prix and not lignes_prix:
        lignes_prix.append(texte_description)

    prix = None
    prix_brut = " | ".join(lignes_prix)
    if lignes_prix:
        montants, methodes, nombre_max = [], set(), 0
        for ligne in lignes_prix:
            total, detail, methode = extraire_montants(ligne)
            methodes.add(methode)
            nombre_max = max(nombre_max, len(detail))
            if total is not None:
                montants.append(total)
        if montants:
            prix = sum(montants)
        interpretations = {
            "total-recapitulatif", "total-en-tete", "resultat-calcul", "remise", "fourchette",
        }
        if methodes & interpretations or len(lignes_prix) > 1 or nombre_max >= 3:
            drapeaux.append("prix_a_verifier")
    else:
        drapeaux.append("prix_absent")

    paiement = extraire_paiement([norm(l) for l in lignes_prix] or [norm(l) for l in lignes])
    if paiement in ("Offert", "Échange de services") and prix is None:
        prix = 0.0
    if not paiement:
        drapeaux.append("paiement_absent")

    # --- contact ----------------------------------------------------------
    telephones, mails_trouves = [], []
    for contenu in mails:
        mails_trouves.extend(RE_MAIL.findall(contenu))
        reste = re.sub(r"^\s*(e-?)?mail\s*:", "", contenu, flags=re.I)
        reste = RE_MAIL.sub(" ", reste).strip(" ,;-")
        if reste:
            if a_telephone(reste):
                telephones.extend(RE_TEL_FR.findall(reste) + RE_TEL_INTL.findall(reste))
            else:
                commentaires.append(reste)

    proprietaire = ""
    for contenu in contacts:
        nom_brut, tels, mls, notes, adrs = nettoyer_proprietaire(contenu)
        telephones.extend(tels)
        mails_trouves.extend(mls)
        commentaires.extend(notes)
        adresses.extend(adrs)
        # La première ligne de contact ne porte pas toujours le nom : une ligne
        # ne contenant qu'un téléphone précède souvent celle du nom.
        if not proprietaire:
            proprietaire = nom_brut
        elif nom_brut:
            commentaires.append(nom_brut)

    if not proprietaire and not telephones:
        drapeaux.append("proprietaire_absent")

    prenom, nom, ambigu = separer_nom_prenom(proprietaire)
    if ambigu:
        drapeaux.append("nom_prenom_a_verifier")

    # --- race et nom de l'animal -----------------------------------------
    mots_desc, normes_desc = mots_et_normes(texte_description)
    occurrences = chercher_sequences(normes_desc, RACES_RECHERCHEES)

    specifiques = [o for o in occurrences if o[2] not in GENERIQUES]
    retenues = specifiques or occurrences

    plusieurs = False
    if len(retenues) >= 2:
        # « croisé shih tzu / bichon » décrit un seul animal ; « X et Y » en décrit deux.
        liaison = " ".join(normes_desc[retenues[0][1]:retenues[1][0]])
        if re.search(r"\bet\b", liaison) or re.search(r"\d", liaison):
            plusieurs = True
    avant_premiere = " ".join(normes_desc[: retenues[0][0]]) if retenues else ""
    if re.search(r"\bet\b", avant_premiere):
        plusieurs = True

    if not retenues:
        race = ""
        drapeaux.append("race_absente")
        fin_race = 0
        debut_race = 0
    elif plusieurs:
        race = " + ".join(libelle(o[2]) for o in retenues)
        debut_race, fin_race = retenues[0][0], retenues[0][1]
    else:
        race = " × ".join(libelle(o[2]) for o in retenues)
        debut_race, fin_race = retenues[0][0], retenues[-1][1]

    quantite = 1
    if normes_desc and re.fullmatch(r"\d", normes_desc[0]) and int(normes_desc[0]) <= 6:
        quantite = int(normes_desc[0])
    if quantite > 1:
        plusieurs = True
    if plusieurs:
        drapeaux.append("plusieurs_animaux")

    indices_race = set()
    for debut, fin, _ in retenues:
        indices_race.update(range(debut, fin))

    def mot_utilisable(index):
        n = normes_desc[index]
        if index in indices_race:
            return False
        if n in SEPARATEURS or n in MOTS_VIDES_ANIMAL or n in MOTS_PRESTATION:
            return False
        if n in GENERIQUES or n in MOTS_COURANTS:
            return False
        return not re.search(r"\d", n) and len(n) > 1

    nom_animal = " ".join(mots_desc[i] for i in range(debut_race) if mot_utilisable(i))
    if not nom_animal and retenues:
        # Nom écrit après la race : « Terrier Tibétain Ruby », « Chien de chasse « Taïga » ».
        for index in range(fin_race, min(fin_race + 3, len(mots_desc))):
            if mot_utilisable(index):
                nom_animal = mots_desc[index]
                break
    nom_animal = nom_animal.strip(PONCTUATION_BORD)

    # --- prestations ------------------------------------------------------
    sources_prestation = [texte_description] + notes_prestation + lignes_prix + commentaires
    normes_prestation = []
    for source in sources_prestation:
        normes_prestation.extend(mots_et_normes(source)[1])
    prestations = [libelle(o[2]) for o in chercher_sequences(normes_prestation, PRESTATIONS)]
    prestations = list(dict.fromkeys(prestations))
    if not prestations:
        drapeaux.append("prestation_absente")

    # --- commentaire ------------------------------------------------------
    indices_prestation = set()
    for debut, fin, _ in chercher_sequences(normes_desc, PRESTATIONS):
        indices_prestation.update(range(debut, fin))
    mots_animal = set(nom_animal.split())
    reste = [
        mots_desc[i]
        for i in range(len(mots_desc))
        if i not in indices_race
        and i not in indices_prestation
        and mots_desc[i] not in mots_animal
        and normes_desc[i] not in MOTS_VIDES_ANIMAL
        and normes_desc[i] not in SEPARATEURS
    ]
    reste_texte = re.sub(r"\s+", " ", " ".join(reste)).strip(" ,.;:-")
    if len(reste_texte) > 2:
        commentaires.insert(0, reste_texte)

    return {
        "date_prestation": date.isoformat() if date else "",
        "prenom": prenom,
        "nom": nom,
        "nom_animal": nom_animal,
        "race_animal": race,
        "adresse": ", ".join(dict.fromkeys(a.strip() for a in adresses if a.strip())),
        "telephone": " / ".join(dict.fromkeys(t.strip() for t in telephones if t.strip())),
        "email": " / ".join(dict.fromkeys(m.strip().lower() for m in mails_trouves)),
        "type_prestation": " + ".join(prestations),
        "prix_paye": "" if prix is None else ("%g" % prix),
        "mode_paiement": paiement,
        "commentaire": " ; ".join(
            dict.fromkeys(c.strip(" ,.;:-") for c in commentaires if c and c.strip(" ,.;:-"))
        ),
        "prix_brut": prix_brut,
        "fichier_source": fichier,
        "ligne_source": numero_ligne,
        "source_brut": " / ".join(lignes),
        "a_revoir": ",".join(dict.fromkeys(drapeaux)),
    }


def cle_telephone(valeur):
    """Premier numéro de la ligne, réduit à ses chiffres, pour servir d'identifiant."""
    if not valeur:
        return ""
    chiffres = re.sub(r"\D", "", valeur.split("/")[0])
    return chiffres[-9:] if len(chiffres) >= 9 else ""


def valeur_dominante(valeurs):
    """La valeur non vide la plus fréquente, la plus longue en cas d'égalité."""
    presentes = [v for v in valeurs if v and v.strip()]
    if not presentes:
        return ""
    comptes = {}
    for valeur in presentes:
        comptes[valeur] = comptes.get(valeur, 0) + 1
    return max(comptes, key=lambda v: (comptes[v], len(v)))


CHAMPS_CLIENT = ("prenom", "nom", "adresse", "telephone", "email")


def consolider_clients(lignes):
    """Rattache les prestations à un client et complète ses coordonnées manquantes.

    Un même client revient souvent des dizaines de fois : son adresse ou son email
    peut n'être noté qu'une seule fois. Le regroupement se fait d'abord sur le
    numéro de téléphone, qui est fiable, puis sur le nom pour les lignes sans numéro
    et seulement si ce nom ne correspond qu'à un seul numéro.
    """
    par_telephone = {}
    for ligne in lignes:
        cle = cle_telephone(ligne["telephone"])
        if cle:
            par_telephone.setdefault(cle, []).append(ligne)

    # Nom -> numéros connus, pour rattacher les lignes dépourvues de téléphone.
    numeros_par_nom = {}
    for cle, groupe in par_telephone.items():
        for ligne in groupe:
            nom = norm(" ".join(filter(None, (ligne["nom"], ligne["prenom"]))))
            if nom:
                numeros_par_nom.setdefault(nom, set()).add(cle)

    for ligne in lignes:
        if cle_telephone(ligne["telephone"]):
            continue
        nom = norm(" ".join(filter(None, (ligne["nom"], ligne["prenom"]))))
        candidats = numeros_par_nom.get(nom, set())
        if nom and len(candidats) == 1:
            par_telephone[next(iter(candidats))].append(ligne)

    identifiants = {}
    for numero, cle in enumerate(sorted(par_telephone), start=1):
        groupe = par_telephone[cle]
        reference = {champ: valeur_dominante([l[champ] for l in groupe]) for champ in CHAMPS_CLIENT}
        for ligne in groupe:
            complete = []
            for champ in CHAMPS_CLIENT:
                if not ligne[champ] and reference[champ]:
                    ligne[champ] = reference[champ]
                    complete.append(champ)
            if complete:
                ligne["complete_depuis_historique"] = ",".join(complete)
            identifiants[id(ligne)] = "C%03d" % numero

    for ligne in lignes:
        ligne.setdefault("complete_depuis_historique", "")
        ligne["client_id"] = identifiants.get(id(ligne), "")

    return len(par_telephone)


def est_vide(ligne):
    """Un bloc sans animal, sans client et sans prix n'est pas un rendez-vous."""
    porteurs = ("race_animal", "nom_animal", "type_prestation", "nom", "prenom", "telephone", "adresse")
    return not any(ligne[colonne] for colonne in porteurs)


COLONNES = [
    "id", "date_prestation", "prenom", "nom", "nom_animal", "race_animal",
    "adresse", "telephone", "email", "type_prestation", "prix_paye",
    "mode_paiement", "commentaire", "client_id", "complete_depuis_historique",
    "prix_brut", "fichier_source", "ligne_source", "source_brut", "a_revoir",
]


def main():
    os.makedirs(DATA, exist_ok=True)
    fichiers = sorted(
        (n for n in os.listdir(SRC) if n.lower().endswith(".odt")),
        key=lambda n: mois_annee_du_fichier(n)[::-1],
    )

    toutes, rapport, ecartees = [], [], []

    for nom_fichier in fichiers:
        mois, annee = mois_annee_du_fichier(nom_fichier)
        if not mois or not annee:
            rapport.append("!! %s : mois ou année introuvable" % nom_fichier)
            continue

        lignes = lire_odt(os.path.join(SRC, nom_fichier))
        blocs, anomalies, ignorees = decouper(lignes, mois, annee)
        lignes_fichier = []
        for bloc in blocs:
            ligne = analyser_bloc(*bloc, nom_fichier)
            if est_vide(ligne):
                ecartees.append("%s L%d : %s" % (nom_fichier, ligne["ligne_source"], ligne["source_brut"]))
            else:
                lignes_fichier.append(ligne)
        toutes.extend(lignes_fichier)

        signales = [l for l in lignes_fichier if l["a_revoir"]]
        rapport.append(
            "%-32s %04d-%02d  %3d prestations  %3d à vérifier"
            % (nom_fichier, annee, mois, len(lignes_fichier), len(signales))
        )
        for anomalie in anomalies:
            rapport.append("    [date] " + anomalie)
        for ignoree in ignorees:
            rapport.append("    [bilan ou dépense, non retenu] " + ignoree)
        for ligne in signales:
            rapport.append(
                "    [%s] L%d : %s" % (ligne["a_revoir"], ligne["ligne_source"], ligne["source_brut"])
            )

    nombre_clients = consolider_clients(toutes)

    toutes.sort(key=lambda l: (l["date_prestation"], l["fichier_source"], l["ligne_source"]))
    for index, ligne in enumerate(toutes, start=1):
        ligne["id"] = index

    with open(os.path.join(DATA, "prestations.csv"), "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLONNES, delimiter=";")
        writer.writeheader()
        writer.writerows(toutes)

    with open(os.path.join(DATA, "prestations.json"), "w", encoding="utf-8") as handle:
        json.dump(toutes, handle, ensure_ascii=False, indent=1)

    # L'application web lit ce même fichier comme ressource statique.
    public = os.path.join("app", "public")
    if os.path.isdir(os.path.dirname(public)):
        os.makedirs(public, exist_ok=True)
        with open(os.path.join(public, "prestations.json"), "w", encoding="utf-8") as handle:
            json.dump(toutes, handle, ensure_ascii=False, separators=(",", ":"))

    compte = {}
    for ligne in toutes:
        for drapeau in filter(None, ligne["a_revoir"].split(",")):
            compte[drapeau] = compte.get(drapeau, 0) + 1

    entete = [
        "RAPPORT DE CONSOLIDATION",
        "=" * 70,
        "%d prestations extraites de %d fichiers" % (len(toutes), len(fichiers)),
        "%d lignes comportent au moins un point à vérifier"
        % sum(1 for l in toutes if l["a_revoir"]),
        "%d clients distincts, %d lignes complétées depuis une autre fiche du même client"
        % (nombre_clients, sum(1 for l in toutes if l["complete_depuis_historique"])),
        "",
        "Répartition des points à vérifier :",
    ]
    for drapeau, nombre in sorted(compte.items(), key=lambda kv: -kv[1]):
        entete.append("  %-26s %4d" % (drapeau, nombre))
    entete += [
        "",
        "%d blocs écartés (ni animal, ni client, ni prix) :" % len(ecartees),
    ]
    entete += ["  " + e for e in ecartees]
    entete += ["", "=" * 70, ""]

    with open(RAPPORT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(entete + rapport))

    print("\n".join(entete[:14]))
    print("-> data/prestations.csv, data/prestations.json, tools/_rapport.txt")


if __name__ == "__main__":
    main()
