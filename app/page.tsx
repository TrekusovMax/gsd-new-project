import { AppHeader } from '@/components/AppHeader'
import { UploadSection } from '@/components/UploadSection'

export default function Home() {
  return (
    <>
      <AppHeader />
      <main
        style={{
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <UploadSection />
      </main>
    </>
  )
}
