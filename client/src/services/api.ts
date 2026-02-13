import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  me: () => api.get('/auth/me'),
  getGoogleAuthUrl: () => api.get('/auth/google'),
  googleCallback: (code: string) =>
    api.post('/auth/google/callback', { code }),
}

export const usersApi = {
  getAll: () => api.get('/users'),
  updateRole: (id: number, role: string) =>
    api.patch(`/users/${id}/role`, { role }),
  delete: (id: number) => api.delete(`/users/${id}`),
}

export const productsApi = {
  getAll: () => api.get('/products'),
  create: (data: { sku: string; name: string; description?: string; category?: string; unitPrice: number }) =>
    api.post('/products', data),
  update: (id: number, data: { sku?: string; name?: string; description?: string; category?: string; unitPrice?: number }) =>
    api.put(`/products/${id}`, data),
  delete: (id: number) => api.delete(`/products/${id}`),
}

export const inventoryApi = {
  getAll: () => api.get('/inventory'),
  update: (productId: number, data: { quantity: number; location?: string }) =>
    api.put(`/inventory/${productId}`, data),
  getAlerts: () => api.get('/inventory/alerts'),
}

export const demandApi = {
  getAll: (params?: { productId?: number; startDate?: string; endDate?: string }) =>
    api.get('/demand', { params }),
  create: (data: { productId: number; quantity: number; date: string; source?: string }) =>
    api.post('/demand', data),
  bulkCreate: (records: { productId: number; quantity: number; date: string; source?: string }[]) =>
    api.post('/demand/bulk', { records }),
}

export const forecastApi = {
  get: (productId: number) => api.get(`/forecast/${productId}`),
  generate: (productId: number, method: string) =>
    api.post(`/forecast/${productId}`, { method }),
}

export const alertsApi = {
  getAll: () => api.get('/alerts'),
  create: (data: { productId: number; threshold: number }) =>
    api.post('/alerts', data),
  update: (id: number, data: { threshold?: number; isActive?: boolean }) =>
    api.put(`/alerts/${id}`, data),
  delete: (id: number) => api.delete(`/alerts/${id}`),
}

export const importExportApi = {
  importProducts: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/import/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  importDemand: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/import/demand', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  exportReport: (type: string) =>
    api.get(`/export/report`, { params: { type }, responseType: 'blob' }),
  getTemplates: () => api.get('/import/templates'),
}

export interface Promotion {
  id: number
  promo_name: string
  country: string | null
  channel: string | null
  start_date: string
  end_date: string
  discount_percent: number
  notes: string | null
  status: string
  created_at: string
}

export const promotionsApi = {
  list: () => api.get<Promotion[]>('/promotions'),
  create: (data: Omit<Promotion, 'id' | 'created_at'>) =>
    api.post<Promotion>('/promotions', data),
  update: (id: number, data: Partial<Omit<Promotion, 'id' | 'created_at'>>) =>
    api.put<Promotion>(`/promotions/${id}`, data),
  delete: (id: number) => api.delete(`/promotions/${id}`),
}

export const channelForecastApi = {
  getChannels: () => api.get('/channel-forecast/channels'),
  discoverChannels: () => api.get('/channel-forecast/discover-channels'),
  getBaseline: (data: {
    startDate: string
    endDate: string
    countryBucket: string
    channel: string
    channelGroup?: string
    ringBasis: string
  }) => api.post('/channel-forecast/baseline', data),
  getSettings: (channelGroup: string, countryBucket: string) =>
    api.get('/channel-forecast/settings', { params: { channelGroup, countryBucket } }),
  saveSettings: (data: {
    channelGroup: string
    countryBucket: string
    months: {
      forecastMonth: string
      baselineDrr: number
      liftPct: number
      momGrowthPct: number
      distributionMethod: string
      baselineStartDate: string | null
      baselineEndDate: string | null
      ringBasis: string
    }[]
  }) => api.put('/channel-forecast/settings', data),
  saveSkuDistribution: (data: {
    channelGroup: string
    countryBucket: string
    skus: {
      sku: string
      autoWeightPct: number
      manualWeightPct: number | null
      isOverride: boolean
    }[]
  }) => api.put('/channel-forecast/sku-distribution', data),
  saveForecasts: (data: {
    channelGroup: string
    countryBucket: string
    forecasts: { sku: string; forecastMonth: string; forecastUnits: number }[]
  }) => api.post('/channel-forecast/save-forecasts', data),
}

export default api
