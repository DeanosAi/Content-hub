import Database from '@tauri-apps/plugin-sql'
import { CalendarEvent, Job, Workspace, Template, JobStage, WorkspaceColumn } from '@/types'

class DatabaseService {
  private db: Database | null = null
  
  async connect(dbPath: string): Promise<void> {
    try {
      console.log('Connecting to database:', dbPath)
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
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS workspace_columns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_default BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE(workspace_id, column_id)
      )
    `)

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        end_date TEXT,
        start_time TEXT,
        end_time TEXT,
        category TEXT,
        location TEXT,
        color TEXT,
        recurrence TEXT DEFAULT 'none',
        source TEXT NOT NULL DEFAULT 'manual',
        external_url TEXT,
        linked_job_id INTEGER,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
        FOREIGN KEY (linked_job_id) REFERENCES jobs(id) ON DELETE SET NULL
      )
    `)
    
    await this.ensureJobsColumns()
    await this.ensureCalendarEventColumns()
    await this.ensureWorkspaceColumns()
    await this.seedRecurringCalendarEvents()
    
    console.log('Database initialization complete')
  }
  
  private async ensureJobsColumns(): Promise<void> {
    if (!this.db) return
    
    try {
      const columns: any[] = await this.db.select('PRAGMA table_info(jobs)')
      const hasLiveUrl = columns.some(col => col.name === 'live_url')
      const hasLiveMetrics = columns.some(col => col.name === 'live_metrics_json')
      const hasInstagramLiveUrl = columns.some(col => col.name === 'instagram_live_url')
      const hasFacebookLiveUrl = columns.some(col => col.name === 'facebook_live_url')
      const hasPlatformMetrics = columns.some(col => col.name === 'platform_metrics_json')
      const hasCustomFields = columns.some(col => col.name === 'custom_fields_json')
      
      if (!hasLiveUrl) await this.db.execute('ALTER TABLE jobs ADD COLUMN live_url TEXT')
      if (!hasLiveMetrics) await this.db.execute('ALTER TABLE jobs ADD COLUMN live_metrics_json TEXT')
      if (!hasInstagramLiveUrl) await this.db.execute('ALTER TABLE jobs ADD COLUMN instagram_live_url TEXT')
      if (!hasFacebookLiveUrl) await this.db.execute('ALTER TABLE jobs ADD COLUMN facebook_live_url TEXT')
      if (!hasPlatformMetrics) await this.db.execute('ALTER TABLE jobs ADD COLUMN platform_metrics_json TEXT')
      if (!hasCustomFields) await this.db.execute('ALTER TABLE jobs ADD COLUMN custom_fields_json TEXT')
    } catch (error) {
      console.error('Failed to ensure jobs columns:', error)
    }
  }
  
  private async ensureWorkspaceColumns(): Promise<void> {
    if (!this.db) return
    
    try {
      const workspaces: any[] = await this.db.select('SELECT id FROM workspaces')
      for (const ws of workspaces) {
        await this.ensureDefaultColumnsForWorkspace(ws.id)
      }
    } catch (error) {
      console.error('Failed to ensure workspace columns:', error)
    }
  }
  
  private async ensureDefaultColumnsForWorkspace(workspaceId: number): Promise<void> {
    if (!this.db) return
    
    const existing: any[] = await this.db.select(
      'SELECT COUNT(*) as count FROM workspace_columns WHERE workspace_id = ?',
      [workspaceId]
    )
    
    if (existing[0]?.count === 0) {
      const defaults = [
        { column_id: 'brief', title: 'Brief', color: 'bg-slate-500', sort_order: 0 },
        { column_id: 'production', title: 'In Production', color: 'bg-blue-500', sort_order: 1 },
        { column_id: 'ready', title: 'Ready for Posting', color: 'bg-amber-500', sort_order: 2 },
        { column_id: 'posted', title: 'Posted', color: 'bg-emerald-500', sort_order: 3 },
        { column_id: 'archive', title: 'Archive', color: 'bg-gray-600', sort_order: 4 },
      ]
      
      for (const col of defaults) {
        await this.db.execute(
          `INSERT INTO workspace_columns (workspace_id, column_id, title, color, sort_order, is_default)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [workspaceId, col.column_id, col.title, col.color, col.sort_order, 1]
        )
      }
    }
  }
  
  private async migrateJobsTable(): Promise<void> {
    if (!this.db) return
    
    try {
      await this.db.execute('PRAGMA foreign_keys = OFF')
      await this.db.execute(`
        INSERT INTO jobs (workspace_id, title, platform) 
        VALUES (0, '__migration_test__', '["instagram","tiktok"]')
      `)
      await this.db.execute(`DELETE FROM jobs WHERE title = '__migration_test__'`)
      await this.db.execute('PRAGMA foreign_keys = ON')
      return
    } catch (error: any) {
      await this.db.execute('PRAGMA foreign_keys = ON')
      const errorStr = error?.message || error?.toString?.() || String(error)
      if (!errorStr.includes('CHECK constraint')) return
    }
    
    try {
      await this.db.execute('PRAGMA foreign_keys = OFF')
      await this.db.execute('DROP TABLE IF EXISTS jobs_new')
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
      await this.db.execute(`INSERT INTO jobs_new SELECT * FROM jobs WHERE title != '__migration_test__'`)
      await this.db.execute('DROP TABLE jobs')
      await this.db.execute('ALTER TABLE jobs_new RENAME TO jobs')
      await this.db.execute('PRAGMA foreign_keys = ON')
    } catch (error) {
      console.error('Migration failed:', error)
      await this.db.execute('PRAGMA foreign_keys = ON')
      try {
        await this.db.execute('DROP TABLE IF EXISTS jobs_new')
        await this.db.execute(`DELETE FROM jobs WHERE title = '__migration_test__'`)
      } catch {
        // ignore
      }
      throw error
    }
  }

  private async ensureCalendarEventColumns(): Promise<void> {
    if (!this.db) return

    try {
      const columns: any[] = await this.db.select('PRAGMA table_info(calendar_events)')
      const hasColor = columns.some(col => col.name === 'color')
      const hasRecurrence = columns.some(col => col.name === 'recurrence')
      if (!hasColor) await this.db.execute('ALTER TABLE calendar_events ADD COLUMN color TEXT')
      if (!hasRecurrence) await this.db.execute("ALTER TABLE calendar_events ADD COLUMN recurrence TEXT DEFAULT 'none'")
    } catch (error) {
      console.error('Failed to ensure calendar event columns:', error)
    }
  }

  private async seedRecurringCalendarEvents(): Promise<void> {
    if (!this.db) return

    try {
      const existing: any[] = await this.db.select(
        `SELECT COUNT(*) as count FROM calendar_events WHERE source = 'seeded'`
      )
      if ((existing[0]?.count || 0) > 20) return

      const currentYear = new Date().getFullYear()
      const years = [currentYear, currentYear + 1]
      for (const year of years) {
        const seeded = this.buildAustralianRecurringEvents(year)
        for (const event of seeded) {
          await this.db.execute(
            `INSERT INTO calendar_events (workspace_id, title, description, event_date, end_date, start_time, end_time, category, location, source, external_url, linked_job_id, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              null,
              event.title,
              event.description,
              event.event_date,
              event.end_date,
              event.start_time,
              event.end_time,
              event.category,
              event.location,
              event.source,
              event.external_url,
              event.linked_job_id,
              event.metadata_json,
            ]
          )
        }
      }
    } catch (error) {
      console.error('Failed to seed calendar events:', error)
    }
  }

  private buildAustralianRecurringEvents(year: number): Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>[] {
    const easter = this.calculateEaster(year)
    const goodFriday = new Date(easter)
    goodFriday.setDate(easter.getDate() - 2)
    const easterMonday = new Date(easter)
    easterMonday.setDate(easter.getDate() + 1)

    return [
      this.buildSeedEvent('New Year\'s Day', `${year}-01-01`, 'National', 'National public holiday in Australia'),
      this.buildSeedEvent('Australia Day', `${year}-01-26`, 'National', 'National day of Australia'),
      this.buildSeedEvent('Good Friday', this.toDateString(goodFriday), 'Holiday', 'Public holiday during Easter'),
      this.buildSeedEvent('Easter Sunday', this.toDateString(easter), 'Holiday', 'Easter Sunday'),
      this.buildSeedEvent('Easter Monday', this.toDateString(easterMonday), 'Holiday', 'Public holiday after Easter Sunday'),
      this.buildSeedEvent('ANZAC Day', `${year}-04-25`, 'National', 'Australia and New Zealand Army Corps remembrance day'),
      this.buildSeedEvent('Mother\'s Day', this.nthWeekdayOfMonth(year, 4, 0, 2), 'Seasonal', 'Second Sunday of May'),
      this.buildSeedEvent('Father\'s Day', this.nthWeekdayOfMonth(year, 8, 0, 1), 'Seasonal', 'First Sunday of September'),
      this.buildSeedEvent('Halloween', `${year}-10-31`, 'Seasonal', 'Popular campaign and themed content opportunity'),
      this.buildSeedEvent('Melbourne Cup', this.nthWeekdayOfMonth(year, 10, 2, 1), 'Sport', 'First Tuesday of November'),
      this.buildSeedEvent('Black Friday', this.lastWeekdayOfMonth(year, 10, 5), 'Retail', 'Late November retail sales event'),
      this.buildSeedEvent('Christmas Day', `${year}-12-25`, 'Holiday', 'Christmas Day'),
      this.buildSeedEvent('Boxing Day', `${year}-12-26`, 'Holiday', 'Boxing Day'),
      this.buildSeedEvent('New Year\'s Eve', `${year}-12-31`, 'Seasonal', 'End of year event'),
    ]
  }

  private buildSeedEvent(title: string, eventDate: string, category: string, description: string): Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> {
    return {
      workspace_id: null,
      title,
      description,
      event_date: eventDate,
      end_date: null,
      start_time: null,
      end_time: null,
      category,
      location: 'Australia',
      color: this.getCategoryColor(category),
      recurrence: 'year',
      source: 'seeded',
      external_url: null,
      linked_job_id: null,
      metadata_json: JSON.stringify({ seeded: true }),
    }
  }

  private getCategoryColor(category: string): string {
    const normalized = category.toLowerCase()
    if (normalized.includes('holiday')) return 'bg-emerald-500'
    if (normalized.includes('national')) return 'bg-blue-500'
    if (normalized.includes('sport')) return 'bg-orange-500'
    if (normalized.includes('retail')) return 'bg-pink-500'
    if (normalized.includes('seasonal')) return 'bg-violet-500'
    return 'bg-slate-500'
  }

  private calculateEaster(year: number): Date {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(year, month - 1, day)
  }

  private nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, occurrence: number): string {
    const date = new Date(year, monthIndex, 1)
    while (date.getDay() !== weekday) {
      date.setDate(date.getDate() + 1)
    }
    date.setDate(date.getDate() + (occurrence - 1) * 7)
    return this.toDateString(date)
  }

  private lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): string {
    const date = new Date(year, monthIndex + 1, 0)
    while (date.getDay() !== weekday) {
      date.setDate(date.getDate() - 1)
    }
    return this.toDateString(date)
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0]
  }
  
  async getWorkspaces(): Promise<Workspace[]> {
    if (!this.db) throw new Error('Database not connected')
    try {
      return await this.db.select('SELECT * FROM workspaces WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC')
    } catch {
      return await this.db.select('SELECT * FROM workspaces WHERE is_active = 1 ORDER BY created_at DESC')
    }
  }
  
  async createWorkspace(name: string, color: string = '#8b5cf6'): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    try {
      try {
        const result = await this.db.execute(
          'INSERT INTO workspaces (name, color, sort_order) VALUES (?, ?, ?)',
          [name, color, 0]
        )
        return result.lastInsertId ?? 0
      } catch {
        const result = await this.db.execute(
          'INSERT INTO workspaces (name, color) VALUES (?, ?)',
          [name, color]
        )
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
      if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
        return
      }
      throw error
    }
  }
  
  async getJobs(workspaceId: number): Promise<Job[]> {
    if (!this.db) throw new Error('Database not connected')
    try {
      const rows: any[] = await this.db.select(
        'SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC, id DESC',
        [workspaceId]
      )
      return rows.map((row: any) => ({
        ...row,
        platform: row.platform ? JSON.parse(row.platform) : null,
        live_metrics: row.live_metrics_json ? JSON.parse(row.live_metrics_json) : null,
        instagram_live_url: row.instagram_live_url ?? null,
        facebook_live_url: row.facebook_live_url ?? null,
        platform_metrics: row.platform_metrics_json ? JSON.parse(row.platform_metrics_json) : null,
        custom_fields: row.custom_fields_json ? JSON.parse(row.custom_fields_json) : null
      }))
    } catch (error: any) {
      if (error?.message?.includes('no such column')) {
        const rows: any[] = await this.db.select(
          'SELECT id, workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links, created_at, updated_at FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC, id DESC',
          [workspaceId]
        )
        return rows.map((row: any) => ({
          ...row,
          platform: row.platform ? JSON.parse(row.platform) : null,
          live_url: null,
          live_metrics: null,
          instagram_live_url: null,
          facebook_live_url: null,
          platform_metrics: null,
          custom_fields: null
        }))
      }
      throw error
    }
  }
  
  async createJob(jobData: Omit<Job, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    try {
      try {
        const result = await this.db.execute(
          `INSERT INTO jobs (workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links, live_url, live_metrics_json, instagram_live_url, facebook_live_url, platform_metrics_json, custom_fields_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jobData.workspace_id,
            jobData.title,
            jobData.description,
            jobData.stage,
            jobData.priority,
            jobData.due_date,
            jobData.platform ? JSON.stringify(jobData.platform) : null,
            jobData.target_hashtags,
            jobData.file_links,
            jobData.live_url,
            jobData.live_metrics ? JSON.stringify(jobData.live_metrics) : null,
            jobData.instagram_live_url ?? null,
            jobData.facebook_live_url ?? null,
            jobData.platform_metrics ? JSON.stringify(jobData.platform_metrics) : null,
            jobData.custom_fields ? JSON.stringify(jobData.custom_fields) : null,
          ]
        )
        return result.lastInsertId ?? 0
      } catch (error: any) {
        if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
          const result = await this.db.execute(
            `INSERT INTO jobs (workspace_id, title, description, stage, priority, due_date, platform, target_hashtags, file_links)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobData.workspace_id, jobData.title, jobData.description, jobData.stage, jobData.priority, jobData.due_date, jobData.platform ? JSON.stringify(jobData.platform) : null, jobData.target_hashtags, jobData.file_links]
          )
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
      const processedUpdates: any = { ...updates }
      if (updates.platform) processedUpdates.platform = JSON.stringify(updates.platform)
      if ('live_metrics' in processedUpdates) {
        processedUpdates.live_metrics_json = updates.live_metrics ? JSON.stringify(updates.live_metrics) : null
        delete processedUpdates.live_metrics
      }
      if ('platform_metrics' in processedUpdates) {
        processedUpdates.platform_metrics_json = updates.platform_metrics ? JSON.stringify(updates.platform_metrics) : null
        delete processedUpdates.platform_metrics
      }
      if ('custom_fields' in processedUpdates) {
        processedUpdates.custom_fields_json = updates.custom_fields ? JSON.stringify(updates.custom_fields) : null
        delete processedUpdates.custom_fields
      }
      if (updates.live_url !== undefined) processedUpdates.live_url = updates.live_url
      if (updates.instagram_live_url !== undefined) processedUpdates.instagram_live_url = updates.instagram_live_url
      if (updates.facebook_live_url !== undefined) processedUpdates.facebook_live_url = updates.facebook_live_url
      const fields = Object.keys(processedUpdates).map(key => `${key} = ?`).join(', ')
      const values = Object.values(processedUpdates)
      await this.db.execute(`UPDATE jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id])
    } catch (error: any) {
      if (error?.message?.includes('no such column')) {
        const processedUpdates: any = { ...updates }
        if (updates.platform) processedUpdates.platform = JSON.stringify(updates.platform)
        delete processedUpdates.live_url
        delete processedUpdates.live_metrics
        delete processedUpdates.live_metrics_json
        delete processedUpdates.instagram_live_url
        delete processedUpdates.facebook_live_url
        delete processedUpdates.platform_metrics
        delete processedUpdates.platform_metrics_json
        delete processedUpdates.custom_fields
        delete processedUpdates.custom_fields_json
        if (Object.keys(processedUpdates).length === 0) return
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
  
  async getTemplates(): Promise<Template[]> {
    if (!this.db) throw new Error('Database not connected')
    return await this.db.select('SELECT * FROM templates ORDER BY created_at DESC')
  }
  
  async createTemplate(templateData: Omit<Template, 'id' | 'created_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(
      'INSERT INTO templates (name, description, default_platform, default_hashtags, default_description) VALUES (?, ?, ?, ?, ?)',
      [templateData.name, templateData.description, templateData.default_platform, templateData.default_hashtags, templateData.default_description]
    )
    return result.lastInsertId ?? 0
  }
  
  async deleteTemplate(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM templates WHERE id = ?', [id])
  }
  
  async getTrendingItems(): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected')
    const rows: any[] = await this.db.select('SELECT * FROM trending_cache ORDER BY avg_engagement DESC, popularity_score DESC')
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
          item.top_posts ? JSON.stringify(item.top_posts) : null,
        ]
      )
    } catch (error: any) {
      if (error?.message?.includes('no such column') || error?.toString?.()?.includes('no such column')) {
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
    await this.clearTrendingCache()
    for (const item of items) {
      try {
        await this.saveTrendingItem(item)
      } catch (err) {
        console.error(`Failed to save trend "${item.name}":`, err)
      }
    }
  }
  
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

  async getCalendarEvents(workspaceId?: number | null, startDate?: string, endDate?: string): Promise<CalendarEvent[]> {
    if (!this.db) throw new Error('Database not connected')
    let query = 'SELECT * FROM calendar_events WHERE 1 = 1'
    const params: any[] = []

    if (workspaceId !== undefined && workspaceId !== null) {
      query += ' AND (workspace_id = ? OR workspace_id IS NULL)'
      params.push(workspaceId)
    }

    if (startDate) {
      query += ' AND event_date >= ?'
      params.push(startDate)
    }

    if (endDate) {
      query += ' AND event_date <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY event_date ASC, start_time ASC, created_at ASC'
    return await this.db.select(query, params)
  }

  async createCalendarEvent(event: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(
      `INSERT INTO calendar_events (workspace_id, title, description, event_date, end_date, start_time, end_time, category, location, color, recurrence, source, external_url, linked_job_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.workspace_id,
        event.title,
        event.description,
        event.event_date,
        event.end_date,
        event.start_time,
        event.end_time,
        event.category,
        event.location,
        event.color ?? null,
        event.recurrence ?? 'none',
        event.source,
        event.external_url,
        event.linked_job_id,
        event.metadata_json,
      ]
    )
    return result.lastInsertId ?? 0
  }

  async updateCalendarEvent(id: number, updates: Partial<CalendarEvent>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    const processedUpdates = { ...updates }
    delete (processedUpdates as any).id
    delete (processedUpdates as any).created_at
    delete (processedUpdates as any).updated_at
    const fields = Object.keys(processedUpdates).map(key => `${key} = ?`).join(', ')
    const values = Object.values(processedUpdates)
    if (!fields) return
    await this.db.execute(`UPDATE calendar_events SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id])
  }

  async deleteCalendarEvent(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM calendar_events WHERE id = ?', [id])
  }
  
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
  
  async getApiKeys(): Promise<{ youtube: string; apify: string; moonshot: string }> {
    const keys = await this.getSettings('api_keys')
    return {
      youtube: keys?.youtube || '',
      apify: keys?.apify || '',
      moonshot: keys?.moonshot || ''
    }
  }
  
  async getWorkspaceColumns(workspaceId: number): Promise<WorkspaceColumn[]> {
    if (!this.db) throw new Error('Database not connected')
    await this.ensureDefaultColumnsForWorkspace(workspaceId)
    return await this.db.select(
      'SELECT * FROM workspace_columns WHERE workspace_id = ? ORDER BY sort_order ASC',
      [workspaceId]
    )
  }
  
  async createWorkspaceColumn(workspaceId: number, columnId: string, title: string, color: string, sortOrder: number): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result = await this.db.execute(
      `INSERT INTO workspace_columns (workspace_id, column_id, title, color, sort_order, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workspaceId, columnId, title, color, sortOrder, 0]
    )
    return result.lastInsertId ?? 0
  }
  
  async updateWorkspaceColumn(id: number, updates: Partial<WorkspaceColumn>): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = Object.values(updates)
    await this.db.execute(`UPDATE workspace_columns SET ${fields} WHERE id = ?`, [...values, id])
  }
  
  async deleteWorkspaceColumn(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    await this.db.execute('DELETE FROM workspace_columns WHERE id = ?', [id])
  }
  
  async reorderWorkspaceColumns(orderedIds: number[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected')
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.execute('UPDATE workspace_columns SET sort_order = ? WHERE id = ?', [i, orderedIds[i]])
    }
  }
  
  async getColumnJobCount(columnId: string, workspaceId: number): Promise<number> {
    if (!this.db) throw new Error('Database not connected')
    const result: any[] = await this.db.select(
      'SELECT COUNT(*) as count FROM jobs WHERE stage = ? AND workspace_id = ?',
      [columnId, workspaceId]
    )
    return result[0]?.count || 0
  }
}

export const dbService = new DatabaseService()
