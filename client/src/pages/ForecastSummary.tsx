import { useState, useEffect, useMemo } from 'react'
import { channelForecastApi } from '../services/api'

interface ForecastRow {
  channelGroup: string
  countryBucket: string
  sku: string
  forecastMonth: string
  forecastUnits: number
  updatedAt: string
}

interface ChannelStatus {
  channelGroup: string
  regions: string[]
  monthCount: string
  lastUpdated: string
}

const CHANNELS = ['B2C', 'Replacement', 'Retail', 'Marketplace']

// Channels that don't require region breakdowns
const NO_REGION_CHANNELS = ['B2C', 'Replacement', 'Marketplace']

// Expected regions for Retail
const RETAIL_REGIONS = [
  'INDIA', 'UNITED STATES', 'EUROPE UNION', 'UNITED KINGDOM',
  'UNITED ARAB EMIRATES', 'AUSTRALIA', 'CANADA', 'GERMANY',
  'NETHERLANDS', 'FRANCE', 'JAPAN', 'SAUDI ARABIA', 'SINGAPORE', 'ROW',
]

const RING_TYPES: Record<string, string[]> = {
  'Ring Air': ['AA', 'AG', 'AS', 'BR', 'MG', 'RT'],
  'Diesel Collaborated': ['DB', 'DS'],
  'Wabi Sabi': ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'],
}

function getRingType(sku: string): string {
  const prefix = sku.slice(0, 2).toUpperCase()
  for (const [type, prefixes] of Object.entries(RING_TYPES)) {
    if (prefixes.includes(prefix)) return type
  }
  return 'Other'
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const then = new Date(dateStr)
  const diffMs = now.getTime() - then.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

interface StatusInfo {
  label: string
  color: string
  bgColor: string
  detail: string | null
  progress: number // 0-100
}

function getChannelStatus(ch: string, statusMap: Record<string, ChannelStatus>): StatusInfo {
  const status = statusMap[ch]

  if (!status) {
    return {
      label: 'Not Started',
      color: '#6b7280',
      bgColor: '#f3f4f6',
      detail: null,
      progress: 0,
    }
  }

  if (NO_REGION_CHANNELS.includes(ch)) {
    const months = parseInt(status.monthCount) || 0
    return {
      label: 'Complete',
      color: '#059669',
      bgColor: '#ecfdf5',
      detail: `${months} months \u00B7 ${timeAgo(status.lastUpdated)}`,
      progress: 100,
    }
  }

  // Retail - check region coverage
  const filledRegions = status.regions.filter(r => r !== 'ALL')
  const totalExpected = RETAIL_REGIONS.length
  const filledCount = filledRegions.length
  const months = parseInt(status.monthCount) || 0

  if (filledCount === 0) {
    return {
      label: 'Not Started',
      color: '#6b7280',
      bgColor: '#f3f4f6',
      detail: null,
      progress: 0,
    }
  }

  if (filledCount >= totalExpected) {
    return {
      label: 'Complete',
      color: '#059669',
      bgColor: '#ecfdf5',
      detail: `${filledCount}/${totalExpected} regions \u00B7 ${months} months \u00B7 ${timeAgo(status.lastUpdated)}`,
      progress: 100,
    }
  }

  const progress = Math.round((filledCount / totalExpected) * 100)
  return {
    label: `${filledCount}/${totalExpected} regions`,
    color: '#d97706',
    bgColor: '#fffbeb',
    detail: `${months} months \u00B7 ${timeAgo(status.lastUpdated)}`,
    progress,
  }
}

function ForecastSummary() {
  const [forecasts, setForecasts] = useState<ForecastRow[]>([])
  const [channelStatusList, setChannelStatusList] = useState<ChannelStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(CHANNELS))
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  useEffect(() => {
    channelForecastApi.getForecastSummary()
      .then(res => {
        setForecasts(res.data.forecasts || [])
        setChannelStatusList(res.data.channelStatus || [])
      })
      .catch(err => console.error('Failed to load forecasts:', err))
      .finally(() => setLoading(false))
  }, [])

  const statusMap = useMemo(() => {
    const map: Record<string, ChannelStatus> = {}
    for (const s of channelStatusList) map[s.channelGroup] = s
    return map
  }, [channelStatusList])

  // Get unique months across all data
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const f of forecasts) set.add(f.forecastMonth.slice(0, 7))
    return Array.from(set).sort()
  }, [forecasts])

  // Toggle channel selection
  const toggleChannelSelect = (ch: string) => {
    setSelectedChannels(prev => {
      const next = new Set(prev)
      if (next.has(ch)) {
        next.delete(ch)
      } else {
        next.add(ch)
      }
      return next
    })
  }

  const selectAllChannels = () => {
    setSelectedChannels(new Set(CHANNELS))
  }

  // Filter by selected channels
  const channelData = useMemo(() => {
    return forecasts.filter(f => selectedChannels.has(f.channelGroup))
  }, [forecasts, selectedChannels])

  // Build SKU -> month -> units map
  const skuMonthMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const f of channelData) {
      const monthKey = f.forecastMonth.slice(0, 7)
      if (!map[f.sku]) map[f.sku] = {}
      map[f.sku][monthKey] = (map[f.sku][monthKey] || 0) + f.forecastUnits
    }
    return map
  }, [channelData])

  const skus = useMemo(() => Object.keys(skuMonthMap).sort(), [skuMonthMap])

  // Group SKUs by ring type
  const groupedSKUs = useMemo(() => {
    const typeOrder = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']
    const groups: { type: 'header' | 'sku'; label: string; sku?: string }[] = []

    for (const type of typeOrder) {
      const typeSkus = skus.filter(s => getRingType(s) === type)
      if (typeSkus.length > 0) {
        groups.push({ type: 'header', label: type })
        for (const sku of typeSkus) {
          groups.push({ type: 'sku', label: sku, sku })
        }
      }
    }
    return groups
  }, [skus])

  // Channel totals per month
  const channelMonthTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const sku of skus) {
      for (const m of months) {
        totals[m] = (totals[m] || 0) + (skuMonthMap[sku]?.[m] || 0)
      }
    }
    return totals
  }, [skuMonthMap, skus, months])

  // Category totals per month
  const categoryMonthTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {}
    for (const sku of skus) {
      const type = getRingType(sku)
      if (!totals[type]) totals[type] = {}
      for (const m of months) {
        totals[type][m] = (totals[type][m] || 0) + (skuMonthMap[sku]?.[m] || 0)
      }
    }
    return totals
  }, [skuMonthMap, skus, months])

  // Grand total across all channels per month
  const allChannelTotals = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {}
    for (const ch of CHANNELS) {
      totals[ch] = {}
      for (const f of forecasts.filter(ff => ff.channelGroup === ch)) {
        const m = f.forecastMonth.slice(0, 7)
        totals[ch][m] = (totals[ch][m] || 0) + f.forecastUnits
      }
    }
    return totals
  }, [forecasts])

  // Per-channel per-region monthly totals (for Retail expansion)
  const regionTotals = useMemo(() => {
    const totals: Record<string, Record<string, Record<string, number>>> = {}
    for (const f of forecasts) {
      const ch = f.channelGroup
      const region = f.countryBucket
      const m = f.forecastMonth.slice(0, 7)
      if (!totals[ch]) totals[ch] = {}
      if (!totals[ch][region]) totals[ch][region] = {}
      totals[ch][region][m] = (totals[ch][region][m] || 0) + f.forecastUnits
    }
    return totals
  }, [forecasts])

  // Regions present for Retail, sorted by total descending
  const retailRegions = useMemo(() => {
    const rt = regionTotals['Retail'] || {}
    return Object.keys(rt)
      .map(region => ({
        region,
        total: Object.values(rt[region] || {}).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map(r => r.region)
  }, [regionTotals])

  // Expanded channels state
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({})
  const toggleChannelExpand = (ch: string) => {
    setExpandedChannels(prev => ({ ...prev, [ch]: !prev[ch] }))
  }

  if (loading) {
    return <div className="forecast-summary-page"><p>Loading forecasts...</p></div>
  }

  return (
    <div className="forecast-summary-page">
      <div className="page-header">
        <h1 className="page-title">Forecast Summary</h1>
      </div>

      {/* All Channels Overview */}
      <div className="card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>All Channels Overview</h2>
        {months.length === 0 ? (
          <p style={{ color: 'var(--text-secondary, #888)' }}>No forecasts generated yet. Go to Channel Forecast to generate.</p>
        ) : (
          <table style={{ width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', minWidth: '160px' }}>Channel</th>
                {months.map(m => (
                  <th key={m} style={{ textAlign: 'center', minWidth: '80px', fontSize: '0.85rem' }}>
                    {formatMonth(m + '-01')}
                  </th>
                ))}
                <th style={{ textAlign: 'center', minWidth: '90px', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.flatMap(ch => {
                const hasData = Object.values(allChannelTotals[ch] || {}).some(v => v > 0)
                const status = getChannelStatus(ch, statusMap)
                const isRetail = ch === 'Retail'
                const isExpanded = expandedChannels[ch]
                const hasRegions = isRetail && retailRegions.length > 0

                // Row colors based on status
                const rowBg = status.progress === 100
                  ? '#f0fdf4'  // green tint - complete
                  : status.progress > 0
                    ? '#fffbeb'  // amber tint - partial
                    : '#f9fafb'  // gray tint - not started
                const borderColor = status.progress === 100
                  ? '#22c55e'  // green
                  : status.progress > 0
                    ? '#f59e0b'  // amber
                    : '#d1d5db'  // gray
                const allSelected = selectedChannels.size === CHANNELS.length
                const isSelected = selectedChannels.has(ch) && !allSelected
                const stickyBg = rowBg

                const rows = []

                rows.push(
                  <tr
                    key={ch}
                    className="channel-row"
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? '#eef2ff' : rowBg,
                      transition: 'background 0.15s ease',
                    }}
                    onClick={() => {
                      setSelectedChannels(prev => {
                        const next = new Set(prev)
                        if (next.has(ch) && next.size > 1) {
                          // Deselect this channel (but keep at least one)
                          next.delete(ch)
                        } else if (next.has(ch) && next.size === 1) {
                          // Last one selected — go back to all
                          return new Set(CHANNELS)
                        } else {
                          next.add(ch)
                        }
                        return next
                      })
                    }}
                  >
                    <td style={{
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      background: isSelected ? '#eef2ff' : stickyBg,
                      borderLeft: `4px solid ${isSelected ? '#6366f1' : borderColor}`,
                      userSelect: 'none',
                      padding: '0.6rem 0.5rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{ch}</span>
                        {hasRegions && (() => {
                          const filledCount = retailRegions.length
                          const totalCount = RETAIL_REGIONS.length
                          const pillColor = filledCount === 0
                            ? { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' }   // red - zero
                            : filledCount >= totalCount
                              ? { text: '#059669', bg: '#ecfdf5', border: '#a7f3d0' } // green - all filled
                              : { text: '#d97706', bg: '#fffbeb', border: '#fde68a' } // orange - partial
                          return (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                color: pillColor.text,
                                cursor: 'pointer',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '10px',
                                background: pillColor.bg,
                                border: `1px solid ${pillColor.border}`,
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap',
                              }}
                              title={isExpanded ? 'Collapse regions' : 'Expand regions'}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleChannelExpand(ch)
                              }}
                            >
                              {filledCount}/{totalCount} regions {isExpanded ? '\u2191' : '\u2193'}
                            </span>
                          )
                        })()}
                        {status.progress > 0 && status.progress < 100 && !hasRegions && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: '#d97706',
                            background: '#fef3c7',
                            padding: '0.05rem 0.35rem',
                            borderRadius: '4px',
                            marginLeft: '0.25rem',
                          }}>
                            {status.label}
                          </span>
                        )}
                        {status.progress === 0 && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: '#9ca3af',
                            fontStyle: 'italic',
                            marginLeft: '0.25rem',
                          }}>
                            No forecast
                          </span>
                        )}
                      </div>
                    </td>
                    {months.map(m => (
                      <td key={m} style={{
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        color: hasData ? 'var(--text, #111)' : '#d1d5db',
                      }}>
                        {hasData ? ((allChannelTotals[ch]?.[m] || 0).toLocaleString()) : '\u2014'}
                      </td>
                    ))}
                    <td style={{
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      color: hasData ? 'var(--text, #111)' : '#d1d5db',
                    }}>
                      {hasData ? Object.values(allChannelTotals[ch] || {}).reduce((s, v) => s + v, 0).toLocaleString() : '\u2014'}
                    </td>
                  </tr>
                )

                // Expanded region sub-rows for Retail
                if (isRetail && isExpanded) {
                  const rt = regionTotals['Retail'] || {}
                  for (const region of retailRegions) {
                    const rData = rt[region] || {}
                    const rTotal = Object.values(rData).reduce((s, v) => s + v, 0)
                    rows.push(
                      <tr key={`retail-${region}`} style={{ background: '#f0fdf4' }}>
                        <td style={{
                          position: 'sticky',
                          left: 0,
                          background: '#f0fdf4',
                          paddingLeft: '2.2rem',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          borderLeft: '4px solid #86efac',
                        }}>
                          {region}
                        </td>
                        {months.map(m => (
                          <td key={m} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                            {(rData[m] || 0).toLocaleString()}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.85rem' }}>
                          {rTotal.toLocaleString()}
                        </td>
                      </tr>
                    )
                  }
                  const filledSet = new Set(retailRegions)
                  const missingRegions = RETAIL_REGIONS.filter(r => !filledSet.has(r))
                  for (const region of missingRegions) {
                    rows.push(
                      <tr key={`retail-missing-${region}`} style={{ background: '#fef9ee' }}>
                        <td style={{
                          position: 'sticky',
                          left: 0,
                          background: '#fef9ee',
                          paddingLeft: '2.2rem',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          color: '#9ca3af',
                          borderLeft: '4px solid #fcd34d',
                        }}>
                          {region}
                        </td>
                        {months.map(m => (
                          <td key={m} style={{ textAlign: 'center', fontSize: '0.85rem', color: '#d1d5db' }}>{'\u2014'}</td>
                        ))}
                        <td style={{ textAlign: 'center', fontSize: '0.85rem', color: '#d1d5db' }}>{'\u2014'}</td>
                      </tr>
                    )
                  }
                }

                return rows
              })}
              <tr
                className="channel-row"
                style={{
                  fontWeight: 700,
                  borderTop: '2px solid var(--border, #ddd)',
                  background: selectedChannels.size === CHANNELS.length ? '#eef2ff' : 'var(--surface-alt, #f0f4f8)',
                  cursor: 'pointer',
                }}
                onClick={selectAllChannels}
              >
                <td style={{
                  position: 'sticky',
                  left: 0,
                  background: selectedChannels.size === CHANNELS.length ? '#eef2ff' : 'var(--surface-alt, #f0f4f8)',
                  borderLeft: `4px solid ${selectedChannels.size === CHANNELS.length ? '#6366f1' : 'transparent'}`,
                  userSelect: 'none',
                }}>Grand Total</td>
                {months.map(m => {
                  const total = CHANNELS.reduce((s, ch) => s + (allChannelTotals[ch]?.[m] || 0), 0)
                  return (
                    <td key={m} style={{ textAlign: 'center' }}>{total.toLocaleString()}</td>
                  )
                })}
                <td style={{ textAlign: 'center' }}>
                  {CHANNELS.reduce((s, ch) => s + Object.values(allChannelTotals[ch] || {}).reduce((ss, v) => ss + v, 0), 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Channel Detail - SKU Breakdown */}
      {months.length > 0 && selectedChannels.size > 0 && skus.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>
            {selectedChannels.size === CHANNELS.length
              ? 'Grand Total'
              : Array.from(selectedChannels).join(' + ')
            } - SKU Breakdown
          </h2>
          <table style={{ width: '100%', minWidth: '800px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', minWidth: '120px' }}>SKU</th>
                {months.map(m => (
                  <th key={m} style={{ textAlign: 'center', minWidth: '80px', fontSize: '0.85rem' }}>
                    {formatMonth(m + '-01')}
                  </th>
                ))}
                <th style={{ textAlign: 'center', minWidth: '90px', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {groupedSKUs.map((item) => {
                if (item.type === 'header') {
                  const collapsed = collapsedCategories[item.label]
                  const catTotals = categoryMonthTotals[item.label] || {}
                  return (
                    <tr
                      key={`header-${item.label}`}
                      style={{ background: 'var(--surface-alt, #f0f4f8)', cursor: 'pointer' }}
                      onClick={() => toggleCategory(item.label)}
                    >
                      <td style={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        padding: '0.6rem 0.5rem',
                        position: 'sticky',
                        left: 0,
                        background: 'var(--surface-alt, #f0f4f8)',
                        userSelect: 'none',
                      }}>
                        <span style={{ display: 'inline-block', width: '1.2rem', fontSize: '0.75rem' }}>
                          {collapsed ? '\u25B6' : '\u25BC'}
                        </span>
                        {item.label}
                      </td>
                      {months.map(m => (
                        <td key={m} style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                          {(catTotals[m] || 0).toLocaleString()}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                        {Object.values(catTotals).reduce((s, v) => s + v, 0).toLocaleString()}
                      </td>
                    </tr>
                  )
                }

                const sku = item.sku!
                if (collapsedCategories[getRingType(sku)]) return null

                const skuData = skuMonthMap[sku] || {}
                const skuTotal = months.reduce((s, m) => s + (skuData[m] || 0), 0)
                return (
                  <tr key={sku}>
                    <td style={{ fontWeight: 500, position: 'sticky', left: 0, background: 'var(--surface, #fff)', fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
                      {sku}
                    </td>
                    {months.map(m => (
                      <td key={m} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                        {(skuData[m] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.85rem' }}>
                      {skuTotal.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, #ddd)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Total</td>
                {months.map(m => (
                  <td key={m} style={{ textAlign: 'center' }}>
                    {(channelMonthTotals[m] || 0).toLocaleString()}
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  {Object.values(channelMonthTotals).reduce((s, v) => s + v, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .forecast-summary-page .page-header {
          display: flex;
          align-items: baseline;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .forecast-summary-page table {
          border-collapse: collapse;
        }
        .forecast-summary-page th,
        .forecast-summary-page td {
          padding: 0.4rem 0.5rem;
          border-bottom: 1px solid var(--border, #eee);
        }
        .forecast-summary-page th {
          font-size: 0.8rem;
          color: var(--text-secondary, #666);
          font-weight: 600;
        }
        .forecast-summary-page .channel-row:hover {
          filter: brightness(0.97);
        }
      `}</style>
    </div>
  )
}

export default ForecastSummary
