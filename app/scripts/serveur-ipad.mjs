import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossierBin = path.join(racine, "bin");
const dossierCerts = path.join(racine, "certs");
const mkcertLocal = path.join(dossierBin, "mkcert.exe");
const urlMkcert =
  "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe";

function ipv4Locale() {
  for (const adresses of Object.values(os.networkInterfaces())) {
    for (const adresse of adresses ?? []) {
      if (adresse.family === "IPv4" && !adresse.internal && !adresse.address.startsWith("169.254.")) {
        return adresse.address;
      }
    }
  }
  return "127.0.0.1";
}

function pageInstallation(ip) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Installer Loulou Paradise</title>
    <style>
      body { font-family: sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1.2rem; line-height: 1.5; color: #223; }
      h1 { font-size: 1.4rem; }
      ol { padding-left: 1.2rem; }
      li { margin: 0.8rem 0; }
      a.bouton { display: inline-block; margin-top: 0.4rem; padding: 0.7rem 1rem; background: #3f7d5c; color: #fff; text-decoration: none; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>Mettre Loulou sur l'écran d'accueil</h1>
    <p>Une seule fois, pour que l'app s'ouvre même sans Wi‑Fi.</p>
    <ol>
      <li>
        <a class="bouton" href="/loulou-paradise.crt">1. Télécharger le certificat</a>
        <p>Safari propose d’autoriser un profil. Accepte.</p>
      </li>
      <li>Ouvre <strong>Réglages</strong> → <strong>Profil téléchargé</strong> → <strong>Installer</strong>.</li>
      <li>Puis <strong>Réglages</strong> → <strong>Général</strong> → <strong>À propos</strong> → <strong>Réglages des certificats</strong> → active <strong>mkcert</strong>.</li>
      <li>
        Reviens ici et ouvre l'app :<br />
        <a class="bouton" href="https://${ip}:5173/">2. Ouvrir Loulou Paradise</a>
      </li>
      <li>Attends le texte vert <strong>Disponible hors ligne</strong>, puis Partager → Sur l’écran d’accueil.</li>
      <li>Supprime l’ancienne icône (celle en http).</li>
    </ol>
  </body>
</html>`;
}

async function assurerMkcert() {
  mkdirSync(dossierBin, { recursive: true });
  if (!existsSync(mkcertLocal)) {
    const reponse = await fetch(urlMkcert);
    if (!reponse.ok) {
      throw new Error(`Téléchargement de mkcert impossible (${reponse.status})`);
    }
    writeFileSync(mkcertLocal, Buffer.from(await reponse.arrayBuffer()));
  }
  return mkcertLocal;
}

function lancer(commande, args, extraEnv = {}) {
  return spawn(commande, args, {
    cwd: racine,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
}

function ouvrirPareFeu(port, nom) {
  try {
    execFileSync(
      "netsh",
      ["advfirewall", "firewall", "add", "rule", `name=${nom}`, "dir=in", "action=allow", "protocol=TCP", `localport=${port}`],
      { stdio: "ignore" },
    );
  } catch {
    // Sans droits administrateur, la règle n'est pas ajoutée.
  }
}

const ip = ipv4Locale();
const mkcert = await assurerMkcert();

try {
  execFileSync(mkcert, ["-install"], { stdio: "ignore" });
} catch {
  // L'autorité locale existe déjà, ou Windows refuse l'installation système.
}

mkdirSync(dossierCerts, { recursive: true });
execFileSync(
  mkcert,
  ["-cert-file", path.join(dossierCerts, "cert.pem"), "-key-file", path.join(dossierCerts, "key.pem"), ip, "localhost", "127.0.0.1"],
  { stdio: "inherit" },
);

const racineCa = execFileSync(mkcert, ["-CAROOT"], { encoding: "utf8" }).trim();
const fichierCa = path.join(racineCa, "rootCA.pem");
if (!existsSync(fichierCa)) {
  throw new Error("Certificat d'autorité mkcert introuvable.");
}

ouvrirPareFeu(5173, "Loulou Paradise HTTPS");
ouvrirPareFeu(8080, "Loulou Paradise certificat");

await new Promise((ok, ko) => {
  const compilation = lancer("npm", ["run", "build"]);
  compilation.on("exit", (code) => (code === 0 ? ok() : ko(new Error(`Build échoué (${code})`))));
});

createServer((requete, reponse) => {
  if (requete.url === "/loulou-paradise.crt") {
    reponse.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="loulou-paradise.crt"',
    });
    reponse.end(readFileSync(fichierCa));
    return;
  }
  reponse.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  reponse.end(pageInstallation(ip));
}).listen(8080, "0.0.0.0", () => {
  console.log(`\nInstallation iPad : http://${ip}:8080/\nApp hors ligne :   https://${ip}:5173/\n`);
});

lancer("npx", ["vite", "preview", "--host", "--port", "5173"], { LOULOU_HTTPS: "1" });
