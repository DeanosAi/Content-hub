export interface Workspace {
  id: number
  name: string
  color: string
  sort_order: number
  created_at: string
  is_active: boolean
}

export type JobStage = string // Now dynamic based on workspace columns
export type Platform = 'instagram' | 'tiktok' | 'youtube'
export type CustomFieldType = 'text' | 'textarea' | 'date'

export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  value: string
}

export interface Job {
  id: number
  workspace_id: number
  title: string
  description: string | null
  stage: JobStage
  priority: number
  due_date: string | null
  platform: Platform[] | null
  target_hashtags: string | null
  file_links: string | null
  live_url: string | null // URL to posted content
  live_metrics: {
    views: number
    likes: number
    comments: number
    shares: number
    engagement_rate: number
    last_updated: string
  } | null // AI-populated metrics from live post
  custom_fields: CustomField[] | null
  created_at: string
  updated_at: string
}

export interface WorkspaceColumn {
  id: number
  workspace_id: number
  column_id: string
  title: string
  color: string
  sort_order: number
  is_default: boolean
  created_at: string
}

export interface FileLink {
  name: string
  url: string
  type: 'drive' | 'dropbox' | 'frame' | 'other'
}

export interface Template {
  id: number
  name: string
  description: string | null
  default_platform: Platform[] | null
  default_hashtags: string | null
  default_description: string | null
  created_at: string
}

// Performance Metrics for Phase 4
export interface PerformanceMetrics {
  id: number
  job_id: number
  platform: Platform
  views: number
  likes: number
  comments: number
  shares: number
  engagement_rate: number
  posted_at: string
  captured_at: string
}

export interface YouTubeVideoMetrics {
  videoId: string
  title: string
  views: number
  likes: number
  comments: number
  engagementRate: number
  publishedAt: string
}

export interface InstagramPostMetrics {
  shortCode: string
  caption: string
  likes: number
  comments: number
  engagementRate: number
  postedAt: string
  hashtags: string[]
}

export interface ReportData {
  id: number
  workspace_id: number
  title: string
  type: 'summary' | 'quarterly'
  start_date: string
  end_date: string
  metrics: {
    totalViews: number
    totalEngagement: number
    avgEngagementRate: number
    topPerformingPost: PerformanceMetrics | null
    platformBreakdown: Record<Platform, { views: number; engagement: number }>
  }
  created_at: string
  pdf_path: string | null
}
