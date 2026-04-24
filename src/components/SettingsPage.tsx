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

const DEFAULTS = {
  background: '#0f172a',
  highlight: '#8b5cf6',
  font: '#e5eefb',
}

const DEFAULT_COLUMN_BG = '#334155'

export function SettingsPage() {
  const { dbPath, selectedWorkspace, workspaces, updateWorkspace, loadWorkspaces, workspaceColumns, updateWorkspaceColumn } = useJobStore()
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ youtube: '', apify: '', moonshot: '' })
  const [showKeys, setShowKeys] = useState({ youtube: false, apify: false, moonshot: false })
  const [isLoading, setIsLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')
  const [brandBackground, setBrandBackground] = useState(DEFAULTS.background)
  const [brandHighlight, setBrandHighlight] = useState(DEFAULTS.highlight)
  const [brandFont, setBrandFont] = useState(DEFAULTS.font)
  const [logoPreview, setLogoPreview] = useState<string>('')

  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspace)

  useEffect(() => {
    loadApiKeys()
    loadTheme()
  }, [])

  useEffect(() => {
    setBrandBackground(currentWorkspace?.brand_background_color || DEFAULTS.background)
    setBrandHighlight(currentWorkspace?.brand_highlight_color || DEFAULTS.highlight)
    setBrandFont(currentWorkspace?.brand_font_color || DEFAULTS.font)
    setLogoPreview(currentWorkspace?.brand_logo_data_url || '')
  }, [currentWorkspace])

  const applyWorkspaceTheme = (background: string, highlight: string, font: string) => {
    const root = document.documentElement
    root.style.setProperty('--workspace-background-override', background)
    root.style.setProperty('--workspace-primary-override', highlight)
    root.style.setProperty('--workspace-font-override', font)
  }

  const clearWorkspaceTheme = () => {
    const root = document.documentElement
    root.style.removeProperty('--workspace-background-override')
    root.style.removeProperty('--workspace-primary-override')
    root.style.removeProperty('--workspace-font-override')
  }

  const flashMessage = (message: string) => {
    setSaveMessage(message)
    setTimeout(() => setSaveMessage(''), 3000)
  }

  const loadTheme = async () => {
    try {
      const theme = await dbService.getSettings('theme_mode')
      if (theme) setThemeMode(theme)
    } catch (e) { console.error(e) }
  }

  const handleThemeChange = async (mode: 'dark' | 'light') => {
    setThemeMode(mode)
    await dbService.saveSettings('theme_mode', mode)
    if (mode === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }

  const loadApiKeys = async () => {
    try {
      const keys = await dbService.getSettings('api_keys')
      if (keys) setApiKeys({ youtube: keys.youtube || '', apify: keys.apify || '', moonshot: keys.moonshot || '' })
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }

  const handleSaveApiKeys = async () => {
    setIsLoading(true)
    setSaveMessage('')
    try {
      await dbService.saveSettings('api_keys', apiKeys)
      flashMessage('API keys saved successfully!')
    } catch (error) {
      console.error('Failed to save API keys:', error)
      flashMessage('Failed to save API keys')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveBranding = async () => {
    if (!currentWorkspace) return
    try {
      await updateWorkspace(currentWorkspace.id, {
        brand_background_color: brandBackground,
        brand_highlight_color: brandHighlight,
        brand_font_color: brandFont,
        brand_logo_data_url: logoPreview || null,
      })
      applyWorkspaceTheme(brandBackground, brandHighlight, brandFont)
      await loadWorkspaces()
      flashMessage('Workspace branding saved!')
    } catch (error) {
      console.error('Failed to save workspace branding:', error)
      flashMessage('Failed to save workspace branding')
    }
  }

  const handleResetBranding = async () => {
    if (!currentWorkspace) return
    try {
      setBrandBackground(DEFAULTS.background)
      setBrandHighlight(DEFAULTS.highlight)
      setBrandFont(DEFAULTS.font)
      setLogoPreview('')
      await updateWorkspace(currentWorkspace.id, {
        brand_background_color: null,
        brand_highlight_color: null,
        brand_font_color: null,
        brand_logo_data_url: null,
      })
      clearWorkspaceTheme()
      await loadWorkspaces()
      flashMessage('Workspace branding reset to default')
    } catch (error) {
      console.error('Failed to reset workspace branding:', error)
      flashMessage('Failed to reset workspace branding')
    }
  }

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const handleColumnBackgroundChange = async (columnId: number, backgroundColor: string) => {
    try {
      await updateWorkspaceColumn(columnId, { background_color: backgroundColor })
      flashMessage('Column colour saved!')
    } catch (error) {
      console.error('Failed to save column colour:', error)
      flashMessage('Failed to save column colour')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
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
            <p className="text-xs text-muted-foreground">Your data is stored locally in an SQLite database file.</p>
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
          <div className="space-y-2">
            <Label>YouTube Data API Key</Label>
            <div className="flex gap-2">
              <Input type={showKeys.youtube ? 'text' : 'password'} placeholder="Enter API key..." value={apiKeys.youtube} onChange={(e) => setApiKeys({ ...apiKeys, youtube: e.target.value })} />
              <Button variant="outline" size="icon" onClick={() => setShowKeys({ ...showKeys, youtube: !showKeys.youtube })}>{showKeys.youtube ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Apify API Token</Label>
            <div className="flex gap-2">
              <Input type={showKeys.apify ? 'text' : 'password'} placeholder="Enter API token..." value={apiKeys.apify} onChange={(e) => setApiKeys({ ...apiKeys, apify: e.target.value })} />
              <Button variant="outline" size="icon" onClick={() => setShowKeys({ ...showKeys, apify: !showKeys.apify })}>{showKeys.apify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Moonshot (Kimi) API Key</Label>
            <div className="flex gap-2">
              <Input type={showKeys.moonshot ? 'text' : 'password'} placeholder="Enter API key..." value={apiKeys.moonshot} onChange={(e) => setApiKeys({ ...apiKeys, moonshot: e.target.value })} />
              <Button variant="outline" size="icon" onClick={() => setShowKeys({ ...showKeys, moonshot: !showKeys.moonshot })}>{showKeys.moonshot ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>
          {saveMessage && <p className="text-sm text-emerald-500">{saveMessage}</p>}
          <Button onClick={handleSaveApiKeys} disabled={isLoading} className="w-full">{isLoading ? 'Saving...' : 'Save API Keys'}</Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the app and selected workspace branding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleThemeChange('dark')} className={cn('flex items-center gap-3 p-4 rounded-lg border-2 transition-all', themeMode === 'dark' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50')}>
                <Moon className="h-5 w-5" />
                <div className="text-left"><p className="text-sm font-medium">Dark Mode</p><p className="text-xs text-muted-foreground">Current theme</p></div>
              </button>
              <button onClick={() => handleThemeChange('light')} className={cn('flex items-center gap-3 p-4 rounded-lg border-2 transition-all', themeMode === 'light' ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50')}>
                <Sun className="h-5 w-5" />
                <div className="text-left"><p className="text-sm font-medium">Light Mode</p><p className="text-xs text-muted-foreground">Light theme</p></div>
              </button>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div>
              <Label>Workspace Branding</Label>
              <p className="text-xs text-muted-foreground mt-1">These settings apply only to the selected workspace.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Background colour</Label><Input type="color" value={brandBackground} onChange={(e) => setBrandBackground(e.target.value)} /></div>
              <div className="space-y-2"><Label>Highlight colour</Label><Input type="color" value={brandHighlight} onChange={(e) => setBrandHighlight(e.target.value)} /></div>
              <div className="space-y-2"><Label>Font colour</Label><Input type="color" value={brandFont} onChange={(e) => setBrandFont(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Sidebar logo</Label>
              <Input type="file" accept="image/*" onChange={handleLogoUpload} />
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="h-16 w-16 rounded object-contain bg-white/5 p-1" />}
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSaveBranding}>Save Workspace Branding</Button>
              <Button variant="outline" onClick={handleResetBranding}>Reset to Default</Button>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div>
              <Label>Dashboard Column Colours</Label>
              <p className="text-xs text-muted-foreground mt-1">Subtle per-workspace column backgrounds so text stays readable.</p>
            </div>
            <div className="space-y-3">
              {workspaceColumns.map((column) => (
                <div key={column.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{column.title}</p>
                    <p className="text-xs text-muted-foreground">Workspace-specific column background</p>
                  </div>
                  <Input className="w-20" type="color" value={column.background_color || DEFAULT_COLUMN_BG} onChange={(e) => void handleColumnBackgroundChange(column.id, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
