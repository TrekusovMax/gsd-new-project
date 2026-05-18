import { AppHeader } from '@/components/AppHeader'

export default function Home() {
  return (
    <>
      <AppHeader />
      <main
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 'calc(100vh - 56px)',
          padding: '24px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 600,
            width: '100%',
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 32,
          }}
        />
      </main>
    </>
  )
}
