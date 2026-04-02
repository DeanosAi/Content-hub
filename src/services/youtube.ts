import { YouTubeVideoMetrics } from '@/types'

const YOUTUBE_API_KEY = 'AIzaSyDGK1lXuN9hxV8vzc90tbzqOozRG0CF32Q'

export class YouTubeService {
  
  // Fetch metrics for a YouTube video
  async getVideoMetrics(videoId: string): Promise<YouTubeVideoMetrics | null> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
      )
      
      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.items || data.items.length === 0) {
        return null
      }
      
      const video = data.items[0]
      const stats = video.statistics
      const snippet = video.snippet
      
      const views = parseInt(stats.viewCount || '0', 10)
      const likes = parseInt(stats.likeCount || '0', 10)
      const comments = parseInt(stats.commentCount || '0', 10)
      
      // Calculate engagement rate: (likes + comments) / views * 100
      const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0
      
      return {
        videoId,
        title: snippet.title,
        views,
        likes,
        comments,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        publishedAt: snippet.publishedAt
      }
    } catch (error) {
      console.error('Failed to fetch YouTube metrics:', error)
      return null
    }
  }
  
  // Fetch metrics for multiple videos
  async getMultipleVideoMetrics(videoIds: string[]): Promise<YouTubeVideoMetrics[]> {
    const results: YouTubeVideoMetrics[] = []
    
    // YouTube API allows up to 50 IDs per request
    const batchSize = 50
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize)
      const idsString = batch.join(',')
      
      try {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${idsString}&key=${YOUTUBE_API_KEY}`
        )
        
        if (!response.ok) {
          console.error(`YouTube API batch error: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        
        for (const video of data.items || []) {
          const stats = video.statistics
          const snippet = video.snippet
          
          const views = parseInt(stats.viewCount || '0', 10)
          const likes = parseInt(stats.likeCount || '0', 10)
          const comments = parseInt(stats.commentCount || '0', 10)
          const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0
          
          results.push({
            videoId: video.id,
            title: snippet.title,
            views,
            likes,
            comments,
            engagementRate: parseFloat(engagementRate.toFixed(2)),
            publishedAt: snippet.publishedAt
          })
        }
      } catch (error) {
        console.error('Failed to fetch YouTube batch:', error)
      }
    }
    
    return results
  }
  
  // Extract video ID from various YouTube URL formats
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /youtube\.com\/shorts\/([^&\s?]+)/
    ]
    
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    
    return null
  }
}

export const youtubeService = new YouTubeService()
