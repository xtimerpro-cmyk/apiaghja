// Configuration du système de réservation A Piaghja
// C'EST ICI qu'on règle les capacités et les créneaux.

// Couverts maximum par service (midi / soir)
export const CAPACITE = { midi: 60, soir: 60 };

// Créneaux proposés
export const CRENEAUX = {
  midi: ["12:00", "12:30", "13:00", "13:30", "14:00"],
  soir: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
};

// Taille max d'une réservation en ligne (au-delà : appeler)
export const MAX_PAX = 8;

// Jusqu'à combien de jours à l'avance on peut réserver
export const JOURS_MAX = 90;

export function serviceDe(heure) {
  return heure < "17:00" ? "midi" : "soir";
}

export function jsonReponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
