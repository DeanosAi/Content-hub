import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, FileText, Download, TrendingUp, BarChart3, Check, AlertCircle, RefreshCw, Eye, Heart, MessageSquare, Sparkles, Clock3, Briefcase } from 'lucide-react'
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { CalendarEvent, Job, Platform } from '@/types'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'

type ToastType = 'success' | 'error'

interface PostMetric {
  jobId: number
  jobTitle: string
  platform: Platform
  views: number
  likes: number
  comments: number
  shares: number
  engagementRate: number
  postedAt: string
  lastUpdated: string
}

export function ReportsPage() {
  const { workspaces, jobs, selectedWorkspace, loadJobs } = useJobStore()
  const [reportWorkspace, setReportWorkspace] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState('')
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [compareWorkspace, setCompareWorkspace] = useState<number | null>(null)
  const [compareJobs, setCompareJobs] = useState<Job[]>([])
  const [monthlyEvents, setMonthlyEvents] = useState<CalendarEvent[]>([])
  const [savedReports, setSavedReports] = useState<any[]>([])

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const loadReportJobs = async () => {
      const wsId = reportWorkspace ?? selectedWorkspace
      if (!wsId) return
      try {
        const wsJobs = await dbService.getJobs(wsId)
        setAllJobs(wsJobs)
      } catch (e) { console.error(e) }
    }
    loadReportJobs()
  }, [reportWorkspace, selectedWorkspace, jobs])

  useEffect(() => {
    const loadCompare = async () => {
      if (!compareWorkspace) { setCompareJobs([]); return }
      try {
        const cJobs = await dbService.getJobs(compareWorkspace)
        setCompareJobs(cJobs)
      } catch (e) { console.error(e) }
    }
    loadCompare()
  }, [compareWorkspace])

  const activeWsId = reportWorkspace ?? selectedWorkspace
  const currentWorkspace = workspaces.find(w => w.id === activeWsId)

  useEffect(() => {
    const loadAutomationData = async () => {
      try {
        const now = new Date()
        const start = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
        const end = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')
        const [events, reports] = await Promise.all([
          dbService.getCalendarEvents(activeWsId ?? undefined, start, end),
          activeWsId ? dbService.getReports(activeWsId) : Promise.resolve([])
        ])
        setMonthlyEvents(events)
        setSavedReports(reports)
      } catch (error) {
        console.error('Failed to load report automation data:', error)
      }
    }

    loadAutomationData()
  }, [activeWsId])

  const metricsData: PostMetric[] = useMemo(() => {
    return allJobs
      .filter(j => (j.stage === 'posted' || j.stage === 'archive') && j.live_metrics)
      .filter(j => {
        if (!dateRange.start && !dateRange.end) return true
        const jobDate = j.live_metrics?.last_updated || j.created_at
        if (!jobDate) return true
        const d = new Date(jobDate)
        if (dateRange.start && d < new Date(dateRange.start)) return false
        if (dateRange.end && d > new Date(dateRange.end + 'T23:59:59')) return false
        return true
      })
      .map(j => ({
        jobId: j.id,
        jobTitle: j.title,
        platform: (Array.isArray(j.platform) ? j.platform[0] : j.platform) as Platform || 'instagram',
        views: j.live_metrics!.views,
        likes: j.live_metrics!.likes,
        comments: j.live_metrics!.comments,
        shares: j.live_metrics!.shares,
        engagementRate: j.live_metrics!.engagement_rate,
        postedAt: j.live_metrics!.last_updated || j.created_at,
        lastUpdated: j.live_metrics!.last_updated,
      }))
  }, [allJobs, dateRange])

  const totalPostsInRange = useMemo(() => {
    return allJobs
      .filter(j => j.stage === 'posted' || j.stage === 'archive')
      .filter(j => {
        if (!dateRange.start && !dateRange.end) return true
        const jobDate = j.live_metrics?.last_updated || j.created_at
        if (!jobDate) return true
        const d = new Date(jobDate)
        if (dateRange.start && d < new Date(dateRange.start)) return false
        if (dateRange.end && d > new Date(dateRange.end + 'T23:59:59')) return false
        return true
      }).length
  }, [allJobs, dateRange])

  const totalViews = metricsData.reduce((s, m) => s + m.views, 0)
  const totalEngagement = metricsData.reduce((s, m) => s + m.likes + m.comments + m.shares, 0)
  const avgEngagementRate = metricsData.length > 0
    ? metricsData.reduce((s, m) => s + m.engagementRate, 0) / metricsData.length : 0

  const platformData = metricsData.reduce((acc, m) => {
    if (!acc[m.platform]) acc[m.platform] = { views: 0, engagement: 0, count: 0 }
    acc[m.platform].views += m.views
    acc[m.platform].engagement += m.likes + m.comments + m.shares
    acc[m.platform].count += 1
    return acc
  }, {} as Record<Platform, { views: number; engagement: number; count: number }>)

  const chartData = Object.entries(platformData).map(([p, d]) => ({
    platform: p.charAt(0).toUpperCase() + p.slice(1),
    views: d.views,
    engagement: d.engagement,
    count: d.count,
  }))

  const overviewPlatformCards = (['instagram', 'tiktok', 'facebook', 'youtube'] as Platform[])
    .filter((platform) => platformData[platform])
    .map((platform) => ({
      platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      views: platformData[platform]?.views || 0,
      engagement: platformData[platform]?.engagement || 0,
      count: platformData[platform]?.count || 0,
    }))

  const topPosts = [...metricsData].sort((a, b) =>
    (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)
  )

  const monthlyChartData = useMemo(() => {
    const byMonth: Record<string, { views: number; engagement: number; posts: number }> = {}
    metricsData.forEach(m => {
      const key = m.postedAt ? format(new Date(m.postedAt), 'MMM yyyy') : 'Unknown'
      if (!byMonth[key]) byMonth[key] = { views: 0, engagement: 0, posts: 0 }
      byMonth[key].views += m.views
      byMonth[key].engagement += m.likes + m.comments + m.shares
      byMonth[key].posts += 1
    })
    return Object.entries(byMonth).map(([month, d]) => ({ month, ...d }))
  }, [metricsData])

  const compareMonthlyData = useMemo(() => {
    const compMetrics = compareJobs
      .filter(j => (j.stage === 'posted' || j.stage === 'archive') && j.live_metrics)
      .filter(j => {
        if (!dateRange.start && !dateRange.end) return true
        const jobDate = j.live_metrics?.last_updated || j.created_at
        if (!jobDate) return true
        const d = new Date(jobDate)
        if (dateRange.start && d < new Date(dateRange.start)) return false
        if (dateRange.end && d > new Date(dateRange.end + 'T23:59:59')) return false
        return true
      })
    const byMonth: Record<string, { views: number; engagement: number; posts: number }> = {}
    compMetrics.forEach(j => {
      const key = j.live_metrics?.last_updated ? format(new Date(j.live_metrics.last_updated), 'MMM yyyy') : 'Unknown'
      if (!byMonth[key]) byMonth[key] = { views: 0, engagement: 0, posts: 0 }
      byMonth[key].views += j.live_metrics!.views
      byMonth[key].engagement += j.live_metrics!.likes + j.live_metrics!.comments + j.live_metrics!.shares
      byMonth[key].posts += 1
    })
    return Object.entries(byMonth).map(([month, d]) => ({ month, ...d }))
  }, [compareJobs, dateRange])

  const mergedMonthly = useMemo(() => {
    const allMonths = new Set([...monthlyChartData.map(d => d.month), ...compareMonthlyData.map(d => d.month)])
    return Array.from(allMonths).map(month => {
      const primary = monthlyChartData.find(d => d.month === month)
      const compare = compareMonthlyData.find(d => d.month === month)
      return {
        month,
        views: primary?.views || 0,
        engagement: primary?.engagement || 0,
        compareViews: compare?.views || 0,
        compareEngagement: compare?.engagement || 0,
      }
    })
  }, [monthlyChartData, compareMonthlyData])

  const automationSummary = useMemo(() => {
    const linkedEventCount = monthlyEvents.filter((event) => event.linked_job_id).length
    const recurringEventCount = monthlyEvents.filter((event) => event.recurrence && event.recurrence !== 'none').length
    const aiEventCount = monthlyEvents.filter((event) => event.source === 'ai').length
    const upcomingJobDueCount = allJobs.filter((job) => job.due_date).length
    const narrative = [
      `${monthlyEvents.length} events currently scheduled this month`,
      `${linkedEventCount} already linked to content jobs`,
      `${recurringEventCount} recurring planning anchors`,
      `${aiEventCount} imported via Kimi`,
      `${upcomingJobDueCount} jobs with due dates in the workspace`,
    ].join(' • ')

    return {
      linkedEventCount,
      recurringEventCount,
      aiEventCount,
      upcomingJobDueCount,
      narrative,
    }
  }, [monthlyEvents, allJobs])

  const contentPlanningRows = useMemo(() => {
    return monthlyEvents.map((event) => {
      const linkedJob = allJobs.find((job) => job.id === event.linked_job_id)
      return {
        id: event.id,
        title: event.title,
        when: format(new Date(event.event_date), 'EEE d MMM'),
        category: event.category || 'General',
        source: event.source,
        linkedJobTitle: linkedJob?.title || 'Not linked',
        linkedJobStage: linkedJob?.stage || '—',
      }
    })
  }, [monthlyEvents, allJobs])

  const handleUpdateAll = useCallback(async () => {
    const postsToUpdate = allJobs
      .filter(j => (j.stage === 'posted' || j.stage === 'archive') && j.live_url)
      .filter(j => {
        if (!dateRange.start && !dateRange.end) return true
        const jobDate = j.live_metrics?.last_updated || j.created_at
        if (!jobDate) return true
        const d = new Date(jobDate)
        if (dateRange.start && d < new Date(dateRange.start)) return false
        if (dateRange.end && d > new Date(dateRange.end + 'T23:59:59')) return false
        return true
      })

    if (postsToUpdate.length === 0) {
      showToast('No posted jobs with live URLs in this range', 'error')
      return
    }

    const apiKeys = await dbService.getSettings('api_keys') || {}
    const apifyKey = apiKeys?.apify || ''
    if (!apifyKey) {
      showToast('Add your Apify API token in Settings first', 'error')
      return
    }

    setIsUpdating(true)
    const { invoke } = await import('@tauri-apps/api/core')
    let updated = 0
    let failed = 0

    for (const job of postsToUpdate) {
      setUpdateProgress(`Updating ${updated + failed + 1}/${postsToUpdate.length}: ${job.title}`)
      try {
        const metrics = await invoke('fetch_metrics_with_ai', {
          url: job.live_url,
          apiKey: apifyKey,
        }) as { views: number; likes: number; comments: number; shares: number; engagement_rate: number }

        await dbService.updateJob(job.id, {
          live_metrics: {
            views: metrics.views || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            engagement_rate: metrics.engagement_rate || 0,
            last_updated: new Date().toISOString(),
          }
        })
        updated++
      } catch (e) {
        console.error(`Failed to update ${job.title}:`, e)
        failed++
      }
    }

    const wsId = reportWorkspace ?? selectedWorkspace
    if (wsId) {
      const freshJobs = await dbService.getJobs(wsId)
      setAllJobs(freshJobs)
    }
    await loadJobs()

    setIsUpdating(false)
    setUpdateProgress('')
    showToast(`Updated ${updated} posts${failed > 0 ? `, ${failed} failed` : ''}`)
  }, [allJobs, dateRange, reportWorkspace, selectedWorkspace, loadJobs])

  const handleSaveAutomationSnapshot = async () => {
    if (!activeWsId) return
    const now = new Date()
    const start = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
    const end = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')

    await dbService.saveReport({
      workspace_id: activeWsId,
      title: `Automation Snapshot — ${format(now, 'MMMM yyyy')}`,
      type: 'summary',
      start_date: start,
      end_date: end,
      metrics_json: JSON.stringify({
        automationSummary,
        contentPlanningRows,
        generatedAt: now.toISOString(),
      }),
    })

    const reports = await dbService.getReports(activeWsId)
    setSavedReports(reports)
    showToast('Automation snapshot saved in Reports history.')
  }

  const drawBarChart = (doc: jsPDF, x: number, y: number, w: number, h: number,
    data: { label: string; value: number; color: [number, number, number] }[], title: string) => {
    doc.setFontSize(10); doc.setTextColor(24, 24, 27); doc.text(title, x, y - 3)
    const maxVal = Math.max(...data.map(d => d.value), 1)
    const barW = Math.min(30, (w - 10) / data.length - 4)
    const chartX = x + 5
    doc.setDrawColor(200, 200, 200); doc.line(chartX, y, chartX, y + h); doc.line(chartX, y + h, x + w, y + h)
    data.forEach((d, i) => {
      const bx = chartX + 8 + i * (barW + 8)
      const barH = (d.value / maxVal) * (h - 15)
      doc.setFillColor(...d.color)
      doc.rect(bx, y + h - barH, barW, barH, 'F')
      doc.setFontSize(6); doc.setTextColor(80, 80, 80)
      doc.text(d.label, bx + barW / 2, y + h + 5, { align: 'center' })
      doc.setFontSize(5); doc.setTextColor(24, 24, 27)
      doc.text(d.value.toLocaleString(), bx + barW / 2, y + h - barH - 2, { align: 'center' })
    })
  }

  const generateSummaryPdf = async () => {
    setGeneratingPdf('summary')
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const now = format(new Date(), 'dd MMM yyyy')
      const rangeLabel = dateRange.start && dateRange.end
        ? `${format(new Date(dateRange.start), 'dd MMM yyyy')} – ${format(new Date(dateRange.end), 'dd MMM yyyy')}`
        : 'All Time'

      doc.setFillColor(24, 24, 27)
      doc.rect(0, 0, pageWidth, 40, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.text('Performance Summary', 14, 20)
      doc.setFontSize(11)
      doc.text(`${currentWorkspace?.name || 'Workspace'} • ${rangeLabel}`, 14, 30)
      doc.setFontSize(8)
      doc.text(`Generated ${now}`, pageWidth - 14, 30, { align: 'right' })

      doc.setTextColor(0, 0, 0)
      let y = 52
      const kpis = [
        { label: 'Total Views', value: totalViews.toLocaleString() },
        { label: 'Total Engagement', value: totalEngagement.toLocaleString() },
        { label: 'Avg Engagement Rate', value: `${avgEngagementRate.toFixed(2)}%` },
        { label: 'Total Posts', value: totalPostsInRange.toString() },
      ]
      const cardW = (pageWidth - 28 - 18) / 4
      kpis.forEach((kpi, i) => {
        const x = 14 + i * (cardW + 6)
        doc.setFillColor(244, 244, 245)
        doc.roundedRect(x, y, cardW, 24, 3, 3, 'F')
        doc.setFontSize(8); doc.setTextColor(113, 113, 122); doc.text(kpi.label, x + 4, y + 9)
        doc.setFontSize(16); doc.setTextColor(24, 24, 27); doc.text(kpi.value, x + 4, y + 20)
      })
      y += 34

      const platColors: Record<string, [number, number, number]> = {
        instagram: [99, 102, 241],
        tiktok: [16, 185, 129],
        youtube: [239, 68, 68],
        facebook: [37, 99, 235],
      }
      const platChartData = Object.entries(platformData).map(([p, d]) => ({
        label: p.charAt(0).toUpperCase() + p.slice(1),
        value: d.views,
        color: platColors[p] || [136, 132, 216] as [number, number, number],
      }))
      if (platChartData.length > 0) {
        drawBarChart(doc, 14, y + 4, (pageWidth - 28) / 2 - 4, 50, platChartData, 'Views by Platform')
        const engChartData = Object.entries(platformData).map(([p, d]) => ({
          label: p.charAt(0).toUpperCase() + p.slice(1),
          value: d.engagement,
          color: platColors[p] || [130, 202, 157] as [number, number, number],
        }))
        drawBarChart(doc, pageWidth / 2 + 2, y + 4, (pageWidth - 28) / 2 - 4, 50, engChartData, 'Engagement by Platform')
        y += 65
      }

      if (monthlyChartData.length > 0) {
        const monthColors: [number, number, number] = [99, 102, 241]
        const monthBars = monthlyChartData.map(d => ({ label: d.month, value: d.views, color: monthColors }))
        drawBarChart(doc, 14, y + 4, pageWidth - 28, 50, monthBars, 'Month-over-Month Views')
        y += 65
      }

      if (y > 180) { doc.addPage(); y = 20 }

      doc.setFontSize(14); doc.setTextColor(24, 24, 27); doc.text('Platform Breakdown', 14, y); y += 4
      const platformRows = Object.entries(platformData).map(([p, d]) => [
        p.charAt(0).toUpperCase() + p.slice(1), d.count.toString(), d.views.toLocaleString(),
        d.engagement.toLocaleString(), d.views > 0 ? `${((d.engagement / d.views) * 100).toFixed(2)}%` : '—'
      ])
      autoTable(doc, { startY: y, head: [['Platform', 'Posts', 'Views', 'Engagement', 'Eng. Rate']],
        body: platformRows.length > 0 ? platformRows : [['—','—','—','—','—']],
        theme: 'grid', headStyles: { fillColor: [24,24,27], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10

      doc.setFontSize(14); doc.text('Top Performing Posts', 14, y); y += 4
      const top5 = topPosts.slice(0, 5).map((m, i) => [
        `#${i + 1}`, m.jobTitle.length > 30 ? m.jobTitle.slice(0, 30) + '…' : m.jobTitle,
        m.platform.charAt(0).toUpperCase() + m.platform.slice(1),
        m.views.toLocaleString(), m.likes.toLocaleString(), m.comments.toLocaleString(), `${m.engagementRate.toFixed(2)}%`
      ])
      autoTable(doc, { startY: y, head: [['#','Title','Platform','Views','Likes','Comments','Eng. Rate']],
        body: top5.length > 0 ? top5 : [['—','—','—','—','—','—','—']],
        theme: 'grid', headStyles: { fillColor: [24,24,27], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 50 } },
        margin: { left: 14, right: 14 } })

      const filename = `${currentWorkspace?.name || 'report'}-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      doc.save(filename)
      if (activeWsId) {
        await dbService.saveReport({ workspace_id: activeWsId, title: `Performance Summary — ${rangeLabel}`,
          type: 'summary', start_date: dateRange.start || '', end_date: dateRange.end || '',
          metrics_json: JSON.stringify({ totalViews, totalEngagement, avgEngagementRate, platformBreakdown: platformData, postsTracked: metricsData.length }) })
      }
      showToast('Summary PDF downloaded')
    } catch (e) { console.error(e); showToast('Failed to generate PDF', 'error') }
    finally { setGeneratingPdf(null) }
  }

  const generateQuarterlyPdf = async () => {
    setGeneratingPdf('quarterly')
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const now = format(new Date(), 'dd MMM yyyy')
      const rangeLabel = dateRange.start && dateRange.end
        ? `${format(new Date(dateRange.start), 'dd MMM yyyy')} – ${format(new Date(dateRange.end), 'dd MMM yyyy')}`
        : 'All Time'

      doc.setFillColor(24, 24, 27); doc.rect(0, 0, pageWidth, 45, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text('Quarterly Deep-Dive Report', 14, 22)
      doc.setFontSize(12); doc.text(`${currentWorkspace?.name || 'Workspace'}`, 14, 32)
      doc.setFontSize(10); doc.text(rangeLabel, 14, 40)
      doc.setFontSize(8); doc.text(`Generated ${now}`, pageWidth - 14, 40, { align: 'right' })

      let y = 58
      const kpis = [
        { label: 'Total Views', value: totalViews.toLocaleString() },
        { label: 'Total Engagement', value: totalEngagement.toLocaleString() },
        { label: 'Avg Eng. Rate', value: `${avgEngagementRate.toFixed(2)}%` },
        { label: 'Total Posts', value: totalPostsInRange.toString() },
      ]
      const cardW = (pageWidth - 28 - 18) / 4
      kpis.forEach((kpi, i) => {
        const x = 14 + i * (cardW + 6)
        doc.setFillColor(244, 244, 245); doc.roundedRect(x, y, cardW, 24, 3, 3, 'F')
        doc.setFontSize(8); doc.setTextColor(113, 113, 122); doc.text(kpi.label, x + 4, y + 9)
        doc.setFontSize(16); doc.setTextColor(24, 24, 27); doc.text(kpi.value, x + 4, y + 20)
      })
      y += 34

      doc.setFontSize(14); doc.setTextColor(24, 24, 27); doc.text('Month-over-Month Performance', 14, y); y += 4
      const monthEntries = monthlyChartData
      const monthRows = monthEntries.map((d, i) => {
        const prev = i > 0 ? monthEntries[i - 1] : null
        const vΔ = prev && prev.views > 0 ? `${(((d.views - prev.views) / prev.views) * 100).toFixed(1)}%` : '—'
        const eΔ = prev && prev.engagement > 0 ? `${(((d.engagement - prev.engagement) / prev.engagement) * 100).toFixed(1)}%` : '—'
        return [d.month, d.posts.toString(), d.views.toLocaleString(), vΔ, d.engagement.toLocaleString(), eΔ]
      })
      autoTable(doc, { startY: y, head: [['Month','Posts','Views','Δ Views','Engagement','Δ Eng.']],
        body: monthRows.length > 0 ? monthRows : [['—','—','—','—','—','—']],
        theme: 'grid', headStyles: { fillColor: [24,24,27], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10

      if (y > 220) { doc.addPage(); y = 20 }
      doc.setFontSize(14); doc.text('All Posts Ranked by Engagement', 14, y); y += 4
      const allRows = topPosts.map((m, i) => [
        `#${i + 1}`, m.jobTitle.length > 28 ? m.jobTitle.slice(0, 28) + '…' : m.jobTitle,
        m.platform.charAt(0).toUpperCase() + m.platform.slice(1),
        m.views.toLocaleString(), m.likes.toLocaleString(), m.comments.toLocaleString(),
        m.shares.toLocaleString(), `${m.engagementRate.toFixed(2)}%`
      ])
      autoTable(doc, { startY: y, head: [['#','Title','Platform','Views','Likes','Comments','Shares','Eng. Rate']],
        body: allRows.length > 0 ? allRows : [['—','—','—','—','—','—','—','—']],
        theme: 'grid', headStyles: { fillColor: [24,24,27], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7 }, columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 42 } },
        margin: { left: 14, right: 14 } })

      const filename = `${currentWorkspace?.name || 'report'}-quarterly-${format(new Date(), 'yyyy-MM-dd')}.pdf`
      doc.save(filename)
      if (activeWsId) {
        await dbService.saveReport({ workspace_id: activeWsId, title: `Quarterly Deep-Dive — ${rangeLabel}`,
          type: 'quarterly', start_date: dateRange.start || '', end_date: dateRange.end || '',
          metrics_json: JSON.stringify({ totalViews, totalEngagement, avgEngagementRate, platformBreakdown: platformData, monthlyData: monthlyChartData, postsTracked: metricsData.length }) })
      }
      showToast('Quarterly report PDF downloaded')
    } catch (e) { console.error(e); showToast('Failed to generate PDF', 'error') }
    finally { setGeneratingPdf(null) }
  }

  const compareWsName = workspaces.find(w => w.id === compareWorkspace)?.name

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {currentWorkspace ? `Workspace: ${currentWorkspace.name}` : 'Select a workspace'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Workspace:</Label>
          <select
            value={reportWorkspace ?? selectedWorkspace ?? ''}
            onChange={(e) => setReportWorkspace(Number(e.target.value) || null)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[520px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="calendar-report">Calendar Report</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Eye className="h-4 w-4" />Total Views</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{totalViews.toLocaleString()}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Heart className="h-4 w-4" />Total Engagement</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{totalEngagement.toLocaleString()}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4" />Avg Engagement Rate</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{avgEngagementRate.toFixed(2)}%</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" />Total Posts</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{totalPostsInRange}</div></CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Automation Snapshot</CardTitle>
                  <CardDescription>Auto-generated planning summary from current jobs and calendar data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3 bg-background/50">
                      <p className="text-xs text-muted-foreground">Linked Events</p>
                      <p className="text-xl font-semibold">{automationSummary.linkedEventCount}</p>
                    </div>
                    <div className="rounded-lg border p-3 bg-background/50">
                      <p className="text-xs text-muted-foreground">Recurring Events</p>
                      <p className="text-xl font-semibold">{automationSummary.recurringEventCount}</p>
                    </div>
                    <div className="rounded-lg border p-3 bg-background/50">
                      <p className="text-xs text-muted-foreground">Kimi Imported</p>
                      <p className="text-xl font-semibold">{automationSummary.aiEventCount}</p>
                    </div>
                    <div className="rounded-lg border p-3 bg-background/50">
                      <p className="text-xs text-muted-foreground">Jobs with Due Dates</p>
                      <p className="text-xl font-semibold">{automationSummary.upcomingJobDueCount}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{automationSummary.narrative}</p>
                  <Button onClick={handleSaveAutomationSnapshot} variant="outline">
                    <Clock3 className="h-4 w-4 mr-2" />
                    Save Snapshot to Report History
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Saved Report History</CardTitle>
                  <CardDescription>Recent generated summaries and automation snapshots</CardDescription>
                </CardHeader>
                <CardContent>
                  {savedReports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No saved reports yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {savedReports.slice(0, 6).map((report) => (
                        <div key={report.id} className="rounded-lg border p-3 bg-background/50">
                          <p className="font-medium text-sm">{report.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.type} • {report.created_at ? format(new Date(report.created_at), 'd MMM yyyy h:mm a') : 'Unknown date'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date Range
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => setDateRange({ start: '', end: '' })}>
                    Clear Range
                  </Button>
                  <Button
                    onClick={handleUpdateAll}
                    disabled={isUpdating}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                    {isUpdating ? updateProgress : 'Update All Posts in Range'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {metricsData.length > 0 && (
              <>
                <Card>
                  <CardHeader><CardTitle>Platform Overview</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {overviewPlatformCards.map((item) => (
                        <div key={item.platform} className="rounded-lg border p-4 bg-background/50 space-y-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>Posts tracked: {item.count}</div>
                            <div>Views: {item.views.toLocaleString()}</div>
                            <div>Engagement: {item.engagement.toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Top Performing Posts</CardTitle></CardHeader>
                  <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Title</th>
                          <th className="pb-2 pr-4">Platform</th>
                          <th className="pb-2 pr-4 text-right">Views</th>
                          <th className="pb-2 pr-4 text-right">Likes</th>
                          <th className="pb-2 pr-4 text-right">Comments</th>
                          <th className="pb-2 text-right">Eng. Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPosts.slice(0, 10).map((m, i) => (
                          <tr key={m.jobId} className="border-b border-border/50">
                            <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{m.jobTitle}</td>
                            <td className="py-2 pr-4 capitalize">{m.platform}</td>
                            <td className="py-2 pr-4 text-right">{m.views.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{m.likes.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{m.comments.toLocaleString()}</td>
                            <td className="py-2 text-right">{m.engagementRate.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="calendar-report" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  This Month's Event Outlook
                </CardTitle>
                <CardDescription>Upcoming dates and events to plan content around this month</CardDescription>
              </CardHeader>
              <CardContent>
                {monthlyEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events stored for this month yet.</p>
                ) : (
                  <div className="space-y-3">
                    {monthlyEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3 bg-background/60">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <span className={`mt-1 h-3 w-3 rounded-full ${event.color || 'bg-blue-500'}`} />
                            <div>
                              <p className="font-medium">{event.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.event_date), 'EEE d MMM yyyy')}
                                {event.start_time ? ` • ${event.start_time}` : ''}
                                {event.category ? ` • ${event.category}` : ''}
                                {event.recurrence !== 'none' ? ` • repeats ${event.recurrence}` : ''}
                              </p>
                              {event.description && (
                                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" />Event → Content Planning Map</CardTitle>
                <CardDescription>Quick automation view of how events connect to jobs</CardDescription>
              </CardHeader>
              <CardContent>
                {contentPlanningRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calendar planning rows yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4">Event</th>
                          <th className="pb-2 pr-4">When</th>
                          <th className="pb-2 pr-4">Category</th>
                          <th className="pb-2 pr-4">Source</th>
                          <th className="pb-2 pr-4">Linked Job</th>
                          <th className="pb-2">Job Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contentPlanningRows.map((row) => (
                          <tr key={row.id} className="border-b border-border/50">
                            <td className="py-2 pr-4 font-medium">{row.title}</td>
                            <td className="py-2 pr-4">{row.when}</td>
                            <td className="py-2 pr-4">{row.category}</td>
                            <td className="py-2 pr-4 uppercase">{row.source}</td>
                            <td className="py-2 pr-4">{row.linkedJobTitle}</td>
                            <td className="py-2">{row.linkedJobStage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Date Range:</Label>
                    <Input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="w-[140px] text-xs" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="w-[140px] text-xs" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Compare with:</Label>
                    <select
                      value={compareWorkspace ?? ''}
                      onChange={(e) => setCompareWorkspace(Number(e.target.value) || null)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">— None —</option>
                      {workspaces.filter(w => w.id !== activeWsId).map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {metricsData.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No data available. Fetch live metrics on your posted jobs first.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader><CardTitle>Platform Performance</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="platform" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="views" name="Views" fill="#8884d8" />
                          <Bar dataKey="engagement" name="Engagement" fill="#82ca9d" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Month-over-Month {compareWsName ? `(${currentWorkspace?.name} vs ${compareWsName})` : ''}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={compareWorkspace ? mergedMonthly : monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="views" name={compareWorkspace ? `${currentWorkspace?.name} Views` : 'Views'} fill="#8884d8" />
                          {compareWorkspace && (
                            <Bar dataKey="compareViews" name={`${compareWsName} Views`} fill="#fbbf24" />
                          )}
                          <Bar dataKey="engagement" name={compareWorkspace ? `${currentWorkspace?.name} Eng.` : 'Engagement'} fill="#82ca9d" />
                          {compareWorkspace && (
                            <Bar dataKey="compareEngagement" name={`${compareWsName} Eng.`} fill="#f87171" />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Engagement Rate by Post</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metricsData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="jobTitle" angle={-45} textAnchor="end" height={80} />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="engagementRate" stroke="#8884d8" name="Engagement Rate %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />One-Page Summary</CardTitle>
                  <CardDescription>Quick overview for the selected period</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Total views, engagement & rate</li>
                    <li>• Platform breakdown table</li>
                    <li>• Top 5 performing posts</li>
                  </ul>
                  <Button className="w-full" disabled={metricsData.length === 0 || generatingPdf !== null} onClick={generateSummaryPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    {generatingPdf === 'summary' ? 'Generating...' : 'Generate PDF'}
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Quarterly Deep-Dive</CardTitle>
                  <CardDescription>Comprehensive analysis with recommendations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Month-over-month growth</li>
                    <li>• All posts ranked</li>
                    <li>• Actionable recommendations</li>
                  </ul>
                  <Button className="w-full" disabled={metricsData.length === 0 || generatingPdf !== null} onClick={generateQuarterlyPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    {generatingPdf === 'quarterly' ? 'Generating...' : 'Generate PDF'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
