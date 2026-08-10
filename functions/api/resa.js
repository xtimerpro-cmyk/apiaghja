// POST /api/resa — créer une réservation
// Insertion conditionnelle atomique : refuse si la capacité du service est dépassée.
import { CAPACITE, CRENEAUX, MAX_PAX, JOURS_MAX, serviceDe, jsonReponse } from "./_config.js";

export async function onRequestPost({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);

  let b;
  try { b = await request.json(); } catch { return jsonReponse({ error: "json_invalide" }, 400); }

  const date = String(b.date || "");
  const heure = String(b.heure || "");
  const nom = String(b.nom || "").trim().slice(0, 60);
  const prenom = String(b.prenom || "").trim().slice(0, 60);
  const tel = String(b.tel || "").trim().slice(0, 25);
  const pax = parseInt(b.pax, 10);

  // Validations
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonReponse({ error: "date_invalide" }, 400);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + JOURS_MAX * 86400000).toISOString().slice(0, 10);
  if (date < aujourdHui || date > maxDate) return jsonReponse({ error: "date_hors_limites" }, 400);

  const service = serviceDe(heure);
  if (!CRENEAUX[service].includes(heure)) return jsonReponse({ error: "creneau_invalide" }, 400);
  if (!nom || !prenom) return jsonReponse({ error: "nom_requis" }, 400);
  if (!/^[+0-9][0-9 .\-()]{7,}$/.test(tel)) return jsonReponse({ error: "tel_invalide" }, 400);
  if (!Number.isInteger(pax) || pax < 1 || pax > MAX_PAX) return jsonReponse({ error: "pax_invalide" }, 400);

  const capacite = CAPACITE[service];

  // Insertion conditionnelle : une seule requête SQL, donc pas de course possible
  const sql = `
    INSERT INTO reservations (date, heure, service, nom, prenom, tel, pax, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now')
    WHERE (SELECT COALESCE(SUM(pax), 0) FROM reservations WHERE date = ?1 AND service = ?3) + ?7 <= ?8`;

  const res = await env.DB.prepare(sql)
    .bind(date, heure, service, nom, prenom, tel, pax, capacite)
    .run();

  if (!res.meta.changes) {
    // Capacité atteinte pour ce service
    return jsonReponse({ error: "complet", service }, 409);
  }

  const reste = await env.DB.prepare(
    "SELECT ?1 - COALESCE(SUM(pax),0) AS reste FROM reservations WHERE date = ?2 AND service = ?3"
  ).bind(capacite, date, service).first();

  return jsonReponse({ ok: true, date, heure, service, pax, restant: reste?.reste ?? 0 });
}
