import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { forecastApi, productsApi, demandApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface Product {
  id: number
  name: string
  sku: string
}

interface ForecastData {
  id: number
  productId: number
  predictedQuantity: number
  forecastDate: string
  method: string
  createdAt: string
}

interface ChartData {
  date: string
  actual?: number
  forecast?: number
}

function Forecasts() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [forecasts, setForecasts] = useState<ForecastData[]>([])
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [method, setMethod] = useState<string>('moving_average')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const canEdit = user?.role === 'admin' || user?.role === 'analyst'

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (selectedProduct) {
      loadForecastData()
    }
  }, [selectedProduct])

  const loadProducts = async () => {
    try {
      const res = await productsApi.getAll()
      setProducts(res.data)
      if (res.data.length > 0) {
        setSelectedProduct(res.data[0].id.toString())
      }
    } catch (err) {
      console.error('Failed to load products:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadForecastData = async () => {
    try {
      const [forecastRes, demandRes] = await Promise.all([
        forecastApi.get(parseInt(selectedProduct)),
        demandApi.getAll({ productId: parseInt(selectedProduct) }),
      ])

      setForecasts(forecastRes.data)

      // Combine actual demand and forecast data for chart
      const demandByDate: Record<string, number> = {}
      demandRes.data.forEach((d: { date: string; quantity: number }) => {
        const date = d.date.split('T')[0]
        demandByDate[date] = (demandByDate[date] || 0) + d.quantity
      })

      const forecastByDate: Record<string, number> = {}
      forecastRes.data.forEach((f: ForecastData) => {
        const date = f.forecastDate.split('T')[0]
        forecastByDate[date] = f.predictedQuantity
      })

      const allDates = new Set([...Object.keys(demandByDate), ...Object.keys(forecastByDate)])
      const sortedDates = Array.from(allDates).sort()

      const data: ChartData[] = sortedDates.slice(-60).map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        actual: demandByDate[date],
        forecast: forecastByDate[date],
      }))

      setChartData(data)
    } catch (err) {
      console.error('Failed to load forecast data:', err)
    }
  }

  const handleGenerateForecast = async () => {
    if (!selectedProduct) return

    setGenerating(true)
    setError('')

    try {
      await forecastApi.generate(parseInt(selectedProduct), method)
      await loadForecastData()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to generate forecast')
    } finally {
      setGenerating(false)
    }
  }

  const selectedProductName = products.find(p => p.id.toString() === selectedProduct)?.name || ''

  if (loading) {
    return <div className="loading">Loading forecasts...</div>
  }

  return (
    <div className="forecasts-page">
      <div className="page-header">
        <h1 className="page-title">Demand Forecasting</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="forecast-controls">
          <div className="form-group" style={{ flex: 1, maxWidth: '300px' }}>
            <label htmlFor="product">Select Product</label>
            <select
              id="product"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>
          </div>

          {canEdit && (
            <>
              <div className="form-group" style={{ flex: 1, maxWidth: '200px' }}>
                <label htmlFor="method">Forecast Method</label>
                <select
                  id="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="moving_average">Moving Average</option>
                  <option value="exponential_smoothing">Exponential Smoothing</option>
                  <option value="linear_trend">Linear Trend</option>
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerateForecast}
                disabled={generating || !selectedProduct}
                style={{ alignSelf: 'flex-end' }}
              >
                {generating ? 'Generating...' : 'Generate Forecast'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">
            Actual vs Forecast: {selectedProductName}
          </h2>
        </div>
        <div style={{ height: '400px', marginTop: '1rem' }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6' }}
                  name="Actual Demand"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#22c55e' }}
                  name="Forecast"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-light)' }}>
              No data available. Add demand records and generate a forecast.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Forecast Details</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Forecast Date</th>
                <th>Predicted Quantity</th>
                <th>Method</th>
                <th>Generated</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                    No forecasts generated yet.
                  </td>
                </tr>
              ) : (
                forecasts.map((forecast) => (
                  <tr key={forecast.id}>
                    <td>{new Date(forecast.forecastDate).toLocaleDateString()}</td>
                    <td>{forecast.predictedQuantity.toLocaleString()}</td>
                    <td>
                      <span className="badge badge-info">
                        {forecast.method.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{new Date(forecast.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .forecast-controls {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .forecast-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .forecast-controls .form-group {
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default Forecasts
