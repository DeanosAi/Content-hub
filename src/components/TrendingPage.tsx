import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  RefreshCw, TrendingUp, Hash, Music, Sparkles, Plus, Clock, Filter,
  Heart, MessageCircle, Share2, Eye, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react'
import { useTrendingStore } from '@/store/trendingStore'
import { useJobStore } from '@/store/jobStore'
import { TrendingSuggestion, TrendPost } from '@/types/trending'
import { cn } from '@/lib/utils'

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  instagram: 'bg-pink-500 text-white',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Hard: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const TREND_TYPE_ICONS: Record<string, typeof Hash> = {
  hashtag: Hash,
  sound: Music,
  topic: TrendingUp,
}

// ExpandedTrendState interface removed - using Set<number> for expanded state

export function TrendingPage() {
  const { trends, lastUpdated, isLoading, error, loadTrends, fetchNewTrends } = useTrendingStore()
  const { selectedWorkspace, addJob } = useJobStore()
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedTrends, setExpandedTrends] = useState<Set<number>>(new Set())
  
  useEffect(() => {
    loadTrends()
  }, [loadTrends])
  
  const toggleExpand = (trendId: number) => {
    const newExpanded = new Set(expandedTrends)
    if (newExpanded.has(trendId)) {
      newExpanded.delete(trendId)
    } else {
      newExpanded.add(trendId)
    }
    setExpandedTrends(newExpanded)
  }
  
  const filteredTrends = trends.filter(trend => {
    if (platformFilter !== 'all' && trend.platform !== platformFilter) return false
    if (typeFilter !== 'all' && trend.trend_type !== typeFilter) return false
    return true
  })
  
  const parseSuggestion = (suggestionText: string | null): TrendingSuggestion | null => {
    if (!suggestionText) return null
    try {
      return JSON.parse(suggestionText)
    } catch {
      return null
    }
  }
  
  const handleCreateJobFromTrend = async (trendName: string, suggestion: TrendingSuggestion | null) => {
    if (!selectedWorkspace) {
      alert('Please select a workspace first')
      return
    }
    
    await addJob({
      workspace_id: selectedWorkspace,
      title: suggestion?.content_suggestion?.slice(0, 80) || `Content for ${trendName}`,
      description: suggestion ? 
        `Trend: ${trendName}\nWhy trending: ${suggestion.trending_reason}\n\nSuggestion: ${suggestion.content_suggestion}\n\nFormula: ${suggestion.content_formula || 'Hook → Value → CTA'}` :
        `Create content based on trending ${trendName}`,
      stage: 'brief',
      priority: 1,
      due_date: null,
      platform: suggestion?.platform === 'Both' ? ['instagram', 'tiktok'] : 
                suggestion?.platform === 'TikTok' ? ['tiktok'] : 
                suggestion?.platform === 'Instagram' ? ['instagram'] : ['instagram'],
      target_hashtags: trendName,
      file_links: null,
      live_url: null,
      live_metrics: null,
      custom_fields: null,
    })
    
    alert(`Job created from trend: ${trendName}`)
  }
  
  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHrs < 24) return `${diffHrs} hours ago`
    return date.toLocaleDateString()
  }
  
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }
  
  const tiktokCount = trends.filter(t => t.platform === 'tiktok').length
  const instagramCount = trends.filter(t => t.platform === 'instagram').length
  const hashtagCount = trends.filter(t => t.trend_type === 'hashtag').length
  const soundCount = trends.filter(t => t.trend_type === 'sound').length
  const topicCount = trends.filter(t => t.trend_type === 'topic').length
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trending Analysis</h2>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Last updated: {formatLastUpdated(lastUpdated)}
            </p>
          </div>
        </div>
        <Button onClick={fetchNewTrends} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          {isLoading ? 'Fetching Trends...' : 'Check for New Trends'}
        </Button>
      </header>
      
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Error Message */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{trends.length}</div>
              <p className="text-xs text-muted-foreground">Total Trends</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{tiktokCount}</div>
              <p className="text-xs text-muted-foreground">TikTok</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{instagramCount}</div>
              <p className="text-xs text-muted-foreground">Instagram</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{hashtagCount}</div>
              <p className="text-xs text-muted-foreground">Hashtags</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{soundCount + topicCount}</div>
              <p className="text-xs text-muted-foreground">Sounds & Topics</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-2">
            {['all', 'tiktok', 'instagram'].map((platform) => (
              <Button
                key={platform}
                variant={platformFilter === platform ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPlatformFilter(platform)}
              >
                {platform === 'all' ? 'All Platforms' : platform.charAt(0).toUpperCase() + platform.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {['all', 'hashtag', 'sound', 'topic'].map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Trending Cards */}
        {filteredTrends.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTrends.map((trend) => {
              const suggestion = parseSuggestion(trend.suggestion_text)
              const TrendIcon = TREND_TYPE_ICONS[trend.trend_type] || Hash
              const isExpanded = expandedTrends.has(trend.id)
              const topPosts = trend.top_posts || []
              
              return (
                <Card key={trend.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <TrendIcon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base truncate max-w-[180px]" title={trend.name}>
                          {trend.name}
                        </CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className={cn('text-[10px]', PLATFORM_COLORS[trend.platform])}>
                          {trend.platform}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {trend.trend_type}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Engagement Metrics */}
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                      <div className="bg-muted/50 rounded px-2 py-1 text-center">
                        <div className="font-semibold text-primary">
                          {trend.avg_engagement ? formatNumber(trend.avg_engagement) : '-'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">avg engagement</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1 text-center">
                        <div className="font-semibold">{trend.post_count || trend.video_count || 0}</div>
                        <div className="text-[10px] text-muted-foreground">posts analyzed</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1 text-center">
                        <div className="font-semibold">{trend.total_engagement ? formatNumber(trend.total_engagement) : '-'}</div>
                        <div className="text-[10px] text-muted-foreground">total engagement</div>
                      </div>
                    </div>
                    
                    {trend.popularity_score && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5">
                          <div 
                            className="bg-gradient-to-r from-primary to-primary/60 h-1.5 rounded-full"
                            style={{ width: `${trend.popularity_score}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{trend.popularity_score}/100</span>
                      </div>
                    )}
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {/* Suggestion Content */}
                    {suggestion && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-3 w-3 mt-1 text-amber-400 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            {suggestion.trending_reason}
                          </p>
                        </div>
                        
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="text-sm font-medium mb-1">Content Idea:</p>
                          <p className="text-sm text-muted-foreground">
                            {suggestion.content_suggestion}
                          </p>
                        </div>
                        
                        {/* Content Formula */}
                        {suggestion.content_formula && (
                          <div className="bg-primary/5 border border-primary/20 rounded-md p-2">
                            <p className="text-xs font-medium text-primary mb-1">Proven Formula:</p>
                            <p className="text-xs text-muted-foreground">{suggestion.content_formula}</p>
                          </div>
                        )}
                        
                        {/* Optimal Format & Hashtag Strategy */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {suggestion.optimal_format && (
                            <div className="bg-muted/30 rounded p-2">
                              <span className="text-muted-foreground">Best format:</span>
                              <span className="font-medium ml-1">{suggestion.optimal_format}</span>
                            </div>
                          )}
                          {suggestion.hashtag_strategy && (
                            <div className="bg-muted/30 rounded p-2">
                              <span className="text-muted-foreground">Hashtags:</span>
                              <span className="font-medium ml-1 truncate block">
                                {suggestion.hashtag_strategy.slice(0, 40)}...
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* Proven Hooks */}
                        {suggestion.proven_hooks && suggestion.proven_hooks.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Proven hooks from top posts:</p>
                            <div className="space-y-1">
                              {suggestion.proven_hooks.slice(0, 2).map((hook, i) => (
                                <div key={i} className="text-xs bg-muted/30 rounded px-2 py-1 truncate">
                                  "{hook}"
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 flex-wrap">
                          {suggestion.difficulty && (
                            <Badge variant="outline" className={cn('text-[10px]', DIFFICULTY_COLORS[suggestion.difficulty])}>
                              {suggestion.difficulty}
                            </Badge>
                          )}
                          {suggestion.estimated_views_potential && (
                            <Badge variant="outline" className="text-[10px]">
                              {suggestion.estimated_views_potential} potential
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Top Posts Section */}
                    {topPosts.length > 0 && (
                      <div className="border-t pt-3">
                        <button 
                          onClick={() => toggleExpand(trend.id)}
                          className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span>Top performing posts ({topPosts.length})</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-3 space-y-2">
                            {topPosts.map((post: TrendPost, idx: number) => (
                              <div key={idx} className="bg-muted/30 rounded-md p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">@{post.author}</p>
                                    {post.hook && (
                                      <p className="text-muted-foreground mt-1 italic truncate">
                                        "{post.hook}"
                                      </p>
                                    )}
                                  </div>
                                  {post.thumbnailUrl && (
                                    <img 
                                      src={post.thumbnailUrl} 
                                      alt="" 
                                      className="w-12 h-12 object-cover rounded shrink-0"
                                      loading="lazy"
                                    />
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3 w-3" />
                                    {formatNumber(post.likes)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageCircle className="h-3 w-3" />
                                    {formatNumber(post.comments)}
                                  </span>
                                  {post.shares !== undefined && (
                                    <span className="flex items-center gap-1">
                                      <Share2 className="h-3 w-3" />
                                      {formatNumber(post.shares)}
                                    </span>
                                  )}
                                  {post.views !== undefined && (
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      {formatNumber(post.views)}
                                    </span>
                                  )}
                                </div>
                                {post.shortCode && (
                                  <a 
                                    href={`https://instagram.com/p/${post.shortCode}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 mt-2 text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View post
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Create Job Button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleCreateJobFromTrend(trend.name, suggestion)}
                    >
                      <Plus className="h-3 w-3 mr-2" />
                      Create Job from This Trend
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Trending Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Click "Check for New Trends" to fetch the latest trends from TikTok and Instagram.
                </p>
                <Button onClick={fetchNewTrends} disabled={isLoading}>
                  <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                  {isLoading ? 'Fetching...' : 'Fetch Trends Now'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
