import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, FileText, Download, TrendingUp, BarChart3, Check, AlertCircle, RefreshCw, Eye, Heart, MessageSquare } from 'lucide-react'
import { useJobStore } from '@/store/jobStore'
import { dbService } from '@/services/database'
import { Job, Platform } from '@/types'
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
  // Charts state
  const [compareWorkspace, setCompareWorkspace] = useState<number | null>(null)
  const [compareJobs, setCompareJobs] = useState<Job[]>([])

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Load jobs for the selected report workspace
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
  }, [reportWorkspace, selectedWorkspace, jobs]) // re-run when main jobs change too

  // Load compare workspace jobs
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

  // Filter posted/archived jobs with live_metrics, within date range
  const metricsData: PostMetric[] = useMemo(() => {
    return allJobs
      .filter(j => (j.stage === 'posted' || j.stage === 'archive') && j.live_metrics)
      .filter(j => {
        if (!dateRange.start && !dateRange.end) return true
        // Use live_metrics.last_updated or job created_at as the date reference
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

  // Total posted jobs in range (regardless of whether they have metrics)
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

  // Summary stats
  const totalViews = metricsData.reduce((s, m) => s + m.views, 0)
  const totalEngagement = metricsData.reduce((s, m) => s + m.likes + m.comments + m.shares, 0)
  const avgEngagementRate = metricsData.length > 0
    ? metricsData.reduce((s, m) => s + m.engagementRate, 0) / metricsData.length : 0

  // Platform breakdown
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

  const topPosts = [...metricsData].sort((a, b) =>
    (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)
  )

  // Monthly data for charts
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

  // Compare workspace monthly data
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

  // Merged chart data for comparison
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

  // Update all posts in range via Apify
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

    // Reload jobs to reflect new metrics
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

  // PDF generation
  // Helper: draw a bar chart directly in jsPDF
  const drawBarChart = (doc: jsPDF, x: number, y: number, w: number, h: number,
    data: { label: string; value: number; color: [number, number, number] }[], title: string) => {
    doc.setFontSize(10); doc.setTextColor(24, 24, 27); doc.text(title, x, y - 3)
    const maxVal = Math.max(...data.map(d => d.value), 1)
    const barW = Math.min(30, (w - 10) / data.length - 4)
    const chartX = x + 5
    // Y axis line
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

      // Platform Performance Chart
      const platColors: Record<string, [number, number, number]> = {
        instagram: [99, 102, 241], tiktok: [16, 185, 129], youtube: [239, 68, 68]
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

      // Month-over-Month Chart
      if (monthlyChartData.length > 0) {
        const monthColors: [number, number, number] = [99, 102, 241]
        const monthBars = monthlyChartData.map(d => ({ label: d.month, value: d.views, color: monthColors }))
        drawBarChart(doc, 14, y + 4, pageWidth - 28, 50, monthBars, 'Month-over-Month Views')
        y += 65

        // Month comparison text
        if (monthlyChartData.length >= 2) {
          const curr = monthlyChartData[monthlyChartData.length - 1]
          const prev = monthlyChartData[monthlyChartData.length - 2]
          const viewsΔ = prev.views > 0 ? (((curr.views - prev.views) / prev.views) * 100).toFixed(1) : 'N/A'
          const engΔ = prev.engagement > 0 ? (((curr.engagement - prev.engagement) / prev.engagement) * 100).toFixed(1) : 'N/A'
          doc.setFontSize(8); doc.setTextColor(80, 80, 80)
          doc.text(`${curr.month} vs ${prev.month}: Views ${viewsΔ}%, Engagement ${engΔ}%`, 14, y)
          y += 6
        } else {
          doc.setFontSize(8); doc.setTextColor(150, 150, 150)
          doc.text('No previous month data available for comparison.', 14, y)
          y += 6
        }
      }

      // Check if we need a new page for tables
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

      // Month-over-month
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

      // All posts ranked
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
      y = (doc as any).lastAutoTable.finalY + 10

      // Recommendations
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFillColor(234, 250, 241); doc.roundedRect(14, y, pageWidth - 28, 50, 3, 3, 'F')
      doc.setFontSize(13); doc.setTextColor(22, 101, 52); doc.text('Recommendations', 20, y + 10)
      doc.setFontSize(9); doc.setTextColor(21, 128, 61)
      const recs: string[] = []
      const platAnalysis = Object.entries(platformData).sort((a, b) => {
        const rA = a[1].views > 0 ? (a[1].engagement / a[1].views) * 100 : 0
        const rB = b[1].views > 0 ? (b[1].engagement / b[1].views) * 100 : 0
        return rB - rA
      })
      if (platAnalysis.length > 0) recs.push(`Focus on ${platAnalysis[0][0]} — highest engagement rate.`)
      if (metricsData.length < 10) recs.push('Track more posts for statistically meaningful insights.')
      if (avgEngagementRate < 3) recs.push('Engagement below 3% — experiment with hooks, CTAs, trending audio.')
      else if (avgEngagementRate > 5) recs.push('Strong engagement! Double down and increase posting frequency.')
      if (topPosts[0]) recs.push(`Top post "${topPosts[0].jobTitle.slice(0, 30)}" shows what works — create similar content.`)
      if (recs.length === 0) recs.push('Import more data to unlock smart recommendations.')
      recs.forEach((r, i) => { if (y + 16 + i * 6 < y + 46) doc.text(`${i + 1}. ${r}`, 20, y + 18 + i * 6) })

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
          <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          {/* ─── Overview Tab ─── */}
          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards */}
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

            {/* Date Range + Update Button */}
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

            {/* Top Posts Table */}
            {metricsData.length > 0 && (
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
            )}
          </TabsContent>

          {/* ─── Charts Tab ─── */}
          <TabsContent value="charts" className="space-y-6">
            {/* Chart Controls */}
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
                {/* Platform Breakdown */}
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

                {/* Month-over-Month */}
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

                {/* Engagement Rate by Post */}
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

          {/* ─── Export Tab ─── */}
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
