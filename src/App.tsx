import { useEffect, useState } from 'react'
import { DatabaseSetup } from './components/DatabaseSetup'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { SettingsPage } from './components/SettingsPage'
import { ReportsPage } from './components/ReportsPage'
import { TrendingPage } from './components/TrendingPage'
import { CalendarPage } from './components/CalendarPage'
import { useJobStore } from './store/jobStore'
import { dbService } from './services/database'

function App() {
  const { initializeDatabase, dbPath, workspaces, selectedWorkspace } = useJobStore()
  const [currentView, setCurrentView] = useState('dashboard')
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const applyTheme = async () => {
      if (!dbPath) return
      try {
        const mode = await dbService.getSettings('theme_mode')
        if (mode === 'light') document.documentElement.classList.add('light')
        else document.documentElement.classList.remove('light')
      } catch {}
    }
    applyTheme()
    const interval = setInterval(applyTheme, 2000)
    return () => clearInterval(interval)
  }, [dbPath])

  useEffect(() => {
    const workspace = workspaces.find(w => w.id === selectedWorkspace)
    const root = document.documentElement
    if (workspace?.brand_background_color) root.style.setProperty('--workspace-background-override', workspace.brand_background_color)
    else root.style.removeProperty('--workspace-background-override')
    if (workspace?.brand_highlight_color) root.style.setProperty('--workspace-primary-override', workspace.brand_highlight_color)
    else root.style.removeProperty('--workspace-primary-override')
    if (workspace?.brand_font_color) root.style.setProperty('--workspace-font-override', workspace.brand_font_color)
    else root.style.removeProperty('--workspace-font-override')
  }, [workspaces, selectedWorkspace])

  useEffect(() => {
    const init = async () => {
      const storedPath = localStorage.getItem('contenthub_db_path')
      if (storedPath) {
        try {
          await initializeDatabase(storedPath)
        } catch (error) {
          console.error('Failed to initialize database:', error)
          setHasError(true)
          localStorage.removeItem('contenthub_db_path')
        }
      }
      setIsReady(true)
    }
    init()
  }, [initializeDatabase])

  const handleDatabaseSetup = async (path: string) => {
    localStorage.setItem('contenthub_db_path', path)
    setIsReady(false)
    setHasError(false)
    try {
      await initializeDatabase(path)
      setIsReady(true)
    } catch (error) {
      console.error('Failed to initialize database:', error)
      alert('Failed to initialize database. Please try again.')
      setHasError(true)
    }
  }

  if (!isReady) {
    return <div className="flex h-screen items-center justify-center bg-background"><div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div><p className="text-muted-foreground">Connecting to database...</p></div></div>
  }

  if (hasError) {
    return <div className="flex h-screen items-center justify-center bg-background"><div className="text-center max-w-md p-6"><p className="text-destructive mb-4">Failed to connect to database</p><p className="text-muted-foreground mb-4">The database file may be corrupted or incompatible. Please create a new database.</p><DatabaseSetup onSetup={handleDatabaseSetup} /></div></div>
  }

  if (!dbPath) return <DatabaseSetup onSetup={handleDatabaseSetup} />

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'calendar' && <CalendarPage />}
        {currentView === 'settings' && <SettingsPage />}
        {currentView === 'reports' && <ReportsPage />}
        {currentView === 'trending' && <TrendingPage />}
      </main>
    </div>
  )
}

export default App
