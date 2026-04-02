export interface TrendingItem {
  id: number
  platform: string
  trend_type: 'sound' | 'hashtag' | 'topic'
  name: string
  popularity_score: number | null
  video_count: number | null
  suggestion_text: string | null
  fetched_at: string
  // Enhanced fields
  avg_engagement?: number
  total_engagement?: number
  post_count?: number
  top_posts?: TrendPost[]
  content_formats?: ContentFormatBreakdown
  best_performing_hook?: string
  suggested_hashtags?: string[]
}

export interface TrendPost {
  id: string
  shortCode?: string
  caption: string
  hashtags: string[]
  likes: number
  comments: number
  shares?: number
  views?: number
  author: string
  authorFollowers?: number
  contentType: 'carousel' | 'reel' | 'single' | 'video'
  hasAudio: boolean
  audioName?: string
  musicName?: string // For TikTok music meta
  musicAuthor?: string // For TikTok music artist
  postedAt: string
  thumbnailUrl?: string
  hook?: string
  callToAction?: string
}

export interface ContentFormatBreakdown {
  carousel: { count: number; avgEngagement: number }
  reel: { count: number; avgEngagement: number }
  single: { count: number; avgEngagement: number }
  video: { count: number; avgEngagement: number }
}

export interface TrendingSuggestion {
  sound_name: string
  trend_name?: string
  trending_reason: string
  content_suggestion: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  platform: string
  estimated_views_potential: string
  // Enhanced suggestion fields
  proven_hooks?: string[]
  optimal_format?: string
  best_posting_time?: string
  competitor_examples?: string[]
  content_formula?: string
  hashtag_strategy?: string
}

export interface TrendingFetchResult {
  trends: TrendingItem[]
  lastUpdated: string | null
  error?: string
}

export interface TrendAnalysis {
  trendName: string
  platform: string
  totalPosts: number
  avgEngagement: number
  engagementRate: number
  topPerformers: TrendPost[]
  contentPatterns: {
    avgCaptionLength: number
    commonHooks: string[]
    hashtagCount: { min: number; max: number; avg: number }
    bestPerformingFormat: string
    audioUsage: number
  }
  recommendations: {
    hookTemplates: string[]
    contentIdeas: string[]
    formatRecommendation: string
    hashtagStrategy: string
  }
}
