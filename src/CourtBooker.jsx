import { useState, useEffect, useCallback } from 'react'
import InstallPrompt from './InstallPrompt.jsx'

const CONFIG = {
  courts: ['Court 1', 'Court 2'],
  firstHour: 7,
  lastHour: 21,
  slotMinutes: 60,
  daysAhead: 3,
  maxNameLength: 20,
}

const SLOTS_PER_DAY = CONFIG.lastHour - CONFIG.firstHour

function getDateStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = getDateStr(0)
  const tomorrow = getDateStr(1)
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(hour) {
  return `${hour.toString().padStart(2, '0')}:00`
}

function isSlotPast(dateStr, hour) {
  const now = new Date()
  const slotEnd = new Date(dateStr + 'T00:00:00')
  slotEnd.setHours(hour + 1)
  return slotEnd <= now
}

export default function CourtBooker() {
  const [selectedDay, setSelectedDay] = useState(0)
  const [bookings, setBookings] = useState({}) // keyed by "date:court:hour" → { id, name }
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [error, setError] = useState(null)

  const dateStr = getDateStr(selectedDay)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    const dates = Array.from({ length: CONFIG.daysAhead }, (_, i) => getDateStr(i))
    try {
      const res = await fetch(`/api/bookings?dates=${dates.join(',')}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      const map = {}
      for (const row of data) {
        map[`${row.date}:${row.court}:${row.hour}`] = { id: row.id, name: row.name }
      }
      setBookings(map)
    } catch {
      setError('Failed to load bookings.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  // Realtime via SSE
  useEffect(() => {
    const es = new EventSource('/api/bookings/stream')
    es.onmessage = () => loadBookings()
    return () => es.close()
  }, [loadBookings])

  const getBooking = (ds, court, hour) => {
    return bookings[`${ds}:${court}:${hour}`] || null
  }

  const handleBook = async () => {
    if (!name.trim() || !modal) return
    setSaving(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          court: modal.court,
          date: modal.dateStr,
          hour: modal.hour,
          name: name.trim(),
        }),
      })
      if (res.status === 409) {
        alert('Slot just taken — please refresh and try another.')
        setSaving(false)
        loadBookings()
        return
      }
      if (!res.ok) throw new Error()
    } catch {
      alert('Failed to save booking. Please try again.')
      setSaving(false)
      loadBookings()
      return
    }
    setSaving(false)
    setModal(null)
    setName('')
    loadBookings()
  }

  const handleCancel = async (ds, court, hour) => {
    const booking = getBooking(ds, court, hour)
    if (!booking) return
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      alert('Failed to cancel. Please try again.')
    }
    setConfirmCancel(null)
    loadBookings()
  }

  const nowHour = new Date().getHours()

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="12" stroke="#2d6a4f" strokeWidth="2.5" fill="none" />
            <line x1="14" y1="2" x2="14" y2="26" stroke="#2d6a4f" strokeWidth="1.5" />
            <path d="M2 14 Q14 8 26 14" stroke="#2d6a4f" strokeWidth="1.5" fill="none" />
            <path d="M2 14 Q14 20 26 14" stroke="#2d6a4f" strokeWidth="1.5" fill="none" />
          </svg>
          <h1 style={styles.title}>Court Booker</h1>
        </div>
        <p style={styles.subtitle}>Informal booking — be considerate, keep to your slot</p>
      </header>

      {/* Day tabs */}
      <div style={styles.dayTabs}>
        {Array.from({ length: CONFIG.daysAhead }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedDay(i)}
            style={{
              ...styles.dayTab,
              ...(selectedDay === i ? styles.dayTabActive : {}),
              ...(i === CONFIG.daysAhead - 1 ? { borderRight: '1.5px solid #c8c8b8' } : {}),
              ...(selectedDay === i && i === CONFIG.daysAhead - 1
                ? { borderRightColor: '#2d6a4f' }
                : {}),
            }}
          >
            {formatDate(getDateStr(i))}
          </button>
        ))}
      </div>

      {error ? (
        <div style={styles.errorWrap}>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryBtn} onClick={loadBookings}>Retry</button>
        </div>
      ) : loading ? (
        <div style={styles.loadingWrap}>
          <div style={styles.spinner} />
        </div>
      ) : (
        <div style={styles.grid}>
          {/* Header row */}
          <div style={styles.gridHeader}>
            <div style={styles.timeHeader}>Time</div>
            {CONFIG.courts.map((c) => (
              <div key={c} style={styles.courtHeader}>{c}</div>
            ))}
          </div>

          {/* Slot rows */}
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) => {
            const hour = CONFIG.firstHour + i
            const past = isSlotPast(dateStr, hour)
            const isCurrent = selectedDay === 0 && hour === nowHour
            return (
              <div
                key={hour}
                style={{
                  ...styles.gridRow,
                  ...(past ? styles.gridRowPast : {}),
                  ...(isCurrent ? styles.gridRowCurrent : {}),
                }}
              >
                <div style={styles.timeCell}>
                  <span style={styles.timeText}>{formatTime(hour)}</span>
                </div>
                {CONFIG.courts.map((court) => {
                  const booking = getBooking(dateStr, court, hour)
                  return (
                    <div key={court} style={styles.slotCell}>
                      {booking ? (
                        <button
                          style={styles.slotBooked}
                          onClick={() =>
                            !past &&
                            setConfirmCancel({
                              ds: dateStr,
                              court,
                              hour,
                              name: booking.name,
                            })
                          }
                          title={past ? booking.name : 'Tap to cancel'}
                        >
                          <span style={styles.bookedName}>{booking.name}</span>
                          {!past && <span style={styles.cancelHint}>tap to cancel</span>}
                        </button>
                      ) : past ? (
                        <div style={styles.slotPast}>—</div>
                      ) : (
                        <button
                          style={styles.slotFree}
                          onClick={() => setModal({ court, hour, dateStr })}
                        >
                          <span style={styles.freeText}>Book</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <InstallPrompt />

      <footer style={styles.footer}>
        <p>
          This is a voluntary system for the community.
          <br />
          No enforcement — just coordination.
        </p>
      </footer>

      {/* Booking modal */}
      {modal && (
        <div style={styles.overlay} onClick={() => { setModal(null); setName('') }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Book a slot</h2>
            <p style={styles.modalInfo}>
              {modal.court} · {formatDate(modal.dateStr)} · {formatTime(modal.hour)}–
              {formatTime(modal.hour + 1)}
            </p>
            <input
              style={styles.input}
              placeholder="Your name or initials"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBook()}
              autoFocus
              maxLength={CONFIG.maxNameLength}
            />
            <div style={styles.modalButtons}>
              <button style={styles.btnCancel} onClick={() => { setModal(null); setName('') }}>
                Cancel
              </button>
              <button
                style={{
                  ...styles.btnConfirm,
                  opacity: name.trim() ? 1 : 0.4,
                }}
                onClick={handleBook}
                disabled={!name.trim() || saving}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {confirmCancel && (
        <div style={styles.overlay} onClick={() => setConfirmCancel(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Cancel booking?</h2>
            <p style={styles.modalInfo}>
              {confirmCancel.court} · {formatDate(confirmCancel.ds)} ·{' '}
              {formatTime(confirmCancel.hour)}–{formatTime(confirmCancel.hour + 1)}
            </p>
            <p style={{ ...styles.modalInfo, fontWeight: 600 }}>
              Booked by: {confirmCancel.name}
            </p>
            <div style={styles.modalButtons}>
              <button style={styles.btnCancel} onClick={() => setConfirmCancel(null)}>
                Keep
              </button>
              <button
                style={{ ...styles.btnConfirm, background: '#c1121f' }}
                onClick={() =>
                  handleCancel(confirmCancel.ds, confirmCancel.court, confirmCancel.hour)
                }
              >
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    maxWidth: 480,
    margin: '0 auto',
    background: '#fafaf5',
    minHeight: '100vh',
    color: '#1b1b1b',
  },
  header: {
    padding: '24px 20px 12px',
    borderBottom: '2px solid #2d6a4f',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
    color: '#2d6a4f',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b6b6b',
    margin: '6px 0 0',
    lineHeight: 1.3,
  },
  dayTabs: {
    display: 'flex',
    gap: 0,
    padding: '0 20px',
    marginTop: 16,
  },
  dayTab: {
    flex: 1,
    padding: '10px 0',
    border: '1.5px solid #c8c8b8',
    borderRight: 'none',
    background: '#fff',
    fontSize: 13,
    fontWeight: 500,
    color: '#555',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  dayTabActive: {
    background: '#2d6a4f',
    color: '#fff',
    borderColor: '#2d6a4f',
    fontWeight: 700,
  },
  errorWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#c1121f',
  },
  retryBtn: {
    padding: '8px 20px',
    background: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: 60,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid #ddd',
    borderTopColor: '#2d6a4f',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  grid: {
    padding: '12px 20px 20px',
  },
  gridHeader: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr 1fr',
    gap: 6,
    marginBottom: 4,
  },
  timeHeader: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: '0.5px',
    padding: '4px 0',
  },
  courtHeader: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#2d6a4f',
    letterSpacing: '0.5px',
    padding: '4px 0',
    textAlign: 'center',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr 1fr',
    gap: 6,
    marginBottom: 4,
  },
  gridRowPast: {
    opacity: 0.4,
  },
  gridRowCurrent: {
    position: 'relative',
  },
  timeCell: {
    display: 'flex',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
    fontVariantNumeric: 'tabular-nums',
  },
  slotCell: {
    minHeight: 44,
  },
  slotFree: {
    width: '100%',
    height: 44,
    border: '1.5px dashed #b7c9b7',
    borderRadius: 8,
    background: '#f0f5f0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  freeText: {
    fontSize: 13,
    color: '#2d6a4f',
    fontWeight: 600,
  },
  slotBooked: {
    width: '100%',
    height: 44,
    border: '1.5px solid #2d6a4f',
    borderRadius: 8,
    background: '#2d6a4f',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    padding: '2px 6px',
  },
  bookedName: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  cancelHint: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  slotPast: {
    width: '100%',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#bbb',
    fontSize: 14,
  },
  footer: {
    padding: '24px 20px 32px',
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    lineHeight: 1.5,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: '16px 16px 0 0',
    padding: '28px 24px 32px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 -4px 30px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    margin: '0 0 8px',
    color: '#1b1b1b',
  },
  modalInfo: {
    fontSize: 14,
    color: '#666',
    margin: '0 0 16px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '2px solid #ddd',
    borderRadius: 10,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 16,
    transition: 'border-color 0.15s',
  },
  modalButtons: {
    display: 'flex',
    gap: 10,
  },
  btnCancel: {
    flex: 1,
    padding: '12px 0',
    border: '1.5px solid #ddd',
    borderRadius: 10,
    background: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#666',
  },
  btnConfirm: {
    flex: 1,
    padding: '12px 0',
    border: 'none',
    borderRadius: 10,
    background: '#2d6a4f',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#fff',
  },
}
