# Content Hub — Feature Request for Claude Opus 4.6

## Project Overview
Content Hub is a Tauri v2 desktop app for managing social media content workflows. It uses:
- **Backend**: Rust (Tauri v2)
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn/ui
- **Database**: SQLite via Tauri SQL plugin
- **State Management**: Zustand

## Database Schema (Current)

### Tables
```sql
-- workspaces
id, name, color, sort_order, created_at, is_active

-- jobs
id, workspace_id, title, description, stage, priority, due_date, 
platform, target_hashtags, file_links, live_url, live_metrics, 
created_at, updated_at

-- templates
id, name, description, default_platform, default_hashtags, created_at

-- trending_items
id, platform, trend_type, name, popularity_score, video_count, 
post_count, avg_engagement, total_engagement, suggestion_text, 
top_posts, created_at

-- settings
key, value
```

### JobStage Type (Current - Hardcoded)
```typescript
type JobStage = 'brief' | 'production' | 'ready' | 'posted' | 'archive'
```

### Kanban Columns (Current - Hardcoded in KanbanBoard.tsx)
```typescript
const COLUMNS = [
  { id: 'brief', title: 'Brief', color: 'bg-slate-500' },
  { id: 'production', title: 'In Production', color: 'bg-blue-500' },
  { id: 'ready', title: 'Ready for Posting', color: 'bg-amber-500' },
  { id: 'posted', title: 'Posted', color: 'bg-emerald-500' },
  { id: 'archive', title: 'Archive', color: 'bg-gray-600' },
]
```

---

## Feature 1: Custom Fields in New Job Dialog

### Requirements
Allow users to add, edit, and delete custom fields when creating a new job. These fields should be stored with the job and displayed in the job detail view.

### Implementation Details

1. **Database Changes**
   - Add `custom_fields` column to `jobs` table (JSON string)
   - Migration: alter table to add column if not exists

2. **Types Updates** (`src/types/index.ts`)
   ```typescript
   export interface CustomField {
     id: string
     label: string
     value: string
   }
   
   export interface Job {
     // ... existing fields
     custom_fields: CustomField[] | null
   }
   ```

3. **NewJobDialog Component** (`src/components/NewJobDialog.tsx`)
   - Add state: `customFields: CustomField[]`
   - Add UI section below file attachments:
     - List of existing custom fields (label + value inputs + delete button)
     - "Add Field" button that adds a new empty field row
     - Each field has: label input, value input, delete button
   - Include custom fields in form submission

4. **JobDetail Component** (`src/components/JobDetail.tsx`)
   - Display custom fields in view mode
   - Allow editing custom fields in edit mode

5. **Database Service** (`src/services/database.ts`)
   - Update `createJob()` to handle custom_fields
   - Update `updateJob()` to handle custom_fields
   - Update `getJobs()` to parse custom_fields JSON

---

## Feature 2: Workspace-Specific Kanban Columns

### Requirements
Allow users to rename, add, and delete kanban columns per workspace. Changes should only affect the current workspace, not all workspaces.

### Implementation Details

1. **Database Changes**
   - New table: `workspace_columns`
   ```sql
   CREATE TABLE workspace_columns (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     workspace_id INTEGER NOT NULL,
     column_id TEXT NOT NULL,  -- unique identifier (e.g., 'brief', 'custom-1')
     title TEXT NOT NULL,
     color TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0,
     is_default BOOLEAN DEFAULT 0,  -- true for system columns
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
     UNIQUE(workspace_id, column_id)
   )
   ```
   
   - Migration: populate with default columns for existing workspaces

2. **Types Updates** (`src/types/index.ts`)
   ```typescript
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
   ```

3. **JobStore Updates** (`src/store/jobStore.ts`)
   - Add state: `workspaceColumns: WorkspaceColumn[]`
   - Add actions:
     - `loadWorkspaceColumns(workspaceId)`
     - `addWorkspaceColumn(workspaceId, title, color)`
     - `updateWorkspaceColumn(id, updates)`
     - `deleteWorkspaceColumn(id)`
     - `reorderWorkspaceColumns(orderedIds)`

4. **KanbanBoard Component** (`src/components/KanbanBoard.tsx`)
   - Replace hardcoded `COLUMNS` with dynamic columns from store
   - Load columns for current workspace on mount
   - Add column management UI:
     - Column header dropdown menu with: Rename, Change Color, Delete
     - "Add Column" button at end of board
   - Handle empty state when all columns deleted

5. **Database Service** (`src/services/database.ts`)
   - Add methods:
     - `getWorkspaceColumns(workspaceId)`
     - `createWorkspaceColumn(workspaceId, columnId, title, color, sortOrder)`
     - `updateWorkspaceColumn(id, updates)`
     - `deleteWorkspaceColumn(id)`
     - `reorderWorkspaceColumns(orderedIds)`
   - Update `initializeDatabase()` to create default columns for new workspaces

6. **Column Management UI** (new or in KanbanBoard)
   - Rename: inline edit or dialog
   - Color picker: preset colors or color input
   - Delete: confirmation dialog, prevent deletion if jobs exist in column
   - Add: dialog with title input and color picker

### Important Constraints
- When deleting a column, either:
  - Require user to move jobs to another column first, OR
  - Move all jobs to a default column (e.g., first column)
- Default columns (brief, production, ready, posted, archive) should be deletable but recreatable
- Column IDs for custom columns should be unique (use UUID or timestamp)
- Colors should be Tailwind classes (e.g., 'bg-blue-500', 'bg-purple-500')

---

## File Locations to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add CustomField, WorkspaceColumn interfaces; update Job interface |
| `src/services/database.ts` | Add DB methods for custom fields and workspace columns; update migrations |
| `src/store/jobStore.ts` | Add state and actions for workspace columns |
| `src/components/NewJobDialog.tsx` | Add custom fields UI |
| `src/components/JobDetail.tsx` | Display/edit custom fields |
| `src/components/KanbanBoard.tsx` | Dynamic columns, column management UI |
| `src-tauri/src/lib.rs` | May need Rust-side DB migration support |

---

## Testing Checklist

### Custom Fields
- [ ] Add multiple custom fields in New Job dialog
- [ ] Delete custom fields before submitting
- [ ] Create job with custom fields
- [ ] View custom fields in Job Detail
- [ ] Edit custom fields in Job Detail
- [ ] Custom fields persist after app restart

### Workspace Columns
- [ ] Rename a column (e.g., "Brief" → "Jobs")
- [ ] Add a new column to a workspace
- [ ] Delete a column from a workspace
- [ ] Verify column changes only affect current workspace
- [ ] Create job in custom column
- [ ] Move job between columns (including custom ones)
- [ ] Column order persists after app restart
- [ ] Switch workspaces and see different column configs

---

## Notes
- The app uses snake_case in database, camelCase in TypeScript
- Database service methods should handle JSON serialization for array/object fields
- UI uses shadcn/ui components (Dialog, Button, Input, Select, etc.)
- Follow existing patterns in the codebase for consistency
- Ensure TypeScript types are strict
