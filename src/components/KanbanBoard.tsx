import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, MoreHorizontal, Calendar, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Job, JobStage } from '@/types'
import { useJobStore } from '@/store/jobStore'
import { JobDetail } from './JobDetail'
import { NewJobDialog } from './NewJobDialog'
import { cn } from '@/lib/utils'
import type { FilterState } from './Dashboard'

const COLUMNS: { id: JobStage; title: string; color: string }[] = [
  { id: 'brief', title: 'Brief', color: 'bg-slate-500' },
  { id: 'production', title: 'In Production', color: 'bg-blue-500' },
  { id: 'ready', title: 'Ready for Posting', color: 'bg-amber-500' },
  { id: 'posted', title: 'Posted', color: 'bg-emerald-500' },
  { id: 'archive', title: 'Archive', color: 'bg-gray-600' },
]

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-black border border-white/20',
  tiktok: 'bg-black border border-white/20',
  youtube: 'bg-red-500',
}

interface KanbanBoardProps {
  filters?: FilterState
}

export function KanbanBoard({ filters }: KanbanBoardProps) {
  const { jobs, selectedWorkspace, moveJob, loadJobs } = useJobStore()
  const [mounted, setMounted] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [newJobStage, setNewJobStage] = useState<JobStage | null>(null)

  useEffect(() => {
    setMounted(true)
    if (selectedWorkspace) {
      loadJobs()
    }
  }, [selectedWorkspace, loadJobs])

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newStage = destination.droppableId as JobStage
    await moveJob(Number(draggableId), newStage)
  }

  const handleJobClick = (job: Job) => {
    setSelectedJob(job)
    setDetailOpen(true)
  }

  const handleNewJob = (stage: JobStage) => {
    setNewJobStage(stage)
  }

  const applyFilters = (jobList: Job[]): Job[] => {
    if (!filters) return jobList
    return jobList.filter((job) => {
      // Due date filter
      if (filters.dueDateFrom && job.due_date) {
        if (new Date(job.due_date) < new Date(filters.dueDateFrom)) return false
      }
      if (filters.dueDateTo && job.due_date) {
        if (new Date(job.due_date) > new Date(filters.dueDateTo)) return false
      }
      // If filter is set but job has no due date, exclude it
      if ((filters.dueDateFrom || filters.dueDateTo) && !job.due_date) return false

      // Priority filter
      if (filters.priority !== null && job.priority !== filters.priority) return false

      // Platform filter
      if (filters.platform !== null) {
        const platforms: string[] = Array.isArray(job.platform)
          ? job.platform
          : typeof job.platform === 'string'
            ? (() => { try { const p = JSON.parse(job.platform as string); return Array.isArray(p) ? p : [job.platform] } catch { return [job.platform] } })()
            : []
        if (!platforms.includes(filters.platform)) return false
      }

      return true
    })
  }

  const getJobsByStage = (stage: JobStage) => {
    const stageJobs = jobs.filter((job) => job.stage === stage)
    const filtered = applyFilters(stageJobs)
    return filtered.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      }
      return 0
    })
  }

  if (!mounted) return null

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-full overflow-x-auto pb-4">
          {COLUMNS.map((column) => (
            <div key={column.id} className="flex-1 min-w-[280px] max-w-[400px]">
              <div className="bg-card rounded-lg border">
                <div className="flex items-center justify-between p-3 border-b">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', column.color)} />
                    <h3 className="font-semibold text-sm">{column.title}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {getJobsByStage(column.id).length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleNewJob(column.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'p-2 min-h-[200px] space-y-2',
                        snapshot.isDraggingOver && 'bg-accent/50'
                      )}
                    >
                      {getJobsByStage(column.id).map((job, index) => (
                        <Draggable key={job.id} draggableId={String(job.id)} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => handleJobClick(job)}
                              className={cn(
                                'bg-background rounded-md border p-3 cursor-pointer hover:shadow-md transition-shadow',
                                snapshot.isDragging && 'shadow-lg ring-2 ring-primary'
                              )}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-medium text-sm line-clamp-2">{job.title}</h4>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 -mr-1 -mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleJobClick(job)
                                  }}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </div>

                              {job.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                  {job.description}
                                </p>
                              )}

                              <div className="flex items-center gap-2 flex-wrap">
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
                                  return platforms.map((platform) => (
                                    <Badge
                                      key={platform}
                                      variant="secondary"
                                      className={cn('text-[10px] text-white', PLATFORM_COLORS[platform])}
                                    >
                                      {platform}
                                    </Badge>
                                  ))
                                })()}

                                {job.due_date && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(job.due_date).toLocaleDateString()}
                                  </div>
                                )}

                                {job.priority > 0 && (
                                  <Badge variant="destructive" className="text-[10px]">
                                    P{job.priority}
                                  </Badge>
                                )}
                              </div>

                              {job.target_hashtags && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                  <Hash className="h-3 w-3" />
                                  <span className="truncate">{job.target_hashtags}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>

      <JobDetail
        job={selectedJob}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {newJobStage && (
        <NewJobDialog
          initialStage={newJobStage}
          open={true}
          onOpenChange={(open) => !open && setNewJobStage(null)}
        />
      )}
    </>
  )
}
