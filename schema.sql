-- Table des réservations d'A Piaghja
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  heure TEXT NOT NULL,
  service TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  tel TEXT NOT NULL,
  pax INTEGER NOT NULL,
  camping INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resa_date_service ON reservations (date, service);
