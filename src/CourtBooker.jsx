import { useState, useEffect, useCallback, useRef } from 'react'
import InstallPrompt from './InstallPrompt.jsx'

const CONFIG = {
  courts: ['Court 1', 'Court 2'],
  firstHour: 7,
  lastHour: 21,
  slotMinutes: 60,
  daysAhead: 14,
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

function formatTime(hour, half = 0) {
  return `${hour.toString().padStart(2, '0')}:${half === 0 ? '00' : '30'}`
}

function halfSlotEnd(hour, half) {
  return half === 0 ? formatTime(hour, 1) : formatTime(hour + 1, 0)
}

function isSlotPast(dateStr, hour, half = 0) {
  const now = new Date()
  const slotEnd = new Date(dateStr + 'T00:00:00')
  slotEnd.setHours(hour)
  slotEnd.setMinutes(half === 0 ? 30 : 60)
  return slotEnd <= now
}

export default function CourtBooker() {
  const [selectedDay, setSelectedDay] = useState(0)
  const [bookings, setBookings] = useState({}) // keyed by "date:court:hour:half" → { id, name }
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [error, setError] = useState(null)
  const tabsRef = useRef(null)
  const dateInputRef = useRef(null)

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
        map[`${row.date}:${row.court}:${row.hour}:${row.half}`] = { id: row.id, name: row.name }
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

  const getBooking = (ds, court, hour, half) => {
    return bookings[`${ds}:${court}:${hour}:${half}`] || null
  }

  const handleBook = async () => {
    if (!name.trim() || !modal) return
    setSaving(true)
    const halves = modal.half === 'full' ? [0, 1] : [modal.half]
    try {
      for (const h of halves) {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            court: modal.court,
            date: modal.dateStr,
            hour: modal.hour,
            half: h,
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
      }
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

  const handleCancel = async (ds, court, hour, half) => {
    const booking = getBooking(ds, court, hour, half)
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

  useEffect(() => {
    if (tabsRef.current && tabsRef.current.children[selectedDay]) {
      tabsRef.current.children[selectedDay].scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      })
    }
  }, [selectedDay])

  const handleDatePick = (e) => {
    const picked = e.target.value
    if (!picked) return
    const today = getDateStr(0)
    const diffMs = new Date(picked + 'T12:00:00') - new Date(today + 'T12:00:00')
    const diffDays = Math.round(diffMs / 86400000)
    if (diffDays >= 0 && diffDays < CONFIG.daysAhead) {
      setSelectedDay(diffDays)
    }
  }

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
      <style>{`.day-tabs::-webkit-scrollbar { display: none }`}</style>
      <div style={styles.dayTabsWrap}>
        <div className="day-tabs" ref={tabsRef} style={styles.dayTabs}>
          {Array.from({ length: CONFIG.daysAhead }, (_, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              style={{
                ...styles.dayTab,
                ...(selectedDay === i ? styles.dayTabActive : {}),
              }}
            >
              {formatDate(getDateStr(i))}
            </button>
          ))}
        </div>
        <button
          style={styles.calendarBtn}
          onClick={() => dateInputRef.current?.showPicker?.()}
          title="Pick a date"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3" width="14" height="13" rx="2" stroke="#2d6a4f" strokeWidth="1.5" fill="none" />
            <line x1="2" y1="7" x2="16" y2="7" stroke="#2d6a4f" strokeWidth="1.5" />
            <line x1="6" y1="1.5" x2="6" y2="4.5" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="1.5" x2="12" y2="4.5" stroke="#2d6a4f" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <input
          type="date"
          ref={dateInputRef}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: 0, left: 0 }}
          min={getDateStr(0)}
          max={getDateStr(CONFIG.daysAhead - 1)}
          onChange={handleDatePick}
        />
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
            const bothPast = isSlotPast(dateStr, hour, 1)
            const isCurrent = selectedDay === 0 && hour === nowHour
            return (
              <div
                key={hour}
                style={{
                  ...styles.gridRow,
                  ...(bothPast ? styles.gridRowPast : {}),
                  ...(isCurrent ? styles.gridRowCurrent : {}),
                }}
              >
                <div style={styles.timeCell}>
                  <span style={styles.timeText}>{formatTime(hour)}</span>
                </div>
                {CONFIG.courts.map((court) => {
                  const b0 = getBooking(dateStr, court, hour, 0)
                  const b1 = getBooking(dateStr, court, hour, 1)
                  const past0 = isSlotPast(dateStr, hour, 0)
                  const past1 = isSlotPast(dateStr, hour, 1)
                  const anyBooked = b0 || b1
                  const allPast = past0 && past1

                  if (allPast && !anyBooked) {
                    return (
                      <div key={court} style={styles.slotCell}>
                        <div style={styles.slotPast}>—</div>
                      </div>
                    )
                  }

                  const showFullHour = !anyBooked && !allPast

                  return (
                    <div key={court} style={styles.slotCell}>
                      <div style={styles.slotContainer}>
                        {/* Top: two half-slot buttons */}
                        <div style={styles.halfSlotRow}>
                          {[0, 1].map((half) => {
                            const booking = half === 0 ? b0 : b1
                            const past = half === 0 ? past0 : past1
                            if (booking) {
                              return (
                                <button
                                  key={half}
                                  style={{
                                    ...styles.halfSlotBooked,
                                    ...(half === 0 ? styles.halfLeft : styles.halfRight),
                                  }}
                                  onClick={() =>
                                    !past &&
                                    setConfirmCancel({
                                      ds: dateStr,
                                      court,
                                      hour,
                                      half,
                                      name: booking.name,
                                    })
                                  }
                                  title={past ? booking.name : 'Tap to cancel'}
                                >
                                  <span style={styles.halfBookedName}>{booking.name}</span>
                                  {!past && <span style={styles.cancelHint}>cancel</span>}
                                </button>
                              )
                            }
                            if (past) {
                              return <div key={half} style={styles.halfSlotEmpty} />
                            }
                            return (
                              <button
                                key={half}
                                style={{
                                  ...styles.halfSlotFree,
                                  ...(half === 0 ? styles.halfLeft : styles.halfRight),
                                }}
                                onClick={() => setModal({ court, hour, half, dateStr })}
                              >
                                <span style={styles.halfFreeText}>
                                  {half === 0 ? ':00' : ':30'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {/* Bottom: full-hour button */}
                        {showFullHour && (
                          <button
                            style={styles.fullSlotFree}
                            onClick={() => setModal({ court, hour, half: 'full', dateStr })}
                          >
                            <span style={styles.fullFreeText}>1 hr</span>
                          </button>
                        )}
                      </div>
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
        <p>This is a voluntary system for the community.</p>
        <p style={styles.footerLinks}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = ['ma','ilto:','alex','@','afspies','.com'].join('')
            }}
            style={styles.footerLink}
          >
            Contact
          </a>
          {' · '}
          <a
            href="https://github.com/afspies/hammersmith-park-tennis"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.footerLink}
          >
            GitHub
          </a>
        </p>
      </footer>

      {/* Booking modal */}
      {modal && (
        <div style={styles.overlay} onClick={() => { setModal(null); setName('') }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Book a slot</h2>
            <p style={styles.modalInfo}>
              {modal.court} · {formatDate(modal.dateStr)} · {modal.half === 'full'
                ? `${formatTime(modal.hour)}–${formatTime(modal.hour + 1)}`
                : `${formatTime(modal.hour, modal.half)}–${halfSlotEnd(modal.hour, modal.half)}`}
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
              {formatTime(confirmCancel.hour, confirmCancel.half)}–{halfSlotEnd(confirmCancel.hour, confirmCancel.half)}
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
                  handleCancel(confirmCancel.ds, confirmCancel.court, confirmCancel.hour, confirmCancel.half)
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
  dayTabsWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 20px',
    marginTop: 16,
  },
  dayTabs: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    flex: 1,
    paddingBottom: 2,
  },
  dayTab: {
    minWidth: 90,
    flexShrink: 0,
    padding: '8px 12px',
    border: '1.5px solid #c8c8b8',
    borderRadius: 8,
    background: '#fff',
    fontSize: 13,
    fontWeight: 500,
    color: '#555',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    scrollSnapAlign: 'start',
    whiteSpace: 'nowrap',
  },
  dayTabActive: {
    background: '#2d6a4f',
    color: '#fff',
    borderColor: '#2d6a4f',
    fontWeight: 700,
  },
  calendarBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    border: '1.5px solid #c8c8b8',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
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
  slotPast: {
    width: '100%',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#bbb',
    fontSize: 14,
  },
  slotContainer: {
    border: '1.5px solid #c8d8c8',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#f0f5f0',
    height: 48,
    display: 'flex',
    flexDirection: 'column',
  },
  halfSlotRow: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  halfLeft: {
    borderRight: '1px solid #c8d8c8',
  },
  halfRight: {},
  halfSlotFree: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
    padding: '4px 0',
  },
  halfFreeText: {
    fontSize: 11,
    color: '#2d6a4f',
    fontWeight: 600,
  },
  halfSlotBooked: {
    flex: 1,
    border: 'none',
    background: '#2d6a4f',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    padding: '2px 4px',
  },
  halfBookedName: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  cancelHint: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 0,
  },
  halfSlotEmpty: {
    flex: 1,
  },
  fullSlotFree: {
    width: '100%',
    border: 'none',
    borderTop: '1px solid #c8d8c8',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
    padding: '3px 0',
  },
  fullFreeText: {
    fontSize: 10,
    color: '#2d6a4f',
    fontWeight: 600,
  },
  footer: {
    padding: '24px 20px 32px',
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    lineHeight: 1.5,
  },
  footerLinks: {
    marginTop: 6,
  },
  footerLink: {
    color: '#2d6a4f',
    textDecoration: 'none',
    fontWeight: 600,
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
