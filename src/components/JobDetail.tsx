import { useState, useMemo } from 'react'
import { Calendar, Hash, Link, Trash2, Copy, Plus, X, Upload, FileText } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Job, JobStage, Platform, PlatformMetric, CustomField, CustomFieldType, FileLink } from '@/types'
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { cn } from '@/lib/utils'
import { invoke } from '@tauri-apps/api/core'

interface JobDetailProps {
  job: Job | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STAGE_OPTIONS: { value: JobStage; label: string; color: string }[] = [
  { value: 'brief', label: 'Brief', color: 'bg-slate-500' },
  { value: 'production', label: 'In Production', color: 'bg-blue-500' },
  { value: 'ready', label: 'Ready for Posting', color: 'bg-amber-500' },
  { value: 'posted', label: 'Posted', color: 'bg-emerald-500' },
  { value: 'archive', label: 'Archive', color: 'bg-gray-600' },
]

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Single line text' },
  { value: 'textarea', label: 'Text box' },
  { value: 'date', label: 'Date' },
]

const createEmptyField = (): CustomField => ({
  id: crypto.randomUUID(),
  label: '',
  type: 'text',
  value: '',
})

type CachedMetric = { views: number; likes: number; comments: number; shares: number; engagement_rate: number; postId?: string | null }
const METRICS_CACHE_TTL_MS = 15 * 60 * 1000
const metricsCache = new Map<string, { value: CachedMetric; expiresAt: number }>()

const cacheKey = (platform: 'instagram' | 'facebook', url: string) => `${platform}::${url.trim().toLowerCase()}`

const readCache = (platform: 'instagram' | 'facebook', url: string): CachedMetric | null => {
  const hit = metricsCache.get(cacheKey(platform, url))
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    metricsCache.delete(cacheKey(platform, url))
    return null
  }
  return hit.value
}

const writeCache = (platform: 'instagram' | 'facebook', url: string, value: CachedMetric) => {
  metricsCache.set(cacheKey(platform, url), { value, expiresAt: Date.now() + METRICS_CACHE_TTL_MS })
}

function inferLinkType(urlOrPath: string): FileLink['type'] {
  const s = urlOrPath.toLowerCase()
  if (s.includes('drive.google.com') || s.includes('docs.google.com')) return 'drive'
  if (s.includes('dropbox.com')) return 'dropbox'
  if (s.includes('frame.io')) return 'frame'
  return 'other'
}

function basenameOf(path: string): string {
  const lastSep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return lastSep >= 0 ? path.slice(lastSep + 1) : path
}

function isHttpUrl(urlOrPath: string): boolean {
  return /^https?:\/\//i.test(urlOrPath)
}

export function JobDetail({ job: jobProp, open, onOpenChange }: JobDetailProps) {
  const { updateJob, deleteJob, moveJob, jobs, workspaces, workspaceColumns, addJob, markMetricsFetchStart, markMetricsFetchEnd } = useJobStore()
  const [isEditing, setIsEditing] = useState(false)
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false)
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [editedJob, setEditedJob] = useState<Partial<Job>>({})
  
  const job = useMemo(() => {
    if (!jobProp) return null
    return jobs.find(j => j.id === jobProp.id) || jobProp
  }, [jobProp, jobs])
  
  if (!job) return null

  const availableStages = workspaceColumns.length > 0
    ? workspaceColumns.map((column) => ({
        value: column.column_id,
        label: column.title,
        color: column.color,
      }))
    : STAGE_OPTIONS
  
  const handleEdit = () => {
    setEditedJob({ ...job, custom_fields: job.custom_fields ? [...job.custom_fields] : [] })
    setIsEditing(true)
  }
  
  const handleSave = async () => {
    const cleanedFields = (editedJob.custom_fields || [])
      .map((field) => ({
        ...field,
        label: field.label.trim(),
        value: field.value.trim(),
      }))
      .filter((field) => field.label || field.value)

    await updateJob(job.id, {
      ...editedJob,
      custom_fields: cleanedFields,
    })
    setIsEditing(false)
  }
  
  const handleAddCustomField = () => {
    const currentFields = editedJob.custom_fields || job.custom_fields || []
    setEditedJob({ ...editedJob, custom_fields: [...currentFields, createEmptyField()] })
  }
  
  const handleUpdateCustomField = (id: string, updates: Partial<CustomField>) => {
    const currentFields = editedJob.custom_fields || job.custom_fields || []
    setEditedJob({
      ...editedJob,
      custom_fields: currentFields.map(field => 
        field.id === id ? { ...field, ...updates } : field
      )
    })
  }
  
  const handleRemoveCustomField = (id: string) => {
    const currentFields = editedJob.custom_fields || job.custom_fields || []
    setEditedJob({
      ...editedJob,
      custom_fields: currentFields.filter(field => field.id !== id)
    })
  }
  
  const handleDelete = async () => {
    const confirmed = confirm('Delete this job?')
    if (!confirmed) return
    await deleteJob(job.id)
    onOpenChange(false)
  }
  
  const handleStageChange = async (newStage: JobStage) => {
    await moveJob(job.id, newStage)
  }
  
  const handleFetchMetrics = async () => {
    const instagramUrl = job.instagram_live_url || (job.live_url?.includes('instagram.com') ? job.live_url : null)
    const facebookUrl = job.facebook_live_url || (job.live_url?.includes('facebook.com') || job.live_url?.includes('fb.watch') ? job.live_url : null)

    if (!instagramUrl && !facebookUrl) return

    setIsFetchingMetrics(true)
    markMetricsFetchStart(job.id)
    try {
      const apiKeys = await dbService.getSettings('api_keys') || {}
      const apifyKey = apiKeys?.apify || ''

      if (!apifyKey) {
        alert('Please add your Apify API token in Settings first')
        return
      }

      let workspace = null as Awaited<ReturnType<typeof dbService.getWorkspace>>
      try {
        workspace = await dbService.getWorkspace(job.workspace_id)
      } catch (err) {
        console.warn('Could not load workspace for metrics fetch:', err)
      }

      const platformMetrics: Partial<Record<Platform, PlatformMetric>> = { ...(job.platform_metrics || {}) }
      const successes: string[] = []
      const failures: { platform: string; error: string }[] = []
      const jobFieldUpdates: Partial<Job> = {}

      const saveMetrics = async () => {
        await updateJob(job.id, {
          live_metrics: platformMetrics.instagram || platformMetrics.facebook || null,
          platform_metrics: { ...platformMetrics },
          ...jobFieldUpdates,
        })
      }

      let fbPageUrl = workspace?.facebook_page_url?.trim() || ''

      if (facebookUrl && !fbPageUrl && workspace) {
        const entered = window.prompt(
          `To reliably fetch Facebook metrics, Content Hub needs the Facebook page URL ` +
          `for workspace "${workspace.name}".\n\n` +
          `This is the URL of the page that owns the reel, e.g.\n` +
          `https://www.facebook.com/YourBrandPageName\n\n` +
          `You only need to enter this once per workspace. It will be used for ` +
          `every future Facebook metrics fetch in this workspace.\n\n` +
          `Paste the page URL below (or leave blank to skip and try direct scraping):`,
          ''
        )
        if (entered && entered.trim()) {
          fbPageUrl = entered.trim()
          try {
            await dbService.updateWorkspace(workspace.id, { facebook_page_url: fbPageUrl })
            workspace = { ...workspace, facebook_page_url: fbPageUrl }
          } catch (saveErr) {
            console.error('Failed to save facebook_page_url on workspace:', saveErr)
          }
        }
      }

      const tasks: Promise<void>[] = []

      if (instagramUrl) {
        tasks.push((async () => {
          try {
            const cached = readCache('instagram', instagramUrl)
            const metrics = cached
              ? cached
              : await invoke('fetch_metrics_with_ai', {
                  url: instagramUrl,
                  apiKey: apifyKey
                }) as CachedMetric

            if (!cached) writeCache('instagram', instagramUrl, metrics)

            platformMetrics.instagram = {
              views: metrics.views || 0,
              likes: metrics.likes || 0,
              comments: metrics.comments || 0,
              shares: metrics.shares || 0,
              engagement_rate: metrics.engagement_rate || 0,
              last_updated: new Date().toISOString()
            }
            successes.push(cached ? 'Instagram (cached)' : 'Instagram')
            await saveMetrics()
          } catch (err: any) {
            console.error('Instagram fetch failed:', err)
            failures.push({ platform: 'Instagram', error: err?.toString?.() || String(err) })
          }
        })())
      }

      if (facebookUrl) {
        tasks.push((async () => {
          try {
            const cached = readCache('facebook', facebookUrl)
            let metrics: CachedMetric
            let fromCache = false

            if (cached) {
              metrics = cached
              fromCache = true
            } else if (fbPageUrl) {
              metrics = await invoke('fetch_facebook_metrics_via_page_url', {
                targetUrl: facebookUrl,
                pageUrl: fbPageUrl,
                apiKey: apifyKey,
                knownPostId: job.facebook_post_id ?? null,
              }) as CachedMetric
            } else {
              metrics = await invoke('fetch_metrics_with_ai', {
                url: facebookUrl,
                apiKey: apifyKey,
              }) as CachedMetric
            }

            if (!fromCache) writeCache('facebook', facebookUrl, metrics)

            platformMetrics.facebook = {
              views: metrics.views || 0,
              likes: metrics.likes || 0,
              comments: metrics.comments || 0,
              shares: metrics.shares || 0,
              engagement_rate: metrics.engagement_rate || 0,
              last_updated: new Date().toISOString()
            }

            const returnedId = metrics.postId ?? null
            if (returnedId && returnedId !== (job.facebook_post_id ?? null)) {
              jobFieldUpdates.facebook_post_id = returnedId
            }

            successes.push(fromCache ? 'Facebook (cached)' : 'Facebook')
            await saveMetrics()
          } catch (err: any) {
            console.error('Facebook fetch failed:', err)
            failures.push({ platform: 'Facebook', error: err?.toString?.() || String(err) })
          }
        })())
      }

      await Promise.all(tasks)

      if (failures.length === 0) {
        alert(`✅ Live metrics fetched!\n\nSucceeded: ${successes.join(', ')}`)
      } else if (successes.length === 0) {
        const errorDetails = failures.map(f => `— ${f.platform} —\n${f.error}`).join('\n\n')
        alert(`❌ Failed to fetch metrics.\n\n${errorDetails}`)
      } else {
        const errorDetails = failures.map(f => `— ${f.platform} —\n${f.error}`).join('\n\n')
        alert(
          `⚠️ Partial success.\n\n` +
          `Succeeded: ${successes.join(', ')}\n\n` +
          `Failed:\n${errorDetails}`
        )
      }
    } catch (error: any) {
      console.error('handleFetchMetrics outer failure:', error)
      alert(`Unexpected error fetching metrics:\n\n${error?.toString?.() || String(error)}`)
    } finally {
      setIsFetchingMetrics(false)
      markMetricsFetchEnd(job.id)
    }
  }

  const parseFileLinks = (raw: string | null | undefined): FileLink[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const persistFileLinks = async (links: FileLink[]) => {
    if (!job) return
    await updateJob(job.id, {
      file_links: links.length > 0 ? JSON.stringify(links) : null,
    })
  }

  const handleAddLocalFiles = async () => {
    if (!job) return
    try {
      const selected = await openFileDialog({
        multiple: true,
        title: 'Attach files to this brief',
      })
      if (!selected) return
      const paths = Array.isArray(selected) ? selected : [selected]
      const additions: FileLink[] = paths
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
        .map((p) => ({ name: basenameOf(p), url: p, type: 'other' as const }))
      if (additions.length === 0) return
      const existing = parseFileLinks(job.file_links)
      await persistFileLinks([...existing, ...additions])
    } catch (err) {
      console.error('Failed to pick file(s):', err)
    }
  }

  const handleAddUrlLink = async () => {
    if (!job) return
    const url = newLinkUrl.trim()
    const name = newLinkName.trim()
    if (!url || !name) return
    const existing = parseFileLinks(job.file_links)
    const addition: FileLink = { name, url, type: inferLinkType(url) }
    await persistFileLinks([...existing, addition])
    setNewLinkName('')
    setNewLinkUrl('')
  }

  const handleRemoveLink = async (index: number) => {
    if (!job) return
    const existing = parseFileLinks(job.file_links)
    if (index < 0 || index >= existing.length) return
    const next = existing.filter((_, i) => i !== index)
    await persistFileLinks(next)
  }

  const displayJob = isEditing ? editedJob : job

  const renderFieldValue = (field: CustomField) => {
    if (field.type === 'date' && field.value) {
      try {
        return new Date(field.value).toLocaleDateString()
      } catch {
        return field.value
      }
    }
    return field.value || '—'
  }

  const renderCustomFieldInput = (field: CustomField) => {
    if (field.type === 'textarea') {
      return (
        <Textarea
          value={field.value}
          onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })}
          placeholder="Field value"
          rows={3}
        />
      )
    }

    if (field.type === 'date') {
      return (
        <Input
          type="date"
          value={field.value}
          onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })}
        />
      )
    }

    return (
      <Input
        value={field.value}
        onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })}
        placeholder="Field value"
      />
    )
  }
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl">{job.title}</SheetTitle>
            <div className="flex items-center gap-2">
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleEdit}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select 
              value={displayJob.stage} 
              onValueChange={(v) => isEditing ? setEditedJob({ ...editedJob, stage: v as JobStage }) : handleStageChange(v as JobStage)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableStages.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', stage.color)} />
                      {stage.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Description</Label>
            {isEditing ? (
              <Textarea
                value={editedJob.description || ''}
                onChange={(e) => setEditedJob({ ...editedJob, description: e.target.value })}
                rows={4}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {job.description || 'No description'}
              </p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              {isEditing ? (
                <div className="flex gap-2 flex-wrap">
                  {(['instagram', 'tiktok', 'youtube', 'facebook'] as Platform[]).map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => {
                        const current = editedJob.platform || []
                        const updated = current.includes(platform)
                          ? current.filter(p => p !== platform)
                          : [...current, platform]
                        setEditedJob({ ...editedJob, platform: updated })
                      }}
                      className={cn(
                        'px-2 py-1 rounded text-xs font-medium transition-colors border',
                        (editedJob.platform || []).includes(platform)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-input hover:bg-accent'
                      )}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1 flex-wrap">
                  {(() => {
                    let platforms: string[] = []
                    if (job.platform) {
                      if (Array.isArray(job.platform)) {
                        platforms = job.platform
                      } else if (typeof job.platform === 'string') {
                        try {
                          const parsed = JSON.parse(job.platform)
                          platforms = Array.isArray(parsed) ? parsed : [job.platform]
                        } catch {
                          platforms = [job.platform]
                        }
                      }
                    }
                    return platforms.length > 0 
                      ? platforms.map((platform) => (
                          <Badge key={platform} variant="secondary" className="capitalize">
                            {platform}
                          </Badge>
                        ))
                      : <span className="text-sm text-muted-foreground">None</span>
                  })()}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Priority</Label>
              {isEditing ? (
                <Select 
                  value={String(editedJob.priority || 0)} 
                  onValueChange={(v) => setEditedJob({ ...editedJob, priority: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Normal</SelectItem>
                    <SelectItem value="1">High</SelectItem>
                    <SelectItem value="2">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={job.priority > 0 ? 'destructive' : 'secondary'}>
                  {job.priority === 0 ? 'Normal' : job.priority === 1 ? 'High' : 'Urgent'}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Due Date</Label>
            {isEditing ? (
              <Input
                type="date"
                value={editedJob.due_date?.split('T')[0] || ''}
                onChange={(e) => setEditedJob({ ...editedJob, due_date: e.target.value })}
              />
            ) : job.due_date ? (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                {new Date(job.due_date).toLocaleDateString()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No due date</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Target Hashtags</Label>
            {isEditing ? (
              <Input
                value={editedJob.target_hashtags || ''}
                onChange={(e) => setEditedJob({ ...editedJob, target_hashtags: e.target.value })}
                placeholder="#hashtag #campaign"
              />
            ) : job.target_hashtags ? (
              <div className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4" />
                {job.target_hashtags}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hashtags</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>File Attachments</Label>
            {(() => {
              const links = parseFileLinks(job.file_links)
              if (links.length === 0) {
                return <p className="text-sm text-muted-foreground">No file attachments yet</p>
              }
              return (
                <div className="space-y-1">
                  {links.map((link, i) => (
                    <div
                      key={i}
                      className="group flex items-center gap-2 rounded-md border border-transparent hover:border-border hover:bg-accent/30 px-2 py-1.5"
                    >
                      <button
                        onClick={async () => {
                          try {
                            await invoke('open_file_or_url', { path: link.url })
                          } catch (e) {
                            console.error('Failed to open file:', e)

                            if (isHttpUrl(link.url)) {
                              const opened = window.open(link.url, '_blank')
                              if (!opened) {
                                const shouldCopy = confirm(
                                  `Could not open the link automatically.\n\n${link.url}\n\n` +
                                  `Click OK to copy the URL to your clipboard so you can paste it into your browser.`
                                )
                                if (shouldCopy) {
                                  try { await navigator.clipboard.writeText(link.url) } catch { }
                                }
                              }
                            } else {
                              alert(
                                `Could not open the file:\n${link.url}\n\n` +
                                `This can happen for a few reasons:\n\n` +
                                `  • The file has been moved, renamed, or deleted since it was attached.\n` +
                                `  • You're on a work or school computer with security software (AppLocker, ` +
                                `Defender Controlled Folder Access, Microsoft Purview, or similar) that ` +
                                `blocks apps from opening files outside an approved list. This is common ` +
                                `on corporate machines.\n` +
                                `  • No app is registered on this computer to open this type of file.\n\n` +
                                `What to try:\n\n` +
                                `  1. Open the file manually to confirm it still exists at the path above.\n` +
                                `  2. If you're on a corporate computer and the file opens fine manually, ` +
                                `your IT policy is blocking Content Hub from opening it directly. In that ` +
                                `case, upload the file to Google Drive, Dropbox, SharePoint, or frame.io ` +
                                `instead and paste the share URL into the brief using the "cloud URL" option. ` +
                                `Cloud URLs open in your browser and work in locked-down environments.\n` +
                                `  3. Ask IT to add Content Hub to the approved applications list if you ` +
                                `need local-file support on this machine.`
                              )
                            }
                          }
                        }}
                        className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer flex-1 min-w-0 text-left"
                        title={link.url}
                      >
                        {isHttpUrl(link.url) ? (
                          <Link className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">{link.name}</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Remove attachment"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleRemoveLink(i)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )
            })()}

            <div className="pt-2 border-t space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Attach files from your computer</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleAddLocalFiles}
                >
                  <Upload className="h-3 w-3 mr-2" />
                  Choose files…
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Or paste a cloud URL (Google Drive, Dropbox, frame.io, etc.)</p>
                <Input
                  placeholder="Display name (e.g. 'Hero shot v3')"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-[1fr,auto] gap-2">
                  <Input
                    placeholder="https://..."
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddUrlLink() } }}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddUrlLink}
                    disabled={!newLinkUrl.trim() || !newLinkName.trim()}
                  >
                    Add URL
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Additional Info</p>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={handleAddCustomField}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Field
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-3">
                {(editedJob.custom_fields || []).map((field) => (
                  <div key={field.id} className="space-y-3 rounded-md border p-3">
                    <div className="grid grid-cols-[1fr,180px,auto] gap-2 items-start">
                      <Input
                        value={field.label}
                        onChange={(e) => handleUpdateCustomField(field.id, { label: e.target.value })}
                        placeholder="Field name"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(value) => handleUpdateCustomField(field.id, { type: value as CustomFieldType, value: '' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => handleRemoveCustomField(field.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {renderCustomFieldInput(field)}
                  </div>
                ))}
                {(editedJob.custom_fields || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No extra fields yet.</p>
                )}
              </div>
            ) : (
              (job.custom_fields || []).length > 0 ? (
                <div className="space-y-2">
                  {job.custom_fields!.map((field) => (
                    <div key={field.id} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">{field.label || 'Untitled field'}:</span>
                      <span className="font-medium text-right">{renderFieldValue(field)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No extra fields</p>
              )
            )}
          </div>
          
          {job.stage === 'posted' && (
            <div className="space-y-3 pt-4 border-t">
              <Label>Live Post URLs</Label>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Instagram/Tiktok URL</Label>
                    <Input
                      value={editedJob.instagram_live_url || ''}
                      onChange={(e) => setEditedJob({ ...editedJob, instagram_live_url: e.target.value })}
                      placeholder="https://instagram.com/p/..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Facebook URL</Label>
                    <Input
                      value={editedJob.facebook_live_url || ''}
                      onChange={(e) => setEditedJob({ ...editedJob, facebook_live_url: e.target.value })}
                      placeholder="https://facebook.com/... or https://fb.watch/..."
                    />
                  </div>
                </div>
              ) : (job.instagram_live_url || job.facebook_live_url || job.live_url) ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {job.instagram_live_url && (
                      <a
                        href={job.instagram_live_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
                      >
                        <Link className="h-4 w-4 flex-shrink-0" />
                        Open Instagram Post
                      </a>
                    )}
                    {job.facebook_live_url && (
                      <a
                        href={job.facebook_live_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
                      >
                        <Link className="h-4 w-4 flex-shrink-0" />
                        Open Facebook Post
                      </a>
                    )}
                    {!job.instagram_live_url && !job.facebook_live_url && job.live_url && (
                      <a
                        href={job.live_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
                      >
                        <Link className="h-4 w-4 flex-shrink-0" />
                        Open Live Post
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleEdit}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={async () => {
                        const confirmed = confirm('Remove live URLs and metrics?')
                        if (!confirmed) return
                        await updateJob(job.id, {
                          live_url: null,
                          instagram_live_url: null,
                          facebook_live_url: null,
                          live_metrics: null,
                          platform_metrics: null,
                        })
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleFetchMetrics}
                    disabled={isFetchingMetrics}
                    className="mt-2"
                  >
                    {isFetchingMetrics ? 'Scraping live data...' : 'Fetch Live Metrics'}
                  </Button>
                  
                  {job.platform_metrics && Object.keys(job.platform_metrics).length > 0 && (
                    <div className="mt-3 space-y-3">
                      {Object.entries(job.platform_metrics).map(([platform, metrics]) => {
                        if (!metrics) return null
                        return (
                          <div key={platform} className="p-3 bg-muted rounded-md space-y-1">
                            <p className="text-xs font-medium text-muted-foreground capitalize">{platform} Metrics</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>Views: {metrics.views.toLocaleString()}</div>
                              <div>Likes: {metrics.likes.toLocaleString()}</div>
                              <div>Comments: {metrics.comments.toLocaleString()}</div>
                              <div>Shares: {metrics.shares.toLocaleString()}</div>
                              <div className="col-span-2">Engagement: {metrics.engagement_rate.toFixed(2)}%</div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Last updated: {new Date(metrics.last_updated).toLocaleString()}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No live URLs added</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleEdit}
                  >
                    Add Live URLs
                  </Button>
                </div>
              )}
            </div>
          )}
          
          <div className="pt-4 border-t relative">
            <Button variant="outline" className="w-full" onClick={() => setShowCopyMenu(!showCopyMenu)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Another Workspace
            </Button>
            {showCopyMenu && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border rounded-lg shadow-lg z-50 p-2 space-y-1">
                <p className="text-xs text-muted-foreground px-2 pb-1">Select workspace:</p>
                {workspaces
                  .filter(w => w.id !== job.workspace_id)
                  .map(w => (
                    <button
                      key={w.id}
                      className="w-full text-left text-sm px-3 py-2 rounded hover:bg-accent transition-colors"
                      onClick={async () => {
                        try {
                          await addJob({
                            workspace_id: w.id,
                            title: job.title,
                            description: job.description,
                            stage: job.stage,
                            priority: job.priority,
                            due_date: job.due_date,
                            platform: job.platform,
                            target_hashtags: job.target_hashtags,
                            file_links: job.file_links,
                            live_url: null,
                            live_metrics: null,
                            custom_fields: job.custom_fields,
                          })
                          setShowCopyMenu(false)
                          alert(`Copied to "${w.name}" → ${job.stage}`)
                        } catch (e) {
                          console.error('Copy failed:', e)
                          alert('Failed to copy job')
                        }
                      }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: w.color }} />
                      {w.name}
                    </button>
                  ))}
                {workspaces.filter(w => w.id !== job.workspace_id).length === 0 && (
                  <p className="text-xs text-muted-foreground px-2">No other workspaces</p>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
