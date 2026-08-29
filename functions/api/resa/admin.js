// /api/resa/admin v4 — réservé à la direction (clé ADMIN_KEY)
// v4 : la vue période (?from&to) détaille résa / passage par service (rétro-compatible)
// GET  ?date=YYYY-MM-DD&key=...               → réservations du jour + totaux
// GET  ?from=...&to=...&key=...               → totaux par jour (max 31 j)
// GET  ?stats=YYYY-MM&key=...                 → statistiques du mois
// POST {action:"delete", id, key}             → supprime une réservation
// POST {action:"table", id, table, key}       → attribue une table
// POST {action:"passage", date, heure, pax, table?, camping?, key} → enregistre un passage
import { CAPACITE, jsonReponse, serviceDe } from "../_config.js";

function autorise(env, key) {
  return env.ADMIN_KEY && key && key === env.ADMIN_KEY;
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!autorise(env, url.searchParams.get("key"))) return jsonReponse({ error: "non_autorise" }, 401);

  // ----- Statistiques mensuelles -----
  const stats = url.searchParams.get("stats");
  if (stats) {
    if (!/^\d{4}-\d{2}$/.test(stats)) return jsonReponse({ error: "mois_invalide" }, 400);
    const motif = stats + "-%";

    const parJour = await env.DB.prepare(
      "SELECT date, service, COALESCE(SUM(pax),0) AS total FROM reservations WHERE date LIKE ?1 GROUP BY date, service"
    ).bind(motif).all();

    const parCamping = await env.DB.prepare(
      "SELECT camping, COALESCE(SUM(pax),0) AS total FROM reservations WHERE date LIKE ?1 GROUP BY camping"
    ).bind(motif).all();

    const parType = await env.DB.prepare(
      "SELECT type, COALESCE(SUM(pax),0) AS total, COUNT(*) AS nb FROM reservations WHERE date LIKE ?1 GROUP BY type"
    ).bind(motif).all();

    const parHeure = await env.DB.prepare(
      "SELECT heure, COALESCE(SUM(pax),0) AS total FROM reservations WHERE date LIKE ?1 GROUP BY heure ORDER BY heure"
    ).bind(motif).all();

    const jours = {};
    for (const r of parJour.results || []) {
      if (!jours[r.date]) jours[r.date] = { midi: 0, soir: 0 };
      jours[r.date][r.service] = r.total;
    }
    const camping = { oui: 0, non: 0 };
    for (const r of parCamping.results || []) camping[r.camping ? "oui" : "non"] = r.total;
    const types = { resa: { pax: 0, nb: 0 }, passage: { pax: 0, nb: 0 } };
    for (const r of parType.results || []) types[r.type] = { pax: r.total, nb: r.nb };
    const heures = {};
    for (const r of parHeure.results || []) heures[r.heure] = r.total;

    return jsonReponse({ month: stats, jours, camping, types, heures, capacite: CAPACITE });
  }

  // ----- Vue période -----
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (from && to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
      return jsonReponse({ error: "periode_invalide" }, 400);
    if ((new Date(to) - new Date(from)) / 86400000 > 31)
      return jsonReponse({ error: "periode_trop_longue" }, 400);

    const rows = await env.DB.prepare(
      "SELECT date, service, type, COALESCE(SUM(pax),0) AS total, COUNT(*) AS nb FROM reservations WHERE date BETWEEN ?1 AND ?2 GROUP BY date, service, type"
    ).bind(from, to).all();

    const vierge = () => ({ pax: 0, nb: 0, resa_pax: 0, resa_nb: 0, passage_pax: 0, passage_nb: 0 });
    const jours = {};
    for (const r of rows.results || []) {
      if (!jours[r.date]) jours[r.date] = { midi: vierge(), soir: vierge() };
      const s = jours[r.date][r.service];
      if (!s) continue;
      s.pax += r.total; s.nb += r.nb;
      if (r.type === "passage") { s.passage_pax += r.total; s.passage_nb += r.nb; }
      else { s.resa_pax += r.total; s.resa_nb += r.nb; }
    }
    return jsonReponse({ from, to, jours, capacite: CAPACITE });
  }

  // ----- Vue jour -----
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonReponse({ error: "date_invalide" }, 400);

  const rows = await env.DB.prepare(
    "SELECT id, heure, service, nom, prenom, tel, pax, camping, table_num, type, created_at FROM reservations WHERE date = ?1 ORDER BY heure, nom"
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

  // ----- Suppression -----
  if (b.action === "delete") {
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return jsonReponse({ error: "id_invalide" }, 400);
    const res = await env.DB.prepare("DELETE FROM reservations WHERE id = ?1").bind(id).run();
    return jsonReponse({ ok: true, supprime: res.meta.changes });
  }

  // ----- Attribution de table -----
  if (b.action === "table") {
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return jsonReponse({ error: "id_invalide" }, 400);
    const table = String(b.table ?? "").trim().slice(0, 10);
    await env.DB.prepare("UPDATE reservations SET table_num = ?1 WHERE id = ?2")
      .bind(table || null, id).run();
    return jsonReponse({ ok: true, id, table });
  }

  // ----- Passage (client sans réservation, saisi en salle) -----
  if (b.action === "passage") {
    const date = String(b.date || "");
    const heure = String(b.heure || "");
    const pax = parseInt(b.pax, 10);
    const table = String(b.table ?? "").trim().slice(0, 10);
    const camping = (b.camping === 1 || b.camping === "1" || b.camping === true) ? 1 : 0;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonReponse({ error: "date_invalide" }, 400);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return jsonReponse({ error: "heure_invalide" }, 400);
    if (!Number.isInteger(pax) || pax < 1 || pax > 40) return jsonReponse({ error: "pax_invalide" }, 400);

    const service = serviceDe(heure);
    // Le passage est saisi par la salle : pas de contrôle de capacité,
    // mais il décompte des disponibilités en ligne (comportement voulu).
    await env.DB.prepare(
      `INSERT INTO reservations (date, heure, service, nom, prenom, tel, pax, camping, table_num, type, created_at)
       VALUES (?1, ?2, ?3, 'Passage', '', '', ?4, ?5, ?6, 'passage', datetime('now'))`
    ).bind(date, heure, service, pax, camping, table || null).run();

    return jsonReponse({ ok: true, date, heure, service, pax, camping, table });
  }

  return jsonReponse({ error: "action_inconnue" }, 400);
}
