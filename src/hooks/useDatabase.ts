import { useState, useCallback } from 'react'
import Database from '@tauri-apps/plugin-sql'

export function useDatabase() {
  const [db, setDb] = useState<Database | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const initializeDatabase = useCallback(async (dbPath: string) => {
    try {
      const database = await Database.load(`sqlite:${dbPath}`)
      
      // Create tables
      await database.execute(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#8b5cf6',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT 1
        )
      `)

      await database.execute(`
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          stage TEXT CHECK(stage IN ('brief', 'production', 'ready', 'posted')) DEFAULT 'brief',
          priority INTEGER DEFAULT 0,
          due_date DATETIME,
          platform TEXT CHECK(platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'both')),
          target_hashtags TEXT,
          file_links TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        )
      `)

      await database.execute(`
        CREATE TABLE IF NOT EXISTS performance_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL,
          platform TEXT NOT NULL,
          views INTEGER,
          likes INTEGER,
          comments INTEGER,
          shares INTEGER,
          watch_time REAL,
          ctr REAL,
          is_organic BOOLEAN DEFAULT 1,
          recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id)
        )
      `)

      await database.execute(`
        CREATE TABLE IF NOT EXISTS trending_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          trend_type TEXT NOT NULL,
          name TEXT NOT NULL,
          popularity_score INTEGER,
          video_count INTEGER,
          suggestion_text TEXT,
          fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await database.execute(`
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

      await database.execute(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER,
          report_type TEXT CHECK(report_type IN ('one-page', 'quarterly')),
          generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          file_path TEXT,
          metrics_summary TEXT
        )
      `)

      setDb(database)
      setIsInitialized(true)
    } catch (error) {
      console.error('Failed to initialize database:', error)
      setIsInitialized(false)
    }
  }, [])

  return { db, isInitialized, initializeDatabase }
}