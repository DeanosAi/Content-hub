import { useState } from 'react'
import { Filter, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KanbanBoard } from './KanbanBoard'
import { NewJobDialog } from './NewJobDialog'
import { useJobStore } from '@/store/jobStore'
import { Platform } from '@/types'

export interface FilterState {
  dueDateFrom: string
  dueDateTo: string
  priority: number | null
  platform: Platform | null
  keyword: string
  sortBy: 'default' | 'due_date' | 'platform' | 'priority'
  applyToAll: boolean
}

const EMPTY_FILTER: FilterState = {
  dueDateFrom: '',
  dueDateTo: '',
  priority: null,
  platform: null,
  keyword: '',
  sortBy: 'default',
  applyToAll: false,
}

export function Dashboard() {
  const { workspaces, selectedWorkspace } = useJobStore()
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTER })
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({ ...EMPTY_FILTER })

  const currentWorkspace = workspaces.find(w => w.id === selectedWorkspace)

  const hasActiveFilters =
    appliedFilters.dueDateFrom !== '' ||
    appliedFilters.dueDateTo !== '' ||
    appliedFilters.priority !== null ||
    appliedFilters.platform !== null ||
    appliedFilters.keyword.trim() !== '' ||
    appliedFilters.sortBy !== 'default'

  const activeFilterCount = [
    appliedFilters.dueDateFrom || appliedFilters.dueDateTo ? 1 : 0,
    appliedFilters.priority !== null ? 1 : 0,
    appliedFilters.platform !== null ? 1 : 0,
    appliedFilters.keyword.trim() !== '' ? 1 : 0,
    appliedFilters.sortBy !== 'default' ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const applyFilters = () => {
    setAppliedFilters({ ...filters })
    setShowFilters(false)
  }

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTER })
    setAppliedFilters({ ...EMPTY_FILTER })
    setShowFilters(false)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{currentWorkspace?.name || 'Select a Workspace'}</h2>
          <p className="text-sm text-muted-foreground">
            Manage content workflow and track performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setFilters({ ...appliedFilters }); setShowFilters(!showFilters) }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-[340px] bg-card border rounded-lg shadow-lg z-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Filters</h4>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFilters(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Keyword</Label>
                  <Input
                    value={filters.keyword}
                    onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                    placeholder="Search title, description, hashtags, custom fields..."
                    className="text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Sort by</Label>
                  <Select value={filters.sortBy} onValueChange={(value) => setFilters({ ...filters, sortBy: value as FilterState['sortBy'] })}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="due_date">Due date</SelectItem>
                      <SelectItem value="platform">Platform</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Due Date Range</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={filters.dueDateFrom}
                      onChange={(e) => setFilters({ ...filters, dueDateFrom: e.target.value })}
                      className="text-xs"
                    />
                    <Input
                      type="date"
                      value={filters.dueDateTo}
                      onChange={(e) => setFilters({ ...filters, dueDateTo: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Priority</Label>
                  <div className="flex gap-2">
                    {[null, 0, 1, 2].map((p) => (
                      <Button
                        key={String(p)}
                        variant={filters.priority === p ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs flex-1"
                        onClick={() => setFilters({ ...filters, priority: p })}
                      >
                        {p === null ? 'All' : p === 0 ? 'Normal' : `P${p}`}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Platform</Label>
                  <div className="flex gap-2">
                    {([null, 'instagram', 'tiktok', 'youtube', 'facebook'] as (Platform | null)[]).map((pl) => (
                      <Button
                        key={String(pl)}
                        variant={filters.platform === pl ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs flex-1"
                        onClick={() => setFilters({ ...filters, platform: pl })}
                      >
                        {pl === null ? 'All' : pl.charAt(0).toUpperCase() + pl.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="applyAll"
                    checked={filters.applyToAll}
                    onChange={(e) => setFilters({ ...filters, applyToAll: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="applyAll" className="text-xs cursor-pointer">Apply to all workspaces</Label>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1" onClick={clearFilters}>
                    Clear All
                  </Button>
                  <Button size="sm" className="flex-1" onClick={applyFilters}>
                    <Check className="h-3 w-3 mr-1" />
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
          <NewJobDialog />
        </div>
      </header>

      {hasActiveFilters && (
        <div className="px-6 py-2 bg-muted/50 border-b flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground">Active filters:</span>
          {(appliedFilters.dueDateFrom || appliedFilters.dueDateTo) && (
            <Badge variant="secondary" className="text-xs">
              Due: {appliedFilters.dueDateFrom || '∞'} → {appliedFilters.dueDateTo || '∞'}
            </Badge>
          )}
          {appliedFilters.priority !== null && (
            <Badge variant="secondary" className="text-xs">
              {appliedFilters.priority === 0 ? 'Normal' : `P${appliedFilters.priority}`}
            </Badge>
          )}
          {appliedFilters.platform !== null && (
            <Badge variant="secondary" className="text-xs">{appliedFilters.platform}</Badge>
          )}
          {appliedFilters.keyword.trim() !== '' && (
            <Badge variant="secondary" className="text-xs">Keyword: {appliedFilters.keyword}</Badge>
          )}
          {appliedFilters.sortBy !== 'default' && (
            <Badge variant="secondary" className="text-xs">Sort: {appliedFilters.sortBy.replace('_', ' ')}</Badge>
          )}
          {appliedFilters.applyToAll && (
            <Badge variant="outline" className="text-xs">All workspaces</Badge>
          )}
          <Button variant="ghost" size="sm" className="h-5 text-xs ml-auto" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      )}

      <div className="flex-1 p-6 overflow-hidden">
        <KanbanBoard filters={appliedFilters} />
      </div>
    </div>
  )
}
