// /api/carte — la carte du restaurant, pilotée depuis le back-office
// GET                          → carte publique (plats visibles, groupés par onglet/catégorie)
// GET  ?all=1&key=...          → carte complète pour l'admin (plats masqués inclus)
// POST {action, ..., key}      → update / visible / add / delete (réservé direction)
import { jsonReponse } from "./_config.js";

function autorise(env, key) {
  return env.ADMIN_KEY && key && key === env.ADMIN_KEY;
}

function grouper(rows) {
  const panels = {};
  for (const r of rows) {
    if (!panels[r.panel]) panels[r.panel] = { panel: r.panel, cats: [], _idx: {} };
    const p = panels[r.panel];
    if (!(r.categorie in p._idx)) {
      p._idx[r.categorie] = p.cats.length;
      p.cats.push({ titre: r.categorie, plats: [] });
    }
    p.cats[p._idx[r.categorie]].plats.push({
      id: r.id, nom: r.nom, descr: r.descr, prix: r.prix, visible: r.visible, ordre: r.ordre
    });
  }
  return Object.values(panels).map(p => ({ panel: p.panel, cats: p.cats }));
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  const url = new URL(request.url);

  const complet = url.searchParams.get("all") === "1";
  if (complet && !autorise(env, url.searchParams.get("key")))
    return jsonReponse({ error: "non_autorise" }, 401);

  const sql = complet
    ? "SELECT id, panel, categorie, nom, descr, prix, ordre, visible FROM carte ORDER BY panel, ordre"
    : "SELECT id, panel, categorie, nom, descr, prix, ordre, visible FROM carte WHERE visible = 1 ORDER BY panel, ordre";

  const rows = await env.DB.prepare(sql).all();
  const corps = jsonReponse({ panels: grouper(rows.results || []) });
  if (!complet) corps.headers.set("Cache-Control", "no-store");
  return corps;
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return jsonReponse({ error: "db_non_configuree" }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonReponse({ error: "json_invalide" }, 400); }
  if (!autorise(env, b.key)) return jsonReponse({ error: "non_autorise" }, 401);

  // ----- Modifier un plat -----
  if (b.action === "update") {
    const id = parseInt(b.id, 10);
    const nom = String(b.nom || "").trim().slice(0, 120);
    const descr = String(b.descr || "").trim().slice(0, 300) || null;
    const prix = String(b.prix || "").trim().slice(0, 20);
    if (!Number.isInteger(id) || !nom || !prix) return jsonReponse({ error: "champs_invalides" }, 400);
    await env.DB.prepare("UPDATE carte SET nom = ?1, descr = ?2, prix = ?3 WHERE id = ?4")
      .bind(nom, descr, prix, id).run();
    return jsonReponse({ ok: true, id });
  }

  // ----- Afficher / masquer -----
  if (b.action === "visible") {
    const id = parseInt(b.id, 10);
    const v = b.visible ? 1 : 0;
    if (!Number.isInteger(id)) return jsonReponse({ error: "id_invalide" }, 400);
    await env.DB.prepare("UPDATE carte SET visible = ?1 WHERE id = ?2").bind(v, id).run();
    return jsonReponse({ ok: true, id, visible: v });
  }

  // ----- Ajouter un plat -----
  if (b.action === "add") {
    const panel = parseInt(b.panel, 10);
    const categorie = String(b.categorie || "").trim().slice(0, 80);
    const nom = String(b.nom || "").trim().slice(0, 120);
    const descr = String(b.descr || "").trim().slice(0, 300) || null;
    const prix = String(b.prix || "").trim().slice(0, 20);
    if (!Number.isInteger(panel) || panel < 0 || panel > 8 || !categorie || !nom || !prix)
      return jsonReponse({ error: "champs_invalides" }, 400);
    // À la suite de sa catégorie : juste après le dernier plat de cette catégorie
    const dernier = await env.DB.prepare(
      "SELECT COALESCE(MAX(ordre), 0) AS m FROM carte WHERE panel = ?1 AND categorie = ?2"
    ).bind(panel, categorie).first();
    let ordre;
    if (dernier.m > 0) {
      ordre = dernier.m + 1;
      await env.DB.prepare("UPDATE carte SET ordre = ordre + 1 WHERE panel = ?1 AND ordre >= ?2")
        .bind(panel, ordre).run();
    } else {
      const fin = await env.DB.prepare("SELECT COALESCE(MAX(ordre), 0) AS m FROM carte WHERE panel = ?1")
        .bind(panel).first();
      ordre = fin.m + 1;
    }
    const res = await env.DB.prepare(
      "INSERT INTO carte (panel, categorie, nom, descr, prix, ordre, visible) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)"
    ).bind(panel, categorie, nom, descr, prix, ordre).run();
    return jsonReponse({ ok: true, id: res.meta.last_row_id });
  }

  // ----- Supprimer -----
  if (b.action === "delete") {
    const id = parseInt(b.id, 10);
    if (!Number.isInteger(id)) return jsonReponse({ error: "id_invalide" }, 400);
    await env.DB.prepare("DELETE FROM carte WHERE id = ?1").bind(id).run();
    return jsonReponse({ ok: true, supprime: 1 });
  }

  return jsonReponse({ error: "action_inconnue" }, 400);
}
