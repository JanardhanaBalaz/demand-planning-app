import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

const COUNTRY_BUCKETS = [
  'INDIA',
  'UNITED STATES',
  'EUROPE UNION',
  'UNITED KINGDOM',
  'UNITED ARAB EMIRATES',
  'AUSTRALIA',
  'CANADA',
  'GERMANY',
  'NETHERLANDS',
  'FRANCE',
  'JAPAN',
  'SAUDI ARABIA',
  'SINGAPORE',
  'ROW',
]


function getNext12Months(): { forecastMonth: string; label: string; daysInMonth: number }[] {
  const months: { forecastMonth: string; label: string; daysInMonth: number }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const year = now.getFullYear()
    const month = now.getMonth() + 1 + i
    const d = new Date(year, month, 1)
    const forecastMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    months.push({ forecastMonth, label, daysInMonth })
  }
  return months
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const RING_TYPES: Record<string, { label: string; prefixes: string[] }> = {
  'Ring Air': { label: 'Ring Air', prefixes: ['AA', 'AG', 'AS', 'BR', 'MG', 'RT'] },
  'Diesel Collaborated': { label: 'Diesel Collaborated', prefixes: ['DB', 'DS'] },
  'Wabi Sabi': { label: 'Wabi Sabi', prefixes: ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'] },
}

function getRingType(sku: string): string {
  const prefix = sku.slice(0, 2).toUpperCase()
  for (const [type, config] of Object.entries(RING_TYPES)) {
    if (config.prefixes.includes(prefix)) return type
  }
  return 'Other'
}

interface GroupedSKU {
  type: 'header' | 'sku'
  label: string
  skuIdx?: number // index in the effectiveWeights array
}

function ChannelForecast() {
  const navigate = useNavigate()

  // Channel tabs
  const [channels, setChannels] = useState<string[]>([])
  const [activeChannel, setActiveChannel] = useState('')

  // Baseline config
  const [dayRange, setDayRange] = useState<30 | 60 | 'custom'>(30)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [countryBucket, setCountryBucket] = useState('INDIA')
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

  // Collapsible category state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))
  }
  const isCollapsible = activeChannel === 'B2C' || activeChannel === 'Replacement'

  // Compute start/end dates from toggle or custom input
  const { startDate, endDate } = useMemo(() => {
    if (dayRange === 'custom') {
      return { startDate: customStartDate, endDate: customEndDate }
    }
    const end = new Date()
    end.setDate(end.getDate() - 1) // yesterday
    const start = new Date(end)
    start.setDate(start.getDate() - dayRange + 1)
    return { startDate: formatDate(start), endDate: formatDate(end) }
  }, [dayRange, customStartDate, customEndDate])

  const noFiltersChannel = activeChannel === 'B2C' || activeChannel === 'Replacement' || activeChannel === 'Marketplace'

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
  // Each month: Final = Base × (1 + Lift%)
  const computedMonths = useMemo(() => {
    return monthConfigs.map((mc) => {
      const baseUnits = mc.baselineDrr * mc.daysInMonth
      const finalUnits = baseUnits * (1 + mc.liftPct / 100)

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

  // Compute per-category weight (each category sums to 100%)
  const categoryWeights = useMemo(() => {
    const catTotals: Record<string, number> = {}
    for (const ew of effectiveWeights) {
      const type = getRingType(ew.sku)
      catTotals[type] = (catTotals[type] || 0) + ew.autoWeightPct
    }
    return effectiveWeights.map(ew => {
      const type = getRingType(ew.sku)
      const catTotal = catTotals[type] || 1
      return {
        ...ew,
        categoryPct: (ew.autoWeightPct / catTotal) * 100,
      }
    })
  }, [effectiveWeights])

  // Per-category override totals
  const categoryOverrideTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const s of skuRows) {
      const type = getRingType(s.sku)
      if (s.isOverride && s.manualWeightPct !== null) {
        totals[type] = (totals[type] || 0) + s.manualWeightPct
      }
    }
    return totals
  }, [skuRows])

  // Group SKUs by ring type, sorted alphabetically within each group
  const groupedSKUs = useMemo(() => {
    const groups: GroupedSKU[] = []
    const typeOrder = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']

    for (const type of typeOrder) {
      const skusInGroup = categoryWeights
        .map((ew, idx) => ({ ew, idx }))
        .filter(({ ew }) => getRingType(ew.sku) === type)
        .sort((a, b) => a.ew.sku.localeCompare(b.ew.sku))

      if (skusInGroup.length > 0) {
        groups.push({ type: 'header', label: type })
        for (const { idx } of skusInGroup) {
          groups.push({ type: 'sku', label: categoryWeights[idx].sku, skuIdx: idx })
        }
      }
    }
    return groups
  }, [categoryWeights])

  const handleGetBaseline = useCallback(async () => {
    if (!activeChannel) return

    setLoadingBaseline(true)
    setMessage('')
    try {
      const res = await channelForecastApi.getBaseline({
        startDate,
        endDate,
        countryBucket: noFiltersChannel ? 'ALL' : countryBucket,
        channelGroup: activeChannel,
        ringBasis: noFiltersChannel ? '' : ringBasis,
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
      await handleSaveSettings()

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
      // Navigate to summary page after short delay
      setTimeout(() => navigate('/forecast-summary'), 1000)
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
        <h1 className="page-title">Channel Forecast Inputs</h1>
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
          {/* 30/60/Custom Day Toggle */}
          <div className="form-group" style={{ flex: '1', minWidth: '300px' }}>
            <label className="form-label">Period</label>
            <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border, #ddd)', borderRadius: '0.375rem', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setDayRange(30)}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  background: dayRange === 30 ? 'var(--primary, #2563eb)' : 'var(--surface, #fff)',
                  color: dayRange === 30 ? '#fff' : 'var(--text, #333)',
                }}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setDayRange(60)}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  borderLeft: '1px solid var(--border, #ddd)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  background: dayRange === 60 ? 'var(--primary, #2563eb)' : 'var(--surface, #fff)',
                  color: dayRange === 60 ? '#fff' : 'var(--text, #333)',
                }}
              >
                Last 60 Days
              </button>
              <button
                type="button"
                onClick={() => setDayRange('custom')}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  borderLeft: '1px solid var(--border, #ddd)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  background: dayRange === 'custom' ? 'var(--primary, #2563eb)' : 'var(--surface, #fff)',
                  color: dayRange === 'custom' ? '#fff' : 'var(--text, #333)',
                }}
              >
                Custom
              </button>
            </div>
            {dayRange !== 'custom' && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: '0.25rem' }}>
                {startDate} to {endDate}
              </span>
            )}
          </div>
          {dayRange === 'custom' && (
            <>
              <div className="form-group" style={{ flex: '0 0 auto', minWidth: '150px' }}>
                <label className="form-label">From</label>
                <input
                  type="date"
                  className="form-input"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: '0 0 auto', minWidth: '150px' }}>
                <label className="form-label">To</label>
                <input
                  type="date"
                  className="form-input"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                />
              </div>
            </>
          )}
          {!noFiltersChannel && (
            <div className="form-group" style={{ flex: '1', minWidth: '180px' }}>
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
          )}
          {!noFiltersChannel && (
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
          )}
          <button
            className="btn btn-primary"
            onClick={handleGetBaseline}
            disabled={loadingBaseline || (dayRange === 'custom' && (!customStartDate || !customEndDate))}
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
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Base</td>
                {computedMonths.map(cm => (
                  <td key={cm.forecastMonth} style={{ textAlign: 'center' }}>
                    {cm.baseUnits.toLocaleString()}
                  </td>
                ))}
              </tr>
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
              <tr style={{ fontWeight: 700, background: 'var(--surface-alt, #f0f4f8)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface-alt, #f0f4f8)' }}>Final</td>
                {computedMonths.map(cm => (
                  <td key={cm.forecastMonth} style={{ textAlign: 'center' }}>
                    {cm.finalUnits.toLocaleString()}
                  </td>
                ))}
              </tr>
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
              {groupedSKUs.map((item) => {
                if (item.type === 'header') {
                  const catSkus = categoryWeights.filter(ew => getRingType(ew.sku) === item.label)
                  const catPctTotal = catSkus.reduce((s, e) => s + e.categoryPct, 0)
                  const collapsed = isCollapsible && collapsedCategories[item.label]
                  return (
                    <tr
                      key={`header-${item.label}`}
                      style={{ background: 'var(--surface-alt, #f0f4f8)', cursor: isCollapsible ? 'pointer' : 'default' }}
                      onClick={() => isCollapsible && toggleCategory(item.label)}
                    >
                      <td
                        style={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          padding: '0.6rem 0.5rem',
                          position: 'sticky',
                          left: 0,
                          background: 'var(--surface-alt, #f0f4f8)',
                          letterSpacing: '0.03em',
                          userSelect: 'none',
                        }}
                      >
                        {isCollapsible && (
                          <span style={{ display: 'inline-block', width: '1.2rem', fontSize: '0.75rem' }}>
                            {collapsed ? '\u25B6' : '\u25BC'}
                          </span>
                        )}
                        {item.label} ({catSkus.length})
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                        {catPctTotal.toFixed(0)}%
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                        {(() => {
                          const total = categoryOverrideTotals[item.label] || 0
                          if (total === 0) return null
                          const over = total > 100
                          return (
                            <span style={{ color: over ? 'var(--danger, red)' : total === 100 ? 'var(--success, green)' : 'var(--text, #333)' }}>
                              {total.toFixed(1)}%
                            </span>
                          )
                        })()}
                      </td>
                      {computedMonths.map(cm => {
                        const catMonthTotal = catSkus.reduce((s, e) => s + Math.round(cm.finalUnits * e.effectivePct / 100), 0)
                        return (
                          <td key={cm.forecastMonth} style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                            {catMonthTotal.toLocaleString()}
                          </td>
                        )
                      })}
                    </tr>
                  )
                }

                // Skip SKU rows if category is collapsed
                const cw = categoryWeights[item.skuIdx!]
                const catName = getRingType(cw.sku)
                if (isCollapsible && collapsedCategories[catName]) return null

                const idx = item.skuIdx!
                return (
                  <tr key={cw.sku}>
                    <td style={{ fontWeight: 500, position: 'sticky', left: 0, background: 'var(--surface, #fff)', fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
                      {cw.sku}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                      {cw.categoryPct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(() => {
                        const catTotal = categoryOverrideTotals[catName] || 0
                        const overBudget = catTotal > 100
                        return (
                          <input
                            type="number"
                            step="0.1"
                            placeholder=""
                            value={cw.isOverride && cw.manualWeightPct !== null ? cw.manualWeightPct : ''}
                            onChange={e => updateSKUOverride(idx, e.target.value)}
                            style={{
                              width: '60px',
                              textAlign: 'center',
                              padding: '0.2rem',
                              border: `1px solid ${overBudget ? 'var(--danger, red)' : 'var(--border)'}`,
                              borderRadius: '4px',
                            }}
                          />
                        )
                      })()}
                    </td>
                    {computedMonths.map(cm => (
                      <td key={cm.forecastMonth} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                        {Math.round(cm.finalUnits * cw.effectivePct / 100).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)' }}>Total</td>
                <td></td>
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
