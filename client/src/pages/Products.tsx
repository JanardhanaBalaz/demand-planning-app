import { useState, useEffect, FormEvent } from 'react'
import Modal from '../components/Modal'
import { productsApi } from '../services/api'

interface Product {
  id: number
  sku: string
  name: string
  description: string | null
  category: string | null
  unitPrice: number
  createdAt: string
}

function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category: '',
    unitPrice: '',
  })

  const canEdit = true

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const res = await productsApi.getAll()
      setProducts(res.data)
    } catch (err) {
      console.error('Failed to load products:', err)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product)
      setFormData({
        sku: product.sku,
        name: product.name,
        description: product.description || '',
        category: product.category || '',
        unitPrice: product.unitPrice.toString(),
      })
    } else {
      setEditingProduct(null)
      setFormData({
        sku: '',
        name: '',
        description: '',
        category: '',
        unitPrice: '',
      })
    }
    setError('')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    setError('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const data = {
        sku: formData.sku,
        name: formData.name,
        description: formData.description || undefined,
        category: formData.category || undefined,
        unitPrice: parseFloat(formData.unitPrice),
      }

      if (editingProduct) {
        await productsApi.update(editingProduct.id, data)
      } else {
        await productsApi.create(data)
      }

      closeModal()
      loadProducts()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Failed to save product')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      await productsApi.delete(id)
      loadProducts()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      alert(error.response?.data?.message || 'Failed to delete product')
    }
  }

  if (loading) {
    return <div className="loading">Loading products...</div>
  }

  return (
    <div className="products-page">
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            Add Product
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Unit Price</th>
                <th>Created</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} style={{ textAlign: 'center', padding: '2rem' }}>
                    No products found. {canEdit && 'Click "Add Product" to create one.'}
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td><code>{product.sku}</code></td>
                    <td>{product.name}</td>
                    <td>{product.category || '-'}</td>
                    <td>${product.unitPrice.toFixed(2)}</td>
                    <td>{new Date(product.createdAt).toLocaleDateString()}</td>
                    {canEdit && (
                      <td>
                        <button
                          className="btn btn-outline"
                          style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem' }}
                          onClick={() => openModal(product)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.25rem 0.75rem' }}
                          onClick={() => handleDelete(product.id)}
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

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
      >
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="sku">SKU</label>
            <input
              type="text"
              id="sku"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              required
              placeholder="e.g., PROD-001"
            />
          </div>

          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Product name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <input
              type="text"
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Electronics"
            />
          </div>

          <div className="form-group">
            <label htmlFor="unitPrice">Unit Price ($)</label>
            <input
              type="number"
              id="unitPrice"
              value={formData.unitPrice}
              onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
              required
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingProduct ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Products
