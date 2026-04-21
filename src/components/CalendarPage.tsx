import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Link2, Trash2, CheckCircle2, Sparkles, Loader2, Unlink, Briefcase } from 'lucide-react'
import { CalendarEvent, CalendarImportItem, CalendarRecurrence, CalendarView } from '@/types'
import { useJobStore } from '@/store/jobStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { importCalendarEventsWithKimi } from '@/services/calendarAi'
import { dbService } from '@/services/database'

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const RECURRENCE_OPTIONS: { value: CalendarRecurrence; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'day', label: 'Every day' },
  { value: 'week', label: 'Every week' },
  { value: 'fortnight', label: 'Every fortnight' },
  { value: 'month', label: 'Every month' },
  { value: 'year', label: 'Every year' },
]

const COLOR_OPTIONS = [
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-emerald-500', label: 'Green' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-pink-500', label: 'Pink' },
  { value: 'bg-violet-500', label: 'Violet' },
  { value: 'bg-slate-500', label: 'Slate' },
]

const EMPTY_EVENT = {
  title: '',
  description: '',
  event_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: '',
  start_time: '',
  end_time: '',
  category: '',
  location: '',
  recurrence: 'none' as CalendarRecurrence,
  color: 'bg-blue-500',
}

const categoryToColor = (category?: string | null) => {
  const normalized = (category || '').toLowerCase()
  if (normalized.includes('holiday')) return 'bg-emerald-500'
  if (normalized.includes('national')) return 'bg-blue-500'
  if (normalized.includes('sport')) return 'bg-orange-500'
  if (normalized.includes('retail')) return 'bg-pink-500'
  if (normalized.includes('seasonal')) return 'bg-violet-500'
  return 'bg-blue-500'
}

export function CalendarPage() {
  const {
    calendarEvents,
    jobs,
    selectedWorkspace,
    loadCalendarEvents,
    loadJobs,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    addJob,
  } = useJobStore()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>('month')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [eventForm, setEventForm] = useState(EMPTY_EVENT)
  const [jobCreatedMessage, setJobCreatedMessage] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPrompt, setImportPrompt] = useState('')
  const [importSummary, setImportSummary] = useState('')
  const [importPreview, setImportPreview] = useState<CalendarImportItem[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [selectedJobToLink, setSelectedJobToLink] = useState<string>('none')
  const [linkMessage, setLinkMessage] = useState<string | null>(null)

  const getEventMetadata = (event: CalendarEvent | null) => {
    if (!event?.metadata_json) return {}
    try {
      return JSON.parse(event.metadata_json)
    } catch {
      return {}
    }
  }

  useEffect(() => {
    loadCalendarEvents()
    loadJobs()
  }, [loadCalendarEvents, loadJobs, selectedWorkspace])

  useEffect(() => {
    if (!jobCreatedMessage) return
    const timeout = setTimeout(() => setJobCreatedMessage(null), 3000)
    return () => clearTimeout(timeout)
  }, [jobCreatedMessage])

  useEffect(() => {
    if (!importSuccess) return
    const timeout = setTimeout(() => setImportSuccess(null), 3500)
    return () => clearTimeout(timeout)
  }, [importSuccess])

  useEffect(() => {
    if (!linkMessage) return
    const timeout = setTimeout(() => setLinkMessage(null), 3000)
    return () => clearTimeout(timeout)
  }, [linkMessage])

  const range = useMemo(() => {
    if (view === 'week') {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }
    }

    if (view === 'year') {
      return {
        start: new Date(currentDate.getFullYear(), 0, 1),
        end: new Date(currentDate.getFullYear(), 11, 31),
      }
    }

    return {
      start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
    }
  }, [currentDate, view])

  const visibleDays = eachDayOfInterval(range)

  const expandedEvents = useMemo(() => {
    const rangeEnd = view === 'year'
      ? new Date(currentDate.getFullYear(), 11, 31)
      : range.end

    const instances: CalendarEvent[] = []

    const pushInstance = (event: CalendarEvent, eventDate: string) => {
      const metadata = event.metadata_json ? JSON.parse(event.metadata_json) : {}
      const excludedDates: string[] = metadata.excludedDates || []
      if (excludedDates.includes(eventDate)) return
      instances.push({ ...event, event_date: eventDate })
    }

    calendarEvents.forEach((event) => {
      const baseDate = parseISO(event.event_date)
      if (isBefore(rangeEnd, baseDate)) return

      if (!event.recurrence || event.recurrence === 'none') {
        pushInstance(event, event.event_date)
        return
      }

      let cursor = baseDate
      while (isBefore(cursor, range.start)) {
        if (event.recurrence === 'day') cursor = addDays(cursor, 1)
        else if (event.recurrence === 'week') cursor = addWeeks(cursor, 1)
        else if (event.recurrence === 'fortnight') cursor = addWeeks(cursor, 2)
        else if (event.recurrence === 'month') cursor = addMonths(cursor, 1)
        else if (event.recurrence === 'year') cursor = addYears(cursor, 1)
      }

      while (!isBefore(rangeEnd, cursor)) {
        pushInstance(event, format(cursor, 'yyyy-MM-dd'))
        if (event.recurrence === 'day') cursor = addDays(cursor, 1)
        else if (event.recurrence === 'week') cursor = addWeeks(cursor, 1)
        else if (event.recurrence === 'fortnight') cursor = addWeeks(cursor, 2)
        else if (event.recurrence === 'month') cursor = addMonths(cursor, 1)
        else if (event.recurrence === 'year') cursor = addYears(cursor, 1)
        else break
      }
    })

    return instances
  }, [calendarEvents, currentDate, range.end, range.start, view])

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()
    expandedEvents.forEach((event) => {
      const key = event.event_date
      const existing = grouped.get(key) || []
      existing.push(event)
      grouped.set(key, existing)
    })
    return grouped
  }, [expandedEvents])

  const monthsOfYear = useMemo(() => {
    return Array.from({ length: 12 }).map((_, index) => {
      const monthDate = new Date(currentDate.getFullYear(), index, 1)
      const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }),
      })
      return { monthDate, days }
    })
  }, [currentDate])

  const occurrenceMetadata = getEventMetadata(editingEvent)
  const occurrenceLinks = occurrenceMetadata.occurrenceLinks || {}
  const occurrenceUnlinkedDates: string[] = occurrenceMetadata.occurrenceUnlinkedDates || []
  const linkedJobIdForOccurrence = editingEvent
    ? occurrenceLinks[editingEvent.event_date] ?? (occurrenceUnlinkedDates.includes(editingEvent.event_date) ? null : editingEvent.linked_job_id)
    : null

  const linkedJob = linkedJobIdForOccurrence
    ? jobs.find((job) => job.id === linkedJobIdForOccurrence) || null
    : null

  const availableJobsToLink = jobs
    .filter((job) => !editingEvent || job.id !== linkedJobIdForOccurrence)
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const openNewEvent = (date?: Date) => {
    setEditingEvent(null)
    setSelectedJobToLink('none')
    setEventForm({
      ...EMPTY_EVENT,
      event_date: date ? format(date, 'yyyy-MM-dd') : format(currentDate, 'yyyy-MM-dd'),
    })
    setDialogOpen(true)
  }

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setSelectedJobToLink('none')
    setEventForm({
      title: event.title,
      description: event.description || '',
      event_date: event.event_date,
      end_date: event.end_date || '',
      start_time: event.start_time || '',
      end_time: event.end_time || '',
      category: event.category || '',
      location: event.location || '',
      recurrence: event.recurrence || 'none',
      color: event.color || 'bg-blue-500',
    })
    setDialogOpen(true)
  }

  const handleSaveEvent = async () => {
    const payload = {
      workspace_id: selectedWorkspace,
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      event_date: eventForm.event_date,
      end_date: eventForm.end_date || null,
      start_time: eventForm.start_time || null,
      end_time: eventForm.end_time || null,
      category: eventForm.category.trim() || null,
      location: eventForm.location.trim() || null,
      color: eventForm.color,
      recurrence: eventForm.recurrence,
      source: editingEvent?.source || 'manual' as const,
      external_url: editingEvent?.external_url || null,
      linked_job_id: editingEvent?.linked_job_id || null,
      metadata_json: editingEvent?.metadata_json || null,
    }

    if (!payload.title) {
      alert('Please enter an event title.')
      return
    }

    if (editingEvent) {
      await updateCalendarEvent(editingEvent.id, payload)
    } else {
      await addCalendarEvent(payload)
    }

    setDialogOpen(false)
    setEditingEvent(null)
  }

  const handleCreateJobFromEvent = async (event: CalendarEvent) => {
    if (!selectedWorkspace) {
      alert('Select a workspace first.')
      return
    }

    const jobId = await addJob({
      workspace_id: selectedWorkspace,
      title: event.title,
      description: event.description || `Created from calendar event on ${event.event_date}`,
      stage: 'brief',
      priority: 0,
      due_date: event.event_date,
      platform: null,
      target_hashtags: null,
      file_links: null,
      live_url: null,
      live_metrics: null,
      custom_fields: [
        {
          id: crypto.randomUUID(),
          label: 'Calendar Event',
          type: 'text',
          value: event.title,
        },
      ],
    })

    await updateCalendarEvent(event.id, { linked_job_id: jobId })
    setJobCreatedMessage(`Job created for "${event.title}" and linked to the event.`)
  }

  const handleLinkExistingJob = async () => {
    if (!editingEvent || selectedJobToLink === 'none') return
    const jobId = Number(selectedJobToLink)
    const job = jobs.find((item) => item.id === jobId)
    const metadata = getEventMetadata(editingEvent)
    const occurrenceLinks = metadata.occurrenceLinks || {}
    const occurrenceUnlinkedDates: string[] = metadata.occurrenceUnlinkedDates || []

    occurrenceLinks[editingEvent.event_date] = jobId
    const cleanedUnlinkedDates = occurrenceUnlinkedDates.filter((date: string) => date !== editingEvent.event_date)

    await updateCalendarEvent(editingEvent.id, {
      metadata_json: JSON.stringify({ ...metadata, occurrenceLinks, occurrenceUnlinkedDates: cleanedUnlinkedDates })
    })
    setSelectedJobToLink('none')
    setLinkMessage(job ? `Linked "${job.title}" to this event occurrence.` : 'Linked job to event occurrence.')
    setEditingEvent({ ...editingEvent, metadata_json: JSON.stringify({ ...metadata, occurrenceLinks, occurrenceUnlinkedDates: cleanedUnlinkedDates }) })
  }

  const handleUnlinkJob = async () => {
    if (!editingEvent) return
    const metadata = getEventMetadata(editingEvent)
    const occurrenceLinks = metadata.occurrenceLinks || {}
    const occurrenceUnlinkedDates: string[] = metadata.occurrenceUnlinkedDates || []

    delete occurrenceLinks[editingEvent.event_date]
    const updatedUnlinkedDates = [...new Set([...occurrenceUnlinkedDates, editingEvent.event_date])]

    await updateCalendarEvent(editingEvent.id, {
      metadata_json: JSON.stringify({ ...metadata, occurrenceLinks, occurrenceUnlinkedDates: updatedUnlinkedDates })
    })
    setLinkMessage('Removed linked job from this event occurrence.')
    setEditingEvent({ ...editingEvent, metadata_json: JSON.stringify({ ...metadata, occurrenceLinks, occurrenceUnlinkedDates: updatedUnlinkedDates }) })
  }

  const handleRunImport = async () => {
    if (!importPrompt.trim()) {
      setImportError('Enter a prompt for Kimi first.')
      return
    }

    setImportLoading(true)
    setImportError('')
    setImportPreview([])
    setImportSummary('')

    try {
      const apiKeys = await dbService.getApiKeys()
      const result = await importCalendarEventsWithKimi(importPrompt.trim(), apiKeys.moonshot)
      setImportPreview(result.events || [])
      setImportSummary(result.warnings?.join(' ') || '')
      if (!result.events || result.events.length === 0) {
        setImportError('Kimi did not return any importable events.')
      }
    } catch (error: any) {
      console.error(error)
      setImportError(error?.message || 'Failed to import with Kimi.')
    } finally {
      setImportLoading(false)
    }
  }

  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return

    for (const item of importPreview) {
      await addCalendarEvent({
        workspace_id: selectedWorkspace,
        title: item.title,
        description: item.description || null,
        event_date: item.event_date,
        end_date: item.end_date || null,
        start_time: item.start_time || null,
        end_time: item.end_time || null,
        category: item.category || null,
        location: item.location || null,
        color: categoryToColor(item.category),
        recurrence: 'none',
        source: 'ai',
        external_url: item.external_url || null,
        linked_job_id: null,
        metadata_json: JSON.stringify({ importedWith: 'kimi', prompt: importPrompt.trim() }),
      })
    }

    setImportSuccess(`Imported ${importPreview.length} event${importPreview.length === 1 ? '' : 's'} into the calendar.`)
    setImportDialogOpen(false)
    setImportPrompt('')
    setImportPreview([])
    setImportSummary('')
    setImportError('')
  }

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'week') {
      setCurrentDate((prev) => addDays(prev, direction === 'next' ? 7 : -7))
      return
    }
    if (view === 'year') {
      setCurrentDate((prev) => new Date(prev.getFullYear() + (direction === 'next' ? 1 : -1), 0, 1))
      return
    }
    setCurrentDate((prev) => addMonths(prev, direction === 'next' ? 1 : -1))
  }

  const renderEventChip = (event: CalendarEvent) => (
    <button
      key={`${event.id}-${event.event_date}`}
      onClick={() => openEditEvent(event)}
      className="w-full rounded-md border border-border/60 bg-background/70 px-2 py-1 text-left text-xs hover:bg-accent"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${event.color || 'bg-blue-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{event.title}</div>
          <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <span>{event.start_time || event.category || event.source}</span>
            <div className="flex items-center gap-1">
              {event.recurrence !== 'none' && <span className="uppercase">{event.recurrence}</span>}
              {event.linked_job_id && <Link2 className="h-3 w-3" />}
            </div>
          </div>
        </div>
      </div>
    </button>
  )

  const renderDayCell = (day: Date, compact = false) => {
    const key = format(day, 'yyyy-MM-dd')
    const events = eventsByDate.get(key) || []
    return (
      <div
        key={key}
        className={`rounded-lg border border-border/70 bg-card/70 p-2 ${compact ? 'min-h-[110px]' : 'min-h-[160px]'}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <button className="text-sm font-medium" onClick={() => openNewEvent(day)}>
            {format(day, compact ? 'd' : 'EEE d')}
          </button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openNewEvent(day)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-1">
          {events.map(renderEventChip)}
          {events.length === 0 && <p className="text-xs text-muted-foreground">No events</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {jobCreatedMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-green-600 text-white px-4 py-3 shadow-lg flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">{jobCreatedMessage}</span>
        </div>
      )}

      {importSuccess && (
        <div className="fixed top-20 right-4 z-50 rounded-lg bg-blue-600 text-white px-4 py-3 shadow-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">{importSuccess}</span>
        </div>
      )}

      {linkMessage && (
        <div className="fixed top-36 right-4 z-50 rounded-lg bg-violet-600 text-white px-4 py-3 shadow-lg flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          <span className="text-sm font-medium">{linkMessage}</span>
        </div>
      )}

      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Calendar
          </h2>
          <p className="text-sm text-muted-foreground">Plan campaigns around key dates and local events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center font-medium">
            {view === 'year' ? format(currentDate, 'yyyy') : format(currentDate, 'MMMM yyyy')}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={view} onValueChange={(value) => setView(value as CalendarView)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Import with Kimi
          </Button>
          <Button onClick={() => openNewEvent()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {view === 'week' && (
          <div className="grid grid-cols-7 gap-4">
            {visibleDays.map((day) => renderDayCell(day))}
          </div>
        )}

        {view === 'month' && (
          <div className="grid grid-cols-7 gap-4">
            {visibleDays.map((day) => (
              <div key={format(day, 'yyyy-MM-dd')} className={isSameMonth(day, currentDate) ? '' : 'opacity-50'}>
                {renderDayCell(day)}
              </div>
            ))}
          </div>
        )}

        {view === 'year' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {monthsOfYear.map(({ monthDate, days }) => (
              <Card key={monthDate.toISOString()}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{format(monthDate, 'MMMM')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-2 text-[10px] text-muted-foreground mb-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <div key={day}>{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {days.map((day) => {
                      const count = (eventsByDate.get(format(day, 'yyyy-MM-dd')) || []).length
                      return (
                        <button
                          key={format(day, 'yyyy-MM-dd')}
                          onClick={() => setCurrentDate(day)}
                          className={`rounded-md border px-2 py-1 text-xs text-left ${isSameMonth(day, monthDate) ? 'bg-background/70' : 'opacity-40'} ${isSameDay(day, new Date()) ? 'ring-1 ring-primary' : ''}`}
                        >
                          <div>{format(day, 'd')}</div>
                          <div className="text-[10px] text-muted-foreground">{count} evt</div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Import Calendar Events with Kimi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={importPrompt}
                onChange={(e) => setImportPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. Add FIFA 2026 World Cup match schedule to the calendar, including teams, kick-off time and dates."
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleRunImport} disabled={importLoading}>
                {importLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {importLoading ? 'Checking with Kimi...' : 'Preview Import'}
              </Button>
              <Button variant="outline" onClick={() => {
                setImportPrompt('')
                setImportPreview([])
                setImportSummary('')
                setImportError('')
              }}>
                Clear
              </Button>
            </div>

            {importError && <p className="text-sm text-destructive">{importError}</p>}
            {importSummary && <p className="text-sm text-muted-foreground">{importSummary}</p>}

            {importPreview.length > 0 && (
              <div className="space-y-3 rounded-lg border p-4 max-h-[320px] overflow-auto">
                <p className="text-sm font-medium">Preview ({importPreview.length} events)</p>
                {importPreview.map((event, index) => (
                  <div key={`${event.title}-${event.event_date}-${index}`} className="rounded-md border p-3 bg-background/60">
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.event_date}
                      {event.start_time ? ` • ${event.start_time}` : ''}
                      {event.category ? ` • ${event.category}` : ''}
                    </p>
                    {event.description && <p className="text-sm text-muted-foreground mt-1">{event.description}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleConfirmImport} disabled={importPreview.length === 0 || importLoading}>
                Import to Calendar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={eventForm.end_date} onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })} placeholder="Holiday, Campaign, Release..." />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Australia" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recurring Event</Label>
                <Select value={eventForm.recurrence} onValueChange={(value) => setEventForm({ ...eventForm, recurrence: value as CalendarRecurrence })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Event Colour</Label>
                <div className="flex gap-2 flex-wrap pt-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.label}
                      onClick={() => setEventForm({ ...eventForm, color: color.value })}
                      className={`h-8 w-8 rounded-full ${color.value} ${eventForm.color === color.value ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {editingEvent && (
              <div className="rounded-lg border p-4 space-y-3 bg-background/40">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Linked Job</p>
                </div>

                {linkedJob ? (
                  <div className="rounded-md border p-3 bg-card/60">
                    <p className="font-medium text-sm">{linkedJob.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Stage: {linkedJob.stage}
                      {linkedJob.due_date ? ` • Due ${format(new Date(linkedJob.due_date), 'd MMM yyyy')}` : ''}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={handleUnlinkJob}>
                        <Unlink className="h-4 w-4 mr-2" />
                        Unlink Job
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No job linked yet.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2 items-end">
                  <div className="space-y-2">
                    <Label>Link an existing job</Label>
                    <Select value={selectedJobToLink} onValueChange={setSelectedJobToLink}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a job" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No selection</SelectItem>
                        {availableJobsToLink.map((job) => (
                          <SelectItem key={job.id} value={String(job.id)}>
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" className="shrink-0" onClick={handleLinkExistingJob} disabled={selectedJobToLink === 'none'}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Link Job
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col xl:flex-row xl:justify-between gap-3 pt-2">
              <div className="flex flex-wrap gap-2">
                {editingEvent && (
                  <>
                    <Button variant="outline" onClick={() => handleCreateJobFromEvent(editingEvent)}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Create New Job
                    </Button>
                    {editingEvent.recurrence && editingEvent.recurrence !== 'none' && (
                      <Button variant="outline" onClick={async () => {
                        const confirmed = confirm('Delete only this occurrence?')
                        if (!confirmed) return
                        const metadata = getEventMetadata(editingEvent)
                        const excludedDates = Array.isArray(metadata.excludedDates) ? metadata.excludedDates : []
                        const updatedExcludedDates = [...new Set([...excludedDates, editingEvent.event_date])]
                        await updateCalendarEvent(editingEvent.id, {
                          metadata_json: JSON.stringify({ ...metadata, excludedDates: updatedExcludedDates })
                        })
                        setDialogOpen(false)
                      }}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Occurrence
                      </Button>
                    )}
                    <Button variant="destructive" onClick={async () => {
                      const confirmed = confirm(editingEvent.recurrence && editingEvent.recurrence !== 'none' ? 'Delete this entire recurring series?' : 'Delete this event?')
                      if (!confirmed) return
                      await deleteCalendarEvent(editingEvent.id)
                      setDialogOpen(false)
                    }}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {editingEvent.recurrence && editingEvent.recurrence !== 'none' ? 'Delete All' : 'Delete'}
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveEvent}>{editingEvent ? 'Save Changes' : 'Add Event'}</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
