// Cloudflare Pages Function — /api/rating
// Proxifie l'API Google Places (New) pour récupérer la note et le nombre d'avis
// sans exposer la clé API dans le navigateur. Cache 6h côté edge.
//
// Secrets à configurer (une seule fois) :
//   npx wrangler pages secret put GOOGLE_PLACES_KEY --project-name=apiaghja
//   npx wrangler pages secret put GOOGLE_PLACE_ID  --project-name=apiaghja

export async function onRequestGet(context) {
  const { env, request } = context;

  const key = env.GOOGLE_PLACES_KEY;
  const placeId = env.GOOGLE_PLACE_ID;

  if (!key || !placeId) {
    return json({ error: "config_missing" }, 503);
  }

  // Cache edge : une seule vraie requête vers Google toutes les 6h
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/rating", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri",
        },
      }
    );

    if (!resp.ok) {
      return json({ error: "google_api_error", status: resp.status }, 502);
    }

    const data = await resp.json();

    const body = json({
      rating: data.rating ?? null,          // ex: 4.8
      count: data.userRatingCount ?? null,  // ex: 132
      url: data.googleMapsUri ?? null,      // lien vers la fiche
      fetchedAt: new Date().toISOString(),
    });

    // Cache 6h
    const toCache = new Response(body.body, body);
    toCache.headers.set("Cache-Control", "public, max-age=21600");
    context.waitUntil(cache.put(cacheKey, toCache.clone()));
    return toCache;
  } catch (e) {
    return json({ error: "fetch_failed" }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
