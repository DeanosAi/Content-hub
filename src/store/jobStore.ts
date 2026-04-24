import { create } from 'zustand'
import { CalendarEvent, Job, Workspace, Template, JobStage, WorkspaceColumn } from '@/types'
import { dbService } from '@/services/database'

interface JobState {
  jobs: Job[]
  workspaces: Workspace[]
  templates: Template[]
  workspaceColumns: WorkspaceColumn[]
  calendarEvents: CalendarEvent[]
  selectedWorkspace: number | null
  isLoading: boolean
  dbPath: string | null
  pendingMetricsFetchJobIds: number[]
  initializeDatabase: (dbPath: string) => Promise<void>
  loadWorkspaces: () => Promise<void>
  loadJobs: () => Promise<void>
  loadTemplates: () => Promise<void>
  loadWorkspaceColumns: (workspaceId: number) => Promise<void>
  loadCalendarEvents: (startDate?: string, endDate?: string) => Promise<void>
  setSelectedWorkspace: (id: number | null) => void
  addJob: (job: Omit<Job, 'id' | 'created_at' | 'updated_at'>) => Promise<number>
  updateJob: (id: number, updates: Partial<Job>) => Promise<void>
  deleteJob: (id: number) => Promise<void>
  moveJob: (id: number, newStage: JobStage) => Promise<void>
  addWorkspace: (name: string, color: string) => Promise<void>
  updateWorkspace: (id: number, updates: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: number) => Promise<void>
  reorderWorkspaces: (orderedIds: number[]) => Promise<void>
  addTemplate: (template: Omit<Template, 'id' | 'created_at'>) => Promise<void>
  deleteTemplate: (id: number) => Promise<void>
  addWorkspaceColumn: (workspaceId: number, columnId: string, title: string, color: string, backgroundColor?: string | null) => Promise<void>
  updateWorkspaceColumn: (id: number, updates: Partial<WorkspaceColumn>) => Promise<void>
  deleteWorkspaceColumn: (id: number) => Promise<void>
  reorderWorkspaceColumns: (orderedIds: number[]) => Promise<void>
  addCalendarEvent: (event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) => Promise<number>
  updateCalendarEvent: (id: number, updates: Partial<CalendarEvent>) => Promise<void>
  deleteCalendarEvent: (id: number) => Promise<void>
  markMetricsFetchStart: (jobId: number) => void
  markMetricsFetchEnd: (jobId: number) => void
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [], workspaces: [], templates: [], workspaceColumns: [], calendarEvents: [], selectedWorkspace: null, isLoading: false, dbPath: null, pendingMetricsFetchJobIds: [],
  initializeDatabase: async (dbPath) => {
    set({ isLoading: true })
    try {
      await dbService.connect(dbPath)
      set({ dbPath })
      const workspaces = await dbService.getWorkspaces()
      set({ workspaces })
      if (workspaces.length > 0 && !get().selectedWorkspace) {
        set({ selectedWorkspace: workspaces[0].id })
        const [jobs, columns, events] = await Promise.all([dbService.getJobs(workspaces[0].id), dbService.getWorkspaceColumns(workspaces[0].id), dbService.getCalendarEvents(workspaces[0].id)])
        set({ jobs, workspaceColumns: columns, calendarEvents: events })
      }
      const templates = await dbService.getTemplates()
      set({ templates })
    } catch (error) { console.error('Failed to initialize database:', error) }
    finally { set({ isLoading: false }) }
  },
  loadWorkspaces: async () => set({ workspaces: await dbService.getWorkspaces() }),
  loadJobs: async () => { const { selectedWorkspace } = get(); if (selectedWorkspace) set({ jobs: await dbService.getJobs(selectedWorkspace) }) },
  loadTemplates: async () => set({ templates: await dbService.getTemplates() }),
  loadCalendarEvents: async (startDate, endDate) => { const { selectedWorkspace } = get(); set({ calendarEvents: await dbService.getCalendarEvents(selectedWorkspace, startDate, endDate) }) },
  setSelectedWorkspace: (id) => { set({ selectedWorkspace: id }); if (id) { get().loadJobs(); get().loadWorkspaceColumns(id); get().loadCalendarEvents() } },
  loadWorkspaceColumns: async (workspaceId) => { try { set({ workspaceColumns: await dbService.getWorkspaceColumns(workspaceId) }) } catch (error) { console.error('Failed to load workspace columns:', error) } },
  addJob: async (jobData) => { try { const jobId = await dbService.createJob(jobData); await get().loadJobs(); return jobId } catch (error) { console.error('Error in addJob:', error); alert('Failed to create job. Please try again.'); throw error } },
  updateJob: async (id, updates) => { await dbService.updateJob(id, updates); await get().loadJobs() },
  deleteJob: async (id) => { await dbService.deleteJob(id); await get().loadJobs() },
  moveJob: async (id, newStage) => { await dbService.moveJob(id, newStage); await get().loadJobs() },
  addWorkspace: async (name, color) => { try { await dbService.createWorkspace(name, color); await get().loadWorkspaces() } catch (error) { console.error('Error in addWorkspace:', error); alert('Failed to create workspace. Please try again.') } },
  updateWorkspace: async (id, updates) => { await dbService.updateWorkspace(id, updates); await get().loadWorkspaces() },
  deleteWorkspace: async (id) => { await dbService.deleteWorkspace(id); await get().loadWorkspaces() },
  reorderWorkspaces: async (orderedIds) => { await dbService.reorderWorkspaces(orderedIds); await get().loadWorkspaces() },
  addTemplate: async (templateData) => { await dbService.createTemplate(templateData); await get().loadTemplates() },
  deleteTemplate: async (id) => { await dbService.deleteTemplate(id); await get().loadTemplates() },
  addWorkspaceColumn: async (workspaceId, columnId, title, color, backgroundColor) => { try { const sortOrder = get().workspaceColumns.length; await dbService.createWorkspaceColumn(workspaceId, columnId, title, color, sortOrder, backgroundColor); await get().loadWorkspaceColumns(workspaceId) } catch (error) { console.error('Error in addWorkspaceColumn:', error); alert('Failed to create column. Please try again.') } },
  updateWorkspaceColumn: async (id, updates) => { await dbService.updateWorkspaceColumn(id, updates); const { selectedWorkspace } = get(); if (selectedWorkspace) await get().loadWorkspaceColumns(selectedWorkspace) },
  deleteWorkspaceColumn: async (id) => {
    try {
      const { selectedWorkspace, workspaceColumns, jobs } = get()
      if (!selectedWorkspace) return
      const column = workspaceColumns.find(c => c.id === id)
      if (!column) return
      const jobsInColumn = jobs.filter(j => j.stage === column.column_id)
      if (jobsInColumn.length > 0) {
        const confirmMove = confirm(`There are ${jobsInColumn.length} jobs in this column. They will be moved to the first column. Continue?`)
        if (!confirmMove) return
        const firstColumn = workspaceColumns.filter(c => c.id !== id).sort((a, b) => a.sort_order - b.sort_order)[0]
        if (firstColumn) for (const job of jobsInColumn) await dbService.moveJob(job.id, firstColumn.column_id)
      }
      await dbService.deleteWorkspaceColumn(id)
      await get().loadWorkspaceColumns(selectedWorkspace)
      await get().loadJobs()
    } catch (error) { console.error('Error in deleteWorkspaceColumn:', error); alert('Failed to delete column. Please try again.') }
  },
  reorderWorkspaceColumns: async (orderedIds) => { await dbService.reorderWorkspaceColumns(orderedIds); const { selectedWorkspace } = get(); if (selectedWorkspace) await get().loadWorkspaceColumns(selectedWorkspace) },
  addCalendarEvent: async (eventData) => { const id = await dbService.createCalendarEvent(eventData); await get().loadCalendarEvents(); return id },
  updateCalendarEvent: async (id, updates) => { await dbService.updateCalendarEvent(id, updates); await get().loadCalendarEvents() },
  deleteCalendarEvent: async (id) => { await dbService.deleteCalendarEvent(id); await get().loadCalendarEvents() },
  markMetricsFetchStart: (jobId) => set((state) => state.pendingMetricsFetchJobIds.includes(jobId) ? state : { pendingMetricsFetchJobIds: [...state.pendingMetricsFetchJobIds, jobId] }),
  markMetricsFetchEnd: (jobId) => set((state) => !state.pendingMetricsFetchJobIds.includes(jobId) ? state : { pendingMetricsFetchJobIds: state.pendingMetricsFetchJobIds.filter((id) => id !== jobId) }),
}))
