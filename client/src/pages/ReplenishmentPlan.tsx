import { useState, useEffect } from 'react'

interface ChannelBreakdown {
  channel: string
  dailyDemand: number
}

interface MonthlyForecast {
  month: string
  forecastUnits: number
  channelBreakdown: Record<string, number>
}

interface SkuDetail {
  sku: string
  ringType: string
  currentStock: number
  dailyDemand: number
  daysOfCover: number
  status: 'critical' | 'warning' | 'healthy'
  replenishmentNeeded: number
  channelBreakdown: Record<string, number>
}

interface FBAData {
  fbaName: string
  geography: string
  currentStock: number
  dailyDemand: number
  daysOfCover: number
  status: 'critical' | 'warning' | 'healthy'
  replenishmentNeeded: number
  channelBreakdown: ChannelBreakdown[]
  monthlyForecast: MonthlyForecast[]
  skus: SkuDetail[]
}

interface Summary {
  totalFBAs: number
  totalUnitsNeeded: number
  criticalFBAs: number
  warningFBAs: number
  healthyFBAs: number
  targetDaysOfCover: number
}

const STATUS_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  warning: { label: 'Needs Restock', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  healthy: { label: 'Healthy', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
}

const CHANNEL_COLORS: Record<string, string> = {
  'Marketplace': '#8b5cf6',
  'B2C': '#3b82f6',
  'Replacement': '#f59e0b',
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`
}

function ReplenishmentPlan() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [fbas, setFbas] = useState<FBAData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedFBAs, setExpandedFBAs] = useState<Record<string, boolean>>({})
  const [targetDays, setTargetDays] = useState(30)

  const fetchData = (days: number) => {
    setLoading(true)
    fetch(`/api/replenishment-plan?targetDays=${days}`)
      .then(res => res.json())
      .then(data => {
        if (data.message) {
          setError(data.detail || data.message)
        } else {
          setSummary(data.summary)
          setFbas(data.fbas || [])
          setError(null)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(targetDays) }, [])

  const toggleExpand = (fba: string) => {
    setExpandedFBAs(prev => ({ ...prev, [fba]: !prev[fba] }))
  }

  const handleTargetChange = (val: number) => {
    setTargetDays(val)
    fetchData(val)
  }

  // Days of cover bar width (max 60 days = full bar)
  const coverBarWidth = (days: number) => Math.min(100, (days / 60) * 100)

  if (loading) {
    return <div style={{ padding: '2rem' }}><p>Loading replenishment plan...</p></div>
  }

  if (error) {
    return <div style={{ padding: '2rem' }}><p style={{ color: '#dc2626' }}>Error: {error}</p></div>
  }

  return (
    <div style={{ padding: '0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="page-title">FBA Replenishment Plan</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: '#6b7280' }}>Target days of cover:</span>
          <input
            type="number"
            value={targetDays}
            onChange={e => handleTargetChange(Number(e.target.value) || 30)}
            min={7}
            max={90}
            style={{
              width: '60px', padding: '0.3rem 0.5rem', border: '1px solid #d1d5db',
              borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center',
            }}
          />
          <span style={{ color: '#9ca3af' }}>days</span>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.3rem' }}>Total FBAs</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.totalFBAs}</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #dc2626' }}>
            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.3rem' }}>Critical (&lt;15d)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{summary.criticalFBAs}</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #d97706' }}>
            <div style={{ fontSize: '0.75rem', color: '#d97706', marginBottom: '0.3rem' }}>Needs Restock (15-30d)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{summary.warningFBAs}</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #059669' }}>
            <div style={{ fontSize: '0.75rem', color: '#059669', marginBottom: '0.3rem' }}>Healthy (&gt;30d)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{summary.healthyFBAs}</div>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #4f46e5' }}>
            <div style={{ fontSize: '0.75rem', color: '#4f46e5', marginBottom: '0.3rem' }}>Total Units Needed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4f46e5' }}>{summary.totalUnitsNeeded.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* FBA Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>FBA Location</th>
              <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Geography</th>
              <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Stock</th>
              <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Daily Demand</th>
              <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb', minWidth: '180px' }}>Days of Cover</th>
              <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Replenish</th>
              <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '2px solid #e5e7eb' }}>Demand Channels</th>
            </tr>
          </thead>
          <tbody>
            {fbas.map(fba => {
              const cfg = STATUS_CONFIG[fba.status]
              const isExpanded = expandedFBAs[fba.fbaName]

              return (
                <tbody key={fba.fbaName}>
                  <tr
                    onClick={() => toggleExpand(fba.fbaName)}
                    style={{
                      cursor: 'pointer',
                      background: isExpanded ? '#f9fafb' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? '#f9fafb' : 'transparent')}
                  >
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
                      <span style={{ marginRight: '0.4rem', fontSize: '0.7rem', color: '#9ca3af' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      {fba.fbaName}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>{fba.geography}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
                      {fba.currentStock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
                      {fba.dailyDemand.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${coverBarWidth(fba.daysOfCover)}%`,
                            height: '100%',
                            background: cfg.color,
                            borderRadius: '4px',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: cfg.color, minWidth: '35px' }}>
                          {fba.daysOfCover >= 9999 ? '∞' : `${fba.daysOfCover}d`}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: '12px',
                        fontSize: '0.7rem', fontWeight: 600,
                        color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                      }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem',
                      color: fba.replenishmentNeeded > 0 ? '#dc2626' : '#059669',
                    }}>
                      {fba.replenishmentNeeded > 0 ? `+${fba.replenishmentNeeded.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {fba.channelBreakdown.map(cb => (
                          <span key={cb.channel} style={{
                            display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '4px',
                            fontSize: '0.65rem', fontWeight: 600,
                            color: '#fff', background: CHANNEL_COLORS[cb.channel] || '#6b7280',
                          }}>
                            {cb.channel}: {cb.dailyDemand}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <>
                      {/* Monthly Forecast */}
                      {fba.monthlyForecast.length > 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0.5rem 1rem 0.5rem 2rem', background: '#f9fafb', borderBottom: 'none' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                              Monthly Forecast (next {fba.monthlyForecast.length} months)
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                              {fba.monthlyForecast.map(mf => (
                                <div key={mf.month} style={{
                                  padding: '0.4rem 0.8rem', background: '#fff', borderRadius: '6px',
                                  border: '1px solid #e5e7eb', fontSize: '0.8rem',
                                }}>
                                  <div style={{ fontWeight: 600, color: '#374151' }}>{formatMonth(mf.month)}</div>
                                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{mf.forecastUnits.toLocaleString()}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* SKU Detail Table */}
                      <tr>
                        <td colSpan={8} style={{ padding: '0 1rem 1rem 2rem', background: '#f9fafb' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                            SKU Detail ({fba.skus.length} SKUs)
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ background: '#f3f4f6' }}>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem' }}>SKU</th>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem' }}>Type</th>
                                <th style={{ textAlign: 'center', padding: '0.3rem 0.4rem' }}>Stock</th>
                                <th style={{ textAlign: 'center', padding: '0.3rem 0.4rem' }}>DRR</th>
                                <th style={{ textAlign: 'center', padding: '0.3rem 0.4rem' }}>Days</th>
                                <th style={{ textAlign: 'center', padding: '0.3rem 0.4rem' }}>Status</th>
                                <th style={{ textAlign: 'center', padding: '0.3rem 0.4rem' }}>Replenish</th>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem' }}>Channels</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fba.skus.filter(s => s.dailyDemand > 0 || s.currentStock > 0).map(sku => {
                                const skuCfg = STATUS_CONFIG[sku.status]
                                return (
                                  <tr key={sku.sku} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '0.3rem 0.4rem', fontWeight: 600 }}>{sku.sku}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', color: '#6b7280' }}>{sku.ringType}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'center' }}>{sku.currentStock}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'center' }}>{sku.dailyDemand}</td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'center', color: skuCfg.color, fontWeight: 600 }}>
                                      {sku.daysOfCover >= 9999 ? '∞' : sku.daysOfCover}
                                    </td>
                                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'center' }}>
                                      <span style={{
                                        padding: '0.05rem 0.35rem', borderRadius: '8px', fontSize: '0.65rem',
                                        fontWeight: 600, color: skuCfg.color, background: skuCfg.bg,
                                      }}>
                                        {skuCfg.label}
                                      </span>
                                    </td>
                                    <td style={{
                                      padding: '0.3rem 0.4rem', textAlign: 'center', fontWeight: 600,
                                      color: sku.replenishmentNeeded > 0 ? '#dc2626' : '#059669',
                                    }}>
                                      {sku.replenishmentNeeded > 0 ? `+${sku.replenishmentNeeded}` : '—'}
                                    </td>
                                    <td style={{ padding: '0.3rem 0.4rem' }}>
                                      <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                                        {Object.entries(sku.channelBreakdown).map(([ch, drr]) => (
                                          <span key={ch} style={{
                                            padding: '0 0.3rem', borderRadius: '3px', fontSize: '0.6rem',
                                            fontWeight: 600, color: '#fff',
                                            background: CHANNEL_COLORS[ch] || '#6b7280',
                                          }}>
                                            {ch[0]}: {drr}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ReplenishmentPlan
