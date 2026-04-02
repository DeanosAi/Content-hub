import { useEffect, useState } from 'react'
import { Plus, TrendingUp, FileText, Settings, Briefcase, MoreHorizontal, Pencil, Trash2, GripVertical } from 'lucide-react'
import { Button } from './ui/button'
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'

interface SidebarProps {
  currentView: string
  onViewChange: (view: string) => void
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { workspaces, selectedWorkspace, setSelectedWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, reorderWorkspaces, loadWorkspaces } = useJobStore()
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceColor, setNewWorkspaceColor] = useState('#8b5cf6')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    loadWorkspaces()
  }, [loadWorkspaces])
  
  const handleAddWorkspace = async () => {
    console.log('handleAddWorkspace called', newWorkspaceName.trim())
    console.log('Database connected:', dbService.isConnected())
    
    if (!dbService.isConnected()) {
      alert('Database not connected. Please refresh the page.')
      return
    }
    
    if (newWorkspaceName.trim()) {
      try {
        await addWorkspace(newWorkspaceName.trim(), newWorkspaceColor)
        console.log('Workspace created successfully')
        setNewWorkspaceName('')
        setDialogOpen(false)
      } catch (error) {
        console.error('Error creating workspace:', error)
        alert('Failed to create workspace. Check console for details.')
      }
    } else {
      console.log('Workspace name is empty')
      alert('Please enter a workspace name')
    }
  }
  
  const handleEditWorkspace = (workspace: { id: number; name: string; color: string }) => {
    setEditingWorkspace(workspace.id)
    setEditName(workspace.name)
    setEditColor(workspace.color)
  }
  
  const handleSaveEdit = async () => {
    if (editingWorkspace && editName.trim()) {
      await updateWorkspace(editingWorkspace, { name: editName.trim(), color: editColor })
      setEditingWorkspace(null)
    }
  }
  
  const handleDeleteWorkspace = async (id: number) => {
    if (confirm('Are you sure you want to delete this workspace? All jobs in this workspace will be archived.')) {
      await deleteWorkspace(id)
      if (selectedWorkspace === id) {
        setSelectedWorkspace(null)
      }
    }
  }
  
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    
    const items = Array.from(workspaces)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)
    
    // Update local state immediately for smooth UI
    // Then persist to database
    const orderedIds = items.map(w => w.id)
    await reorderWorkspaces(orderedIds)
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Briefcase },
    { id: 'trending', label: 'Trending Analysis', icon: TrendingUp },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  if (!mounted) return null

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-4 border-b flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Content Hub</h1>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Navigation */}
        <div className="p-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    currentView === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="px-4 py-2 border-t">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspaces
            </h2>
            
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Workspace</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="e.g., Client A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <div className="flex gap-2">
                      {['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewWorkspaceColor(color)}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-all',
                            newWorkspaceColor === color ? 'border-white scale-110' : 'border-transparent'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button type="button" onClick={handleAddWorkspace} className="w-full">
                    Create Workspace
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="workspaces">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-1"
                >
                  {workspaces.map((workspace, index) => (
                    <Draggable key={workspace.id} draggableId={String(workspace.id)} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            'group flex items-center rounded-md text-sm transition-colors',
                            selectedWorkspace === workspace.id
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50',
                            snapshot.isDragging && 'shadow-lg ring-2 ring-primary'
                          )}
                        >
                          {/* Drag Handle */}
                          <div
                            {...provided.dragHandleProps}
                            className="p-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          
                          <button
                            onClick={() => setSelectedWorkspace(workspace.id)}
                            className="flex items-center gap-3 flex-1 text-left py-2 pr-2"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: workspace.color }}
                            />
                            {editingWorkspace === workspace.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="h-6 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit()
                                    if (e.key === 'Escape') setEditingWorkspace(null)
                                  }}
                                />
                                <div className="flex gap-1">
                                  {['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'].map((color) => (
                                    <button
                                      key={color}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditColor(color)
                                      }}
                                      className={cn(
                                        'w-4 h-4 rounded-full border',
                                        editColor === color ? 'border-white' : 'border-transparent'
                                      )}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSaveEdit()
                                  }}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="truncate">{workspace.name}</span>
                            )}
                          </button>
                          
                          {editingWorkspace !== workspace.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditWorkspace(workspace)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteWorkspace(workspace.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          
          {workspaces.length === 0 && (
            <p className="text-sm text-muted-foreground px-3 py-2">
              No workspaces yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}