import { useState, useEffect, useMemo, useCallback } from 'react'
import { channelForecastApi } from '../services/api'

interface SKUBreakdown {
  sku: string
  rings: number
  autoWeightPct: number
}

interface BaselineResponse {
  baselineDrr: number
  totalRings: number
  days: number
  channelGroup: string
  countryBucket: string
  ringBasis: string
  startDate: string
  endDate: string
  skuBreakdown: SKUBreakdown[]
}

interface MonthConfig {
  forecastMonth: string
  label: string
  daysInMonth: number
  baselineDrr: number
  liftPct: number
  momGrowthPct: number
  distributionMethod: 'historical' | 'desired'
}

interface SKURow {
  sku: string
  autoWeightPct: number
  manualWeightPct: number | null
  isOverride: boolean
}

interface SavedSetting {
  forecastMonth: string
  baselineDrr: number
  liftPct: number
  momGrowthPct: number
  distributionMethod: string
  baselineStartDate: string
  baselineEndDate: string
  ringBasis: string
}

interface SavedSKU {
  sku: string
  autoWeightPct: number
  manualWeightPct: number | null
  isOverride: boolean
}

const COUNTRY_BUCKETS = ['India', 'US', 'EU', 'ROW']

function getDaysInMonth(dateStr: string): number {
  const d = new Date(dateStr)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function getNext12Months(): { forecastMonth: string; label: string; daysInMonth: number }[] {
  const months: { forecastMonth: string; label: string; daysInMonth: number }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1)
    const forecastMonth = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    months.push({ forecastMonth, label, daysInMonth: getDaysInMonth(forecastMonth) })
  }
  return months
}

function ChannelForecast() {
  // Channel tabs
  const [channels, setChannels] = useState<string[]>([])
  const [activeChannel, setActiveChannel] = useState('')

  // Baseline config
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [countryBucket, setCountryBucket] = useState('India')
  const [ringBasis, setRingBasis] = useState('activated')
  const [loadingBaseline, setLoadingBaseline] = useState(false)

  // Baseline data
  const [baseline, setBaseline] = useState<BaselineResponse | null>(null)

  // 12-month config
  const futureMonths = useMemo(() => getNext12Months(), [])
  const [monthConfigs, setMonthConfigs] = useState<MonthConfig[]>([])

  // SKU distribution
  const [skuRows, setSkuRows] = useState<SKURow[]>([])

  // Status
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Load accessible channels on mount
  useEffect(() => {
    channelForecastApi.getChannels()
      .then(res => {
        const ch = res.data.channels || []
        setChannels(ch)
        if (ch.length > 0) setActiveChannel(ch[0])
      })
      .catch(err => console.error('Failed to load channels:', err))
  }, [])

  // Initialize month configs when baseline or channel changes
  useEffect(() => {
    if (!baseline) {
      setMonthConfigs(futureMonths.map(m => ({
        ...m,
        baselineDrr: 0,
        liftPct: 0,
        momGrowthPct: 0,
        distributionMethod: 'historical' as const,
      })))
      return
    }

    setMonthConfigs(futureMonths.map(m => ({
      ...m,
      baselineDrr: baseline.baselineDrr,
      liftPct: 0,
      momGrowthPct: 0,
      distributionMethod: 'historical' as const,
    })))

    setSkuRows(baseline.skuBreakdown.map(s => ({
      sku: s.sku,
      autoWeightPct: s.autoWeightPct,
      manualWeightPct: null,
      isOverride: false,
    })))
  }, [baseline, futureMonths])

  // Load saved settings when channel/region changes
  useEffect(() => {
    if (!activeChannel || !countryBucket) return

    channelForecastApi.getSettings(activeChannel, countryBucket)
      .then(res => {
        const { settings, skuDistribution } = res.data as { settings: SavedSetting[]; skuDistribution: SavedSKU[] }

        if (settings && settings.length > 0) {
          setMonthConfigs(prev => prev.map(mc => {
            const saved = settings.find((s: SavedSetting) => s.forecastMonth?.slice(0, 7) === mc.forecastMonth.slice(0, 7))
            if (saved) {
              return {
                ...mc,
                baselineDrr: Number(saved.baselineDrr) || mc.baselineDrr,
                liftPct: Number(saved.liftPct) || 0,
                momGrowthPct: Number(saved.momGrowthPct) || 0,
                distributionMethod: (saved.distributionMethod as 'historical' | 'desired') || 'historical',
              }
            }
            return mc
          }))
        }

        if (skuDistribution && skuDistribution.length > 0) {
          setSkuRows(skuDistribution.map((s: SavedSKU) => ({
            sku: s.sku,
            autoWeightPct: Number(s.autoWeightPct) || 0,
            manualWeightPct: s.manualWeightPct !== null ? Number(s.manualWeightPct) : null,
            isOverride: s.isOverride || false,
          })))
        }
      })
      .catch(() => { /* settings not found, use defaults */ })
  }, [activeChannel, countryBucket])

  // Compute final forecast for each month
  const computedMonths = useMemo(() => {
    return monthConfigs.map((mc, idx) => {
      const baseUnits = mc.baselineDrr * mc.daysInMonth
      let finalUnits: number

      if (idx === 0) {
        finalUnits = baseUnits * (1 + mc.liftPct / 100)
      } else {
        const prevFinal = (() => {
          // Recalculate previous month's final
          let prev = monthConfigs[0].baselineDrr * monthConfigs[0].daysInMonth * (1 + monthConfigs[0].liftPct / 100)
          for (let i = 1; i <= idx - 1; i++) {
            prev = prev * (1 + monthConfigs[i].momGrowthPct / 100) * (1 + monthConfigs[i].liftPct / 100)
          }
          return prev
        })()
        finalUnits = prevFinal * (1 + mc.momGrowthPct / 100) * (1 + mc.liftPct / 100)
      }

      return {
        ...mc,
        baseUnits: Math.round(baseUnits),
        finalUnits: Math.round(finalUnits),
      }
    })
  }, [monthConfigs])

  // Compute effective weights (renormalize when overrides exist)
  const effectiveWeights = useMemo(() => {
    const overrideTotal = skuRows
      .filter(s => s.isOverride && s.manualWeightPct !== null)
      .reduce((sum, s) => sum + (s.manualWeightPct || 0), 0)

    const remainingPct = Math.max(0, 100 - overrideTotal)
    const autoTotal = skuRows
      .filter(s => !s.isOverride)
      .reduce((sum, s) => sum + s.autoWeightPct, 0)

    return skuRows.map(s => {
      if (s.isOverride && s.manualWeightPct !== null) {
        return { ...s, effectivePct: s.manualWeightPct }
      }
      const normalized = autoTotal > 0 ? (s.autoWeightPct / autoTotal) * remainingPct : 0
      return { ...s, effectivePct: normalized }
    })
  }, [skuRows])

  const handleGetBaseline = useCallback(async () => {
    if (!startDate || !endDate || !activeChannel) return

    setLoadingBaseline(true)
    setMessage('')
    try {
      const res = await channelForecastApi.getBaseline({
        startDate,
        endDate,
        countryBucket,
        channelGroup: activeChannel,
        ringBasis,
      })
      setBaseline(res.data)
    } catch (err) {
      console.error('Baseline fetch failed:', err)
      setMessage('Failed to fetch baseline data')
    } finally {
      setLoadingBaseline(false)
    }
  }, [startDate, endDate, activeChannel, countryBucket, ringBasis])

  const updateMonthConfig = (idx: number, field: keyof MonthConfig, value: number | string) => {
    setMonthConfigs(prev => prev.map((mc, i) => i === idx ? { ...mc, [field]: value } : mc))
  }

  const updateSKUOverride = (idx: number, value: string) => {
    setSkuRows(prev => prev.map((s, i) => {
      if (i !== idx) return s
      if (value === '') {
        return { ...s, manualWeightPct: null, isOverride: false }
      }
      const num = parseFloat(value)
      if (isNaN(num)) return s
      return { ...s, manualWeightPct: num, isOverride: true }
    }))
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    setMessage('')
    try {
      await channelForecastApi.saveSettings({
        channelGroup: activeChannel,
        countryBucket,
        months: monthConfigs.map(mc => ({
          forecastMonth: mc.forecastMonth,
          baselineDrr: mc.baselineDrr,
          liftPct: mc.liftPct,
          momGrowthPct: mc.momGrowthPct,
          distributionMethod: mc.distributionMethod,
          baselineStartDate: startDate || null,
          baselineEndDate: endDate || null,
          ringBasis,
        })),
      })

      await channelForecastApi.saveSkuDistribution({
        channelGroup: activeChannel,
        countryBucket,
        skus: skuRows.map(s => ({
          sku: s.sku,
          autoWeightPct: s.autoWeightPct,
          manualWeightPct: s.manualWeightPct,
          isOverride: s.isOverride,
        })),
      })

      setMessage('Settings saved successfully')
    } catch (err) {
      console.error('Save failed:', err)
      setMessage('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndGenerate = async () => {
    setSaving(true)
    setMessage('')
    try {
      // Save settings first
      await handleSaveSettings()

      // Materialize forecasts
      const forecasts: { sku: string; forecastMonth: string; forecastUnits: number }[] = []

      for (const cm of computedMonths) {
        for (const ew of effectiveWeights) {
          forecasts.push({
            sku: ew.sku,
            forecastMonth: cm.forecastMonth,
            forecastUnits: Math.round(cm.finalUnits * ew.effectivePct / 100),
          })
        }
      }

      await channelForecastApi.saveForecasts({
        channelGroup: activeChannel,
        countryBucket,
        forecasts,
      })

      setMessage('Forecasts generated and saved successfully')
    } catch (err) {
      console.error('Generate failed:', err)
      setMessage('Failed to generate forecasts')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="channel-forecast-page">
      <div className="page-header">
        <h1 className="page-title">Channel Demand Forecast</h1>
      </div>

      {/* Channel Tabs */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {channels.map(ch => (
            <button
              key={ch}
              className={`btn ${activeChannel === ch ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setActiveChannel(ch); setBaseline(null) }}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Baseline Configuration */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Baseline Configuration</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
            <label className="form-label">Region</label>
            <select
              className="form-input"
              value={countryBucket}
              onChange={e => setCountryBucket(e.target.value)}
            >
              {COUNTRY_BUCKETS.map(cb => (
                <option key={cb} value={cb}>{cb}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
            <label className="form-label">Ring Basis</label>
            <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="ringBasis"
                  value="activated"
                  checked={ringBasis === 'activated'}
                  onChange={e => setRingBasis(e.target.value)}
                />
                Activated
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="ringBasis"
                  value="shipped"
                  checked={ringBasis === 'shipped'}
                  onChange={e => setRingBasis(e.target.value)}
                />
                Shipped
              </label>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGetBaseline}
            disabled={loadingBaseline || !startDate || !endDate}
            style={{ height: 'fit-content' }}
          >
            {loadingBaseline ? 'Loading...' : 'Get Baseline'}
          </button>
        </div>
      </div>

      {/* Baseline Summary */}
      {baseline && (
        <div className="card" style={{ marginBottom: '1rem', background: 'var(--surface-alt, #f0f4f8)' }}>
          <div style={{ display: 'flex', gap: '2rem', fontWeight: 600 }}>
            <span>Baseline DRR: {baseline.baselineDrr.toFixed(1)} rings/day</span>
            <span>Total: {baseline.totalRings.toLocaleString()} rings</span>
            <span>Period: {baseline.days} days</span>
          </div>
        </div>
      )}

      {/* 12-Month Forecast Grid */}
      {monthConfigs.length > 0 && monthConfigs[0].baselineDrr > 0 && (
        <div className="card" style={{ marginBottom: '1rem', overflowX: 'auto' }}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>12-Month Forecast Grid</h2>
          <table style={{ width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', minWidth: '100px' }}></th>
                {computedMonths.map(cm => (
                  <th key={cm.forecastMonth} style={{ textAlign: 'center', minWidth: '80px', fontSize: '0.85rem' }}>
                    {cm.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Base Units (read-only) */}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Base</td>
                {computedMonths.map(cm => (
                  <td key={cm.forecastMonth} style={{ textAlign: 'center' }}>
                    {cm.baseUnits.toLocaleString()}
                  </td>
                ))}
              </tr>
              {/* Lift % (editable) */}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Lift %</td>
                {monthConfigs.map((mc, idx) => (
                  <td key={mc.forecastMonth} style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      step="0.1"
                      value={mc.liftPct}
                      onChange={e => updateMonthConfig(idx, 'liftPct', parseFloat(e.target.value) || 0)}
                      style={{ width: '60px', textAlign: 'center', padding: '0.2rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                  </td>
                ))}
              </tr>
              {/* MoM Growth % (editable) */}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>MoM %</td>
                {monthConfigs.map((mc, idx) => (
                  <td key={mc.forecastMonth} style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      step="0.1"
                      value={mc.momGrowthPct}
                      onChange={e => updateMonthConfig(idx, 'momGrowthPct', parseFloat(e.target.value) || 0)}
                      style={{ width: '60px', textAlign: 'center', padding: '0.2rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                  </td>
                ))}
              </tr>
              {/* Final Units (read-only) */}
              <tr style={{ fontWeight: 700, background: 'var(--surface-alt, #f0f4f8)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface-alt, #f0f4f8)' }}>Final</td>
                {computedMonths.map(cm => (
                  <td key={cm.forecastMonth} style={{ textAlign: 'center' }}>
                    {cm.finalUnits.toLocaleString()}
                  </td>
                ))}
              </tr>
              {/* Distribution Method */}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Dist.</td>
                {monthConfigs.map((mc, idx) => (
                  <td key={mc.forecastMonth} style={{ textAlign: 'center' }}>
                    <select
                      value={mc.distributionMethod}
                      onChange={e => updateMonthConfig(idx, 'distributionMethod', e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '0.15rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                    >
                      <option value="historical">Hist</option>
                      <option value="desired">Des</option>
                    </select>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* SKU Distribution */}
      {effectiveWeights.length > 0 && monthConfigs[0]?.baselineDrr > 0 && (
        <div className="card" style={{ marginBottom: '1rem', overflowX: 'auto' }}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>SKU Distribution</h2>
          <table style={{ width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', minWidth: '120px' }}>SKU</th>
                <th style={{ textAlign: 'center', minWidth: '70px' }}>Auto %</th>
                <th style={{ textAlign: 'center', minWidth: '90px' }}>Override %</th>
                {computedMonths.map(cm => (
                  <th key={cm.forecastMonth} style={{ textAlign: 'center', minWidth: '70px', fontSize: '0.85rem' }}>
                    {cm.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {effectiveWeights.map((ew, idx) => (
                <tr key={ew.sku}>
                  <td style={{ fontWeight: 500, position: 'sticky', left: 0, background: 'var(--surface, #fff)', fontSize: '0.85rem' }}>
                    {ew.sku}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                    {ew.autoWeightPct.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      step="0.1"
                      placeholder=""
                      value={ew.isOverride && ew.manualWeightPct !== null ? ew.manualWeightPct : ''}
                      onChange={e => updateSKUOverride(idx, e.target.value)}
                      style={{ width: '60px', textAlign: 'center', padding: '0.2rem', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                  </td>
                  {computedMonths.map(cm => (
                    <td key={cm.forecastMonth} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                      {Math.round(cm.finalUnits * ew.effectivePct / 100).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Total</td>
                <td style={{ textAlign: 'center' }}>
                  {effectiveWeights.reduce((s, e) => s + e.effectivePct, 0).toFixed(1)}%
                </td>
                <td></td>
                {computedMonths.map(cm => (
                  <td key={cm.forecastMonth} style={{ textAlign: 'center' }}>
                    {cm.finalUnits.toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Action Buttons */}
      {monthConfigs.length > 0 && monthConfigs[0].baselineDrr > 0 && (
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginBottom: '2rem' }}>
          {message && (
            <span style={{
              alignSelf: 'center',
              color: message.includes('Failed') ? 'var(--danger, red)' : 'var(--success, green)',
              fontWeight: 500,
            }}>
              {message}
            </span>
          )}
          <button
            className="btn btn-outline"
            onClick={handleSaveSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveAndGenerate}
            disabled={saving}
          >
            {saving ? 'Generating...' : 'Save & Generate'}
          </button>
        </div>
      )}

      <style>{`
        .channel-forecast-page .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .channel-forecast-page .form-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary, #666);
        }
        .channel-forecast-page .form-input {
          padding: 0.5rem;
          border: 1px solid var(--border, #ddd);
          border-radius: 0.375rem;
          font-size: 0.9rem;
        }
        .channel-forecast-page table {
          border-collapse: collapse;
        }
        .channel-forecast-page th,
        .channel-forecast-page td {
          padding: 0.4rem 0.5rem;
          border-bottom: 1px solid var(--border, #eee);
        }
        .channel-forecast-page th {
          font-size: 0.8rem;
          color: var(--text-secondary, #666);
          font-weight: 600;
        }
        .channel-forecast-page input[type="number"] {
          -moz-appearance: textfield;
        }
        .channel-forecast-page input[type="number"]::-webkit-outer-spin-button,
        .channel-forecast-page input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
    </div>
  )
}

export default ChannelForecast
