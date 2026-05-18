'use client'

export function AppHeader() {
  return (
    <header
      style={{
        height: 56,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderBottom: '1px solid #303050',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <h1
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: '#e8e8f0',
          margin: 0,
        }}
      >
        PDF Compressor
      </h1>
    </header>
  )
}
