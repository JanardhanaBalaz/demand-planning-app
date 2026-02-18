import { useState, useEffect, useMemo } from 'react'
import { stockAnalysisApi } from '../services/api'

interface SkuAnalysis {
  sku: string
  ringType: string
  totalStock: number
  dailyDemand: number
  daysOfCover: number
  status: 'critical' | 'understock' | 'balanced' | 'overstock'
  warehouseStock: Record<string, number>
  channelDemand: Record<string, number>
}

interface Summary {
  critical: number
  understock: number
  balanced: number
  overstock: number
  totalSKUs: number
}

const STATUS_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  understock: { label: 'Understock', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  balanced: { label: 'Balanced', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  overstock: { label: 'Overstock', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

const CHANNEL_COLORS: Record<string, string> = {
  'B2C': '#059669',
  'Replacement': '#d97706',
  'Retail': '#2563eb',
  'Marketplace': '#db2777',
}

const TYPE_ORDER = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']

function StockAnalysis() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [skus, setSkus] = useState<SkuAnalysis[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSKUs, setExpandedSKUs] = useState<Record<string, boolean>>({})
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [collapsedTypes, setCollapsedTypes] = useState<Record<string, boolean>>({})

  useEffect(() => {
    stockAnalysisApi.getData()
      .then(res => {
        setSummary(res.data.summary)
        setSkus(res.data.skus || [])
        setLocations(res.data.locations || [])
        setError(null)
      })
      .catch(err => {
        console.error('Failed to load stock analysis:', err)
        setError('Failed to load stock analysis')
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (sku: string) => {
    setExpandedSKUs(prev => ({ ...prev, [sku]: !prev[sku] }))
  }

  const toggleType = (type: string) => {
    setCollapsedTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  // Filter SKUs
  const filtered = useMemo(() => {
    return skus.filter(s => {
      if (filterStatus !== 'all' && s.status !== filterStatus) return false
      if (filterType !== 'all' && s.ringType !== filterType) return false
      return true
    })
  }, [skus, filterStatus, filterType])

  // Group by ring type
  const grouped = useMemo(() => {
    const groups: { type: 'header' | 'sku'; label: string; sku?: SkuAnalysis; typeName?: string }[] = []

    for (const type of TYPE_ORDER) {
      const typeSkus = filtered.filter(s => s.ringType === type)
      if (typeSkus.length === 0) continue

      // Category summary
      const totalStock = typeSkus.reduce((s, sk) => s + sk.totalStock, 0)
      const totalDemand = typeSkus.reduce((s, sk) => s + sk.dailyDemand, 0)
      const avgDays = totalDemand > 0 ? Math.round(totalStock / totalDemand) : 9999

      groups.push({ type: 'header', label: `${type} (${typeSkus.length} SKUs \u00B7 Stock: ${totalStock.toLocaleString()} \u00B7 ${avgDays} days avg)`, typeName: type })
      for (const sku of typeSkus) {
        groups.push({ type: 'sku', label: sku.sku, sku, typeName: type })
      }
    }
    return groups
  }, [filtered])

  if (loading) {
    return <div className="stock-analysis-page"><p>Analyzing stock levels per SKU...</p></div>
  }

  if (error || !summary) {
    return (
      <div className="stock-analysis-page">
        <p style={{ color: '#dc2626' }}>{error || 'No data available'}</p>
      </div>
    )
  }

  return (
    <div className="stock-analysis-page">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Stock Analysis</h1>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          SKU-level overstock / understock &middot; 30-day demand coverage &middot; {summary.totalSKUs} SKUs
        </span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {(['critical', 'understock', 'balanced', 'overstock'] as const).map(status => {
          const config = STATUS_CONFIG[status]
          const count = summary[status]
          const isActive = filterStatus === status
          return (
            <div
              key={status}
              className="card"
              onClick={() => setFilterStatus(isActive ? 'all' : status)}
              style={{
                padding: '1rem',
                textAlign: 'center',
                borderLeft: `4px solid ${config.color}`,
                background: count > 0 ? config.bg : '#fafafa',
                cursor: 'pointer',
                outline: isActive ? `2px solid ${config.color}` : 'none',
                outlineOffset: '-2px',
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: config.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {config.label}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: count > 0 ? config.color : '#d1d5db', marginTop: '0.25rem' }}>
                {count}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                {status === 'critical' ? '<15 days' : status === 'understock' ? '15-30 days' : status === 'balanced' ? '30-60 days' : '>60 days'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
        >
          <option value="all">All Ring Types</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterStatus !== 'all' || filterType !== 'all') && (
          <button
            onClick={() => { setFilterStatus('all'); setFilterType('all') }}
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: '#fff', color: '#6b7280' }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {skus.length} SKUs
        </span>
      </div>

      {/* SKU table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '750px' }}>
          <thead>
            <tr>
              <th style={{ minWidth: '80px', textAlign: 'left' }}>SKU</th>
              <th style={{ textAlign: 'center', minWidth: '90px' }}>Total Stock</th>
              <th style={{ textAlign: 'center', minWidth: '90px' }}>Daily Demand</th>
              <th style={{ textAlign: 'center', minWidth: '100px' }}>Days of Cover</th>
              <th style={{ textAlign: 'center', minWidth: '90px' }}>Status</th>
              <th style={{ minWidth: '200px' }}>Demand by Channel</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((item, idx) => {
              if (item.type === 'header') {
                const collapsed = collapsedTypes[item.typeName!]
                return (
                  <tr
                    key={`header-${item.typeName}`}
                    style={{ background: 'var(--surface-alt, #f0f4f8)', cursor: 'pointer' }}
                    onClick={() => toggleType(item.typeName!)}
                  >
                    <td colSpan={6} style={{
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      padding: '0.6rem 0.5rem',
                      userSelect: 'none',
                    }}>
                      <span style={{ display: 'inline-block', width: '1.2rem', fontSize: '0.75rem' }}>
                        {collapsed ? '\u25B6' : '\u25BC'}
                      </span>
                      {item.label}
                    </td>
                  </tr>
                )
              }

              if (collapsedTypes[item.typeName!]) return null
              const sku = item.sku!
              const config = STATUS_CONFIG[sku.status]
              const isExpanded = expandedSKUs[sku.sku]

              // Days of cover bar
              const barWidth = Math.min(100, (sku.daysOfCover / 90) * 100)

              return (
                <tbody key={sku.sku}>
                  <tr
                    style={{
                      cursor: 'pointer',
                      background: config.bg,
                      transition: 'background 0.15s ease',
                    }}
                    className="sku-row"
                    onClick={() => toggleExpand(sku.sku)}
                  >
                    <td style={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      borderLeft: `3px solid ${config.color}`,
                      paddingLeft: '1rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>
                          {isExpanded ? '\u25BC' : '\u25B6'}
                        </span>
                        {sku.sku}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
                      {sku.totalStock.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                      {sku.dailyDemand > 0 ? sku.dailyDemand.toFixed(1) : '\u2014'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.4rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                        <div style={{
                          width: '50px',
                          height: '6px',
                          background: '#e5e7eb',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: config.color,
                            borderRadius: '3px',
                          }} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: config.color, minWidth: '35px' }}>
                          {sku.daysOfCover >= 9999 ? '\u221E' : sku.daysOfCover}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '10px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: config.color,
                        background: 'rgba(255,255,255,0.7)',
                        border: `1px solid ${config.border}`,
                      }}>
                        {config.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {Object.entries(sku.channelDemand)
                          .filter(([, v]) => v > 0)
                          .sort(([, a], [, b]) => b - a)
                          .map(([ch, drr]) => (
                            <span key={ch} style={{
                              fontSize: '0.6rem',
                              fontWeight: 500,
                              padding: '0.05rem 0.35rem',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: CHANNEL_COLORS[ch] || '#374151',
                              whiteSpace: 'nowrap',
                            }}>
                              {ch}: {drr}/d
                            </span>
                          ))}
                        {Object.keys(sku.channelDemand).length === 0 && (
                          <span style={{ fontSize: '0.6rem', color: '#d1d5db', fontStyle: 'italic' }}>No demand</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded: warehouse stock breakdown */}
                  {isExpanded && (
                    <tr style={{ background: '#fafbfc' }}>
                      <td colSpan={6} style={{ padding: '0.5rem 1rem 0.5rem 2rem', borderLeft: '3px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                              Stock by Warehouse
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {Object.entries(sku.warehouseStock)
                                .filter(([, v]) => v > 0)
                                .sort(([, a], [, b]) => b - a)
                                .map(([wh, qty]) => (
                                  <span key={wh} style={{
                                    fontSize: '0.7rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    fontWeight: 500,
                                  }}>
                                    {wh}: {qty}
                                  </span>
                                ))}
                              {Object.keys(sku.warehouseStock).length === 0 && (
                                <span style={{ fontSize: '0.7rem', color: '#d1d5db' }}>No stock</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                              Demand by Channel (DRR)
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {Object.entries(sku.channelDemand)
                                .filter(([, v]) => v > 0)
                                .sort(([, a], [, b]) => b - a)
                                .map(([ch, drr]) => (
                                  <span key={ch} style={{
                                    fontSize: '0.7rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    background: '#fef3c7',
                                    color: CHANNEL_COLORS[ch] || '#374151',
                                    fontWeight: 500,
                                  }}>
                                    {ch}: {drr}/day
                                  </span>
                                ))}
                              {Object.keys(sku.channelDemand).length === 0 && (
                                <span style={{ fontSize: '0.7rem', color: '#d1d5db' }}>No demand data</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .stock-analysis-page table {
          border-collapse: collapse;
        }
        .stock-analysis-page th,
        .stock-analysis-page td {
          padding: 0.35rem 0.5rem;
          border-bottom: 1px solid var(--border, #eee);
        }
        .stock-analysis-page th {
          font-size: 0.75rem;
          color: var(--text-secondary, #666);
          font-weight: 600;
          text-align: left;
        }
        .stock-analysis-page .sku-row:hover {
          filter: brightness(0.97);
        }
      `}</style>
    </div>
  )
}

export default StockAnalysis
