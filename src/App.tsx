import { useEffect, useState } from 'react'
import { DatabaseSetup } from './components/DatabaseSetup'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { SettingsPage } from './components/SettingsPage'
import { ReportsPage } from './components/ReportsPage'
import { TrendingPage } from './components/TrendingPage'
import { useJobStore } from './store/jobStore'
import { dbService } from './services/database'

function App() {
  const { initializeDatabase, dbPath } = useJobStore()
  const [currentView, setCurrentView] = useState('dashboard')
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Theme: apply light class to root when theme_mode is 'light'
  useEffect(() => {
    const applyTheme = async () => {
      if (!dbPath) return
      try {
        const mode = await dbService.getSettings('theme_mode')
        if (mode === 'light') {
          document.documentElement.classList.add('light')
        } else {
          document.documentElement.classList.remove('light')
        }
      } catch (e) { /* ignore before DB is ready */ }
    }
    applyTheme()
    // Listen for storage events to react to settings changes
    const interval = setInterval(applyTheme, 2000)
    return () => clearInterval(interval)
  }, [dbPath])

  useEffect(() => {
    const init = async () => {
      const storedPath = localStorage.getItem('contenthub_db_path')
      
      if (storedPath) {
        try {
          console.log('Initializing database at:', storedPath)
          await initializeDatabase(storedPath)
          console.log('Database initialized successfully')
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

  // Show loading state
  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Connecting to database...</p>
        </div>
      </div>
    )
  }

  // Show error state with option to reset
  if (hasError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md p-6">
          <p className="text-destructive mb-4">Failed to connect to database</p>
          <p className="text-muted-foreground mb-4">
            The database file may be corrupted or incompatible. Please create a new database.
          </p>
          <DatabaseSetup onSetup={handleDatabaseSetup} />
        </div>
      </div>
    )
  }

  // Show database setup if no path is set
  if (!dbPath) {
    return <DatabaseSetup onSetup={handleDatabaseSetup} />
  }

  // Main app
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'settings' && <SettingsPage />}
        {currentView === 'reports' && <ReportsPage />}
        {currentView === 'trending' && <TrendingPage />}
      </main>
    </div>
  )
}

export default App