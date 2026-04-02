import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface DatabaseSetupProps {
  onSetup: (path: string) => void
}

export function DatabaseSetup({ onSetup }: DatabaseSetupProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Content Hub Data Location',
      })
      if (selected && typeof selected === 'string') {
        setSelectedPath(selected)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const handleCreateDatabase = async () => {
    if (!selectedPath) return
    setIsCreating(true)
    
    try {
      // Database will be created at this path
      const dbPath = `${selectedPath}/contenthub.db`
      onSetup(dbPath)
    } catch (error) {
      console.error('Failed to create database:', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Welcome to Content Hub</DialogTitle>
          <DialogDescription>
            Choose where to store your Content Hub data. This folder will contain your database file.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleSelectFolder}
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Choose Folder
            </Button>
            <span className="text-sm text-muted-foreground truncate">
              {selectedPath || 'No folder selected'}
            </span>
          </div>
          
          {selectedPath && (
            <p className="text-xs text-muted-foreground">
              Database will be created at: {selectedPath}/contenthub.db
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleCreateDatabase}
            disabled={!selectedPath || isCreating}
          >
            {isCreating ? 'Creating...' : 'Get Started'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}