// GET /api/resa/availability?month=YYYY-MM
// Renvoie, pour chaque jour du mois, les couverts restants par service.
import { CAPACITE, jsonReponse } from "../_config.js";

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonReponse({ error: "mois_invalide" }, 400);

  const rows = await env.DB.prepare(
    "SELECT date, service, COALESCE(SUM(pax),0) AS total FROM reservations WHERE date LIKE ?1 GROUP BY date, service"
  ).bind(month + "-%").all();

  const jours = {};
  for (const r of rows.results || []) {
    if (!jours[r.date]) jours[r.date] = { midi: CAPACITE.midi, soir: CAPACITE.soir };
    jours[r.date][r.service] = Math.max(0, CAPACITE[r.service] - r.total);
  }

  return jsonReponse({ month, capacite: CAPACITE, jours });
}
