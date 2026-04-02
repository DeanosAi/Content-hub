import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ApiKeys {
  youtube: string
  apify: string
  moonshot: string
}

export function SettingsPage() {
  const { dbPath } = useJobStore()
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ youtube: '', apify: '', moonshot: '' })
  const [showKeys, setShowKeys] = useState({ youtube: false, apify: false, moonshot: false })
  const [isLoading, setIsLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')

  // Load settings on mount
  useEffect(() => {
    loadApiKeys()
    loadTheme()
  }, [])

  const loadTheme = async () => {
    try {
      const theme = await dbService.getSettings('theme_mode')
      if (theme) setThemeMode(theme)
    } catch (e) { console.error(e) }
  }

  const handleThemeChange = async (mode: 'dark' | 'light') => {
    setThemeMode(mode)
    await dbService.saveSettings('theme_mode', mode)
    if (mode === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }

  const loadApiKeys = async () => {
    try {
      const keys = await dbService.getSettings('api_keys')
      if (keys) {
        setApiKeys({
          youtube: keys.youtube || '',
          apify: keys.apify || '',
          moonshot: keys.moonshot || ''
        })
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }

  const handleSaveApiKeys = async () => {
    setIsLoading(true)
    setSaveMessage('')
    try {
      await dbService.saveSettings('api_keys', apiKeys)
      setSaveMessage('API keys saved successfully!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      console.error('Failed to save API keys:', error)
      setSaveMessage('Failed to save API keys')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      
      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>Manage your local database settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Database Location</Label>
            <div className="flex gap-2">
              <Input value={dbPath || ''} readOnly />
              <Button variant="outline">Change</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your data is stored locally in an SQLite database file.
            </p>
          </div>
          
          <div className="pt-4 border-t">
            <Button variant="outline">Export Database Backup</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Configure external service integrations. Keys are stored locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* YouTube API Key */}
          <div className="space-y-2">
            <Label>YouTube Data API Key</Label>
            <div className="flex gap-2">
              <Input 
                type={showKeys.youtube ? 'text' : 'password'} 
                placeholder="Enter API key..."
                value={apiKeys.youtube}
                onChange={(e) => setApiKeys({ ...apiKeys, youtube: e.target.value })}
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowKeys({ ...showKeys, youtube: !showKeys.youtube })}
              >
                {showKeys.youtube ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a>
            </p>
          </div>
          
          {/* Apify API Token */}
          <div className="space-y-2">
            <Label>Apify API Token</Label>
            <div className="flex gap-2">
              <Input 
                type={showKeys.apify ? 'text' : 'password'} 
                placeholder="Enter API token..."
                value={apiKeys.apify}
                onChange={(e) => setApiKeys({ ...apiKeys, apify: e.target.value })}
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowKeys({ ...showKeys, apify: !showKeys.apify })}
              >
                {showKeys.apify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your token from <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Apify Console</a>
            </p>
          </div>
          
          {/* Moonshot API Key */}
          <div className="space-y-2">
            <Label>Moonshot (Kimi) API Key</Label>
            <div className="flex gap-2">
              <Input 
                type={showKeys.moonshot ? 'text' : 'password'} 
                placeholder="Enter API key..."
                value={apiKeys.moonshot}
                onChange={(e) => setApiKeys({ ...apiKeys, moonshot: e.target.value })}
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowKeys({ ...showKeys, moonshot: !showKeys.moonshot })}
              >
                {showKeys.moonshot ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Moonshot Platform</a>. Used for AI-powered metrics fetching.
            </p>
          </div>
          
          {saveMessage && (
            <p className="text-sm text-emerald-500">{saveMessage}</p>
          )}
          
          <Button 
            onClick={handleSaveApiKeys} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Saving...' : 'Save API Keys'}
          </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleThemeChange('dark')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all',
                  themeMode === 'dark'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <Moon className="h-5 w-5" />
                <div className="text-left">
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">Current theme</p>
                </div>
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all',
                  themeMode === 'light'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <Sun className="h-5 w-5" />
                <div className="text-left">
                  <p className="text-sm font-medium">Light Mode</p>
                  <p className="text-xs text-muted-foreground">Light theme</p>
                </div>
              </button>
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  )
}