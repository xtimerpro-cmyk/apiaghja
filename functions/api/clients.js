// /api/clients — fichier client de la direction (clé ADMIN_KEY)
// GET  ?key=...                                    → liste agrégée des clients
// POST {action:"maj", tel, avis?, vip?, optout?, note?, key} → fiche CRM (upsert)
const CREATION = `CREATE TABLE IF NOT EXISTS clients_notes (
  tel TEXT PRIMARY KEY,
  avis INTEGER DEFAULT 0,
  vip INTEGER DEFAULT 0,
  optout INTEGER DEFAULT 0,
  note TEXT,
  maj_le TEXT
)`;
const CREATION_DEVIS = `CREATE TABLE IF NOT EXISTS devis_evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cree_le TEXT DEFAULT (datetime('now')),
  type TEXT, date_evt TEXT, moment TEXT,
  pax INTEGER, formule TEXT, options TEXT,
  prenom TEXT, tel TEXT, estimation INTEGER,
  statut TEXT DEFAULT 'nouveau'
)`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const autorise = (env, key) => env.ADMIN_KEY && key && key === env.ADMIN_KEY;

// même normalisation côté SQL et côté JS : chiffres uniquement (le + de +33 tombe)
const NORM_SQL = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(${col},' ',''),'.',''),'-',''),'+','')`;

export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);
  if (!autorise(env, url.searchParams.get("key"))) return json({ error: "non_autorise" }, 401);

  try {
    await env.DB.prepare(CREATION).run();
    await env.DB.prepare(CREATION_DEVIS).run();

    const clients = await env.DB.prepare(
      `SELECT ${NORM_SQL("tel")} AS telN,
              MAX(tel) AS tel, MAX(nom) AS nom, MAX(prenom) AS prenom,
              COUNT(*) AS visites, COALESCE(SUM(pax),0) AS couverts,
              MIN(date) AS premiere, MAX(date) AS derniere,
              COALESCE(SUM(camping),0) AS campings
       FROM reservations
       WHERE type = 'resa' AND tel IS NOT NULL AND TRIM(tel) <> ''
       GROUP BY telN
       ORDER BY derniere DESC`
    ).all();

    const notes = await env.DB.prepare("SELECT * FROM clients_notes").all();
    const devis = await env.DB.prepare(
      `SELECT ${NORM_SQL("tel")} AS telN, COUNT(*) AS nb FROM devis_evenements GROUP BY telN`
    ).all();

    const parTel = {};
    for (const n of notes.results || []) parTel[n.tel] = n;
    const devisParTel = {};
    for (const d of devis.results || []) devisParTel[d.telN] = d.nb;

    const liste = (clients.results || []).map(c => {
      const n = parTel[c.telN] || {};
      return {
        tel: c.tel, telN: c.telN, nom: c.nom, prenom: c.prenom,
        visites: c.visites, couverts: c.couverts,
        premiere: c.premiere, derniere: c.derniere,
        campings: c.campings, devis: devisParTel[c.telN] || 0,
        avis: n.avis ? 1 : 0, vip: n.vip ? 1 : 0, optout: n.optout ? 1 : 0,
        note: n.note || ""
      };
    });
    return json({ clients: liste });
  } catch (e) {
    return json({ error: "lecture_impossible" }, 500);
  }
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return json({ error: "db_non_configuree" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "json_invalide" }, 400); }
  if (!autorise(env, b.key)) return json({ error: "non_autorise" }, 401);

  if (b.action === "maj") {
    const telN = String(b.tel || "").replace(/[^0-9]/g, "");
    if (telN.length < 8) return json({ error: "tel_invalide" }, 400);
    const avis = b.avis ? 1 : 0;
    const vip = b.vip ? 1 : 0;
    const optout = b.optout ? 1 : 0;
    const note = String(b.note || "").slice(0, 500);
    try {
      await env.DB.prepare(CREATION).run();
      await env.DB.prepare(
        `INSERT INTO clients_notes (tel, avis, vip, optout, note, maj_le)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(tel) DO UPDATE SET avis=?2, vip=?3, optout=?4, note=?5, maj_le=datetime('now')`
      ).bind(telN, avis, vip, optout, note).run();
      return json({ ok: true, tel: telN });
    } catch (e) {
      return json({ error: "enregistrement_impossible" }, 500);
    }
  }
  return json({ error: "action_inconnue" }, 400);
}
