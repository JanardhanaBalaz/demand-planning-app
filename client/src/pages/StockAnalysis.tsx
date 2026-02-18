import { useState, useEffect, useMemo, useCallback } from 'react'
import { stockAnalysisApi } from '../services/api'

interface SkuAnalysis {
  sku: string
  ringType: string
  warehouseStock: Record<string, number>
  warehouseDRR: Record<string, number>
  warehouseDOC: Record<string, number>
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
  const [whLocations, setWhLocations] = useState<string[]>([])
  const [fbaLocations, setFbaLocations] = useState<string[]>([])
  const [optimalDOC, setOptimalDOC] = useState<Record<string, number>>({})
  const [docInputs, setDocInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('sku')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    stockAnalysisApi.getData()
      .then(res => {
        const wh = res.data.whLocations || []
        const fba = res.data.fbaLocations || []
        setSkus(res.data.skus || [])
        setWhLocations(wh)
        setFbaLocations(fba)
        const doc = res.data.optimalDOC || {}
        setOptimalDOC(doc)
        const inputs: Record<string, string> = {}
        for (const loc of [...wh, ...fba]) {
          inputs[loc] = String(doc[loc] || 30)
        }
        setDocInputs(inputs)
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

  const allLocations = useMemo(() => [...whLocations, ...fbaLocations], [whLocations, fbaLocations])

  const locationTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const loc of allLocations) {
      totals[loc] = skus.reduce((sum, s) => sum + (s.warehouseStock[loc] || 0), 0)
    }
    return totals
  }, [skus, allLocations])

  const getOptimal = useCallback((loc: string) => optimalDOC[loc] || 30, [optimalDOC])

  const handleDocInputChange = (loc: string, value: string) => {
    setDocInputs(prev => ({ ...prev, [loc]: value }))
  }

  const handleDocInputBlur = async (loc: string) => {
    const days = parseInt(docInputs[loc], 10)
    if (isNaN(days) || days <= 0) {
      setDocInputs(prev => ({ ...prev, [loc]: String(getOptimal(loc)) }))
      return
    }
    setOptimalDOC(prev => ({ ...prev, [loc]: days }))
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
              {/* Row 1: Group headers */}
              <tr className="group-header-row">
                <th className="sticky-col col-sku" rowSpan={2} onClick={() => handleSort('sku')} style={{ cursor: 'pointer', verticalAlign: 'bottom' }}>
                  SKU{sortIndicator('sku')}
                </th>
                {whLocations.length > 0 && (
                  <th colSpan={whLocations.length} className="group-header group-wh">
                    Warehouses <span style={{ fontWeight: 400, fontSize: '0.55rem', color: '#9ca3af' }}>(stock / doc)</span>
                  </th>
                )}
                {fbaLocations.length > 0 && (
                  <th colSpan={fbaLocations.length} className="group-header group-fba">
                    FBA Locations <span style={{ fontWeight: 400, fontSize: '0.55rem', color: '#9ca3af' }}>(stock / doc)</span>
                  </th>
                )}
              </tr>
              {/* Row 2: Location names + total rings */}
              <tr className="loc-header-row">
                {allLocations.map(loc => (
                  <th
                    key={loc}
                    className="wh-col"
                    onClick={() => handleSort(loc)}
                    style={{ cursor: 'pointer', textAlign: 'right' }}
                  >
                    <div>{loc}{sortIndicator(loc)}</div>
                    <div style={{ fontSize: '0.55rem', fontWeight: 500, color: '#6b7280' }}>
                      {locationTotals[loc]?.toLocaleString() || 0} rings
                    </div>
                  </th>
                ))}
              </tr>
              {/* Row 3: Target DOC inputs */}
              <tr className="target-doc-row">
                <th className="sticky-col col-sku" style={{ textAlign: 'left', fontSize: '0.6rem', color: '#6366f1', fontWeight: 600, background: '#f5f3ff' }}>
                  Target DOC
                </th>
                {allLocations.map(loc => (
                  <th key={loc} className="wh-col" style={{ textAlign: 'right', padding: '0.25rem 0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                      <input
                        type="number"
                        value={docInputs[loc] ?? String(getOptimal(loc))}
                        onChange={e => handleDocInputChange(loc, e.target.value)}
                        onBlur={() => handleDocInputBlur(loc)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        style={{
                          width: '38px', padding: '2px 4px', fontSize: '0.65rem',
                          border: '1px solid #c7d2fe', borderRadius: '3px', textAlign: 'right',
                          background: '#eef2ff', color: '#4338ca', fontWeight: 600,
                        }}
                      />
                      <span style={{ fontSize: '0.55rem', color: '#6366f1', fontWeight: 500 }}>d</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sku => (
                <tr key={sku.sku}>
                  <td className="sticky-col col-sku" style={{ fontWeight: 600, background: '#fff' }}>
                    {sku.sku}
                  </td>
                  {allLocations.map(loc => {
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
              ))}
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
          z-index: 2;
          user-select: none;
        }
        .stock-analysis-page .stock-matrix .group-header-row th {
          top: 0;
        }
        .stock-analysis-page .stock-matrix .loc-header-row th {
          top: 28px;
          border-bottom: 1px solid #d1d5db;
        }
        .stock-analysis-page .stock-matrix .target-doc-row th {
          top: 62px;
          border-bottom: 2px solid #d1d5db;
          background: #f5f3ff;
        }
        .stock-analysis-page .stock-matrix .group-header {
          text-align: center;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #d1d5db;
        }
        .stock-analysis-page .stock-matrix .group-wh {
          border-right: 2px solid #e5e7eb;
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

        /* Remove spinner from number inputs */
        .stock-analysis-page .target-doc-row input[type=number]::-webkit-inner-spin-button,
        .stock-analysis-page .target-doc-row input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .stock-analysis-page .target-doc-row input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  )
}

export default StockAnalysis
