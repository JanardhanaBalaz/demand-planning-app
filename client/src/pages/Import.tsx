import { useState, useRef, DragEvent } from 'react'
import { importExportApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

type ImportType = 'products' | 'demand'

function Import() {
  const { user } = useAuth()
  const [importType, setImportType] = useState<ImportType>('products')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canEdit = user?.role === 'admin' || user?.role === 'analyst'

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFile(droppedFile)
      setResult(null)
    } else {
      setResult({ success: false, message: 'Please upload a CSV file' })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const uploadFn = importType === 'products'
        ? importExportApi.importProducts
        : importExportApi.importDemand

      const res = await uploadFn(file)
      setResult({
        success: true,
        message: res.data.message || `Successfully imported ${res.data.count || 0} records`,
        details: res.data.errors,
      })
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; errors?: string[] } } }
      setResult({
        success: false,
        message: error.response?.data?.message || 'Import failed',
        details: error.response?.data?.errors,
      })
    } finally {
      setUploading(false)
    }
  }

  const handleExport = async (type: string) => {
    try {
      const res = await importExportApi.exportReport(type)
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}-report-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setResult({ success: false, message: 'Export failed' })
    }
  }

  return (
    <div className="import-page">
      <div className="page-header">
        <h1 className="page-title">Import / Export</h1>
      </div>

      <div className="import-export-grid">
        {canEdit && (
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: '1rem' }}>Import Data</h2>

            <div className="form-group">
              <label htmlFor="importType">Import Type</label>
              <select
                id="importType"
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportType)}
              >
                <option value="products">Products</option>
                <option value="demand">Demand Records</option>
              </select>
            </div>

            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                style={{ display: 'none' }}
              />
              {file ? (
                <div className="file-info">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="drop-zone-content">
                  <span className="upload-icon">📁</span>
                  <p>Drag and drop a CSV file here</p>
                  <p className="drop-zone-hint">or click to browse</p>
                </div>
              )}
            </div>

            {result && (
              <div className={`alert ${result.success ? 'alert-success' : 'alert-error'}`}>
                <p>{result.message}</p>
                {result.details && result.details.length > 0 && (
                  <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                    {result.details.slice(0, 5).map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                    {result.details.length > 5 && (
                      <li>...and {result.details.length - 5} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>

            <div className="template-section">
              <h3>CSV Templates</h3>
              <p>Download sample templates to see the expected format:</p>
              <div className="template-links">
                <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('products') }}>
                  Products Template
                </a>
                <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('demand') }}>
                  Demand Template
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>Export Data</h2>

          <div className="export-options">
            <div className="export-option">
              <h3>Products Report</h3>
              <p>Export all products with inventory levels</p>
              <button className="btn btn-outline" onClick={() => handleExport('products')}>
                Download CSV
              </button>
            </div>

            <div className="export-option">
              <h3>Demand Report</h3>
              <p>Export demand history for all products</p>
              <button className="btn btn-outline" onClick={() => handleExport('demand')}>
                Download CSV
              </button>
            </div>

            <div className="export-option">
              <h3>Inventory Report</h3>
              <p>Export current inventory status</p>
              <button className="btn btn-outline" onClick={() => handleExport('inventory')}>
                Download CSV
              </button>
            </div>

            <div className="export-option">
              <h3>Forecast Report</h3>
              <p>Export all forecast predictions</p>
              <button className="btn btn-outline" onClick={() => handleExport('forecasts')}>
                Download CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .import-export-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }
        .drop-zone {
          border: 2px dashed var(--border);
          border-radius: 0.75rem;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .drop-zone:hover, .drop-zone.dragging {
          border-color: var(--primary);
          background-color: #eff6ff;
        }
        .drop-zone.has-file {
          border-color: var(--success);
          background-color: #f0fdf4;
        }
        .drop-zone-content {
          color: var(--text-light);
        }
        .upload-icon {
          font-size: 2rem;
          display: block;
          margin-bottom: 0.5rem;
        }
        .drop-zone-hint {
          font-size: 0.875rem;
          margin-top: 0.25rem;
        }
        .file-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .file-icon {
          font-size: 1.5rem;
        }
        .file-name {
          font-weight: 500;
        }
        .file-size {
          color: var(--text-light);
          font-size: 0.875rem;
        }
        .template-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        .template-section h3 {
          font-size: 1rem;
          margin-bottom: 0.5rem;
        }
        .template-section p {
          font-size: 0.875rem;
          color: var(--text-light);
          margin-bottom: 0.75rem;
        }
        .template-links {
          display: flex;
          gap: 1rem;
        }
        .export-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .export-option {
          padding: 1rem;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
        }
        .export-option h3 {
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }
        .export-option p {
          font-size: 0.875rem;
          color: var(--text-light);
          margin-bottom: 0.75rem;
        }
      `}</style>
    </div>
  )
}

function handleDownloadTemplate(type: string) {
  let content = ''
  let filename = ''

  if (type === 'products') {
    content = 'sku,name,description,category,unitPrice\nPROD-001,Sample Product,A sample product description,Electronics,29.99'
    filename = 'products-template.csv'
  } else {
    content = 'productId,quantity,date,source\n1,100,2024-01-15,Online\n1,50,2024-01-16,In-Store'
    filename = 'demand-template.csv'
  }

  const blob = new Blob([content], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export default Import
