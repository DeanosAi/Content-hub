import { useState, useRef } from 'react'
import { Upload, X, FileText } from 'lucide-react'
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
import { JobStage, Platform, FileLink } from '@/types'
import { cn } from '@/lib/utils'

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
]

export function NewJobDialog({ 
  initialStage = 'brief', 
  open: controlledOpen, 
  onOpenChange,
  trigger 
}: NewJobDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen
  
  const { selectedWorkspace, addJob } = useJobStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
  
  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    )
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('handleSubmit called')
    console.log('Database connected:', dbService.isConnected())
    console.log('Selected workspace:', selectedWorkspace)
    console.log('Title:', title.trim())
    
    if (!dbService.isConnected()) {
      alert('Database not connected. Please refresh the page.')
      return
    }
    
    if (!selectedWorkspace) {
      alert('Please select a workspace first')
      return
    }
    
    if (!title.trim()) {
      alert('Please enter a job title')
      return
    }
    
    try {
      await addJob({
        workspace_id: selectedWorkspace,
        title: title.trim(),
        description: description.trim() || null,
        stage,
        priority: parseInt(priority),
        due_date: dueDate || null,
        platform: selectedPlatforms.length > 0 ? selectedPlatforms : null,
        target_hashtags: hashtags.trim() || null,
        file_links: fileLinks.length > 0 ? JSON.stringify(fileLinks) : null,
        live_url: null,
        live_metrics: null,
      })
      console.log('Job created successfully')
      
      // Reset form
      setTitle('')
      setDescription('')
      setStage('brief')
      setSelectedPlatforms(['instagram'])
      setPriority('0')
      setDueDate('')
      setHashtags('')
      setFileLinks([])
      setNewFileUrl('')
      setNewFileName('')
      setOpen(false)
    } catch (error) {
      console.error('Error creating job:', error)
      alert('Failed to create job. Check console for details.')
    }
  }
  
  const handleAddFileLink = () => {
    if (newFileUrl.trim() && newFileName.trim()) {
      setFileLinks([...fileLinks, { 
        name: newFileName.trim(), 
        url: newFileUrl.trim(),
        type: 'other'
      }])
      setNewFileUrl('')
      setNewFileName('')
    }
  }
  
  const handleRemoveFileLink = (index: number) => {
    setFileLinks(fileLinks.filter((_, i) => i !== index))
  }
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Create a local file URL
      const url = URL.createObjectURL(file)
      setFileLinks([...fileLinks, {
        name: file.name,
        url: url,
        type: 'other'
      }])
    }
  }
  
  const dialogContent = (
    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create New Job</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Summer Campaign Video"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the content..."
            rows={3}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stage">Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as JobStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brief">Brief</SelectItem>
                <SelectItem value="production">In Production</SelectItem>
                <SelectItem value="ready">Ready for Posting</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="archive">Archive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Normal</SelectItem>
                <SelectItem value="1">High</SelectItem>
                <SelectItem value="2">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Multi-select Platforms */}
        <div className="space-y-2">
          <Label>Platforms</Label>
          <div className="flex gap-2 flex-wrap">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.value}
                type="button"
                onClick={() => togglePlatform(platform.value)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all border',
                  selectedPlatforms.includes(platform.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', platform.color)} />
                  {platform.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due Date</Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="hashtags">Target Hashtags</Label>
          <Input
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#summer #campaign #brand"
          />
        </div>
        
        {/* File Attachments */}
        <div className="space-y-3 border rounded-lg p-4">
          <Label>File Attachments</Label>
          
          {/* Existing file links */}
          {fileLinks.length > 0 && (
            <div className="space-y-2">
              {fileLinks.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => handleRemoveFileLink(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          {/* Add file link */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr,auto] gap-2">
              <Input
                placeholder="File URL (Google Drive, Dropbox, etc.)"
                value={newFileUrl}
                onChange={(e) => setNewFileUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddFileLink}
                disabled={!newFileUrl.trim()}
              >
                Add Link
              </Button>
            </div>
            <Input
              placeholder="File name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
            />
          </div>
          
          {/* Upload local file */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit">Create Job</Button>
        </div>
      </form>
    </DialogContent>
  )
  
  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    )
  }
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {dialogContent}
    </Dialog>
  )
}