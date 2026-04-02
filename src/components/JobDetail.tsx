import { useState, useMemo } from 'react'
import { Calendar, Hash, Link, Trash2, Copy, ExternalLink } from 'lucide-react'
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
import { Job, JobStage, Platform } from '@/types'
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

export function JobDetail({ job: jobProp, open, onOpenChange }: JobDetailProps) {
  const { updateJob, deleteJob, moveJob, jobs, workspaces, addJob } = useJobStore()
  const [isEditing, setIsEditing] = useState(false)
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false)
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  
  const [editedJob, setEditedJob] = useState<Partial<Job>>({})
  
  // Always use the latest version of the job from the store (fixes stale data after metrics fetch)
  const job = useMemo(() => {
    if (!jobProp) return null
    return jobs.find(j => j.id === jobProp.id) || jobProp
  }, [jobProp, jobs])
  
  if (!job) return null
  
  const handleEdit = () => {
    setEditedJob({ ...job })
    setIsEditing(true)
  }
  
  const handleSave = async () => {
    await updateJob(job.id, editedJob)
    setIsEditing(false)
  }
  
  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this job?')) {
      await deleteJob(job.id)
      onOpenChange(false)
    }
  }
  
  const handleStageChange = async (newStage: JobStage) => {
    await moveJob(job.id, newStage)
  }
  
  const handleFetchMetrics = async () => {
    if (!job.live_url) return
    
    setIsFetchingMetrics(true)
    try {
      // Get Apify API key from settings
      const apiKeys = await dbService.getSettings('api_keys') || {}
      const apifyKey = apiKeys?.apify || ''
      
      if (!apifyKey) {
        alert('Please add your Apify API token in Settings first')
        setIsFetchingMetrics(false)
        return
      }
      
      // Call Tauri command to fetch metrics via Apify scraper
      const metrics = await invoke('fetch_metrics_with_ai', {
        url: job.live_url,
        apiKey: apifyKey
      }) as { views: number; likes: number; comments: number; shares: number; engagement_rate: number }
      
      // Update job with live metrics
      await updateJob(job.id, {
        live_metrics: {
          views: metrics.views || 0,
          likes: metrics.likes || 0,
          comments: metrics.comments || 0,
          shares: metrics.shares || 0,
          engagement_rate: metrics.engagement_rate || 0,
          last_updated: new Date().toISOString()
        }
      })
      alert('✅ Live metrics fetched from Apify!')
    } catch (error: any) {
      console.error('Failed to fetch metrics:', error)
      alert(`Failed to fetch metrics: ${error?.toString?.()?.includes('Unsupported') ? error : 'Check your Apify token and make sure the post URL is public.'}`)
    } finally {
      setIsFetchingMetrics(false)
    }
  }
  
  const displayJob = isEditing ? editedJob : job
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
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
          {/* Stage */}
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
                {STAGE_OPTIONS.map((stage) => (
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
          
          {/* Description */}
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
          
          {/* Platform & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              {isEditing ? (
                <div className="flex gap-2 flex-wrap">
                  {(['instagram', 'tiktok', 'youtube'] as Platform[]).map((platform) => (
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
                    // Handle both old string format and new array format
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
          
          {/* Due Date */}
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
          
          {/* Hashtags */}
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
          
          {/* File Links */}
          <div className="space-y-2">
            <Label>File Links</Label>
            {job.file_links ? (
              <div className="space-y-2">
                {JSON.parse(job.file_links).map((link: { name: string; url: string }, i: number) => (
                  <button
                    key={i}
                    onClick={async () => {
                      try {
                        await invoke('open_file_or_url', { path: link.url })
                      } catch (e) {
                        console.error('Failed to open file:', e)
                        window.open(link.url, '_blank')
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer w-full text-left"
                  >
                    <ExternalLink className="h-4 w-4 flex-shrink-0" />
                    {link.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No file links</p>
            )}
          </div>
          
          {/* Live URL - Only show for Posted stage */}
          {job.stage === 'posted' && (
            <div className="space-y-2 pt-4 border-t">
              <Label>Live Post URL</Label>
              {isEditing ? (
                <Input
                  value={editedJob.live_url || ''}
                  onChange={(e) => setEditedJob({ ...editedJob, live_url: e.target.value })}
                  placeholder="https://instagram.com/p/... or https://tiktok.com/@..."
                />
              ) : job.live_url ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <a
                      href={job.live_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
                    >
                      <Link className="h-4 w-4 flex-shrink-0" />
                      Open Live Post
                    </a>
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
                          if (confirm('Remove live URL and metrics?')) {
                            await updateJob(job.id, { live_url: null, live_metrics: null })
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Metrics Fetch Button */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleFetchMetrics}
                    disabled={isFetchingMetrics}
                    className="mt-2"
                  >
                    {isFetchingMetrics ? 'Scraping live data...' : 'Fetch Live Metrics'}
                  </Button>
                  
                  {/* Display Live Metrics if available */}
                  {job.live_metrics && (
                    <div className="mt-3 p-3 bg-muted rounded-md space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Live Metrics</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Views: {job.live_metrics.views.toLocaleString()}</div>
                        <div>Likes: {job.live_metrics.likes.toLocaleString()}</div>
                        <div>Comments: {job.live_metrics.comments.toLocaleString()}</div>
                        <div>Shares: {job.live_metrics.shares.toLocaleString()}</div>
                        <div className="col-span-2">Engagement: {job.live_metrics.engagement_rate.toFixed(2)}%</div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Last updated: {new Date(job.live_metrics.last_updated).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No live URL added</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleEdit}
                  >
                    Add Live URL
                  </Button>
                </div>
              )}
            </div>
          )}
          
          {/* Copy to Workspace */}
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