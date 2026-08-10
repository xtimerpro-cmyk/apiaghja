// /api/resa/admin — réservé au restaurant (clé ADMIN_KEY)
// GET  ?date=YYYY-MM-DD&key=...        → liste des réservations du jour
// POST {action:"delete", id, key}      → supprime une réservation
import { CAPACITE, jsonReponse } from "../_config.js";

function autorise(env, key) {
  return env.ADMIN_KEY && key && key === env.ADMIN_KEY;
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!autorise(env, url.searchParams.get("key"))) return jsonReponse({ error: "non_autorise" }, 401);

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
