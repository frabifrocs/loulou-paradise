import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const rows = JSON.parse(readFileSync("data/prestations.json", "utf8"));
const cols = [
  "date_prestation",
  "prenom",
  "nom",
  "nom_animal",
  "race_animal",
  "adresse",
  "telephone",
  "email",
  "type_prestation",
  "prix_paye",
  "mode_paiement",
  "commentaire",
  "id",
  "client_id",
  "a_revoir",
];
const headers = [
  "Date",
  "Prénom",
  "Nom",
  "Animal",
  "Race",
  "Adresse",
  "Téléphone",
  "Email",
  "Prestation",
  "Prix payé",
  "Mode de paiement",
  "Commentaire",
  "Id",
  "Client",
  "À revoir",
];

function echapper(valeur) {
  return `"${String(valeur ?? "").replace(/"/g, '""')}"`;
}

const lignes = [
  headers.map(echapper).join(";"),
  ...rows.map((p, i) => cols.map((c) => echapper(c === "id" ? (p.id ?? i + 1) : p[c])).join(";")),
];

mkdirSync("data", { recursive: true });
writeFileSync("data/loulou-paradise.csv", `\uFEFF${lignes.join("\r\n")}`, "utf8");
copyFileSync("data/loulou-paradise.csv", "C:/Users/Tanguy Fraboni/Desktop/loulou-paradise.csv");
console.log(rows.length);
