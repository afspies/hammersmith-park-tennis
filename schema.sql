-- Court Booker schema (SQLite)

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  court TEXT NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (court, date, hour)
);
