import { InstagramPostMetrics } from '@/types'

export class InstagramCSVService {
  
  // Parse Instagram Insights CSV export
  parseCSV(csvText: string): InstagramPostMetrics[] {
    const lines = csvText.split('\n')
    if (lines.length < 2) return []
    
    // Parse header
    const headers = this.parseCSVLine(lines[0])
    
    // Find column indices
    const permalinkIndex = headers.findIndex(h => h.toLowerCase().includes('permalink') || h.toLowerCase().includes('url'))
    const captionIndex = headers.findIndex(h => h.toLowerCase().includes('caption'))
    const likesIndex = headers.findIndex(h => h.toLowerCase().includes('like'))
    const commentsIndex = headers.findIndex(h => h.toLowerCase().includes('comment'))
    const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('posted'))
    
    const results: InstagramPostMetrics[] = []
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      
      const values = this.parseCSVLine(lines[i])
      if (values.length < 3) continue
      
      const permalink = permalinkIndex >= 0 ? values[permalinkIndex] : ''
      const shortCode = this.extractShortCode(permalink)
      
      const likes = likesIndex >= 0 ? parseInt(values[likesIndex].replace(/,/g, '') || '0', 10) : 0
      const comments = commentsIndex >= 0 ? parseInt(values[commentsIndex].replace(/,/g, '') || '0', 10) : 0
      const totalEngagement = likes + comments
      
      // Estimate engagement rate (we don't have reach/impressions from basic export)
      // Using a rough estimate based on typical reach being 10-15% of follower count
      const estimatedReach = totalEngagement * 10 // Rough estimate
      const engagementRate = estimatedReach > 0 ? (totalEngagement / estimatedReach) * 100 : 0
      
      const caption = captionIndex >= 0 ? values[captionIndex] : ''
      const hashtags = this.extractHashtags(caption)
      
      results.push({
        shortCode,
        caption: caption.slice(0, 500),
        likes,
        comments,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        postedAt: dateIndex >= 0 ? values[dateIndex] : new Date().toISOString(),
        hashtags
      })
    }
    
    return results
  }
  
  // Parse a single CSV line handling quoted values
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current.trim())
    return result
  }
  
  // Extract shortcode from Instagram URL
  private extractShortCode(url: string): string {
    const match = url.match(/instagram\.com\/p\/([^\/]+)/)
    return match ? match[1] : ''
  }
  
  // Extract hashtags from caption
  private extractHashtags(caption: string): string[] {
    const matches = caption.match(/#[\w\u00C0-\u024F]+/g) || []
    return matches.map(tag => tag.toLowerCase())
  }
  
  // Read file as text
  async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }
}

export const instagramCSVService = new InstagramCSVService()
