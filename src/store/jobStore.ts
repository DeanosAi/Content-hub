import { create } from 'zustand'
import { Job, Workspace, Template, JobStage } from '@/types'
import { dbService } from '@/services/database'

interface JobState {
  jobs: Job[]
  workspaces: Workspace[]
  templates: Template[]
  selectedWorkspace: number | null
  isLoading: boolean
  dbPath: string | null
  
  // Actions
  initializeDatabase: (dbPath: string) => Promise<void>
  loadWorkspaces: () => Promise<void>
  loadJobs: () => Promise<void>
  loadTemplates: () => Promise<void>
  
  setSelectedWorkspace: (id: number | null) => void
  
  // Job operations
  addJob: (job: Omit<Job, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateJob: (id: number, updates: Partial<Job>) => Promise<void>
  deleteJob: (id: number) => Promise<void>
  moveJob: (id: number, newStage: JobStage) => Promise<void>
  
  // Workspace operations
  addWorkspace: (name: string, color: string) => Promise<void>
  updateWorkspace: (id: number, updates: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: number) => Promise<void>
  reorderWorkspaces: (orderedIds: number[]) => Promise<void>
  
  // Template operations
  addTemplate: (template: Omit<Template, 'id' | 'created_at'>) => Promise<void>
  deleteTemplate: (id: number) => Promise<void>
}

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  workspaces: [],
  templates: [],
  selectedWorkspace: null,
  isLoading: false,
  dbPath: null,
  
  initializeDatabase: async (dbPath) => {
    set({ isLoading: true })
    try {
      await dbService.connect(dbPath)
      set({ dbPath })
      
      // Load initial data
      const workspaces = await dbService.getWorkspaces()
      set({ workspaces })
      
      if (workspaces.length > 0 && !get().selectedWorkspace) {
        set({ selectedWorkspace: workspaces[0].id })
        const jobs = await dbService.getJobs(workspaces[0].id)
        set({ jobs })
      }
      
      const templates = await dbService.getTemplates()
      set({ templates })
    } catch (error) {
      console.error('Failed to initialize database:', error)
    } finally {
      set({ isLoading: false })
    }
  },
  
  loadWorkspaces: async () => {
    const workspaces = await dbService.getWorkspaces()
    set({ workspaces })
  },
  
  loadJobs: async () => {
    const { selectedWorkspace } = get()
    if (selectedWorkspace) {
      const jobs = await dbService.getJobs(selectedWorkspace)
      set({ jobs })
    }
  },
  
  loadTemplates: async () => {
    const templates = await dbService.getTemplates()
    set({ templates })
  },
  
  setSelectedWorkspace: (id) => {
    set({ selectedWorkspace: id })
    if (id) {
      get().loadJobs()
    }
  },
  
  addJob: async (jobData) => {
    try {
      await dbService.createJob(jobData)
      await get().loadJobs()
    } catch (error) {
      console.error('Error in addJob:', error)
      alert('Failed to create job. Please try again.')
    }
  },
  
  updateJob: async (id, updates) => {
    await dbService.updateJob(id, updates)
    await get().loadJobs()
  },
  
  deleteJob: async (id) => {
    await dbService.deleteJob(id)
    await get().loadJobs()
  },
  
  moveJob: async (id, newStage) => {
    await dbService.moveJob(id, newStage)
    await get().loadJobs()
  },
  
  addWorkspace: async (name, color) => {
    try {
      await dbService.createWorkspace(name, color)
      await get().loadWorkspaces()
    } catch (error) {
      console.error('Error in addWorkspace:', error)
      alert('Failed to create workspace. Please try again.')
    }
  },
  
  updateWorkspace: async (id, updates) => {
    await dbService.updateWorkspace(id, updates)
    await get().loadWorkspaces()
  },
  
  deleteWorkspace: async (id) => {
    await dbService.deleteWorkspace(id)
    await get().loadWorkspaces()
  },
  
  reorderWorkspaces: async (orderedIds) => {
    await dbService.reorderWorkspaces(orderedIds)
    await get().loadWorkspaces()
  },
  
  addTemplate: async (templateData) => {
    await dbService.createTemplate(templateData)
    await get().loadTemplates()
  },
  
  deleteTemplate: async (id) => {
    await dbService.deleteTemplate(id)
    await get().loadTemplates()
  },
}))