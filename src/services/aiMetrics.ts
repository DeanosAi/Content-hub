import { TrendingItem, TrendPost } from '@/types/trending'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const APIFY_API_KEY = 'apify_api_J2RlwkTRIZVkYNxnmx54Feo7no69jg0qwiZd'

// General trending hashtags for broad discovery
const TIKTOK_TARGET_HASHTAGS = [
  'trending', 'viral', 'fyp', 'foryou', 'foryoupage',
  'tiktoktrend', 'trendingsound', 'viralvideo'
]

const INSTAGRAM_TARGET_HASHTAGS = [
  'trending', 'viral', 'explore', 'explorepage',
  'reels', 'reelsinstagram', 'viralreels'
]

export class TrendingService {
  
  // Fetch TikTok trending data prioritizing high engagement
  async fetchTikTokTrends(): Promise<Partial<TrendingItem>[]> {
    const trends: Partial<TrendingItem>[] = []
    
    try {
      console.log('Fetching TikTok trends with engagement focus...')
      
      const response = await tauriFetch(
        'https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashtags: TIKTOK_TARGET_HASHTAGS,
            resultsPerPage: 50, // Get more posts for better trend detection
            shouldDownloadVideos: false
          })
        }
      )
      
      if (!response.ok) {
        throw new Error(`Apify API error: ${response.status}`)
      }
      
      const data: any[] = await response.json()
      console.log(`Fetched ${data.length} TikTok posts`)
      
      // Process posts - focus on high engagement indicators
      const processedPosts: TrendPost[] = data
        .filter(post => {
          // Filter for high-performing content indicators
          const stats = post.stats || {}
          const playCount = stats.playCount || 0
          const diggCount = stats.diggCount || 0
          const authorFollowers = post.authorMeta?.followerCount || 0
          
          // Trending content has high views OR high engagement OR creator has followers
          return playCount > 10000 || diggCount > 500 || authorFollowers > 10000
        })
        .map(post => {
          const stats = post.stats || {}
          const caption = post.text || ''
          const musicTitle = post.musicMeta?.musicName || ''
          const musicAuthor = post.musicMeta?.musicAuthor || ''
          
          return {
            id: post.id || post.videoId || '',
            caption: caption.slice(0, 500),
            hashtags: (caption.match(/#[\w\u00C0-\u024F]+/g) || []) as string[],
            likes: stats.diggCount || 0,
            comments: stats.commentCount || 0,
            shares: stats.shareCount || 0,
            views: stats.playCount || 0,
            author: post.authorMeta?.nickName || post.authorMeta?.name || 'Unknown',
            authorFollowers: post.authorMeta?.followerCount || 0,
            contentType: 'reel',
            hasAudio: !!musicTitle,
            audioName: musicTitle,
            musicName: musicTitle,
            musicAuthor: musicAuthor,
            postedAt: post.createTimeISO || new Date().toISOString(),
            thumbnailUrl: post.videoMeta?.coverUrl,
            hook: this.extractHook(caption)
          }
        })
      
      console.log(`Processed ${processedPosts.length} high-engagement posts`)
      
      // EXTRACT TRENDING SOUNDS (up to 20)
      // Prioritize sounds used by high-follower creators on high-engagement posts
      const soundMap = new Map<string, {
        posts: TrendPost[]
        totalEngagement: number
        avgEngagement: number
        totalViews: number
        highFollowerCreators: number
      }>()
      
      for (const post of processedPosts) {
        const musicTitle = post.musicName
        const musicAuthor = post.musicAuthor
        
        if (musicTitle && musicTitle.length > 1) {
          // Skip generic sounds
          const lowerTitle = musicTitle.toLowerCase()
          if (lowerTitle.includes('original sound') || 
              lowerTitle.includes('original audio') ||
              lowerTitle === 'sound' ||
              lowerTitle.length < 3) {
            continue
          }
          
          // Create unique key with artist if available
          const key = musicAuthor 
            ? `${musicTitle} — ${musicAuthor}`
            : musicTitle
          
          const existing = soundMap.get(key) || {
            posts: [],
            totalEngagement: 0,
            avgEngagement: 0,
            totalViews: 0,
            highFollowerCreators: 0
          }
          
          existing.posts.push(post)
          const engagement = post.likes + post.comments + (post.shares || 0)
          existing.totalEngagement += engagement
          existing.totalViews += post.views || 0
          
          // Count high-follower creators (10k+ followers)
          if ((post.authorFollowers || 0) > 10000) {
            existing.highFollowerCreators++
          }
          
          existing.avgEngagement = existing.totalEngagement / existing.posts.length
          soundMap.set(key, existing)
        }
      }
      
      // Sort sounds by: high-follower creators first, then engagement
      const sortedSounds = [...soundMap.entries()]
        .filter(([_, data]) => data.posts.length >= 2) // At least 2 posts
        .sort((a, b) => {
          // Prioritize sounds used by high-follower creators
          const aScore = (a[1].highFollowerCreators * 10000) + a[1].avgEngagement
          const bScore = (b[1].highFollowerCreators * 10000) + b[1].avgEngagement
          return bScore - aScore
        })
        .slice(0, 20) // Up to 20 sounds as requested
      
      console.log(`Found ${sortedSounds.length} trending sounds`)
      
      for (const [soundName, data] of sortedSounds) {
        const topPost = data.posts.sort((a, b) => 
          (b.likes + b.comments) - (a.likes + a.comments)
        )[0]
        
        trends.push({
          platform: 'tiktok',
          trend_type: 'sound',
          name: soundName,
          popularity_score: Math.min(Math.round(data.avgEngagement / 100), 100),
          video_count: data.posts.length,
          post_count: data.posts.length,
          avg_engagement: Math.round(data.avgEngagement),
          total_engagement: data.totalEngagement,
          top_posts: data.posts.slice(0, 3),
          best_performing_hook: topPost?.hook,
          suggestion_text: JSON.stringify({
            sound_name: soundName,
            trending_reason: `Used in ${data.posts.length} high-engagement posts (${data.highFollowerCreators} by creators with 10k+ followers). Avg ${Math.round(data.avgEngagement).toLocaleString()} engagement.`,
            content_suggestion: `Create content using "${soundName}". Top posts average ${Math.round(data.avgEngagement / 1000)}K engagement.`,
            difficulty: 'Medium',
            platform: 'TikTok',
            estimated_views_potential: data.avgEngagement > 50000 ? 'High' : 'Medium',
            high_follower_creators: data.highFollowerCreators
          })
        })
      }
      
      // EXTRACT TRENDING HASHTAGS (high engagement only)
      const hashtagMap = new Map<string, {
        posts: TrendPost[]
        totalEngagement: number
        avgEngagement: number
        highEngagementPosts: number
      }>()
      
      for (const post of processedPosts) {
        for (const hashtag of post.hashtags) {
          const normalized = hashtag.toLowerCase()
          
          // Skip generic hashtags
          if (['#fyp', '#foryou', '#foryoupage', '#viral', '#trending', '#tiktok'].includes(normalized)) {
            continue
          }
          
          const existing = hashtagMap.get(normalized) || {
            posts: [],
            totalEngagement: 0,
            avgEngagement: 0,
            highEngagementPosts: 0
          }
          
          existing.posts.push(post)
          const engagement = post.likes + post.comments + (post.shares || 0)
          existing.totalEngagement += engagement
          
          // Count truly high-engagement posts (10k+ likes)
          if (post.likes > 10000) {
            existing.highEngagementPosts++
          }
          
          existing.avgEngagement = existing.totalEngagement / existing.posts.length
          hashtagMap.set(normalized, existing)
        }
      }
      
      // Sort hashtags by high-engagement post count, then avg engagement
      const sortedHashtags = [...hashtagMap.entries()]
        .filter(([_, data]) => data.posts.length >= 3 && data.avgEngagement > 1000)
        .sort((a, b) => {
          const aScore = (a[1].highEngagementPosts * 100000) + a[1].avgEngagement
          const bScore = (b[1].highEngagementPosts * 100000) + b[1].avgEngagement
          return bScore - aScore
        })
        .slice(0, 15)
      
      for (const [hashtag, data] of sortedHashtags) {
        const topPosts = data.posts
          .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
          .slice(0, 3)
        
        trends.push({
          platform: 'tiktok',
          trend_type: 'hashtag',
          name: hashtag,
          popularity_score: Math.min(Math.round(data.avgEngagement / 100), 100),
          video_count: data.posts.length,
          post_count: data.posts.length,
          avg_engagement: Math.round(data.avgEngagement),
          total_engagement: data.totalEngagement,
          top_posts: topPosts,
          best_performing_hook: topPosts[0]?.hook,
          suggestion_text: JSON.stringify({
            trend_name: hashtag,
            trending_reason: `${data.posts.length} high-engagement posts, ${data.highEngagementPosts} with 10k+ likes. Avg engagement: ${Math.round(data.avgEngagement).toLocaleString()}`,
            content_suggestion: `Use ${hashtag} in your content. Posts with this tag average ${Math.round(data.avgEngagement / 1000)}K engagement.`,
            difficulty: 'Easy',
            platform: 'TikTok',
            estimated_views_potential: data.avgEngagement > 50000 ? 'High' : 'Medium'
          })
        })
      }
      
      // EXTRACT TOPICS from high-performing content themes
      const topicClusters = this.clusterByTopic(processedPosts.filter(p => p.likes > 5000))
      for (const [topic, posts] of topicClusters.slice(0, 5)) {
        const totalEngagement = posts.reduce((sum, p) => sum + p.likes + p.comments, 0)
        const avgEngagement = totalEngagement / posts.length
        
        trends.push({
          platform: 'tiktok',
          trend_type: 'topic',
          name: topic,
          popularity_score: Math.min(Math.round(avgEngagement / 100), 100),
          video_count: posts.length,
          post_count: posts.length,
          avg_engagement: Math.round(avgEngagement),
          total_engagement: totalEngagement,
          top_posts: posts.sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 3),
          best_performing_hook: posts[0]?.hook,
          suggestion_text: JSON.stringify({
            trend_name: topic,
            trending_reason: `${posts.length} high-performing posts in this category with ${Math.round(avgEngagement / 1000)}K avg engagement.`,
            content_suggestion: `Create ${topic.toLowerCase()} content. This theme is performing well with high engagement rates.`,
            difficulty: 'Medium',
            platform: 'TikTok',
            estimated_views_potential: avgEngagement > 50000 ? 'High' : 'Medium'
          })
        })
      }
      
      console.log(`Found ${trends.length} TikTok trends: ${sortedSounds.length} sounds, ${sortedHashtags.length} hashtags, ${Math.min(topicClusters.length, 5)} topics`)
      
    } catch (error) {
      console.error('Failed to fetch TikTok trends:', error)
    }
    
    return trends
  }
  
  // Fetch Instagram trends prioritizing high engagement
  async fetchInstagramTrends(): Promise<Partial<TrendingItem>[]> {
    const trends: Partial<TrendingItem>[] = []
    
    try {
      console.log('Fetching Instagram trends with engagement focus...')
      
      const response = await tauriFetch(
        'https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashtags: INSTAGRAM_TARGET_HASHTAGS,
            resultsPerPage: 50
          })
        }
      )
      
      if (!response.ok) {
        throw new Error(`Apify API error: ${response.status}`)
      }
      
      const data: any[] = await response.json()
      console.log(`Fetched ${data.length} Instagram posts`)
      
      // Process high-engagement posts
      const processedPosts: TrendPost[] = data
        .filter(post => {
          // Instagram trending = high likes OR high comments
          const likes = post.likesCount || 0
          const comments = post.commentsCount || 0
          return likes > 5000 || comments > 100 || (likes + comments) > 6000
        })
        .map(post => {
          const caption = post.caption || ''
          const hashtags = post.hashtags || []
          
          let contentType: 'carousel' | 'reel' | 'single' = 'single'
          if (post.productType === 'carousel_container') contentType = 'carousel'
          else if (post.productType === 'clips' || post.productType === 'reel') contentType = 'reel'
          
          return {
            id: post.id || '',
            shortCode: post.shortCode,
            caption: caption.slice(0, 500),
            hashtags: hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`),
            likes: post.likesCount || 0,
            comments: post.commentsCount || 0,
            author: post.ownerUsername || 'Unknown',
            contentType,
            hasAudio: !!post.musicInfo?.audio_canonical_id,
            postedAt: post.timestamp || new Date().toISOString(),
            thumbnailUrl: post.displayUrl,
            hook: this.extractHook(caption)
          }
        })
      
      console.log(`Processed ${processedPosts.length} high-engagement posts`)
      
      // EXTRACT TRENDING HASHTAGS
      const hashtagMap = new Map<string, {
        posts: TrendPost[]
        totalEngagement: number
        avgEngagement: number
        highEngagementPosts: number
      }>()
      
      for (const post of processedPosts) {
        for (const hashtag of post.hashtags) {
          const normalized = hashtag.toLowerCase()
          
          // Skip generic hashtags
          if (['#reels', '#instagram', '#instagood', '#explore', '#explorepage', '#viral', '#trending'].includes(normalized)) {
            continue
          }
          
          const existing = hashtagMap.get(normalized) || {
            posts: [],
            totalEngagement: 0,
            avgEngagement: 0,
            highEngagementPosts: 0
          }
          
          existing.posts.push(post)
          const engagement = post.likes + post.comments
          existing.totalEngagement += engagement
          
          if (post.likes > 10000) {
            existing.highEngagementPosts++
          }
          
          existing.avgEngagement = existing.totalEngagement / existing.posts.length
          hashtagMap.set(normalized, existing)
        }
      }
      
      const sortedHashtags = [...hashtagMap.entries()]
        .filter(([_, data]) => data.posts.length >= 3 && data.avgEngagement > 2000)
        .sort((a, b) => (b[1].highEngagementPosts * 100000 + b[1].avgEngagement) - 
                        (a[1].highEngagementPosts * 100000 + a[1].avgEngagement))
        .slice(0, 15)
      
      for (const [hashtag, data] of sortedHashtags) {
        const topPosts = data.posts
          .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
          .slice(0, 3)
        
        trends.push({
          platform: 'instagram',
          trend_type: 'hashtag',
          name: hashtag,
          popularity_score: Math.min(Math.round(data.avgEngagement / 50), 100),
          video_count: data.posts.length,
          post_count: data.posts.length,
          avg_engagement: Math.round(data.avgEngagement),
          total_engagement: data.totalEngagement,
          top_posts: topPosts,
          best_performing_hook: topPosts[0]?.hook,
          suggestion_text: JSON.stringify({
            trend_name: hashtag,
            trending_reason: `${data.posts.length} high-engagement posts, ${data.highEngagementPosts} with 10k+ likes. Avg: ${Math.round(data.avgEngagement).toLocaleString()} engagement.`,
            content_suggestion: `Include ${hashtag} in your Reels. Posts with this tag are averaging ${Math.round(data.avgEngagement / 1000)}K engagement.`,
            difficulty: 'Easy',
            platform: 'Instagram',
            estimated_views_potential: data.avgEngagement > 20000 ? 'High' : 'Medium'
          })
        })
      }
      
      // EXTRACT CONTENT FORMAT TRENDS
      const formatMap = new Map<string, TrendPost[]>()
      for (const post of processedPosts) {
        const format = post.contentType === 'carousel' ? 'Carousel Posts' :
                      post.contentType === 'reel' ? 'Reels' : 'Single Images'
        const existing = formatMap.get(format) || []
        existing.push(post)
        formatMap.set(format, existing)
      }
      
      const sortedFormats = [...formatMap.entries()]
        .sort((a, b) => {
          const aAvg = a[1].reduce((s, p) => s + p.likes + p.comments, 0) / a[1].length
          const bAvg = b[1].reduce((s, p) => s + p.likes + p.comments, 0) / b[1].length
          return bAvg - aAvg
        })
        .slice(0, 3)
      
      for (const [format, posts] of sortedFormats) {
        const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments, 0)
        const avgEngagement = totalEngagement / posts.length
        
        trends.push({
          platform: 'instagram',
          trend_type: 'topic',
          name: format,
          popularity_score: Math.min(Math.round(avgEngagement / 50), 100),
          video_count: posts.length,
          post_count: posts.length,
          avg_engagement: Math.round(avgEngagement),
          total_engagement: totalEngagement,
          top_posts: posts.sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 3),
          suggestion_text: JSON.stringify({
            trend_name: format,
            trending_reason: `${format} are averaging ${Math.round(avgEngagement / 1000)}K engagement across ${posts.length} high-performing posts.`,
            content_suggestion: `Create ${format.toLowerCase()} for best engagement. This format is currently performing well on Instagram.`,
            difficulty: format === 'Reels' ? 'Medium' : 'Easy',
            platform: 'Instagram',
            estimated_views_potential: avgEngagement > 20000 ? 'High' : 'Medium'
          })
        })
      }
      
      console.log(`Found ${trends.length} Instagram trends: ${sortedHashtags.length} hashtags, ${sortedFormats.length} format trends`)
      
    } catch (error) {
      console.error('Failed to fetch Instagram trends:', error)
    }
    
    return trends
  }
  
  // Generate suggestions - already embedded in trend objects
  async generateSuggestions(trends: Partial<TrendingItem>[]): Promise<Map<string, string>> {
    const suggestions = new Map<string, string>()
    
    for (const trend of trends) {
      if (trend.name && trend.suggestion_text) {
        suggestions.set(trend.name, trend.suggestion_text)
      }
    }
    
    return suggestions
  }
  
  private extractHook(caption: string): string | undefined {
    if (!caption) return undefined
    
    const lines = caption.split('\n').filter(l => l.trim())
    const firstLine = lines[0]?.trim()
    
    if (!firstLine) return undefined
    
    // Common hook patterns for trending content
    const hookPatterns = [
      /^(POV|pov):/i,
      /^(Wait for it|Wait till the end)/i,
      /^(This is|Here's|Did you know)/i,
      /^(How to|Tutorial|Guide):/i,
      /^(Day \d+|Part \d+)/i,
      /^(Tell me|Comment|Save this)/i,
      /^(Unpopular opinion|Hot take)/i,
      /^(Before|After)/i,
      /^(The|My|Your) \w+/i,
      /^(Stop|Don't|Never)/i,
      /^(Who|What|When|Where|Why|How)\b/i,
      /^(Nobody|Everyone|I|You)\b/i
    ]
    
    for (const pattern of hookPatterns) {
      if (pattern.test(firstLine)) {
        return firstLine.slice(0, 100)
      }
    }
    
    // Return first sentence if punchy
    if (firstLine.length < 80 && firstLine.includes('.')) {
      return firstLine.split('.')[0] + '.'
    }
    
    return firstLine.slice(0, 80)
  }
  
  private clusterByTopic(posts: TrendPost[]): [string, TrendPost[]][] {
    const topicKeywords: Record<string, string[]> = {
      'Comedy & Entertainment': ['funny', 'comedy', 'meme', 'humor', 'joke', 'laugh', 'hilarious'],
      'Dance & Music': ['dance', 'dancing', 'choreography', 'dancer', 'routine'],
      'Fashion & Style': ['fashion', 'outfit', 'style', 'ootd', 'clothing', 'look'],
      'Food & Cooking': ['food', 'recipe', 'cooking', 'foodie', 'meal', 'cook', 'eat'],
      'Fitness & Health': ['fitness', 'gym', 'workout', 'exercise', 'health', 'training'],
      'Beauty & Makeup': ['beauty', 'makeup', 'skincare', 'glam', 'tutorial'],
      'Travel & Adventure': ['travel', 'adventure', 'explore', 'trip', 'vacation'],
      'Lifestyle & Vlog': ['lifestyle', 'day', 'routine', 'vlog', 'life'],
      'Education & Tips': ['tip', 'hack', 'learn', 'how to', 'advice', 'guide'],
      'Transformation': ['transformation', 'before', 'after', 'progress', 'journey']
    }
    
    const clusters = new Map<string, TrendPost[]>()
    
    for (const post of posts) {
      const text = (post.caption + ' ' + post.hashtags.join(' ')).toLowerCase()
      
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(kw => text.includes(kw))) {
          const existing = clusters.get(topic) || []
          existing.push(post)
          clusters.set(topic, existing)
        }
      }
    }
    
    return [...clusters.entries()]
      .sort((a, b) => b[1].length - a[1].length)
  }
}

export const trendingService = new TrendingService()
