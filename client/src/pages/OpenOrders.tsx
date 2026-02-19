import { useState, useEffect, useMemo } from 'react'
import { openOrdersApi } from '../services/api'

interface Order {
  id: number
  order_number: string
  source: string
  status: string
  priority: number
  ship_to_name: string
  ship_to_city: string
  ship_to_country: string
  created_at: string
  allocated_at: string | null
  warehouse_code: string
  warehouse_name: string
}

interface Warehouse {
  id: number
  code: string
  name: string
  country: string
}

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  PENDING: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  ALLOCATED: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  PICKING: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  READY_TO_SHIP: { color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

type SortKey = 'order_number' | 'source' | 'status' | 'warehouse_code' | 'ship_to_country' | 'created_at' | 'age'
type SortDir = 'asc' | 'desc'

function OpenOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterWarehouse, setFilterWarehouse] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    openOrdersApi.getData()
      .then(res => {
        setOrders(res.data.orders || [])
        setWarehouses(res.data.warehouses || [])
        setError(null)
      })
      .catch(err => {
        console.error('Failed to load open orders:', err)
        setError('Failed to load open orders')
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
    let result = orders.filter(o => {
      if (filterWarehouse !== 'all' && o.warehouse_code !== filterWarehouse) return false
      if (filterStatus !== 'all' && o.status !== filterStatus) return false
      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'age' || sortKey === 'created_at') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      } else {
        const aVal = (a as Record<string, unknown>)[sortKey] as string || ''
        const bVal = (b as Record<string, unknown>)[sortKey] as string || ''
        cmp = aVal.localeCompare(bVal)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [orders, filterWarehouse, filterStatus, sortKey, sortDir])

  const statuses = useMemo(() => [...new Set(orders.map(o => o.status))].sort(), [orders])

  // Status summary counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of filtered) {
      counts[o.status] = (counts[o.status] || 0) + 1
    }
    return counts
  }, [filtered])

  if (loading) {
    return <div className="open-orders-page"><p>Loading open orders...</p></div>
  }

  if (error) {
    return (
      <div className="open-orders-page">
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="open-orders-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Open Orders</h1>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          Live from WMS &middot; {orders.length} open orders
        </span>
      </div>

      {/* Status summary */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {Object.entries(statusCounts).map(([status, count]) => {
          const cfg = STATUS_COLORS[status] || { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' }
          return (
            <div key={status} style={{
              padding: '0.4rem 0.75rem', borderRadius: '6px',
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              fontSize: '0.8rem',
            }}>
              <span style={{ fontWeight: 600, color: cfg.color }}>{count}</span>
              <span style={{ color: '#6b7280', marginLeft: '0.3rem' }}>{status.replace(/_/g, ' ')}</span>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterWarehouse}
          onChange={e => setFilterWarehouse(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
        >
          <option value="all">All Warehouses</option>
          {warehouses.map(w => <option key={w.code} value={w.code}>{w.code} - {w.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
        >
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {(filterWarehouse !== 'all' || filterStatus !== 'all') && (
          <button
            onClick={() => { setFilterWarehouse('all'); setFilterStatus('all') }}
            style={{ padding: '0.35rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: '#fff', color: '#6b7280' }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} orders
        </span>
      </div>

      {/* Orders table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {([
                  ['order_number', 'Order #'],
                  ['source', 'Source'],
                  ['status', 'Status'],
                  ['warehouse_code', 'Warehouse'],
                  ['ship_to_country', 'Country'],
                  ['created_at', 'Created'],
                  ['age', 'Age'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer',
                      background: '#f9fafb', borderBottom: '2px solid #d1d5db',
                      fontSize: '0.7rem', fontWeight: 600, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                    No open orders found
                  </td>
                </tr>
              ) : (
                filtered.map(order => {
                  const cfg = STATUS_COLORS[order.status] || { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' }
                  const age = daysSince(order.created_at)
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                        {order.order_number}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                        {order.source}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem',
                          fontWeight: 600, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>
                        {order.warehouse_code}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                        {order.ship_to_country}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td style={{
                        padding: '0.5rem 0.75rem', fontWeight: 600,
                        color: age > 7 ? '#dc2626' : age > 3 ? '#d97706' : '#6b7280',
                      }}>
                        {age}d
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default OpenOrders
