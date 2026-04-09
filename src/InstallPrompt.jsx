import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIOSPrompt, setShowIOSPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('install-dismissed') === '1'
  )

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const isIOS = /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone
    if (isIOS && !deferredPrompt) {
      setShowIOSPrompt(true)
    }
  }, [deferredPrompt])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('install-dismissed', '1')
  }

  if (dismissed) return null
  if (!deferredPrompt && !showIOSPrompt) return null

  return (
    <div style={styles.banner}>
      {deferredPrompt ? (
        <>
          <span style={styles.text}>Add to Home Screen for quick access</span>
          <div style={styles.buttons}>
            <button style={styles.installBtn} onClick={handleInstall}>Install</button>
            <button style={styles.dismissBtn} onClick={handleDismiss}>Not now</button>
          </div>
        </>
      ) : (
        <>
          <span style={styles.text}>
            Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> for quick access
          </span>
          <button style={styles.dismissBtn} onClick={handleDismiss}>Got it</button>
        </>
      )}
    </div>
  )
}

const styles = {
  banner: {
    margin: '0 20px 16px',
    padding: '14px 16px',
    background: '#fff',
    border: '1.5px solid #2d6a4f',
    borderRadius: 12,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    minWidth: 160,
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
  installBtn: {
    padding: '8px 16px',
    background: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  dismissBtn: {
    padding: '8px 12px',
    background: 'transparent',
    color: '#888',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
