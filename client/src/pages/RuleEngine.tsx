import { useState, useEffect, useMemo } from 'react'
import { ruleEngineApi } from '../services/api'

interface NetworkRule {
  id?: number
  location: string
  whOrFactory: string
  region: string
  channel: string
  destinationCountry: string
  shipmentType: string
  isActive: boolean
  priority: number
}

const CHANNEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'B2C': { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  'Replacement': { bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
  'Retail': { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  'Marketplace': { bg: '#fce7f3', text: '#db2777', border: '#fbcfe8' },
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Warehouse': { bg: '#dbeafe', text: '#1e40af' },
  'Factory': { bg: '#fef9c3', text: '#854d0e' },
}

const SHIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  'End Customer Shipments': { bg: '#ecfdf5', text: '#065f46' },
  'Bulk': { bg: '#f3e8ff', text: '#7c3aed' },
}

function RuleEngine() {
  const [rules, setRules] = useState<NetworkRule[]>([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filterChannel, setFilterChannel] = useState<string>('all')
  const [filterLocation, setFilterLocation] = useState<string>('all')
  const [filterShipment, setFilterShipment] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchRules = () => {
    setLoading(true)
    ruleEngineApi.getRules()
      .then(res => {
        setRules(res.data.rules || [])
        setSource(res.data.source || '')
      })
      .catch(err => console.error('Failed to load rules:', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRules() }, [])

  const syncFromSheet = () => {
    setSyncing(true)
    ruleEngineApi.syncFromSheet()
      .then(() => fetchRules())
      .catch(err => console.error('Failed to sync:', err))
      .finally(() => setSyncing(false))
  }

  const toggleActive = (rule: NetworkRule) => {
    if (!rule.id) return
    ruleEngineApi.updateRule(rule.id, { isActive: !rule.isActive })
      .then(() => {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
      })
      .catch(err => console.error('Failed to toggle:', err))
  }

  // Unique values for filters
  const channels = useMemo(() => [...new Set(rules.map(r => r.channel))].sort(), [rules])
  const locations = useMemo(() => [...new Set(rules.map(r => r.location))].sort(), [rules])
  const shipmentTypes = useMemo(() => [...new Set(rules.map(r => r.shipmentType))].sort(), [rules])

  // Filtered rules
  const filtered = useMemo(() => {
    return rules.filter(r => {
      if (filterChannel !== 'all' && r.channel !== filterChannel) return false
      if (filterLocation !== 'all' && r.location !== filterLocation) return false
      if (filterShipment !== 'all' && r.shipmentType !== filterShipment) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return r.location.toLowerCase().includes(term) ||
          r.channel.toLowerCase().includes(term) ||
          r.destinationCountry.toLowerCase().includes(term) ||
          r.region.toLowerCase().includes(term)
      }
      return true
    })
  }, [rules, filterChannel, filterLocation, filterShipment, searchTerm])

  // Stats
  const stats = useMemo(() => {
    const byChannel: Record<string, number> = {}
    const byLocation: Record<string, number> = {}
    for (const r of rules) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + 1
      byLocation[r.location] = (byLocation[r.location] || 0) + 1
    }
    return { byChannel, byLocation, total: rules.length, active: rules.filter(r => r.isActive).length }
  }, [rules])

  if (loading) {
    return <div className="rule-engine-page"><p>Loading network rules...</p></div>
  }

  const pillStyle = (colors: { bg: string; text: string; border?: string }) => ({
    display: 'inline-block',
    padding: '0.15rem 0.5rem',
    borderRadius: '10px',
    fontSize: '0.7rem',
    fontWeight: 600 as const,
    background: colors.bg,
    color: colors.text,
    border: colors.border ? `1px solid ${colors.border}` : 'none',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <div className="rule-engine-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Rule Engine</h1>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Warehouse to Demand Network Mapping &middot; {stats.total} rules ({stats.active} active)
            {source && ` \u00B7 Source: ${source}`}
          </span>
        </div>
        <button
          onClick={syncFromSheet}
          disabled={syncing}
          style={{
            padding: '0.4rem 1rem',
            fontSize: '0.85rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: syncing ? '#f3f4f6' : '#fff',
            cursor: syncing ? 'not-allowed' : 'pointer',
            color: '#374151',
          }}
        >
          {syncing ? 'Syncing...' : 'Sync from Sheet'}
        </button>
      </div>

      {/* Channel summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {Object.entries(stats.byChannel).map(([ch, count]) => {
          const colors = CHANNEL_COLORS[ch] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
          const isActive = filterChannel === ch
          return (
            <div
              key={ch}
              className="card"
              onClick={() => setFilterChannel(isActive ? 'all' : ch)}
              style={{
                padding: '0.75rem',
                textAlign: 'center',
                cursor: 'pointer',
                border: `2px solid ${isActive ? colors.text : 'transparent'}`,
                background: colors.bg,
                borderRadius: '8px',
                transition: 'border 0.15s ease',
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ch}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text }}>{count}</div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>rules</div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search rules..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            padding: '0.35rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.85rem',
            width: '200px',
          }}
        />
        <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}>
          <option value="all">All Locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}>
          <option value="all">All Channels</option>
          {channels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterShipment} onChange={e => setFilterShipment(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}>
          <option value="all">All Shipment Types</option>
          {shipmentTypes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterChannel !== 'all' || filterLocation !== 'all' || filterShipment !== 'all' || searchTerm) && (
          <button
            onClick={() => { setFilterChannel('all'); setFilterLocation('all'); setFilterShipment('all'); setSearchTerm('') }}
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: '#fff', color: '#6b7280' }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {rules.length} rules
        </span>
      </div>

      {/* Rules table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '900px' }}>
          <thead>
            <tr>
              {source === 'database' && <th style={{ width: '50px', textAlign: 'center' }}>Active</th>}
              <th style={{ minWidth: '40px' }}>#</th>
              <th style={{ minWidth: '120px' }}>Source Location</th>
              <th style={{ minWidth: '80px' }}>Type</th>
              <th style={{ minWidth: '80px' }}>Region</th>
              <th style={{ minWidth: '100px' }}>Channel</th>
              <th style={{ minWidth: '150px' }}>Destination</th>
              <th style={{ minWidth: '120px' }}>Shipment Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rule, idx) => (
              <tr
                key={rule.id || idx}
                style={{
                  opacity: rule.isActive ? 1 : 0.45,
                  background: rule.isActive ? 'transparent' : '#f9fafb',
                }}
              >
                {source === 'database' && (
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={() => toggleActive(rule)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                )}
                <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{rule.priority || idx + 1}</td>
                <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{rule.location}</td>
                <td>
                  <span style={pillStyle(TYPE_COLORS[rule.whOrFactory] || { bg: '#f3f4f6', text: '#374151' })}>
                    {rule.whOrFactory}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem' }}>{rule.region}</td>
                <td>
                  <span style={pillStyle(CHANNEL_COLORS[rule.channel] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' })}>
                    {rule.channel}
                  </span>
                </td>
                <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>{rule.destinationCountry}</td>
                <td>
                  <span style={pillStyle(SHIPMENT_COLORS[rule.shipmentType] || { bg: '#f3f4f6', text: '#374151' })}>
                    {rule.shipmentType}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .rule-engine-page table {
          border-collapse: collapse;
        }
        .rule-engine-page th,
        .rule-engine-page td {
          padding: 0.4rem 0.5rem;
          border-bottom: 1px solid var(--border, #eee);
        }
        .rule-engine-page th {
          font-size: 0.75rem;
          color: var(--text-secondary, #666);
          font-weight: 600;
          text-align: left;
        }
        .rule-engine-page tr:hover {
          background: #f8fafc !important;
        }
      `}</style>
    </div>
  )
}

export default RuleEngine
