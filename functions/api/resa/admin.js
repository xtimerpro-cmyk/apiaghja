// /api/resa/admin — réservé à la direction (clé ADMIN_KEY)
// GET  ?date=YYYY-MM-DD&key=...              → réservations du jour + totaux
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD&key=... → totaux par jour sur une période (max 31 j)
// POST {action:"delete", id, key}             → supprime une réservation
import { CAPACITE, jsonReponse } from "../_config.js";

function autorise(env, key) {
  return env.ADMIN_KEY && key && key === env.ADMIN_KEY;
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!autorise(env, url.searchParams.get("key"))) return jsonReponse({ error: "non_autorise" }, 401);

  const from = url.searchParams.get("from"), to = url.searchParams.get("to");

  // ----- Vue période : totaux par jour -----
  if (from && to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
      return jsonReponse({ error: "periode_invalide" }, 400);
    const ecart = (new Date(to) - new Date(from)) / 86400000;
    if (ecart > 31) return jsonReponse({ error: "periode_trop_longue" }, 400);

    const rows = await env.DB.prepare(
      "SELECT date, service, COALESCE(SUM(pax),0) AS total, COUNT(*) AS nb FROM reservations WHERE date BETWEEN ?1 AND ?2 GROUP BY date, service"
    ).bind(from, to).all();

    const jours = {};
    for (const r of rows.results || []) {
      if (!jours[r.date]) jours[r.date] = { midi: { pax: 0, nb: 0 }, soir: { pax: 0, nb: 0 } };
      jours[r.date][r.service] = { pax: r.total, nb: r.nb };
    }
    return jsonReponse({ from, to, jours, capacite: CAPACITE });
  }

  // ----- Vue jour : liste détaillée -----
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonReponse({ error: "date_invalide" }, 400);

  const rows = await env.DB.prepare(
    "SELECT id, heure, service, nom, prenom, tel, pax, created_at FROM reservations WHERE date = ?1 ORDER BY heure, nom"
  ).bind(date).all();

  const resas = rows.results || [];
  const totaux = { midi: 0, soir: 0 };
  for (const r of resas) totaux[r.service] += r.pax;

  return jsonReponse({ date, resas, totaux, capacite: CAPACITE });
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonReponse({ error: "json_invalide" }, 400); }
  if (!autorise(env, b.key)) return jsonReponse({ error: "non_autorise" }, 401);

  if (b.action === "delete") {
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return jsonReponse({ error: "id_invalide" }, 400);
    const res = await env.DB.prepare("DELETE FROM reservations WHERE id = ?1").bind(id).run();
    return jsonReponse({ ok: true, supprime: res.meta.changes });
  }

  return jsonReponse({ error: "action_inconnue" }, 400);
}
