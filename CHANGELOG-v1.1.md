# Content Hub v1.1 - Changelog

## New Features

### 1. Custom Fields in Jobs
- Add, edit, and delete custom fields when creating or editing jobs
- Each field has a label and value (e.g., "Client: ABC Corp", "Budget: $5000")
- Custom fields are displayed in job cards (preview shows first 2 fields)
- Full custom fields visible in job detail view
- Stored as JSON in the database

### 2. Workspace-Specific Kanban Columns
- Each workspace now has its own set of kanban columns
- **Rename columns**: Click the settings icon on any column header
- **Add columns**: Click "Add Column" button at the end of the board
- **Delete columns**: Use the settings dropdown (jobs in deleted column move to first column)
- **19 color options** available for column customization
- Changes are isolated per workspace
- Default columns are created for new workspaces: Brief, In Production, Ready for Posting, Posted, Archive

## Database Changes

### New Table: `workspace_columns`
```sql
CREATE TABLE workspace_columns (
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
```

### Modified Table: `jobs`
- Added `custom_fields_json` column to store custom fields as JSON

## Files Modified

| File | Changes |
|------|---------|
| `src/types/index.ts` | Added `CustomField` and `WorkspaceColumn` interfaces; updated `Job` interface |
| `src/services/database.ts` | Added workspace column methods; custom fields support; migration logic |
| `src/store/jobStore.ts` | Added workspace column state and actions |
| `src/components/NewJobDialog.tsx` | Added custom fields UI |
| `src/components/JobDetail.tsx` | Added custom fields display and editing |
| `src/components/KanbanBoard.tsx` | Complete rewrite for dynamic workspace columns |
| `package.json` | Version bump to 1.1.0 |
| `src-tauri/tauri.conf.json` | Version bump to 1.1.0 |
| `src-tauri/Cargo.toml` | Version bump to 1.1.0 |

## Migration Notes
- Existing databases will be automatically migrated
- Default columns will be created for existing workspaces
- The `custom_fields_json` column will be added to existing jobs tables
- No data loss - all existing jobs and workspaces are preserved

## Build Instructions

### Development
```bash
npm run tauri-dev
```

### Production Build (Windows)
```bash
npm run tauri-build
```

### Production Build (macOS)
```bash
npm run tauri-build -- --target universal-apple-darwin
```

Builds will be output to:
- Windows: `src-tauri/target/release/bundle/`
- macOS: `src-tauri/target/universal-apple-darwin/release/bundle/`
