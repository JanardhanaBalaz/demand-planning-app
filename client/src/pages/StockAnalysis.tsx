import { useState, useEffect, useMemo, useCallback } from 'react'
import { stockAnalysisApi } from '../services/api'

interface SkuAnalysis {
  sku: string
  ringType: string
  totalStock: number
  dailyDemand: number
  daysOfCover: number
  status: 'critical' | 'understock' | 'balanced' | 'overstock'
  warehouseStock: Record<string, number>
  warehouseDRR: Record<string, number>
  warehouseDOC: Record<string, number>
  channelDemand: Record<string, number>
}

const STATUS_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  understock: { label: 'Understock', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  balanced: { label: 'Balanced', color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
  overstock: { label: 'Overstock', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

// Get cell status relative to optimal DOC target
function getCellStatus(doc: number, optimal: number): 'critical' | 'understock' | 'balanced' | 'overstock' {
  const ratio = doc / optimal
  if (ratio < 0.5) return 'critical'      // < 50% of target
  if (ratio < 1.0) return 'understock'    // 50-100% of target
  if (ratio <= 2.0) return 'balanced'     // 100-200% of target
  return 'overstock'                      // > 200% of target
}

const TYPE_ORDER = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']

type SortKey = 'sku' | string
type SortDir = 'asc' | 'desc'

function StockAnalysis() {
  const [skus, setSkus] = useState<SkuAnalysis[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [optimalDOC, setOptimalDOC] = useState<Record<string, number>>({})
  const [editingOptimal, setEditingOptimal] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('sku')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    stockAnalysisApi.getData()
      .then(res => {
        setSkus(res.data.skus || [])
        setLocations(res.data.locations || [])
        setOptimalDOC(res.data.optimalDOC || {})
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

  const getOptimal = useCallback((loc: string) => optimalDOC[loc] || 30, [optimalDOC])

  const handleOptimalEdit = (loc: string) => {
    setEditingOptimal(loc)
    setEditValue(String(getOptimal(loc)))
  }

  const handleOptimalSave = async (loc: string) => {
    const days = parseInt(editValue, 10)
    if (isNaN(days) || days <= 0) {
      setEditingOptimal(null)
      return
    }
    setOptimalDOC(prev => ({ ...prev, [loc]: days }))
    setEditingOptimal(null)
    try {
      await stockAnalysisApi.saveOptimalDoc([{ locationName: loc, optimalDays: days }])
    } catch (err) {
      console.error('Failed to save optimal DOC:', err)
    }
  }

  const filtered = useMemo(() => {
    let result = skus.filter(s => {
      if (filterType !== 'all' && s.ringType !== filterType) return false
      if (searchTerm && !s.sku.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'sku') {
        cmp = a.sku.localeCompare(b.sku)
      } else {
        // Location column: sort by DOC
        const aVal = a.warehouseDOC?.[sortKey] ?? 9999
        const bVal = b.warehouseDOC?.[sortKey] ?? 9999
        cmp = aVal - bVal
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [skus, filterType, searchTerm, sortKey, sortDir])

  if (loading) {
    return <div className="stock-analysis-page"><p>Analyzing stock levels per SKU...</p></div>
  }

  if (error) {
    return (
      <div className="stock-analysis-page">
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="stock-analysis-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Stock Analysis - FG</h1>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          SKU-level stock &amp; days of cover per warehouse &middot; {skus.length} SKUs
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.7rem' }}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'inline-block' }} />
            <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
            <span style={{ color: '#9ca3af' }}>
              {key === 'critical' ? '(<50% target)' : key === 'understock' ? '(50-100%)' : key === 'balanced' ? '(100-200%)' : '(>200%)'}
            </span>
          </span>
        ))}
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
        <input
          type="text"
          placeholder="Search SKU..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', width: '140px' }}
        />
        {(filterType !== 'all' || searchTerm) && (
          <button
            onClick={() => { setFilterType('all'); setSearchTerm('') }}
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
                {locations.map(loc => {
                  const optimal = getOptimal(loc)
                  return (
                    <th
                      key={loc}
                      className="wh-col"
                      style={{ cursor: 'pointer', textAlign: 'right', verticalAlign: 'top' }}
                    >
                      <div onClick={() => handleSort(loc)}>
                        {loc}{sortIndicator(loc)}
                      </div>
                      <div style={{ fontSize: '0.55rem', fontWeight: 400, color: '#9ca3af' }}>stock / doc</div>
                      {editingOptimal === loc ? (
                        <div style={{ marginTop: '2px' }}>
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleOptimalSave(loc)}
                            onKeyDown={e => { if (e.key === 'Enter') handleOptimalSave(loc); if (e.key === 'Escape') setEditingOptimal(null) }}
                            autoFocus
                            style={{
                              width: '40px', padding: '1px 3px', fontSize: '0.6rem',
                              border: '1px solid #6366f1', borderRadius: '3px', textAlign: 'right',
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                          <span style={{ fontSize: '0.55rem', color: '#6366f1' }}>d</span>
                        </div>
                      ) : (
                        <div
                          onClick={e => { e.stopPropagation(); handleOptimalEdit(loc) }}
                          title="Click to edit optimal DOC target"
                          style={{
                            fontSize: '0.55rem', fontWeight: 500, color: '#6366f1',
                            cursor: 'pointer', marginTop: '1px',
                            padding: '0 2px', borderRadius: '2px',
                            background: '#eef2ff',
                          }}
                        >
                          target: {optimal}d
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sku => {
                return (
                  <tr key={sku.sku}>
                    <td className="sticky-col col-sku" style={{ fontWeight: 600, background: '#fff' }}>
                      {sku.sku}
                    </td>
                    {locations.map(loc => {
                      const qty = sku.warehouseStock[loc] || 0
                      const doc = sku.warehouseDOC?.[loc]
                      const drr = sku.warehouseDRR?.[loc] || 0
                      const optimal = getOptimal(loc)

                      const cellStatus = (doc !== undefined && (qty > 0 || drr > 0))
                        ? getCellStatus(doc >= 9999 ? 9999 : doc, optimal)
                        : null
                      const cellConfig = cellStatus ? STATUS_CONFIG[cellStatus] : null

                      return (
                        <td
                          key={loc}
                          className="wh-col"
                          style={{
                            textAlign: 'right',
                            background: cellConfig ? cellConfig.bg : undefined,
                            borderLeft: cellConfig ? `2px solid ${cellConfig.border}` : undefined,
                            padding: '0.2rem 0.5rem',
                          }}
                        >
                          {qty === 0 && drr === 0 ? (
                            <span style={{ color: '#d1d5db' }}>{'\u2014'}</span>
                          ) : (
                            <>
                              <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151' }}>
                                {qty.toLocaleString()}
                              </div>
                              <div style={{
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                color: cellConfig ? cellConfig.color : '#9ca3af',
                              }}>
                                {doc !== undefined && doc >= 9999 ? '\u221E' : doc !== undefined ? `${doc}d` : ''}
                              </div>
                            </>
                          )}
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
          border-right: 2px solid #d1d5db;
        }
        .stock-analysis-page thead .col-sku {
          background: #f9fafb;
        }

        .stock-analysis-page .wh-col {
          min-width: 75px;
        }
      `}</style>
    </div>
  )
}

export default StockAnalysis
