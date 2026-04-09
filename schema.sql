-- Court Booker schema (SQLite)

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  court TEXT NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  half INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (court, date, hour, half)
);
