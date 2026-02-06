import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { productsApi, inventoryApi, demandApi } from '../services/api'

interface DashboardStats {
  totalProducts: number
  totalInventory: number
  lowStockItems: number
  recentDemand: number
}

interface DemandTrend {
  date: string
  quantity: number
}

interface TopProduct {
  name: string
  demand: number
}

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalInventory: 0,
    lowStockItems: 0,
    recentDemand: 0,
  })
  const [demandTrend, setDemandTrend] = useState<DemandTrend[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [productsRes, inventoryRes, alertsRes, demandRes] = await Promise.all([
        productsApi.getAll(),
        inventoryApi.getAll(),
        inventoryApi.getAlerts(),
        demandApi.getAll(),
      ])

      const products = productsRes.data
      const inventory = inventoryRes.data
      const alerts = alertsRes.data
      const demands = demandRes.data

      setStats({
        totalProducts: products.length,
        totalInventory: inventory.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
        lowStockItems: alerts.filter((a: { isTriggered: boolean }) => a.isTriggered).length,
        recentDemand: demands.slice(0, 30).reduce((sum: number, d: { quantity: number }) => sum + d.quantity, 0),
      })

      // Process demand trend (last 7 days)
      const last7Days = [...Array(7)].map((_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return date.toISOString().split('T')[0]
      })

      const trendData = last7Days.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        quantity: demands
          .filter((d: { date: string }) => d.date.startsWith(date))
          .reduce((sum: number, d: { quantity: number }) => sum + d.quantity, 0),
      }))
      setDemandTrend(trendData)

      // Calculate top products by demand
      const productDemand: Record<number, { name: string; demand: number }> = {}
      demands.forEach((d: { productId: number; quantity: number; productName?: string }) => {
        if (!productDemand[d.productId]) {
          const product = products.find((p: { id: number }) => p.id === d.productId)
          productDemand[d.productId] = {
            name: product?.name || d.productName || `Product ${d.productId}`,
            demand: 0,
          }
        }
        productDemand[d.productId].demand += d.quantity
      })

      const topProductsData = Object.values(productDemand)
        .sort((a, b) => b.demand - a.demand)
        .slice(0, 5)
      setTopProducts(topProductsData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{stats.totalProducts}</div>
          <Link to="/products" className="stat-link">View all</Link>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Inventory</div>
          <div className="stat-value">{stats.totalInventory.toLocaleString()}</div>
          <Link to="/inventory" className="stat-link">Manage</Link>
        </div>
        <div className="stat-card">
          <div className="stat-label">Low Stock Alerts</div>
          <div className="stat-value" style={{ color: stats.lowStockItems > 0 ? 'var(--danger)' : 'inherit' }}>
            {stats.lowStockItems}
          </div>
          <Link to="/inventory" className="stat-link">View alerts</Link>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recent Demand</div>
          <div className="stat-value">{stats.recentDemand.toLocaleString()}</div>
          <Link to="/demand" className="stat-link">View details</Link>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="card chart-card">
          <div className="card-header">
            <h2 className="card-title">Demand Trend (Last 7 Days)</h2>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={demandTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="quantity"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <h2 className="card-title">Top Products by Demand</h2>
          </div>
          <div className="chart-container">
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" />
                  <YAxis dataKey="name" type="category" width={100} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="demand" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                <p>No demand data available</p>
                <Link to="/demand" className="btn btn-primary">Add Demand Data</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-charts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }
        .chart-card {
          padding: 1.5rem;
        }
        .chart-container {
          margin-top: 1rem;
        }
        .stat-link {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.875rem;
        }
        .empty-chart {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 300px;
          color: var(--text-light);
        }
        .empty-chart p {
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  )
}

export default Dashboard
