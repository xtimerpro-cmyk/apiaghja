// /api/candidature — candidatures spontanées de la page Rejoignez-nous
const CREATION = `CREATE TABLE IF NOT EXISTS candidatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cree_le TEXT DEFAULT (datetime('now')),
  poste TEXT, prenom TEXT, tel TEXT,
  dispo TEXT, message TEXT,
  statut TEXT DEFAULT 'nouvelle'
)`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "corps_invalide" }, 400); }

  const poste = String(b.poste || "").slice(0, 60).trim();
  const prenom = String(b.prenom || "").slice(0, 80).trim();
  const tel = String(b.tel || "").trim();
  const dispo = String(b.dispo || "").slice(0, 120).trim();
  const message = String(b.message || "").slice(0, 600).trim();

  if (!poste) return json({ error: "poste_requis" }, 400);
  if (prenom.length < 2) return json({ error: "prenom_requis" }, 400);
  if (!/^[+0-9][0-9 .\-()]{7,}$/.test(tel)) return json({ error: "tel_invalide" }, 400);

  try {
    await env.DB.prepare(CREATION).run();
    await env.DB.prepare(
      "INSERT INTO candidatures (poste, prenom, tel, dispo, message) VALUES (?, ?, ?, ?, ?)"
    ).bind(poste, prenom, tel, dispo, message).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: "enregistrement_impossible" }, 500);
  }
}

// Consultation direction : /api/candidature?key=ADMIN_KEY
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY)
    return json({ error: "non_autorise" }, 401);
  try {
    await env.DB.prepare(CREATION).run();
    const r = await env.DB.prepare("SELECT * FROM candidatures ORDER BY id DESC LIMIT 200").all();
    return json({ candidatures: r.results || [] });
  } catch (e) {
    return json({ error: "lecture_impossible" }, 500);
  }
}
