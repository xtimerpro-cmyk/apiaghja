// Demandes de devis événement — collectées par l'assistant du site
const CREATION = `CREATE TABLE IF NOT EXISTS devis_evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cree_le TEXT DEFAULT (datetime('now')),
  type TEXT, date_evt TEXT, moment TEXT,
  pax INTEGER, formule TEXT, options TEXT,
  prenom TEXT, tel TEXT, estimation INTEGER,
  statut TEXT DEFAULT 'nouveau'
)`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "corps_invalide" }, 400); }

  const type = String(b.type || "").slice(0, 40).trim();
  const date = String(b.date || "").slice(0, 10);
  const moment = String(b.moment || "").slice(0, 30).trim();
  const pax = parseInt(b.pax, 10);
  const formule = String(b.formule || "").slice(0, 60).trim();
  const options = String(b.options || "").slice(0, 300).trim();
  const prenom = String(b.prenom || "").slice(0, 60).trim();
  const tel = String(b.tel || "").trim();
  const estimation = Math.max(0, parseInt(b.estimation, 10) || 0);

  if (!type) return json({ error: "type_requis" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date_invalide" }, 400);
  if (!Number.isInteger(pax) || pax < 2 || pax > 500) return json({ error: "pax_invalide" }, 400);
  if (!/^[+0-9][0-9 .\-()]{7,}$/.test(tel)) return json({ error: "tel_invalide" }, 400);

  try {
    await env.DB.prepare(CREATION).run();
    await env.DB.prepare(
      `INSERT INTO devis_evenements (type, date_evt, moment, pax, formule, options, prenom, tel, estimation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(type, date, moment, pax, formule, options, prenom, tel, estimation).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: "enregistrement_impossible" }, 500);
  }
}

// Consultation (pour le back-office, plus tard) : /api/evenement?key=ADMIN_KEY
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY)
    return json({ error: "non_autorise" }, 401);
  try {
    await env.DB.prepare(CREATION).run();
    const r = await env.DB.prepare(
      "SELECT * FROM devis_evenements ORDER BY id DESC LIMIT 200"
    ).all();
    return json({ demandes: r.results || [] });
  } catch (e) {
    return json({ error: "lecture_impossible" }, 500);
  }
}
