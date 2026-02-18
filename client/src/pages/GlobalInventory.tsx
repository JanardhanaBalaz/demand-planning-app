import { useState, useEffect, useMemo } from 'react'
import { globalInventoryApi } from '../services/api'

interface InventoryRow {
  sku: string
  ringType: string
  warehouses: Record<string, number>
  whTotal: number
  fbaChannels: Record<string, number>
  fbaTotal: number
  grandTotal: number
}

interface InventoryData {
  lastUpdated: string
  whColumns: string[]
  fbaColumns: string[]
  rows: InventoryRow[]
  whTotals: Record<string, number>
  fbaTotals: Record<string, number>
  whGrandTotal: number
  fbaGrandTotal: number
  grandTotal: number
}

const TYPE_ORDER = ['Ring Air', 'Diesel Collaborated', 'Wabi Sabi', 'Other']

function GlobalInventory() {
  const [data, setData] = useState<InventoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsedTypes, setCollapsedTypes] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchData = (forceRefresh = false) => {
    const setter = forceRefresh ? setRefreshing : setLoading
    setter(true)
    const call = forceRefresh ? globalInventoryApi.refresh() : globalInventoryApi.getData()
    call
      .then(res => {
        setData(res.data)
        setError(null)
      })
      .catch(err => {
        console.error('Failed to load inventory:', err)
        setError('Failed to load inventory data')
      })
      .finally(() => setter(false))
  }

  useEffect(() => { fetchData() }, [])

  const toggleType = (type: string) => {
    setCollapsedTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  // Group rows by ring type
  const grouped = useMemo(() => {
    if (!data) return []
    const groups: { type: 'header' | 'sku'; label: string; row?: InventoryRow; typeName?: string }[] = []

    for (const type of TYPE_ORDER) {
      const typeRows = data.rows.filter(r => r.ringType === type).sort((a, b) => a.sku.localeCompare(b.sku))
      if (typeRows.length === 0) continue
      groups.push({ type: 'header', label: type, typeName: type })
      for (const row of typeRows) {
        groups.push({ type: 'sku', label: row.sku, row, typeName: type })
      }
    }
    return groups
  }, [data])

  // Category totals
  const categoryTotals = useMemo(() => {
    if (!data) return {} as Record<string, { wh: Record<string, number>; fba: Record<string, number>; whTotal: number; fbaTotal: number; grandTotal: number }>
    const totals: Record<string, { wh: Record<string, number>; fba: Record<string, number>; whTotal: number; fbaTotal: number; grandTotal: number }> = {}

    for (const type of TYPE_ORDER) {
      const typeRows = data.rows.filter(r => r.ringType === type)
      if (typeRows.length === 0) continue
      const wh: Record<string, number> = {}
      const fba: Record<string, number> = {}
      let whTotal = 0, fbaTotal = 0

      for (const col of data.whColumns) wh[col] = 0
      for (const col of data.fbaColumns) fba[col] = 0

      for (const row of typeRows) {
        for (const col of data.whColumns) wh[col] += row.warehouses[col] || 0
        for (const col of data.fbaColumns) fba[col] += row.fbaChannels[col] || 0
        whTotal += row.whTotal
        fbaTotal += row.fbaTotal
      }

      totals[type] = { wh, fba, whTotal, fbaTotal, grandTotal: whTotal + fbaTotal }
    }
    return totals
  }, [data])

  if (loading) {
    return <div className="global-inventory-page"><p>Loading inventory data...</p></div>
  }

  if (error || !data) {
    return (
      <div className="global-inventory-page">
        <p style={{ color: '#dc2626' }}>{error || 'No data available'}</p>
        <button onClick={() => fetchData()} style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  const stickyLeft = { position: 'sticky' as const, left: 0, zIndex: 2 }

  return (
    <div className="global-inventory-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Global Inventory</h1>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Ring Air — Single View &middot; Last refreshed {new Date(data.lastUpdated).toLocaleTimeString()}
          </span>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          style={{
            padding: '0.4rem 1rem',
            fontSize: '0.85rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: refreshing ? '#f3f4f6' : '#fff',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            color: '#374151',
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Warehouse Stock</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>{data.whGrandTotal.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>FBA Stock</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>{data.fbaGrandTotal.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>{data.grandTotal.toLocaleString()}</div>
        </div>
      </div>

      {/* Inventory table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '1200px' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...stickyLeft, background: 'var(--surface, #fff)', minWidth: '80px', verticalAlign: 'bottom' }}>SKU</th>
              <th colSpan={data.whColumns.length + 1} style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', background: '#f0fdf4', color: '#059669', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                WAREHOUSES
              </th>
              <th style={{ width: '1px', background: 'var(--surface, #fff)' }}></th>
              <th colSpan={data.fbaColumns.length + 1} style={{ textAlign: 'center', borderBottom: '2px solid #e5e7eb', background: '#eff6ff', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                FBA / MARKETPLACE
              </th>
              <th style={{ width: '1px', background: 'var(--surface, #fff)' }}></th>
              <th rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'bottom', minWidth: '70px', fontWeight: 700 }}>Grand Total</th>
            </tr>
            <tr>
              {data.whColumns.map(col => (
                <th key={`wh-${col}`} style={{ textAlign: 'center', fontSize: '0.7rem', minWidth: '55px', whiteSpace: 'nowrap', background: '#f0fdf4' }}>{col}</th>
              ))}
              <th style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, minWidth: '55px', background: '#dcfce7' }}>Total</th>
              <th style={{ width: '1px', background: 'var(--surface, #fff)' }}></th>
              {data.fbaColumns.map(col => (
                <th key={`fba-${col}`} style={{ textAlign: 'center', fontSize: '0.7rem', minWidth: '55px', whiteSpace: 'nowrap', background: '#eff6ff' }}>{col}</th>
              ))}
              <th style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, minWidth: '55px', background: '#dbeafe' }}>Total</th>
              <th style={{ width: '1px', background: 'var(--surface, #fff)' }}></th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((item) => {
              if (item.type === 'header') {
                const collapsed = collapsedTypes[item.label]
                const ct = categoryTotals[item.label]
                if (!ct) return null
                const totalCols = data.whColumns.length + 1 + 1 + data.fbaColumns.length + 1 + 1 + 1
                return (
                  <tr
                    key={`header-${item.label}`}
                    style={{ background: 'var(--surface-alt, #f0f4f8)', cursor: 'pointer' }}
                    onClick={() => toggleType(item.label)}
                  >
                    <td style={{
                      ...stickyLeft,
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      padding: '0.6rem 0.5rem',
                      background: 'var(--surface-alt, #f0f4f8)',
                      userSelect: 'none',
                    }}>
                      <span style={{ display: 'inline-block', width: '1.2rem', fontSize: '0.75rem' }}>
                        {collapsed ? '\u25B6' : '\u25BC'}
                      </span>
                      {item.label}
                    </td>
                    {data.whColumns.map(col => (
                      <td key={col} style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                        {(ct.wh[col] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', background: '#e8f5e9' }}>
                      {ct.whTotal.toLocaleString()}
                    </td>
                    <td style={{ background: 'var(--surface-alt, #f0f4f8)' }}></td>
                    {data.fbaColumns.map(col => (
                      <td key={col} style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                        {(ct.fba[col] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', background: '#e3f2fd' }}>
                      {ct.fbaTotal.toLocaleString()}
                    </td>
                    <td style={{ background: 'var(--surface-alt, #f0f4f8)' }}></td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', background: 'var(--surface-alt, #f0f4f8)' }}>
                      {ct.grandTotal.toLocaleString()}
                    </td>
                  </tr>
                )
              }

              if (collapsedTypes[item.typeName!]) return null
              const row = item.row!

              // Color code: red for 0, amber for low stock (<10)
              const cellStyle = (val: number) => ({
                textAlign: 'center' as const,
                fontSize: '0.8rem',
                color: val === 0 ? '#d1d5db' : val < 10 ? '#d97706' : '#111827',
                fontWeight: val < 10 && val > 0 ? 600 : 400,
              })

              return (
                <tr key={row.sku}>
                  <td style={{ ...stickyLeft, fontWeight: 500, fontSize: '0.8rem', background: 'var(--surface, #fff)', paddingLeft: '1.2rem' }}>
                    {row.sku}
                  </td>
                  {data.whColumns.map(col => (
                    <td key={col} style={cellStyle(row.warehouses[col] || 0)}>
                      {row.warehouses[col] || 0 ? (row.warehouses[col]).toLocaleString() : '\u2014'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8rem', background: '#f0fdf4' }}>
                    {row.whTotal.toLocaleString()}
                  </td>
                  <td></td>
                  {data.fbaColumns.map(col => (
                    <td key={col} style={cellStyle(row.fbaChannels[col] || 0)}>
                      {row.fbaChannels[col] || 0 ? (row.fbaChannels[col]).toLocaleString() : '\u2014'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.8rem', background: '#eff6ff' }}>
                    {row.fbaTotal.toLocaleString()}
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                    {row.grandTotal.toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {/* Grand total row */}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, #ddd)', background: 'var(--surface-alt, #f0f4f8)' }}>
              <td style={{ ...stickyLeft, background: 'var(--surface-alt, #f0f4f8)' }}>Total</td>
              {data.whColumns.map(col => (
                <td key={col} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                  {(data.whTotals[col] || 0).toLocaleString()}
                </td>
              ))}
              <td style={{ textAlign: 'center', fontSize: '0.85rem', background: '#dcfce7' }}>
                {data.whGrandTotal.toLocaleString()}
              </td>
              <td style={{ background: 'var(--surface-alt, #f0f4f8)' }}></td>
              {data.fbaColumns.map(col => (
                <td key={col} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                  {(data.fbaTotals[col] || 0).toLocaleString()}
                </td>
              ))}
              <td style={{ textAlign: 'center', fontSize: '0.85rem', background: '#dbeafe' }}>
                {data.fbaGrandTotal.toLocaleString()}
              </td>
              <td style={{ background: 'var(--surface-alt, #f0f4f8)' }}></td>
              <td style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                {data.grandTotal.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style>{`
        .global-inventory-page table {
          border-collapse: collapse;
        }
        .global-inventory-page th,
        .global-inventory-page td {
          padding: 0.35rem 0.4rem;
          border-bottom: 1px solid var(--border, #eee);
        }
        .global-inventory-page th {
          font-size: 0.75rem;
          color: var(--text-secondary, #666);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

export default GlobalInventory
