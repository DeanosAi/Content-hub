import { useState } from 'react'
import { Upload, X, FileText, Plus, Trash2, Link as LinkIcon } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { JobStage, Platform, FileLink, CustomField, CustomFieldType } from '@/types'
import { cn } from '@/lib/utils'

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

interface NewJobDialogProps {
  initialStage?: JobStage
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

const PLATFORMS: { value: Platform; label: string; color: string }[] = [
  { value: 'instagram', label: 'Instagram', color: 'bg-pink-500' },
  { value: 'tiktok', label: 'TikTok', color: 'bg-black border border-white/20' },
  { value: 'youtube', label: 'YouTube', color: 'bg-red-500' },
  { value: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
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

export function NewJobDialog({ initialStage = 'brief', open: controlledOpen, onOpenChange, trigger }: NewJobDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen
  const { selectedWorkspace, workspaceColumns, addJob } = useJobStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [stage, setStage] = useState<JobStage>(initialStage)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram'])
  const [priority, setPriority] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [fileLinks, setFileLinks] = useState<FileLink[]>([])
  const [newFileUrl, setNewFileUrl] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const availableStages = workspaceColumns.length > 0 ? workspaceColumns : [{ column_id: 'brief', title: 'Brief' }, { column_id: 'production', title: 'In Production' }, { column_id: 'ready', title: 'Ready for Posting' }, { column_id: 'posted', title: 'Posted' }, { column_id: 'archive', title: 'Archive' }]
  const togglePlatform = (platform: Platform) => setSelectedPlatforms(prev => prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform])
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dbService.isConnected()) { alert('Database not connected. Please refresh the page.'); return }
    if (!selectedWorkspace) { alert('Please select a workspace first'); return }
    if (!title.trim()) { alert('Please enter a job title'); return }
    const cleanedCustomFields = customFields.map((field) => ({ ...field, label: field.label.trim(), value: field.value.trim() })).filter((field) => field.label || field.value)
    try {
      await addJob({ workspace_id: selectedWorkspace, title: title.trim(), description: description.trim() || null, stage, priority: parseInt(priority), due_date: dueDate || null, platform: selectedPlatforms.length > 0 ? selectedPlatforms : null, target_hashtags: hashtags.trim() || null, file_links: fileLinks.length > 0 ? JSON.stringify(fileLinks) : null, live_url: null, live_metrics: null, custom_fields: cleanedCustomFields.length > 0 ? cleanedCustomFields : null })
      setTitle(''); setDescription(''); setStage(initialStage); setSelectedPlatforms(['instagram']); setPriority('0'); setDueDate(''); setHashtags(''); setFileLinks([]); setNewFileUrl(''); setNewFileName(''); setCustomFields([]); setOpen(false)
    } catch (error) { console.error('Error creating job:', error); alert('Failed to create job. Check console for details.') }
  }
  const handleAddFileLink = () => { if (newFileUrl.trim() && newFileName.trim()) { setFileLinks([...fileLinks, { name: newFileName.trim(), url: newFileUrl.trim(), type: inferLinkType(newFileUrl.trim()) }]); setNewFileUrl(''); setNewFileName('') } }
  const handleRemoveFileLink = (index: number) => setFileLinks(fileLinks.filter((_, i) => i !== index))
  const handleAddCustomField = () => setCustomFields([...customFields, createEmptyField()])
  const handleUpdateCustomField = (id: string, updates: Partial<CustomField>) => setCustomFields(customFields.map(field => field.id === id ? { ...field, ...updates } : field))
  const handleRemoveCustomField = (id: string) => setCustomFields(customFields.filter(field => field.id !== id))
  const handleFileUpload = async () => {
    try {
      const selected = await openFileDialog({ multiple: true, title: 'Attach files to this brief' })
      if (!selected) return
      const paths = Array.isArray(selected) ? selected : [selected]
      const additions: FileLink[] = paths.filter((p): p is string => typeof p === 'string' && p.length > 0).map((p) => ({ name: basenameOf(p), url: p, type: 'other' }))
      if (additions.length > 0) setFileLinks([...fileLinks, ...additions])
    } catch (err) { console.error('Failed to pick file(s):', err) }
  }
  const renderCustomFieldInput = (field: CustomField) => field.type === 'textarea' ? <Textarea placeholder="Field value" value={field.value} onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })} rows={3} /> : field.type === 'date' ? <Input type="date" value={field.value} onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })} /> : <Input placeholder="Field value" value={field.value} onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })} />
  const dialogContent = (<DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader><form onSubmit={handleSubmit} className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="title">Title *</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Summer Campaign Video" required /></div><div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the content..." rows={3} /></div><div className="space-y-3 border rounded-lg p-4"><div className="flex items-center justify-end"><Button type="button" variant="outline" size="sm" onClick={handleAddCustomField}><Plus className="h-3 w-3 mr-1" />Add Field</Button></div>{customFields.length === 0 ? <div className="space-y-1"><p className="text-sm font-medium">Additional Info</p><p className="text-sm text-muted-foreground">No extra fields yet. Add one if you want things like Talent, Shoot Date, Notes, Client, or Approval Deadline.</p></div> : <div className="space-y-4">{customFields.map((field) => <div key={field.id} className="space-y-3 rounded-md border p-3"><div className="grid grid-cols-[1fr,180px,auto] gap-2 items-start"><Input placeholder="Field name" value={field.label} onChange={(e) => handleUpdateCustomField(field.id, { label: e.target.value })} /><Select value={field.type} onValueChange={(value) => handleUpdateCustomField(field.id, { type: value as CustomFieldType, value: '' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleRemoveCustomField(field.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>{renderCustomFieldInput(field)}</div>)}</div>}</div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="stage">Stage</Label><Select value={stage} onValueChange={(v) => setStage(v as JobStage)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableStages.map((column) => <SelectItem key={column.column_id} value={column.column_id}>{column.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="priority">Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Normal</SelectItem><SelectItem value="1">High</SelectItem><SelectItem value="2">Urgent</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Platforms</Label><div className="flex gap-2 flex-wrap">{PLATFORMS.map((platform) => <button key={platform.value} type="button" onClick={() => togglePlatform(platform.value)} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all border', selectedPlatforms.includes(platform.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent')}><span className="flex items-center gap-2"><span className={cn('w-2 h-2 rounded-full', platform.color)} />{platform.label}</span></button>)}</div></div><div className="space-y-2"><Label htmlFor="dueDate">Due Date</Label><Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="hashtags">Target Hashtags</Label><Input id="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#summer #campaign #brand" /></div><div className="space-y-3 border rounded-lg p-4"><Label>File Attachments</Label>{fileLinks.length > 0 && <div className="space-y-2">{fileLinks.map((file, index) => <div key={index} className="flex items-center justify-between bg-muted rounded-md px-3 py-2"><div className="flex items-center gap-2 overflow-hidden">{file.type === 'other' && !file.url.match(/^https?:\/\//i) ? <FileText className="h-4 w-4 flex-shrink-0" /> : <LinkIcon className="h-4 w-4 flex-shrink-0" />}<span className="text-sm truncate" title={file.url}>{file.name}</span></div><Button type="button" variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => handleRemoveFileLink(index)}><X className="h-3 w-3" /></Button></div>)}</div>}<div className="space-y-2"><p className="text-xs text-muted-foreground">Attach files from your computer</p><Button type="button" variant="outline" className="w-full" onClick={handleFileUpload}><Upload className="h-4 w-4 mr-2" />Choose files…</Button></div><div className="space-y-2 pt-2 border-t"><p className="text-xs text-muted-foreground">Or paste a cloud URL (Google Drive, Dropbox, frame.io, etc.)</p><Input placeholder="Display name (e.g. 'Hero shot v3')" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} /><div className="grid grid-cols-[1fr,auto] gap-2"><Input placeholder="https://..." value={newFileUrl} onChange={(e) => setNewFileUrl(e.target.value)} /><Button type="button" variant="outline" onClick={handleAddFileLink} disabled={!newFileUrl.trim() || !newFileName.trim()}>Add URL</Button></div></div></div><div className="flex justify-end gap-3 pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Create Job</Button></div></form></DialogContent>)
  return trigger ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{trigger}</DialogTrigger>{dialogContent}</Dialog> : <Dialog open={open} onOpenChange={setOpen}>{dialogContent}</Dialog>
}
