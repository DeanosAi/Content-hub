# Content Hub

A Tauri v2 desktop application for content production workflow management.

## Features

- Multi-workspace kanban board (Brief → Production → Ready → Posted)
- Job management with drag-and-drop
- Trending analysis (manual trigger)
- Performance tracking (YouTube API, Instagram CSV import, TikTok via Apify)
- C-suite reporting (PDF/HTML export)
- Dark mode by default
- User-selectable SQLite database path

## Tech Stack

- Tauri v2
- React 18 + TypeScript
- Tailwind CSS
- shadcn/ui components
- SQLite via Tauri SQL plugin
- @hello-pangea/dnd for kanban
- Recharts for analytics
- Zustand for state management

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri-dev

# Build for production
npm run tauri-build
```

## API Keys

The following API keys are configured:
- YouTube Data API v3
- Apify API (for TikTok scraping)

## Database

SQLite database is stored at a user-selected location. Default tables:
- workspaces
- jobs
- performance_metrics
- trending_cache
- templates
- reports

## License

MIT