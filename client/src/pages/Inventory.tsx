import { useState, useEffect, FormEvent } from 'react'
import Modal from '../components/Modal'
import { inventoryApi, alertsApi, productsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface InventoryItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  location: string | null
  lastUpdated: string
}

interface Alert {
  id: number
  productId: number
  productName: string
  threshold: number
  isActive: boolean
  isTriggered: boolean
  currentQuantity: number
}

interface Product {
  id: number
  name: string
  sku: string
}

function Inventory() {
  const { user } = useAuth()
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inventory' | 'alerts'>('inventory')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState({ quantity: '', location: '' })
  const [alertForm, setAlertForm] = useState({ productId: '', threshold: '' })
  const [error, setError] = useState('')

  const canEdit = user?.role === 'admin' || user?.role === 'analyst'

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [inventoryRes, alertsRes, productsRes] = await Promise.all([
        inventoryApi.getAll(),
        inventoryApi.getAlerts(),
        productsApi.getAll(),
      ])
      setInventory(inventoryRes.data)
      setAlerts(alertsRes.data)
      setProducts(productsRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item)
    setEditForm({
      quantity: item.quantity.toString(),
      location: item.location || '',
    })
    setError('')
    setIsEditModalOpen(true)
  }

  const handleUpdateInventory = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    try {
      await inventoryApi.update(editingItem.productId, {
        quantity: parseInt(editForm.quantity),
        location: editForm.location || undefined,
      })
      setIsEditModalOpen(false)
      loadData()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to update inventory')
    }
  }

  const handleCreateAlert = async (e: FormEvent) => {
    e.preventDefault()

    try {
      await alertsApi.create({
        productId: parseInt(alertForm.productId),
        threshold: parseInt(alertForm.threshold),
      })
      setIsAlertModalOpen(false)
      setAlertForm({ productId: '', threshold: '' })
      loadData()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to create alert')
    }
  }

  const handleToggleAlert = async (alert: Alert) => {
    try {
      await alertsApi.update(alert.id, { isActive: !alert.isActive })
      loadData()
    } catch (err) {
      console.error('Failed to toggle alert:', err)
    }
  }

  const handleDeleteAlert = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert?')) return

    try {
      await alertsApi.delete(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete alert:', err)
    }
  }

  if (loading) {
    return <div className="loading">Loading inventory...</div>
  }

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        {canEdit && activeTab === 'alerts' && (
          <button className="btn btn-primary" onClick={() => setIsAlertModalOpen(true)}>
            Add Alert
          </button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          Stock Levels
        </button>
        <button
          className={`tab ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          Low Stock Alerts
          {alerts.filter(a => a.isTriggered).length > 0 && (
            <span className="badge badge-danger" style={{ marginLeft: '0.5rem' }}>
              {alerts.filter(a => a.isTriggered).length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'inventory' && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Location</th>
                  <th>Last Updated</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: '2rem' }}>
                      No inventory records found. Add products first.
                    </td>
                  </tr>
                ) : (
                  inventory.map((item) => (
                    <tr key={item.id}>
                      <td><code>{item.productSku}</code></td>
                      <td>{item.productName}</td>
                      <td>
                        <span className={item.quantity < 10 ? 'text-danger' : ''}>
                          {item.quantity.toLocaleString()}
                        </span>
                      </td>
                      <td>{item.location || '-'}</td>
                      <td>{new Date(item.lastUpdated).toLocaleString()}</td>
                      {canEdit && (
                        <td>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.25rem 0.75rem' }}
                            onClick={() => openEditModal(item)}
                          >
                            Update
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Threshold</th>
                  <th>Current Qty</th>
                  <th>Status</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>
                      No alerts configured. {canEdit && 'Click "Add Alert" to create one.'}
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>{alert.productName}</td>
                      <td>{alert.threshold}</td>
                      <td>{alert.currentQuantity}</td>
                      <td>
                        {alert.isTriggered ? (
                          <span className="badge badge-danger">Low Stock</span>
                        ) : alert.isActive ? (
                          <span className="badge badge-success">OK</span>
                        ) : (
                          <span className="badge badge-warning">Paused</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            className="btn btn-outline"
                            style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem' }}
                            onClick={() => handleToggleAlert(alert)}
                          >
                            {alert.isActive ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.75rem' }}
                            onClick={() => handleDeleteAlert(alert.id)}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Update Inventory"
      >
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleUpdateInventory}>
          <div className="form-group">
            <label>Product</label>
            <input type="text" value={editingItem?.productName || ''} disabled />
          </div>
          <div className="form-group">
            <label htmlFor="quantity">Quantity</label>
            <input
              type="number"
              id="quantity"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              required
              min="0"
            />
          </div>
          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              placeholder="e.g., Warehouse A"
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Update
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="Create Low Stock Alert"
      >
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleCreateAlert}>
          <div className="form-group">
            <label htmlFor="productId">Product</label>
            <select
              id="productId"
              value={alertForm.productId}
              onChange={(e) => setAlertForm({ ...alertForm, productId: e.target.value })}
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
            <label htmlFor="threshold">Threshold</label>
            <input
              type="number"
              id="threshold"
              value={alertForm.threshold}
              onChange={(e) => setAlertForm({ ...alertForm, threshold: e.target.value })}
              required
              min="1"
              placeholder="Alert when stock falls below this"
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={() => setIsAlertModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Alert
            </button>
          </div>
        </form>
      </Modal>

      <style>{`
        .tabs {
          display: flex;
          gap: 0.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0;
        }
        .tab {
          padding: 0.75rem 1.5rem;
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          color: var(--text-light);
          font-weight: 500;
        }
        .tab:hover {
          color: var(--text);
        }
        .tab.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }
        .text-danger {
          color: var(--danger);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

export default Inventory
