You are Claude Opus reviewing a local Tauri + React app called Content Hub.

Project path:
`C:\Users\deano\Projects\content-hub`

Your task:
Diagnose and fix the **Kimi calendar import flow** without breaking the rest of the working app.

## Current situation
The app is largely working and already includes:
- Dashboard / kanban workflow
- Workspace-specific columns
- Custom job fields
- Calendar page
- Week / Month / Year calendar views
- Manual calendar events
- Recurring events
- Event colors
- Create/link jobs from events
- Reports automation
- Delete/cancel cleanup pass

## Problem to solve
The broken area is the **Kimi calendar import** flow.

In the app, the user goes to Calendar → "Import with Kimi" and enters a prompt like:

`please place all of the round 1 world FIFA world cup games on the calendar with kick off times and the name of the teams playing.`

Observed failures:
1. Sometimes returns:
   - `Kimi API error (429): {"error":{"message":"The engine is currently overloaded, please try again later","type":"engine_overloaded_error"}}`
2. After retrying, often returns:
   - `Kimi response could not be parsed into calendar events.`

## Important constraints
- Do NOT redesign the app from scratch.
- Do NOT remove working features.
- Make the smallest robust fix that gets Kimi import working reliably.
- Preserve the current UI and current calendar feature set.
- If you change parsing, make it more tolerant of messy model output.
- If you change prompting, keep it practical and production-safe.
- If you add logging/debug helpers, keep them lightweight.

## Likely files involved
Please inspect at minimum:
- `src/services/calendarAi.ts`
- `src/components/CalendarPage.tsx`
- any relevant types/store/database files if needed

## What I want from you
1. Identify the exact failure mode(s)
2. Fix the Kimi import flow
3. Ensure the app still builds cleanly
4. Summarize the changes clearly
5. If helpful, improve retry / parse recovery / response normalization

## Nice-to-have
If the model still cannot guarantee valid JSON, implement a more resilient extraction strategy so that useful event rows can still be recovered when the response contains prose plus structured fragments.

## Output requested
Please provide:
- concise diagnosis
- files changed
- what you changed
- why it should now work
- any remaining limitations
