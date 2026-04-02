import { create } from 'zustand'
import { TrendingItem } from '@/types/trending'
import { dbService } from '@/services/database'
import { trendingService } from '@/services/trending'

interface TrendingState {
  trends: TrendingItem[]
  lastUpdated: string | null
  isLoading: boolean
  error: string | null
  
  loadTrends: () => Promise<void>
  fetchNewTrends: () => Promise<void>
}

export const useTrendingStore = create<TrendingState>((set, get) => ({
  trends: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
  
  loadTrends: async () => {
    try {
      const trends = await dbService.getTrendingItems()
      const lastUpdated = await dbService.getLastTrendingUpdate()
      set({ trends, lastUpdated })
    } catch (error) {
      console.error('Failed to load trends:', error)
    }
  },
  
  fetchNewTrends: async () => {
    set({ isLoading: true, error: null })
    
    try {
      console.log('Starting trend fetch...')
      
      // Fetch trends from both platforms
      const [tiktokTrends, instagramTrends] = await Promise.all([
        trendingService.fetchTikTokTrends(),
        trendingService.fetchInstagramTrends(),
      ])
      
      const allTrends = [...tiktokTrends, ...instagramTrends]
      console.log(`Fetched ${allTrends.length} total trends`)
      
      // Generate AI suggestions
      const suggestions = await trendingService.generateSuggestions(allTrends)
      console.log(`Generated ${suggestions.size} suggestions`)
      
      // Debug: Log trend counts by type
      const hashtagCount = allTrends.filter(t => t.trend_type === 'hashtag').length
      const soundCount = allTrends.filter(t => t.trend_type === 'sound').length
      const topicCount = allTrends.filter(t => t.trend_type === 'topic').length
      const tiktokCount = allTrends.filter(t => t.platform === 'tiktok').length
      console.log(`Breakdown: ${hashtagCount} hashtags, ${soundCount} sounds, ${topicCount} topics | ${tiktokCount} TikTok, ${allTrends.length - tiktokCount} Instagram`)
      
      // Merge suggestions into trends with all enhanced fields
      const trendsWithSuggestions = allTrends.map(trend => ({
        platform: trend.platform || 'unknown',
        trend_type: trend.trend_type || 'hashtag',
        name: trend.name || '',
        popularity_score: trend.popularity_score || 0,
        video_count: trend.video_count || null,
        post_count: trend.post_count || trend.video_count || null,
        avg_engagement: trend.avg_engagement || 0,
        total_engagement: trend.total_engagement || 0,
        top_posts: trend.top_posts || [],
        // Suggestions are now pre-generated in the service, but fallback to generated ones
        suggestion_text: trend.suggestion_text || (trend.name ? (suggestions.get(trend.name) || null) : null),
      }))
      
      // Prioritize high/medium potential trends
      // Include all trends with at least 2 posts (sounds/topics may have different metrics)
      const beforeFilter = trendsWithSuggestions.length
      const prioritizedTrends = trendsWithSuggestions
        .filter(t => {
          const postCount = t.post_count || t.video_count || 0
          return postCount >= 2 // At least 2 posts as evidence
        })
        .sort((a, b) => {
          // Sort by engagement rate, but give sounds/topics a boost
          const aScore = (a.avg_engagement || 0) + (a.popularity_score || 0) * 10
          const bScore = (b.avg_engagement || 0) + (b.popularity_score || 0) * 10
          return bScore - aScore
        })
        .slice(0, 40) // Limit to top 40 trends (20 per platform max)
      
      console.log(`Filtered: ${beforeFilter} → ${prioritizedTrends.length} trends (removed ${beforeFilter - prioritizedTrends.length} with <2 posts)`)
      
      // Save to database (replaces old data)
      await dbService.saveTrendingBatch(prioritizedTrends)
      
      // Reload from database
      await get().loadTrends()
      
      console.log('Trend fetch complete!')
    } catch (error: any) {
      console.error('Failed to fetch trends:', error)
      set({ error: error?.message || 'Failed to fetch trends' })
    } finally {
      set({ isLoading: false })
    }
  },
}))