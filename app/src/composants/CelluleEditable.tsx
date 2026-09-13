import { useEffect, useId, useState } from "react";

type Props = {
  valeur: string;
  onChange: (valeur: string) => void;
  ariaLabel: string;
  type?: "text" | "date" | "email" | "tel" | "decimal";
  suggestions?: string[];
  affichage?: string;
  className?: string;
};

export default function CelluleEditable({
  valeur,
  onChange,
  ariaLabel,
  type = "text",
  suggestions,
  affichage,
  className,
}: Props) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(valeur);
  const listeId = useId();

  useEffect(() => {
    if (!edition) setBrouillon(valeur);
  }, [valeur, edition]);

  function valider() {
    setEdition(false);
    const nettoye = type === "decimal" ? brouillon.trim().replace(",", ".") : brouillon.trim();
    if (nettoye !== valeur) onChange(nettoye);
  }

  function surTouche(evenement: React.KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      valider();
    }
    if (evenement.key === "Escape") {
      setBrouillon(valeur);
      setEdition(false);
    }
  }

  if (edition) {
    return (
      <input
        className={`cellule-saisie ${className ?? ""}`}
        aria-label={ariaLabel}
        autoFocus
        type={type === "decimal" ? "text" : type}
        inputMode={type === "decimal" ? "decimal" : undefined}
        list={suggestions && suggestions.length > 0 ? listeId : undefined}
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        onKeyDown={surTouche}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const texte = affichage ?? valeur;
  return (
    <>
      <button
        type="button"
        className={`cellule-editable ${texte ? "" : "vide"} ${className ?? ""}`}
        aria-label={`Modifier ${ariaLabel}`}
        title="Cliquer pour corriger"
        onClick={(e) => {
          e.stopPropagation();
          setEdition(true);
        }}
      >
        {texte || "—"}
      </button>
      {suggestions && suggestions.length > 0 && (
        <datalist id={listeId}>
          {suggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  );
}
