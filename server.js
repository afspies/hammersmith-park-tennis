import express from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Database setup
const dataDir = join(__dirname, 'data')
import { mkdirSync } from 'fs'
mkdirSync(dataDir, { recursive: true })

const db = new Database(join(dataDir, 'db.sqlite'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    court TEXT NOT NULL,
    date TEXT NOT NULL,
    hour INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (court, date, hour)
  )
`)

// SSE clients
const clients = new Set()

function broadcast() {
  for (const res of clients) {
    res.write('data: update\n\n')
  }
}

// Middleware
app.use(express.json())

// API routes
app.get('/api/bookings', (req, res) => {
  const dates = req.query.dates
  if (!dates) return res.json([])
  const dateList = dates.split(',')
  const placeholders = dateList.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, court, date, hour, name FROM bookings WHERE date IN (${placeholders})`
  ).all(...dateList)
  res.json(rows)
})

app.post('/api/bookings', (req, res) => {
  const { court, date, hour, name } = req.body
  if (!court || !date || hour == null || !name) {
    return res.status(400).json({ error: 'Missing fields' })
  }
  const id = randomUUID()
  try {
    db.prepare(
      'INSERT INTO bookings (id, court, date, hour, name) VALUES (?, ?, ?, ?, ?)'
    ).run(id, court, date, hour, name.trim())
    broadcast()
    res.status(201).json({ id })
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Slot already booked' })
    }
    throw err
  }
})

app.delete('/api/bookings/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id)
  if (result.changes > 0) broadcast()
  res.json({ ok: true })
})

app.get('/api/bookings/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

// Static files (production)
app.use(express.static(join(__dirname, 'dist')))
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Court Booker running on http://localhost:${PORT}`)
})
