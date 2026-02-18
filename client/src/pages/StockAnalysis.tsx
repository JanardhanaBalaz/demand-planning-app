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
  balanced: { label: 'Balanced', color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
  overstock: { label: 'Overstock', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

const TYPE_ORDER = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']

type SortKey = 'sku' | 'totalStock' | 'dailyDemand' | 'daysOfCover' | 'status' | string
type SortDir = 'asc' | 'desc'

function StockAnalysis() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [skus, setSkus] = useState<SkuAnalysis[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('daysOfCover')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ' \u2195'
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  const filtered = useMemo(() => {
    let result = skus.filter(s => {
      if (filterStatus !== 'all' && s.status !== filterStatus) return false
      if (filterType !== 'all' && s.ringType !== filterType) return false
      if (searchTerm && !s.sku.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })

    const statusOrder = { critical: 0, understock: 1, balanced: 2, overstock: 3 }

    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'sku') {
        cmp = a.sku.localeCompare(b.sku)
      } else if (sortKey === 'totalStock') {
        cmp = a.totalStock - b.totalStock
      } else if (sortKey === 'dailyDemand') {
        cmp = a.dailyDemand - b.dailyDemand
      } else if (sortKey === 'daysOfCover') {
        cmp = a.daysOfCover - b.daysOfCover
      } else if (sortKey === 'status') {
        cmp = statusOrder[a.status] - statusOrder[b.status]
      } else {
        // Warehouse column sort
        const aVal = a.warehouseStock[sortKey] || 0
        const bVal = b.warehouseStock[sortKey] || 0
        cmp = aVal - bVal
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [skus, filterStatus, filterType, searchTerm, sortKey, sortDir])

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
          SKU-level stock by warehouse &middot; 30-day demand coverage &middot; {summary.totalSKUs} SKUs
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
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
        >
          <option value="all">All Ring Types</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search SKU..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', width: '140px' }}
        />
        {(filterStatus !== 'all' || filterType !== 'all' || searchTerm) && (
          <button
            onClick={() => { setFilterStatus('all'); setFilterType('all'); setSearchTerm('') }}
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: '#fff', color: '#6b7280' }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {skus.length} SKUs
        </span>
      </div>

      {/* SKU x Warehouse matrix table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="stock-matrix">
            <thead>
              <tr>
                <th className="sticky-col col-sku" onClick={() => handleSort('sku')} style={{ cursor: 'pointer' }}>
                  SKU{sortIndicator('sku')}
                </th>
                <th className="sticky-col col-total" onClick={() => handleSort('totalStock')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                  Total{sortIndicator('totalStock')}
                </th>
                <th className="sticky-col col-drr" onClick={() => handleSort('dailyDemand')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                  DRR{sortIndicator('dailyDemand')}
                </th>
                <th className="sticky-col col-doc" onClick={() => handleSort('daysOfCover')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                  DOC{sortIndicator('daysOfCover')}
                </th>
                <th className="sticky-col col-status" onClick={() => handleSort('status')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                  Status{sortIndicator('status')}
                </th>
                {locations.map(loc => (
                  <th
                    key={loc}
                    className="wh-col"
                    onClick={() => handleSort(loc)}
                    style={{ cursor: 'pointer', textAlign: 'right' }}
                  >
                    {loc}{sortIndicator(loc)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sku => {
                const config = STATUS_CONFIG[sku.status]
                return (
                  <tr key={sku.sku} style={{ background: config.bg }}>
                    <td className="sticky-col col-sku" style={{ fontWeight: 600, background: config.bg, borderLeft: `3px solid ${config.color}` }}>
                      {sku.sku}
                    </td>
                    <td className="sticky-col col-total" style={{ textAlign: 'right', fontWeight: 600, background: config.bg }}>
                      {sku.totalStock.toLocaleString()}
                    </td>
                    <td className="sticky-col col-drr" style={{ textAlign: 'right', background: config.bg }}>
                      {sku.dailyDemand > 0 ? sku.dailyDemand.toFixed(1) : '\u2014'}
                    </td>
                    <td className="sticky-col col-doc" style={{ textAlign: 'right', fontWeight: 700, color: config.color, background: config.bg }}>
                      {sku.daysOfCover >= 9999 ? '\u221E' : sku.daysOfCover}
                    </td>
                    <td className="sticky-col col-status" style={{ textAlign: 'center', background: config.bg }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '10px',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        color: config.color,
                        background: 'rgba(255,255,255,0.7)',
                        border: `1px solid ${config.border}`,
                      }}>
                        {config.label}
                      </span>
                    </td>
                    {locations.map(loc => {
                      const qty = sku.warehouseStock[loc] || 0
                      return (
                        <td
                          key={loc}
                          className="wh-col"
                          style={{
                            textAlign: 'right',
                            color: qty === 0 ? '#d1d5db' : '#374151',
                            fontWeight: qty > 0 ? 500 : 400,
                            fontSize: '0.8rem',
                          }}
                        >
                          {qty === 0 ? '\u2014' : qty.toLocaleString()}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .stock-analysis-page .stock-matrix {
          border-collapse: separate;
          border-spacing: 0;
          width: max-content;
          min-width: 100%;
        }
        .stock-analysis-page .stock-matrix th,
        .stock-analysis-page .stock-matrix td {
          padding: 0.35rem 0.5rem;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .stock-analysis-page .stock-matrix thead th {
          font-size: 0.7rem;
          color: #6b7280;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          background: #f9fafb;
          position: sticky;
          top: 0;
          z-index: 2;
          border-bottom: 2px solid #d1d5db;
          user-select: none;
        }
        .stock-analysis-page .stock-matrix td {
          font-size: 0.8rem;
        }
        .stock-analysis-page .stock-matrix tbody tr:hover {
          filter: brightness(0.97);
        }

        /* Sticky left columns */
        .stock-analysis-page .sticky-col {
          position: sticky;
          z-index: 3;
        }
        .stock-analysis-page thead .sticky-col {
          z-index: 4;
        }
        .stock-analysis-page .col-sku {
          left: 0;
          min-width: 60px;
        }
        .stock-analysis-page .col-total {
          left: 60px;
          min-width: 60px;
        }
        .stock-analysis-page .col-drr {
          left: 120px;
          min-width: 55px;
        }
        .stock-analysis-page .col-doc {
          left: 175px;
          min-width: 50px;
        }
        .stock-analysis-page .col-status {
          left: 225px;
          min-width: 75px;
          border-right: 2px solid #d1d5db;
        }
        .stock-analysis-page thead .col-sku,
        .stock-analysis-page thead .col-total,
        .stock-analysis-page thead .col-drr,
        .stock-analysis-page thead .col-doc,
        .stock-analysis-page thead .col-status {
          background: #f9fafb;
        }

        .stock-analysis-page .wh-col {
          min-width: 65px;
        }
      `}</style>
    </div>
  )
}

export default StockAnalysis
