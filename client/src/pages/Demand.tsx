import { useState, useEffect, FormEvent } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Modal from '../components/Modal'
import { demandApi, productsApi } from '../services/api'

interface DemandRecord {
  id: number
  productId: number
  productName: string
  quantity: number
  date: string
  source: string | null
}

interface Product {
  id: number
  name: string
  sku: string
}

interface ChartData {
  date: string
  quantity: number
}

function Demand() {
  const [demandRecords, setDemandRecords] = useState<DemandRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    productId: '',
    startDate: '',
    endDate: '',
  })
  const [formData, setFormData] = useState({
    productId: '',
    quantity: '',
    date: new Date().toISOString().split('T')[0],
    source: '',
  })
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [selectedProductForChart, setSelectedProductForChart] = useState<string>('')

  const canEdit = true

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    updateChartData()
  }, [demandRecords, selectedProductForChart])

  const loadData = async () => {
    try {
      const [demandRes, productsRes] = await Promise.all([
        demandApi.getAll(filters.productId ? { productId: parseInt(filters.productId) } : undefined),
        productsApi.getAll(),
      ])
      setDemandRecords(demandRes.data)
      setProducts(productsRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = async () => {
    setLoading(true)
    try {
      const params: { productId?: number; startDate?: string; endDate?: string } = {}
      if (filters.productId) params.productId = parseInt(filters.productId)
      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate

      const res = await demandApi.getAll(params)
      setDemandRecords(res.data)
    } catch (err) {
      console.error('Failed to filter data:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateChartData = () => {
    const filtered = selectedProductForChart
      ? demandRecords.filter(d => d.productId === parseInt(selectedProductForChart))
      : demandRecords

    const grouped = filtered.reduce((acc: Record<string, number>, record) => {
      const date = record.date.split('T')[0]
      acc[date] = (acc[date] || 0) + record.quantity
      return acc
    }, {})

    const data = Object.entries(grouped)
      .map(([date, quantity]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        quantity,
      }))
      .slice(-30)

    setChartData(data)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await demandApi.create({
        productId: parseInt(formData.productId),
        quantity: parseInt(formData.quantity),
        date: formData.date,
        source: formData.source || undefined,
      })

      setIsModalOpen(false)
      setFormData({
        productId: '',
        quantity: '',
        date: new Date().toISOString().split('T')[0],
        source: '',
      })
      loadData()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to add demand record')
    }
  }

  if (loading) {
    return <div className="loading">Loading demand data...</div>
  }

  return (
    <div className="demand-page">
      <div className="page-header">
        <h1 className="page-title">Demand Data</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            Add Record
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">Demand Trend</h2>
          <select
            value={selectedProductForChart}
            onChange={(e) => setSelectedProductForChart(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border)' }}
          >
            <option value="">All Products</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ height: '300px', marginTop: '1rem' }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-light)' }}>
              No demand data to display
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Filter Records</h3>
        <div className="filter-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="filterProduct">Product</label>
            <select
              id="filterProduct"
              value={filters.productId}
              onChange={(e) => setFilters({ ...filters, productId: e.target.value })}
            >
              <option value="">All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="startDate">Start Date</label>
            <input
              type="date"
              id="startDate"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="endDate">End Date</label>
            <input
              type="date"
              id="endDate"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={handleFilter} style={{ alignSelf: 'flex-end' }}>
            Apply Filter
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {demandRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                    No demand records found.
                  </td>
                </tr>
              ) : (
                demandRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{new Date(record.date).toLocaleDateString()}</td>
                    <td>{record.productName}</td>
                    <td>{record.quantity.toLocaleString()}</td>
                    <td>{record.source || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Demand Record"
      >
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="productId">Product</label>
            <select
              id="productId"
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              required
            >
              <option value="">Select a product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="quantity">Quantity</label>
            <input
              type="number"
              id="quantity"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              required
              min="1"
            />
          </div>
          <div className="form-group">
            <label htmlFor="date">Date</label>
            <input
              type="date"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="source">Source (optional)</label>
            <input
              type="text"
              id="source"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., Online, In-Store, Import"
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Record
            </button>
          </div>
        </form>
      </Modal>

      <style>{`
        .filter-row {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .filter-row {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  )
}

export default Demand
