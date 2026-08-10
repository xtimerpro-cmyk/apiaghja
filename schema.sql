-- Base de réservations A Piaghja (Cloudflare D1)
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  heure TEXT NOT NULL,         -- HH:MM
  service TEXT NOT NULL,       -- midi | soir
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  tel TEXT NOT NULL,
  pax INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resa_date_service ON reservations (date, service);
