import Database from '@tauri-apps/plugin-sql'
import { Job, Workspace, Template, JobStage } from '@/types'

class DatabaseService {
  private db: Database | null = null
  
  async connect(dbPath: string): Promise<void> {
    try {
      console.log('Connecting to database:', dbPath)
      // Add timeout to prevent hanging
      const connectPromise = Database.load(`sqlite:${dbPath}`)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database connection timeout')), 10000)
      })
      this.db = await Promise.race([connectPromise, timeoutPromise]) as Database
      console.log('Database loaded, initializing tables...')
      await this.initializeTables()
      console.log('Database connected successfully')
    } catch (error) {
      console.error('Failed to connect to database:', error)
      throw error
    }
  }
  
  isConnected(): boolean {
    return this.db !== null
  }
  
  private async initializeTables(): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    // Create tables if they don't exist
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#8b5cf6',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
      )
    `)
    
    // Note: sort_order column added to schema. For existing databases without this column,
    // users should delete their database file and let the app recreate it, or manually run:
    // ALTER TABLE workspaces ADD COLUMN sort_order INTEGER DEFAULT 0
    
    // Create jobs table without CHECK constraint on platform (we handle validation in code)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        stage TEXT DEFAULT 'brief',
        priority INTEGER DEFAULT 0,
        due_date DATETIME,
        platform TEXT,
        target_hashtags TEXT,
        file_links TEXT,
        live_url TEXT,
        live_metrics_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      )
    `)
    
    // Migration: Remove CHECK constraint from existing jobs table
    await this.migrateJobsTable()
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        default_platform TEXT,
        default_hashtags TEXT,
        default_description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trending_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        trend_type TEXT NOT NULL,
        name TEXT NOT NULL,
        popularity_score INTEGER,
        video_count INTEGER,
        post_count INTEGER,
        avg_engagement INTEGER,
        total_engagement INTEGER,
        suggestion_text TEXT,
        top_posts_json TEXT,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Phase 4: Performance Metrics
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        engagement_rate REAL DEFAULT 0,
        posted_at DATETIME,
        captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      )
    `)
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        start_date DATETIME,
        end_date DATETIME,
        metrics_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        pdf_path TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `)
    
    // Settings table for user preferences and API keys
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Ensure all columns exist (for databases created before certain features)
    await this.ensureJobsColumns()
    
    // Migration complete
    console.log('Database initialization complete')
  }
  
  private async ensureJobsColumns(): Promise<void> {
    if (!this.db) return
    
    try {
      // Check if live_url column exists
      const columns: any[] = await this.db.select("PRAGMA table_info(jobs)")
      const hasLiveUrl = columns.some(col => col.name === 'live_url')
      const hasLiveMetrics = columns.some(col => col.name === 'live_metrics_json')
      
      if (!hasLiveUrl) {
        console.log('Adding live_url column to jobs table')
        await this.db.execute('ALTER TABLE jobs ADD COLUMN live_url TEXT')
      }
      
      if (!hasLiveMetrics) {
        console.log('Adding live_metrics_json column to jobs table')
        await this.db.execute('ALTER TABLE jobs ADD COLUMN live_metrics_json TEXT')
      }
    } catch (error) {
      console.error('Failed to ensure jobs columns:', error)
    }
  }
  
  private async migrateJobsTable(): Promise<void> {
    if (!this.db) return
    
    // Check if migration is needed by testing if we can insert a record with platform as JSON array
    try {
      console.log('Checking if jobs table migration is needed...')
      
      // Temporarily disable foreign key constraints for the test
      await this.db.execute(`PRAGMA foreign_keys = OFF`)
      
      // Try to insert a test record with JSON array platform
      await this.db.execute(`
        INSERT INTO jobs (workspace_id, title, platform) 
        VALUES (0, '__migration_test__', '["instagram","tiktok"]')
      `)
      
      // If we get here, the table doesn't have CHECK constraint, delete test record
      await this.db.execute(`DELETE FROM jobs WHERE title = '__migration_test__'`)
      await this.db.execute(`PRAGMA foreign_keys = ON`)
      console.log('Migration not needed: table already supports JSON platform')
      return
    } catch (error: any) {
      // Re-enable foreign keys
      await this.db.execute(`PRAGMA foreign_keys = ON`)
      
      // If error mentions CHECK constraint, we need to migrate
      const errorStr = error?.message || error?.toString?.() || String(error)
      if (errorStr.includes('CHECK constraint')) {
        console.log('Migration needed: CHECK constraint detected')
      } else {
        // Table might not exist yet or other error
        console.log('Migration check result:', error)
        return
      }
    }
    
    // Perform migration
    try {
      console.log('Starting migration: Recreating jobs table without CHECK constraints')
      
      // Disable foreign keys during migration
      await this.db.execute(`PRAGMA foreign_keys = OFF`)
      
      // Drop jobs_new if it exists from a previous failed migration
      await this.db.execute(`DROP TABLE IF EXISTS jobs_new`)
      
      // Create new table without constraints
      await this.db.execute(`
        CREATE TABLE jobs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          stage TEXT DEFAULT 'brief',
          priority INTEGER DEFAULT 0,
          due_date DATETIME,
          platform TEXT,
          target_hashtags TEXT,
          file_links TEXT,
          live_url TEXT,
          live_metrics_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        )
      `)
      
      // Copy data from old table (skip the test record if it exists)
      await this.db.execute(`
        INSERT INTO jobs_new SELECT * FROM jobs WHERE title != '__migration_test__'
      `)
      
      // Drop old table
      await this.db.execute(`DROP TABLE jobs`)
      
      // Rename new table
      await this.db.execute(`ALTER TABLE jobs_new RENAME TO jobs`)
      
      // Re-enable foreign keys
      await this.db.execute(`PRAGMA foreign_keys = ON`)
      
      console.log('Migration complete: CHECK constraints removed from jobs table')
    } catch (error) {
      console.error('Migration failed:', error)
      // Re-enable foreign keys even on error
      await this.db.execute(`PRAGMA foreign_keys = ON`)
      // Clean up
      try {
        await this.db.execute(`DROP TABLE IF EXISTS jobs_new`)
        await this.db.execute(`DELETE FROM jobs WHERE title = '__migration_test__'`)
      } catch (e) {
        // Ignore cleanup errors
      }
      throw error
    }
  }
  
  // Workspace operations
  async getWorkspaces(): Promise<Workspace[]> {
    if (!this.db) throw new Error('Database not connected')
    try {
      // Try with sort_order (new databases)
      return await this.db.select('SELECT * FROM workspaces WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC')
    } catch (error) {
      // Fallback for old databases without sort_order
      return await this.db.select('SELECT * FROM workspaces WHERE is_active = 1 ORDER BY created_at DESC')
    }
  }
  
  async createWorkspace(name: string, color: string = '#8b5cf6'): Promise<number> {
    if (!this.db) {
      console.error('Database not connected when creating workspace')
      throw new Error('Database not connected')
    }
    try {
      // Try with sort_order first (new databases)
      try {
        const result = await this.db.execute(
          'INSERT INTO workspaces (name, color, sort_order) VALUES (?, ?, ?)',
          [name, color, 0]
        )
        console.log('Workspace created with sort_order:', result.lastInsertId)
        return result.lastInsertId ?? 0
      } catch (error) {
        // Fallback for old databases without sort_order column
        const result = await this.db.execute(
          'INSERT INTO workspaces (name, color) VALUES (?, ?)',
          [name, color]
        )
        console.log('Workspace created (legacy):', result.lastInsertId)
        return result.lastInsertId ?? 0
      }
    } catch (error) {
      console.error('Failed to create workspace:', error)
      throw error
    }
  }
  
  async updateWorkspace(id: number, updates: Partial<Workspace>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = Object.values(updates)
    await this.db.execute(`UPDATE workspaces SET ${fields} WHERE id = ?`, [...values, id])
  }
  
  async deleteWorkspace(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('UPDATE workspaces SET is_active = 0 WHERE id = ?', [id])
  }
  
  async reorderWorkspaces(orderedIds: number[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await this.db.execute('UPDATE workspaces SET sort_order = ? WHERE id = ?', [i, orderedIds[i]])
      }
    } catch (error: any) {
      // If sort_order column doesn't exist, silently ignore (reordering not supported in old databases)
      if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
        console.log('Reorder not supported: sort_order column does not exist in old database')
        return
      }
      throw error
    }
  }
  
  // Job operations
  async getJobs(workspaceId: number): Promise<Job[]> {
    if (!this.db) throw new Error('Database not connected')
    try {
      const rows: any[] = await this.db.select(
        'SELECT * FROM jobs WHERE workspace_id = ? ORDER BY priority DESC, due_date ASC',
        [workspaceId]
      )
      // Parse JSON fields
      return rows.map((row: any) => ({
        ...row,
        platform: row.platform ? JSON.parse(row.platform) : null,
        live_metrics: row.live_metrics_json ? JSON.parse(row.live_metrics_json) : null
      }))
    } catch (error: any) {
      // Fallback for old schema without live_metrics_json
      if (error?.message?.includes('no such column')) {
        console.log('Using fallback getJobs (old schema)')
        const rows: any[] = await this.db.select(
          'SELECT id, workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links, created_at, updated_at FROM jobs WHERE workspace_id = ? ORDER BY priority DESC, due_date ASC',
          [workspaceId]
        )
        return rows.map((row: any) => ({
          ...row,
          platform: row.platform ? JSON.parse(row.platform) : null,
          live_url: null,
          live_metrics: null
        }))
      }
      throw error
    }
  }
  
  async createJob(jobData: Omit<Job, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    if (!this.db) {
      console.error('Database not connected when creating job')
      throw new Error('Database not connected')
    }
    try {
      // Try with new columns first
      try {
        const result = await this.db.execute(
          `INSERT INTO jobs (workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links, live_url, live_metrics_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jobData.workspace_id, jobData.title, jobData.description, jobData.stage, 
           jobData.priority, jobData.due_date, jobData.platform ? JSON.stringify(jobData.platform) : null, 
           jobData.target_hashtags, jobData.file_links, jobData.live_url, 
           jobData.live_metrics ? JSON.stringify(jobData.live_metrics) : null]
        )
        console.log('Job created with new schema:', result.lastInsertId)
        return result.lastInsertId ?? 0
      } catch (error: any) {
        // Fallback for old database schema without live_url/live_metrics columns
        if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
          console.log('Using fallback insert (old database schema)')
          const result = await this.db.execute(
            `INSERT INTO jobs (workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobData.workspace_id, jobData.title, jobData.description, jobData.stage, 
             jobData.priority, jobData.due_date, jobData.platform ? JSON.stringify(jobData.platform) : null, 
             jobData.target_hashtags, jobData.file_links]
          )
          console.log('Job created (legacy):', result.lastInsertId)
          return result.lastInsertId ?? 0
        }
        throw error
      }
    } catch (error) {
      console.error('Failed to create job:', error)
      throw error
    }
  }
  
  async updateJob(id: number, updates: Partial<Job>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    try {
      // Handle JSON fields - ALWAYS delete the JS property, only keep DB columns
      const processedUpdates: any = { ...updates }
      
      // Handle platform array -> JSON string
      if (updates.platform) {
        processedUpdates.platform = JSON.stringify(updates.platform)
      }
      
      // Handle live_metrics object -> JSON string (and always remove the JS property)
      if ('live_metrics' in processedUpdates) {
        if (updates.live_metrics) {
          processedUpdates.live_metrics_json = JSON.stringify(updates.live_metrics)
        }
        delete processedUpdates.live_metrics
      }
      
      // Handle live_url
      if (updates.live_url !== undefined) {
        processedUpdates.live_url = updates.live_url
      }
      
      const fields = Object.keys(processedUpdates).map(key => `${key} = ?`).join(', ')
      const values = Object.values(processedUpdates)
      await this.db.execute(`UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id])
    } catch (error: any) {
      // Fallback for old schema without live_url/live_metrics columns
      if (error?.message?.includes('no such column')) {
        console.log('Using fallback update (old schema)')
        const processedUpdates: any = { ...updates }
        if (updates.platform) {
          processedUpdates.platform = JSON.stringify(updates.platform)
        }
        // Remove new columns that don't exist
        delete processedUpdates.live_url
        delete processedUpdates.live_metrics
        delete processedUpdates.live_metrics_json
        
        if (Object.keys(processedUpdates).length === 0) {
          console.log('No fields to update (all new columns)')
          return
        }
        
        const fields = Object.keys(processedUpdates).map(key => `${key} = ?`).join(', ')
        const values = Object.values(processedUpdates)
        await this.db.execute(`UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id])
      } else {
        throw error
      }
    }
  }
  
  async deleteJob(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM jobs WHERE id = ?', [id])
  }
  
  async moveJob(id: number, newStage: JobStage): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('UPDATE jobs SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStage, id])
  }
  
  // Template operations
  async getTemplates(): Promise<Template[]> {
    if (!this.db) throw new Error('Database not connected')
    return await this.db.select('SELECT * FROM templates ORDER BY created_at DESC')
  }
  
  async createTemplate(templateData: Omit<Template, 'id' | 'created_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(
      'INSERT INTO templates (name, description, default_platform, default_hashtags, default_description) VALUES (?, ?, ?, ?, ?)',
      [templateData.name, templateData.description, templateData.default_platform, 
       templateData.default_hashtags, templateData.default_description]
    )
    return result.lastInsertId ?? 0
  }
  
  async deleteTemplate(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM templates WHERE id = ?', [id])
  }
  
  // Trending operations
  async getTrendingItems(): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')
    const rows: any[] = await this.db.select('SELECT * FROM trending_cache ORDER BY avg_engagement DESC, popularity_score DESC')
    // Parse JSON fields
    return rows.map((row: any) => ({
      ...row,
      top_posts: row.top_posts_json ? JSON.parse(row.top_posts_json) : []
    }))
  }
  
  async getLastTrendingUpdate(): Promise<string | null> {
    if (!this.db) throw new Error('Database not connected')
    const result: any[] = await this.db.select('SELECT MAX(fetched_at) as last_update FROM trending_cache')
    return result[0]?.last_update || null
  }
  
  async clearTrendingCache(): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM trending_cache')
  }
  
  async saveTrendingItem(item: {
    platform: string
    trend_type: string
    name: string
    popularity_score: number | null
    video_count: number | null
    post_count?: number | null
    avg_engagement?: number | null
    total_engagement?: number | null
    suggestion_text: string | null
    top_posts?: any[]
  }): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    try {
      await this.db.execute(
        `INSERT INTO trending_cache (platform, trend_type, name, popularity_score, video_count, post_count, avg_engagement, total_engagement, suggestion_text, top_posts_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.platform, 
          item.trend_type, 
          item.name, 
          item.popularity_score, 
          item.video_count,
          item.post_count || item.video_count,
          item.avg_engagement,
          item.total_engagement,
          item.suggestion_text,
          item.top_posts ? JSON.stringify(item.top_posts) : null
        ]
      )
    } catch (error: any) {
      // If the new columns don't exist (old schema), fall back to basic insert
      if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
        console.warn('Using fallback insert (old database schema detected)')
        await this.db.execute(
          `INSERT INTO trending_cache (platform, trend_type, name, popularity_score, video_count, suggestion_text)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [item.platform, item.trend_type, item.name, item.popularity_score, item.video_count, item.suggestion_text]
        )
      } else {
        throw error
      }
    }
  }
  
  async saveTrendingBatch(items: {
    platform: string
    trend_type: string
    name: string
    popularity_score: number | null
    video_count: number | null
    post_count?: number | null
    avg_engagement?: number | null
    total_engagement?: number | null
    suggestion_text: string | null
    top_posts?: any[]
  }[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    
    let savedCount = 0
    let errorCount = 0
    
    // Clear old data first
    await this.clearTrendingCache()
    
    // Insert new data with error handling per item
    for (const item of items) {
      try {
        await this.saveTrendingItem(item)
        savedCount++
      } catch (err) {
        errorCount++
        console.error(`Failed to save trend "${item.name}":`, err)
      }
    }
    
    console.log(`Saved ${savedCount} trending items to database (${errorCount} errors)`)
    
    if (errorCount > 0) {
      console.warn('Database schema may be outdated. Try deleting your database file and restarting the app.')
    }
  }
  
  // Phase 4: Performance Metrics Operations
  async savePerformanceMetrics(metrics: {
    job_id: number
    platform: string
    views: number
    likes: number
    comments: number
    shares: number
    engagement_rate: number
    posted_at: string
  }): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute(
      `INSERT INTO performance_metrics (job_id, platform, views, likes, comments, shares, engagement_rate, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [metrics.job_id, metrics.platform, metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.engagement_rate, metrics.posted_at]
    )
  }
  
  async saveBulkPerformanceMetrics(metricsArray: Array<{
    job_id: number
    platform: string
    views: number
    likes: number
    comments: number
    shares: number
    engagement_rate: number
    posted_at: string
  }>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    for (const metrics of metricsArray) {
      await this.db.execute(
        `INSERT INTO performance_metrics (job_id, platform, views, likes, comments, shares, engagement_rate, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [metrics.job_id, metrics.platform, metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.engagement_rate, metrics.posted_at]
      )
    }
  }

  async getPerformanceMetrics(jobId: number): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')
    return await this.db.select(
      'SELECT * FROM performance_metrics WHERE job_id = ? ORDER BY captured_at DESC',
      [jobId]
    )
  }
  
  async getWorkspaceMetrics(workspaceId: number, startDate?: string, endDate?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')
    
    let query = `
      SELECT pm.*, j.title as job_title, j.platform as job_platform
      FROM performance_metrics pm
      JOIN jobs j ON pm.job_id = j.id
      WHERE j.workspace_id = ?
    `
    const params: any[] = [workspaceId]
    
    if (startDate) {
      query += ' AND pm.posted_at >= ?'
      params.push(startDate)
    }
    if (endDate) {
      query += ' AND pm.posted_at <= ?'
      params.push(endDate)
    }
    
    query += ' ORDER BY pm.posted_at DESC'
    
    return await this.db.select(query, params)
  }
  
  // Report Operations
  async saveReport(report: {
    workspace_id: number
    title: string
    type: string
    start_date: string
    end_date: string
    metrics_json: string
    pdf_path?: string
  }): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(
      `INSERT INTO reports (workspace_id, title, type, start_date, end_date, metrics_json, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [report.workspace_id, report.title, report.type, report.start_date, report.end_date, report.metrics_json, report.pdf_path || null]
    )
    return result.lastInsertId || 0
  }
  
  async getReports(workspaceId: number): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')
    return await this.db.select(
      'SELECT * FROM reports WHERE workspace_id = ? ORDER BY created_at DESC',
      [workspaceId]
    )
  }
  
  // Settings operations
  async getSettings(key: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not connected')
    const result: any[] = await this.db.select(
      'SELECT value_json FROM settings WHERE key = ?',
      [key]
    )
    if (result.length > 0) {
      try {
        return JSON.parse(result[0].value_json)
      } catch {
        return null
      }
    }
    return null
  }
  
  async saveSettings(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute(
      `INSERT INTO settings (key, value_json, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET 
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
      [key, JSON.stringify(value)]
    )
  }
  
  // Get API keys helper
  async getApiKeys(): Promise<{ youtube: string; apify: string; moonshot: string }> {
    const keys = await this.getSettings('api_keys')
    return {
      youtube: keys?.youtube || '',
      apify: keys?.apify || '',
      moonshot: keys?.moonshot || ''
    }
  }
}

export const dbService = new DatabaseService()