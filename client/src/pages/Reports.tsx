import { useState, useEffect, useMemo, useCallback } from 'react'
import { reportsApi } from '../services/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const AGING_BUCKETS = [
  { key: '0-3', label: '0-3 Days', color: '#10B981' },
  { key: '4-7', label: '4-7 Days', color: '#EAB308' },
  { key: '8-15', label: '8-15 Days', color: '#F97316' },
  { key: '16-30', label: '16-30 Days', color: '#F87171' },
  { key: '>30', label: '>30 Days', color: '#DC2626' },
] as const

const INVENTORY_CATEGORIES = [
  { name: 'Ring Air', colors: ['AA', 'AG', 'AS', 'MG', 'RT', 'BR'], bg: '#eff6ff', border: '#bfdbfe', headerBg: '#dbeafe', text: '#1d4ed8' },
  { name: 'Diesel x UH', colors: ['DB', 'DS'], bg: '#faf5ff', border: '#e9d5ff', headerBg: '#f3e8ff', text: '#7c3aed' },
  { name: 'Wabi Sabi', colors: ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'], bg: '#fffbeb', border: '#fde68a', headerBg: '#fef3c7', text: '#b45309' },
  { name: 'Rare Ring', colors: ['LG', 'LP', 'LR'], bg: '#fff1f2', border: '#fecdd3', headerBg: '#ffe4e6', text: '#be123c' },
]

const ALL_ALLOWED_COLORS = INVENTORY_CATEGORIES.flatMap(c => c.colors)

const COLOR_DISPLAY_NAMES: Record<string, string> = {
  'AA': 'Aster Black', 'AG': 'Gold', 'AS': 'Silver', 'MG': 'Matte Grey', 'RT': 'Raw Titanium', 'BR': 'Brushed Rose Gold',
  'DB': 'Diesel Black', 'DS': 'Diesel Silver',
  'WA': 'WS Aster Black', 'WG': 'WS Gold', 'WS': 'WS Silver', 'WM': 'WS Matte Grey', 'WR': 'WS Raw Titanium', 'WT': 'WS Rose Gold',
  'LG': 'Dune', 'LP': 'Desert Snow', 'LR': 'Desert Rose',
}

const COLOR_NAME_TO_CODE: Record<string, string> = {
  'air_aster_black': 'AA', 'air_gold': 'AG', 'air_silver': 'AS', 'aster_black': 'AA', 'gold': 'AG', 'silver': 'AS',
  'matte_grey': 'MG', 'raw_titanium': 'RT', 'brushed_rose_gold': 'BR',
  'diesel_black': 'DB', 'diesel_silver': 'DS', 'diesel-black': 'DB', 'diesel-silver': 'DS',
  'diesel_cryo_silver': 'DS', 'diesel_phantom': 'DB', 'diesel-cryo-silver': 'DS', 'diesel-phantom': 'DB',
  'cryo_silver': 'DS', 'phantom': 'DB',
  'ws_air_aster_black': 'WA', 'ws_air_gold': 'WG', 'ws_air_silver': 'WS',
  'ws_matte_grey': 'WM', 'ws_raw_titanium': 'WR', 'ws_brushed_rose_gold': 'WT',
  'dune': 'LG', 'desert_snow': 'LP', 'desert_rose': 'LR',
  'luna_dune': 'LG', 'luna_desert_snow': 'LP', 'luna_desert_rose': 'LR',
}

const COLOR_ORDER = ['AA', 'AG', 'AS', 'MG', 'RT', 'BR', 'DB', 'DS', 'WA', 'WG', 'WS', 'WM', 'WR', 'WT', 'LG', 'LP', 'LR']

const ALLOWED_WAREHOUSES = ['UH_BLR_LF3', 'ultrahuman', 'UH_PM_BLR', 'UH_BLR_REPL', 'UH_Wabi_Sabi_BLR']

const B2B_EXCLUDED_VENDOR_PREFIXES = ['mp amazon', 'mp bbms to other geo', 'mp ca fba', 'mp nl wh to fba', 'mp stocktransfertotx', 'mp uk wh to fba', 'warehouses kart']

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAgingBucket = (days: number): string => {
  if (days <= 3) return '0-3'
  if (days <= 7) return '4-7'
  if (days <= 15) return '8-15'
  if (days <= 30) return '16-30'
  return '>30'
}

const isB2BExcludedVendor = (v: string) => {
  const lv = v.toLowerCase()
  return B2B_EXCLUDED_VENDOR_PREFIXES.some(p => lv === p || lv.startsWith(p + ' '))
}

const extractVendor = (channel: string): string => {
  const lower = channel.toLowerCase()
  const cleaned = lower.replace(/^bulk_b2b_/, '').replace(/^bulk_/, '').replace(/^retail_/, '')
  const parts = cleaned.split('_')
  const vendorParts: string[] = []
  for (const part of parts) {
    if (/^\d{8}$/.test(part)) break
    vendorParts.push(part)
  }
  const vendor = vendorParts.join(' ').replace(/-/g, ' ').trim()
  return vendor.charAt(0).toUpperCase() + vendor.slice(1)
}

const resolveColor = (raw: string): string => {
  if (ALL_ALLOWED_COLORS.includes(raw.toUpperCase())) return raw.toUpperCase()
  const lower = raw.toLowerCase()
  return COLOR_NAME_TO_CODE[lower] || COLOR_NAME_TO_CODE[lower.replace(/-/g, '_')] || raw.toUpperCase()
}

const sortSizes = (sizes: string[]): string[] =>
  [...sizes].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })

const sortColors = (colors: string[]): string[] =>
  [...colors].sort((a, b) => {
    const ia = COLOR_ORDER.indexOf(a), ib = COLOR_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })

// ─── Types ───────────────────────────────────────────────────────────────────

type SubTab = 'consolidated' | 'b2c-aging' | 'b2b-aging' | 'inventory' | 'b2c-demand' | 'b2b-demand'

// ─── Component ───────────────────────────────────────────────────────────────

function Reports() {
  const [activeTab, setActiveTab] = useState<SubTab>('consolidated')
  const [dailyShipping, setDailyShipping] = useState<any>(null)
  const [b2bBulkOrders, setB2bBulkOrders] = useState<any>(null)
  const [inventoryData, setInventoryData] = useState<any>(null)
  const [loading, setLoading] = useState({ b2c: true, b2b: true, inv: true })
  const [errors, setErrors] = useState<Record<string, string | null>>({ b2c: null, b2b: null, inv: null })

  // Filters
  const [b2cAgingFilter, setB2cAgingFilter] = useState<string[]>([])
  const [b2bAgingFilter, setB2bAgingFilter] = useState<string[]>([])
  const [b2bVendorFilter, setB2bVendorFilter] = useState<string[]>([])
  const [b2bStatusFilter, setB2bStatusFilter] = useState<string[]>([])
  const [b2bCategoryFilter, setB2bCategoryFilter] = useState<string[]>([])

  // Fetch all data on mount
  useEffect(() => {
    reportsApi.getDailyShipping()
      .then(res => { setDailyShipping(res.data); setErrors(e => ({ ...e, b2c: null })) })
      .catch(err => { console.error('B2C fetch failed:', err); setErrors(e => ({ ...e, b2c: 'Failed to load B2C data' })) })
      .finally(() => setLoading(l => ({ ...l, b2c: false })))

    reportsApi.getB2BBulkOrders()
      .then(res => { setB2bBulkOrders(res.data); setErrors(e => ({ ...e, b2b: null })) })
      .catch(err => { console.error('B2B fetch failed:', err); setErrors(e => ({ ...e, b2b: 'Failed to load B2B data' })) })
      .finally(() => setLoading(l => ({ ...l, b2b: false })))

    reportsApi.getInventory()
      .then(res => { setInventoryData(res.data); setErrors(e => ({ ...e, inv: null })) })
      .catch(err => { console.error('Inventory fetch failed:', err); setErrors(e => ({ ...e, inv: 'Failed to load inventory data' })) })
      .finally(() => setLoading(l => ({ ...l, inv: false })))
  }, [])

  const toggleFilter = useCallback((arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }, [])

  // ─── B2C Pendency Calculation (Q8207: DAYS_FROM_SIZE, SKU, RING_COUNT) ─────

  const b2cData = useMemo(() => {
    if (!dailyShipping?.data) return null

    const unfilteredAging: Record<string, number> = {}
    AGING_BUCKETS.forEach(b => { unfilteredAging[b.key] = 0 })

    for (const row of dailyShipping.data) {
      const days = row.DAYS_FROM_SIZE
      const count = row.RING_COUNT || 0
      if (days < 0) continue
      const bucket = getAgingBucket(days)
      unfilteredAging[bucket] = (unfilteredAging[bucket] || 0) + count
    }

    const aging: Record<string, number> = {}
    const colorPivot: Record<string, Record<string, number>> = {}
    const allSizes = new Set<string>()
    let total = 0, critical = 0, urgent = 0, totalDays = 0

    AGING_BUCKETS.forEach(b => { aging[b.key] = 0 })

    for (const row of dailyShipping.data) {
      const days = row.DAYS_FROM_SIZE
      const count = row.RING_COUNT || 0
      const sku = row.SKU || ''
      if (days < 0 || !sku) continue

      const bucket = getAgingBucket(days)
      if (b2cAgingFilter.length > 0 && !b2cAgingFilter.includes(bucket)) continue

      const color = sku.substring(0, 2).toUpperCase()
      const size = sku.substring(2).replace(/^0+/, '') || sku.substring(2)

      total += count
      totalDays += days * count
      if (days > 30) critical += count
      if (days > 15 && days <= 30) urgent += count
      aging[bucket] = (aging[bucket] || 0) + count

      if (color && size) {
        allSizes.add(size)
        if (!colorPivot[color]) colorPivot[color] = {}
        colorPivot[color][size] = (colorPivot[color][size] || 0) + count
      }
    }

    const sortedSizes = sortSizes(Array.from(allSizes))
    const colorTotals = Object.entries(colorPivot)
      .map(([color, sizes]) => ({ color, displayName: COLOR_DISPLAY_NAMES[color] || color, sizes, total: Object.values(sizes).reduce((s, c) => s + c, 0) }))
      .sort((a, b) => { const ia = COLOR_ORDER.indexOf(a.color), ib = COLOR_ORDER.indexOf(b.color); if (ia !== -1 && ib !== -1) return ia - ib; if (ia !== -1) return -1; if (ib !== -1) return 1; return a.color.localeCompare(b.color) })

    // Top SKUs by pendency
    const skuStats: Record<string, { total: number; critical: number; totalDays: number }> = {}
    for (const row of dailyShipping.data) {
      const days = row.DAYS_FROM_SIZE
      const count = row.RING_COUNT || 0
      const sku = row.SKU || ''
      if (days < 0 || !sku) continue
      const bucket = getAgingBucket(days)
      if (b2cAgingFilter.length > 0 && !b2cAgingFilter.includes(bucket)) continue
      if (!skuStats[sku]) skuStats[sku] = { total: 0, critical: 0, totalDays: 0 }
      skuStats[sku].total += count
      skuStats[sku].totalDays += days * count
      if (days > 30) skuStats[sku].critical += count
    }
    const topSkus = Object.entries(skuStats)
      .map(([sku, s]) => ({ sku, total: s.total, critical: s.critical, avgDays: s.total > 0 ? Math.round(s.totalDays / s.total) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    return {
      total, critical, urgent, avgDays: total > 0 ? Math.round(totalDays / total) : 0,
      aging, colorPivot: colorTotals, sortedSizes, unfilteredAging, topSkus,
    }
  }, [dailyShipping, b2cAgingFilter])

  // ─── B2B Pendency Calculation ──────────────────────────────────────────────

  const b2bData = useMemo(() => {
    if (!b2bBulkOrders?.data) return null
    const now = new Date()
    const allChannels = new Set<string>()
    const allStatuses = new Set<string>()
    const allVendors = new Set<string>()
    const unfilteredAging: Record<string, number> = {}
    const unfilteredVendor: Record<string, number> = {}
    const unfilteredStatus: Record<string, number> = {}

    for (const order of b2bBulkOrders.data) {
      const channel = order.ORDER_CHANNEL || order.order_channel || 'Unknown'
      const vendor = extractVendor(channel)
      if (isB2BExcludedVendor(vendor)) continue
      const createdAt = order.CREATED_AT || order.created_at
      const createdDate = createdAt ? new Date(createdAt) : null
      if (!createdDate) continue
      const days = Math.floor((now.getTime() - createdDate.getTime()) / 86400000)
      if (days < 0) continue
      const bucket = getAgingBucket(days)
      unfilteredAging[bucket] = (unfilteredAging[bucket] || 0) + 1
      allChannels.add(channel)
      const statusVal = order.STATUS || order.status || 'Unknown'
      allStatuses.add(statusVal)
      unfilteredStatus[statusVal] = (unfilteredStatus[statusVal] || 0) + 1
      allVendors.add(vendor)
      unfilteredVendor[vendor] = (unfilteredVendor[vendor] || 0) + 1
    }

    const aging: Record<string, number> = {}
    const vendorDist: Record<string, number> = {}
    const statusDist: Record<string, number> = {}
    const skuBreakdown: Record<string, Record<string, number>> = {}
    const allSizes = new Set<string>()
    const categoryBreakdown: Record<string, { total: number; colors: Record<string, number> }> = {}
    INVENTORY_CATEGORIES.forEach(cat => {
      categoryBreakdown[cat.name] = { total: 0, colors: {} }
      cat.colors.forEach(c => { categoryBreakdown[cat.name].colors[c] = 0 })
    })
    let total = 0, critical = 0, urgent = 0

    for (const order of b2bBulkOrders.data) {
      const channel = order.ORDER_CHANNEL || order.order_channel || 'Unknown'
      const vendor = extractVendor(channel)
      if (isB2BExcludedVendor(vendor)) continue
      const createdAt = order.CREATED_AT || order.created_at
      const createdDate = createdAt ? new Date(createdAt) : null
      if (!createdDate) continue
      const days = Math.floor((now.getTime() - createdDate.getTime()) / 86400000)
      if (days < 0) continue
      const bucket = getAgingBucket(days)
      const statusVal = order.STATUS || order.status || 'Unknown'

      const sku = order.SKU || order.sku || ''
      let rawColor = '', rawSize = '', color = '', orderCategory = ''
      if (sku) {
        rawColor = sku.substring(0, 2).toUpperCase()
        rawSize = sku.substring(2)
      }
      if (rawColor && rawSize) {
        color = ALL_ALLOWED_COLORS.includes(rawColor) ? rawColor : resolveColor(rawColor)
        for (const cat of INVENTORY_CATEGORIES) {
          if (cat.colors.includes(color)) { orderCategory = cat.name; break }
        }
      }

      if (b2bAgingFilter.length > 0 && !b2bAgingFilter.includes(bucket)) continue
      if (b2bStatusFilter.length > 0 && !b2bStatusFilter.includes(statusVal)) continue
      if (b2bVendorFilter.length > 0 && !b2bVendorFilter.includes(vendor)) continue
      if (b2bCategoryFilter.length > 0 && orderCategory && !b2bCategoryFilter.includes(orderCategory)) continue

      total++
      aging[bucket] = (aging[bucket] || 0) + 1
      vendorDist[vendor] = (vendorDist[vendor] || 0) + 1
      statusDist[statusVal] = (statusDist[statusVal] || 0) + 1
      if (bucket === '>30') critical++
      if (bucket === '16-30') urgent++

      if (color && rawSize) {
        const size = String(rawSize).replace(/^0+/, '') || String(rawSize)
        allSizes.add(size)
        if (!skuBreakdown[color]) skuBreakdown[color] = {}
        skuBreakdown[color][size] = (skuBreakdown[color][size] || 0) + 1
        for (const cat of INVENTORY_CATEGORIES) {
          if (cat.colors.includes(color)) {
            categoryBreakdown[cat.name].total++
            categoryBreakdown[cat.name].colors[color] = (categoryBreakdown[cat.name].colors[color] || 0) + 1
            break
          }
        }
      }
    }

    return {
      total, critical, urgent, aging, vendorDist, statusDist,
      unfilteredAging, unfilteredVendor, unfilteredStatus,
      allStatuses: Array.from(allStatuses).sort(), allVendors: Array.from(allVendors).sort(),
      skuBreakdown, sortedColors: sortColors(Object.keys(skuBreakdown)),
      sortedSizes: sortSizes(Array.from(allSizes)), categoryBreakdown,
    }
  }, [b2bBulkOrders, b2bAgingFilter, b2bVendorFilter, b2bStatusFilter, b2bCategoryFilter])

  // ─── Inventory Stock Calculation ───────────────────────────────────────────

  const invData = useMemo(() => {
    if (!inventoryData?.data) return null

    const records = inventoryData.data.filter((r: any) => {
      const wh = r.Facility || r.warehouse || r.Warehouse || ''
      return ALLOWED_WAREHOUSES.includes(wh)
    }).filter((r: any) => {
      const sku = r.itemTypeSKU || r.SKU || r.sku || ''
      const prefix = sku.toUpperCase().substring(0, 2)
      return ALL_ALLOWED_COLORS.includes(prefix)
    })

    const categoryData: Record<string, { colorSizePivot: Record<string, Record<string, number>>; totalQty: number; allSizes: Set<string> }> = {}
    INVENTORY_CATEGORIES.forEach(cat => {
      categoryData[cat.name] = { colorSizePivot: {}, totalQty: 0, allSizes: new Set() }
      cat.colors.forEach(c => { categoryData[cat.name].colorSizePivot[c] = {} })
    })

    let totalQty = 0
    const whDist: Record<string, number> = {}

    for (const r of records) {
      const qty = typeof r.inventory === 'number' ? r.inventory : parseInt(r.inventory) || 0
      const sku = r.itemTypeSKU || r.SKU || r.sku || ''
      const color = sku.toUpperCase().substring(0, 2)
      const sizeMatch = sku.match(/\d+/g)
      const size = sizeMatch ? sizeMatch[sizeMatch.length - 1] : ''
      if (!color || !size) continue

      totalQty += qty
      const wh = r.Facility || r.warehouse || r.Warehouse || 'Unknown'
      whDist[wh] = (whDist[wh] || 0) + qty

      for (const cat of INVENTORY_CATEGORIES) {
        if (cat.colors.includes(color)) {
          categoryData[cat.name].allSizes.add(size)
          categoryData[cat.name].totalQty += qty
          categoryData[cat.name].colorSizePivot[color][size] = (categoryData[cat.name].colorSizePivot[color][size] || 0) + qty
          break
        }
      }
    }

    const sorted = Object.entries(categoryData).map(([name, d]) => ({
      name, colorSizePivot: d.colorSizePivot, totalQuantity: d.totalQty,
      sortedSizes: sortSizes(Array.from(d.allSizes)),
    }))

    return { totalQuantity: totalQty, warehouseDistribution: whDist, categoryData: sorted }
  }, [inventoryData])

  // ─── B2C Demand Calculation ────────────────────────────────────────────────

  const b2cDemandData = useMemo(() => {
    if (!dailyShipping?.data) return null

    // Pendency by color×size from Q8207
    const pendency: Record<string, Record<string, number>> = {}
    let totalPendency = 0
    for (const row of dailyShipping.data) {
      const sku = row.SKU || ''
      const count = row.RING_COUNT || 0
      if (!sku || row.DAYS_FROM_SIZE < 0) continue
      const color = sku.substring(0, 2).toUpperCase()
      const size = sku.substring(2).replace(/^0+/, '') || sku.substring(2)
      if (!color || !size) continue
      if (!pendency[color]) pendency[color] = {}
      pendency[color][size] = (pendency[color][size] || 0) + count
      totalPendency += count
    }

    // Inventory by color×size
    const inv: Record<string, Record<string, number>> = {}
    let totalInv = 0
    if (invData?.categoryData) {
      for (const cat of invData.categoryData) {
        for (const [color, sizes] of Object.entries(cat.colorSizePivot)) {
          if (!inv[color]) inv[color] = {}
          for (const [size, qty] of Object.entries(sizes as Record<string, number>)) {
            const normSize = String(size).replace(/^0+/, '') || size
            if (qty > 0) { inv[color][normSize] = (inv[color][normSize] || 0) + qty; totalInv += qty }
          }
        }
      }
    }

    // Demand = pendency - fulfillable
    const allSizes = new Set<string>()
    const demand: Record<string, Record<string, { inventory: number; pendency: number; fulfillable: number; unfulfillable: number }>> = {}
    let totalFulfillable = 0, totalUnfulfillable = 0

    for (const color of Object.keys(pendency)) {
      demand[color] = {}
      for (const [size, pen] of Object.entries(pendency[color])) {
        allSizes.add(size)
        const inventory = inv[color]?.[size] || 0
        const fulfillable = Math.min(pen, inventory)
        const unfulfillable = pen - fulfillable
        demand[color][size] = { inventory, pendency: pen, fulfillable, unfulfillable }
        totalFulfillable += fulfillable
        totalUnfulfillable += unfulfillable
      }
    }

    const fulfillmentRate = totalPendency > 0 ? Math.round((totalFulfillable / totalPendency) * 100) : 0

    const categoryData = INVENTORY_CATEGORIES.map(cat => {
      let catPen = 0, catFul = 0, catUnf = 0, catInv = 0
      cat.colors.forEach(c => {
        if (demand[c]) Object.values(demand[c]).forEach(d => { catPen += d.pendency; catFul += d.fulfillable; catUnf += d.unfulfillable })
      })
      const invCat = invData?.categoryData?.find((ic: any) => ic.name === cat.name)
      if (invCat) catInv = invCat.totalQuantity || 0
      return { ...cat, pendency: catPen, inventory: catInv, fulfillable: catFul, unfulfillable: catUnf, fulfillmentRate: catPen > 0 ? Math.round((catFul / catPen) * 100) : 100 }
    })

    return {
      demand, sortedColors: sortColors(Object.keys(pendency)), sortedSizes: sortSizes(Array.from(allSizes)),
      totalInventory: invData?.totalQuantity || totalInv, totalPendency, totalFulfillable, totalUnfulfillable, fulfillmentRate, categoryData,
    }
  }, [dailyShipping, invData])

  // ─── B2B Demand Calculation ────────────────────────────────────────────────

  const b2bDemandData = useMemo(() => {
    if (!b2bBulkOrders?.data) return null

    // B2B pendency (variant_selected only)
    const pendency: Record<string, Record<string, number>> = {}
    let totalPendency = 0
    for (const order of b2bBulkOrders.data) {
      const channel = order.ORDER_CHANNEL || order.order_channel || 'Unknown'
      const vendor = extractVendor(channel)
      if (isB2BExcludedVendor(vendor)) continue
      const status = (order.STATUS || order.status || '').toLowerCase()
      if (status !== 'variant_selected') continue
      const sku = order.SKU || order.sku || ''
      if (!sku) continue
      const rawColor = sku.substring(0, 2).toUpperCase()
      const rawSize = sku.substring(2)
      const size = String(rawSize).replace(/^0+/, '') || String(rawSize)
      if (!rawColor || !size || !ALL_ALLOWED_COLORS.includes(rawColor)) continue
      if (!pendency[rawColor]) pendency[rawColor] = {}
      pendency[rawColor][size] = (pendency[rawColor][size] || 0) + 1
      totalPendency++
    }

    // Full inventory
    const inv: Record<string, Record<string, number>> = {}
    let totalInv = 0
    if (invData?.categoryData) {
      for (const cat of invData.categoryData) {
        for (const [color, sizes] of Object.entries(cat.colorSizePivot)) {
          if (!inv[color]) inv[color] = {}
          for (const [size, qty] of Object.entries(sizes as Record<string, number>)) {
            const normSize = String(size).replace(/^0+/, '') || size
            if (qty > 0) { inv[color][normSize] = (inv[color][normSize] || 0) + qty; totalInv += qty }
          }
        }
      }
    }

    // Leftover after B2C
    const leftover: Record<string, Record<string, number>> = {}
    let totalLeftover = 0
    for (const color of Object.keys(inv)) {
      leftover[color] = {}
      for (const [size, qty] of Object.entries(inv[color])) {
        const b2cFul = b2cDemandData?.demand?.[color]?.[size]?.fulfillable || 0
        const left = Math.max(0, qty - b2cFul)
        leftover[color][size] = left
        totalLeftover += left
      }
    }

    // B2B demand
    const allSizes = new Set<string>()
    const demand: Record<string, Record<string, { inventory: number; pendency: number; fulfillable: number; unfulfillable: number }>> = {}
    let totalFulfillable = 0, totalUnfulfillable = 0
    for (const color of Object.keys(pendency)) {
      demand[color] = {}
      for (const [size, pen] of Object.entries(pendency[color])) {
        allSizes.add(size)
        const inventory = leftover[color]?.[size] || 0
        const fulfillable = Math.min(pen, inventory)
        const unfulfillable = pen - fulfillable
        demand[color][size] = { inventory, pendency: pen, fulfillable, unfulfillable }
        totalFulfillable += fulfillable
        totalUnfulfillable += unfulfillable
      }
    }

    const fulfillmentRate = totalPendency > 0 ? Math.round((totalFulfillable / totalPendency) * 100) : 0
    const categoryData = INVENTORY_CATEGORIES.map(cat => {
      let catPen = 0, catFul = 0, catUnf = 0, catInv = 0
      cat.colors.forEach(c => {
        if (demand[c]) Object.values(demand[c]).forEach(d => { catPen += d.pendency; catFul += d.fulfillable; catUnf += d.unfulfillable })
        if (leftover[c]) Object.values(leftover[c]).forEach(q => { catInv += q })
      })
      return { ...cat, pendency: catPen, inventory: catInv, fulfillable: catFul, unfulfillable: catUnf, fulfillmentRate: catPen > 0 ? Math.round((catFul / catPen) * 100) : 100 }
    })

    return {
      demand, sortedColors: sortColors(Object.keys(pendency)), sortedSizes: sortSizes(Array.from(allSizes)),
      totalInventory: totalLeftover, totalPendency, totalFulfillable, totalUnfulfillable, fulfillmentRate, categoryData,
    }
  }, [b2bBulkOrders, invData, b2cDemandData])

  // ─── Render Helpers ────────────────────────────────────────────────────────

  const isAllLoading = loading.b2c || loading.b2b || loading.inv

  const kpiCard = (label: string, value: number | string, color: string, bgFrom: string, bgTo: string, borderColor: string) => (
    <div style={{ background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})`, borderRadius: '8px', padding: '1rem', border: `1px solid ${borderColor}` }}>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 500, color }}>{label}</div>
    </div>
  )

  const filterBadge = (label: string, onClick: () => void) => (
    <span
      key={label}
      onClick={onClick}
      style={{ padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 500, background: '#f3f4f6', border: '1px solid #d1d5db', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    >
      {label} &times;
    </span>
  )

  const agingBar = (dist: Record<string, number>, total: number, onClickBucket: (key: string) => void, activeFilters: string[]) => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {AGING_BUCKETS.map(b => {
        const count = dist[b.key] || 0
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const isActive = activeFilters.length === 0 || activeFilters.includes(b.key)
        return (
          <div
            key={b.key}
            onClick={() => onClickBucket(b.key)}
            style={{
              flex: 1, minWidth: '80px', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer',
              background: isActive ? `${b.color}15` : '#f9fafb', border: `1px solid ${isActive ? b.color : '#e5e7eb'}`,
              opacity: isActive ? 1 : 0.5, textAlign: 'center', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: b.color }}>{count}</div>
            <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>{b.label}</div>
            <div style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{pct}%</div>
          </div>
        )
      })}
    </div>
  )

  // Color×Size pivot table renderer
  const renderColorSizePivot = (
    data: { color: string; displayName?: string; sizes: Record<string, number>; total: number }[],
    sortedSizes: string[],
    title: string
  ) => (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{title}</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Color</th>
              {sortedSizes.map(s => <th key={s} style={{ ...thStyle, textAlign: 'center' }}>{s}</th>)}
              <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.color} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {row.color} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{row.displayName || COLOR_DISPLAY_NAMES[row.color] || ''}</span>
                </td>
                {sortedSizes.map(s => {
                  const v = row.sizes[s] || 0
                  return <td key={s} style={{ ...tdCenter, color: v > 0 ? '#111827' : '#d1d5db' }}>{v || '-'}</td>
                })}
                <td style={{ ...tdCenter, fontWeight: 700 }}>{row.total}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #d1d5db' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 700 }}>Total</td>
              {sortedSizes.map(s => {
                const colTotal = data.reduce((sum, row) => sum + (row.sizes[s] || 0), 0)
                return <td key={s} style={{ ...tdCenter, fontWeight: 700 }}>{colTotal || '-'}</td>
              })}
              <td style={{ ...tdCenter, fontWeight: 700 }}>{data.reduce((s, r) => s + r.total, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )

  // Demand pivot table (with pendency, inventory, fulfillable, unfulfillable)
  const renderDemandPivot = (
    demandData: Record<string, Record<string, { inventory: number; pendency: number; fulfillable: number; unfulfillable: number }>>,
    sortedColors: string[],
    sortedSizes: string[],
    title: string
  ) => (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{title}</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Color</th>
              {sortedSizes.map(s => <th key={s} style={{ ...thStyle, textAlign: 'center' }}>{s}</th>)}
              <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedColors.map(color => {
              const row = demandData[color] || {}
              const rowTotal = Object.values(row).reduce((s, d) => s + d.unfulfillable, 0)
              return (
                <tr key={color} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {color} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{COLOR_DISPLAY_NAMES[color] || ''}</span>
                  </td>
                  {sortedSizes.map(s => {
                    const cell = row[s]
                    if (!cell || cell.unfulfillable === 0) return <td key={s} style={{ ...tdCenter, color: '#d1d5db' }}>-</td>
                    return (
                      <td key={s} style={{ ...tdCenter, color: '#dc2626', fontWeight: 600 }} title={`Pendency: ${cell.pendency}, Inv: ${cell.inventory}, Fulfillable: ${cell.fulfillable}`}>
                        {cell.unfulfillable}
                      </td>
                    )
                  })}
                  <td style={{ ...tdCenter, fontWeight: 700, color: rowTotal > 0 ? '#dc2626' : '#d1d5db' }}>{rowTotal || '-'}</td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid #d1d5db' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 700 }}>Total</td>
              {sortedSizes.map(s => {
                const colTotal = sortedColors.reduce((sum, c) => sum + (demandData[c]?.[s]?.unfulfillable || 0), 0)
                return <td key={s} style={{ ...tdCenter, fontWeight: 700, color: colTotal > 0 ? '#dc2626' : '#d1d5db' }}>{colTotal || '-'}</td>
              })}
              <td style={{ ...tdCenter, fontWeight: 700, color: '#dc2626' }}>
                {sortedColors.reduce((sum, c) => sum + Object.values(demandData[c] || {}).reduce((s, d) => s + d.unfulfillable, 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )

  // ─── Tab: Consolidated Dashboard ───────────────────────────────────────────

  const renderConsolidated = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {kpiCard('B2C Pendency', b2cData?.total ?? '...', '#2563eb', '#eff6ff', '#dbeafe', '#bfdbfe')}
        {kpiCard('B2B Pendency', b2bData?.total ?? '...', '#7c3aed', '#faf5ff', '#f3e8ff', '#e9d5ff')}
        {kpiCard('Total Inventory', invData?.totalQuantity ?? '...', '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
        {kpiCard('B2C Avg Age', b2cData ? `${b2cData.avgDays}d` : '...', '#d97706', '#fffbeb', '#fef3c7', '#fde68a')}
      </div>

      {/* B2C Aging overview */}
      {b2cData && (
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>B2C Pendency Aging</h3>
          {agingBar(b2cData.unfilteredAging, b2cData.total, () => {}, [])}
        </div>
      )}

      {/* B2B Aging overview */}
      {b2bData && (
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>B2B Pendency Aging</h3>
          {agingBar(b2bData.unfilteredAging, b2bData.total, () => {}, [])}
        </div>
      )}

      {/* Inventory by category */}
      {invData && (
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Inventory by Category</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {invData.categoryData.map((cat: any) => {
              const catCfg = INVENTORY_CATEGORIES.find(c => c.name === cat.name)
              return (
                <div key={cat.name} style={{ padding: '0.75rem', borderRadius: '6px', background: catCfg?.bg || '#f9fafb', border: `1px solid ${catCfg?.border || '#e5e7eb'}` }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: catCfg?.text }}>{cat.totalQuantity}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cat.name}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Demand summary */}
      {b2cDemandData && b2bDemandData && (
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Demand Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {kpiCard('B2C Unfulfillable', b2cDemandData.totalUnfulfillable, '#dc2626', '#fef2f2', '#fee2e2', '#fecaca')}
            {kpiCard('B2C Fill Rate', `${b2cDemandData.fulfillmentRate}%`, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
            {kpiCard('B2B Unfulfillable', b2bDemandData.totalUnfulfillable, '#dc2626', '#fef2f2', '#fee2e2', '#fecaca')}
            {kpiCard('B2B Fill Rate', `${b2bDemandData.fulfillmentRate}%`, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
          </div>
        </div>
      )}
    </div>
  )

  // ─── Tab: B2C Pendency Aging ───────────────────────────────────────────────

  const renderB2CAging = () => {
    if (loading.b2c) return <p>Loading B2C data...</p>
    if (errors.b2c) return <p style={{ color: '#dc2626' }}>{errors.b2c}</p>
    if (!b2cData) return <p>No B2C data available</p>

    const hasFilters = b2cAgingFilter.length > 0
    const maxAgingCount = Math.max(...Object.values(b2cData.unfilteredAging), 1)

    // Color display name mapping matching the screenshot style
    const colorSnakeNames: Record<string, string> = {
      'AA': 'air_aster_black', 'AG': 'air_gold', 'AS': 'air_silver',
      'MG': 'matte_grey', 'RT': 'raw_titanium', 'BR': 'brushed_rose_gold',
      'DB': 'diesel_phantom', 'DS': 'diesel_cryo_silver',
      'WA': 'ws_air_aster_black', 'WG': 'ws_air_gold', 'WS': 'ws_air_silver',
      'WM': 'ws_matte_grey', 'WR': 'ws_raw_titanium', 'WT': 'ws_brushed_rose_gold',
      'LG': 'dune', 'LP': 'desert_snow', 'LR': 'desert_rose',
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>B2C Pendency Aging Dashboard</h2>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Real-time aging analysis based on Size Date</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {hasFilters && (
              <button onClick={() => setB2cAgingFilter([])}
                style={{ padding: '0.3rem 0.75rem', border: '1px solid #f97316', borderRadius: '6px', background: '#fff7ed', color: '#ea580c', fontSize: '0.75rem', cursor: 'pointer' }}>
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards — 3 columns matching screenshot */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#fff' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2563eb' }}>{b2cData.total}</div>
            <div style={{ fontSize: '0.8rem', color: '#2563eb' }}>Total Pendency</div>
          </div>
          <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #fecaca', background: '#fff' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#dc2626' }}>{b2cData.critical}</div>
            <div style={{ fontSize: '0.8rem', color: '#dc2626' }}>Critical (&gt;30 days)</div>
          </div>
          <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #fed7aa', background: '#fff' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ea580c' }}>{b2cData.urgent}</div>
            <div style={{ fontSize: '0.8rem', color: '#ea580c' }}>Urgent (16-30 days)</div>
          </div>
        </div>

        {/* 3-column row: Aging Distribution | (placeholder) | Top SKUs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          {/* Aging Distribution — horizontal bars */}
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Aging Distribution</h3>
              <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>Click to filter</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {AGING_BUCKETS.map(b => {
                const count = b2cData.aging[b.key] || 0
                const unfilteredCount = b2cData.unfilteredAging[b.key] || 0
                const pct = b2cData.total > 0 ? Math.round((count / b2cData.total) * 100) : 0
                const barWidth = maxAgingCount > 0 ? Math.max((unfilteredCount / maxAgingCount) * 100, 2) : 0
                const isActive = b2cAgingFilter.length === 0 || b2cAgingFilter.includes(b.key)
                return (
                  <div key={b.key} onClick={() => toggleFilter(b2cAgingFilter, setB2cAgingFilter, b.key)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: isActive ? 1 : 0.4 }}>
                    <span style={{ fontSize: '0.75rem', color: '#374151', minWidth: '75px', whiteSpace: 'nowrap' }}>{b.label}</span>
                    <div style={{ flex: 1, position: 'relative', height: '22px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', background: b.color, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: count > 0 ? 'center' : 'flex-start', paddingLeft: count > 0 ? 0 : '4px', transition: 'width 0.3s' }}>
                        {count > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#fff' }}>{count}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', minWidth: '28px', textAlign: 'right' }}>{count}</span>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: '28px', textAlign: 'right' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Middle column — placeholder for geography/status if available later */}
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Average Age</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: b2cData.avgDays > 15 ? '#dc2626' : b2cData.avgDays > 7 ? '#d97706' : '#059669' }}>{b2cData.avgDays} days</div>
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>By Category</div>
                {INVENTORY_CATEGORIES.map(cat => {
                  const catTotal = cat.colors.reduce((sum, c) => {
                    const colorData = b2cData.colorPivot.find(cp => cp.color === c)
                    return sum + (colorData?.total || 0)
                  }, 0)
                  if (catTotal === 0) return null
                  return (
                    <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', fontSize: '0.75rem' }}>
                      <span style={{ color: cat.text }}>{cat.name}</span>
                      <span style={{ fontWeight: 600 }}>{catTotal}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Top SKUs by Pendency */}
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Top SKUs by Pendency</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {b2cData.topSkus.map((s, i) => (
                <div key={s.sku} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                    background: i < 3 ? '#dc2626' : '#9ca3af',
                  }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{s.sku}</div>
                    <div style={{ fontSize: '0.65rem', color: s.critical > 0 ? '#dc2626' : '#6b7280' }}>
                      {s.critical > 0 ? <span style={{ color: '#dc2626' }}>{s.critical} critical</span> : <span>0 critical</span>}
                      {' | Avg: '}{s.avgDays}d
                    </div>
                  </div>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>{s.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SKU Breakdown (Color x Size) */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>SKU Breakdown (Color x Size)</h3>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{b2cData.colorPivot.length} colors</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: '200px' }}>Color</th>
                  {b2cData.sortedSizes.map(s => <th key={s} style={{ ...thStyle, textAlign: 'center', minWidth: '45px' }}>{s}</th>)}
                  <th style={{ ...thStyle, textAlign: 'center', background: '#fee2e2', color: '#dc2626', minWidth: '55px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {b2cData.colorPivot.map(row => (
                  <tr key={row.color} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.4rem 0.75rem' }}>
                      <span style={{ fontWeight: 600 }}>{colorSnakeNames[row.color] || row.color}</span>
                      {' '}<span style={{ color: '#9ca3af' }}>{colorSnakeNames[row.color] || ''}</span>
                    </td>
                    {b2cData.sortedSizes.map(s => {
                      const v = row.sizes[s] || 0
                      return <td key={s} style={{ ...tdCenter, color: v > 0 ? '#111827' : '#d1d5db' }}>{v || '-'}</td>
                    })}
                    <td style={{ ...tdCenter, fontWeight: 700, color: '#dc2626', background: '#fef2f2' }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ─── Tab: B2B Pendency Aging ───────────────────────────────────────────────

  const renderB2BAging = () => {
    if (loading.b2b) return <p>Loading B2B data...</p>
    if (errors.b2b) return <p style={{ color: '#dc2626' }}>{errors.b2b}</p>
    if (!b2bData) return <p>No B2B data available</p>

    const hasFilters = b2bAgingFilter.length > 0 || b2bVendorFilter.length > 0 || b2bStatusFilter.length > 0 || b2bCategoryFilter.length > 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>B2B Pendency Aging Dashboard</h2>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Real-time aging analysis based on Created Date</span>
          </div>
          {hasFilters && (
            <button onClick={() => { setB2bAgingFilter([]); setB2bVendorFilter([]); setB2bStatusFilter([]); setB2bCategoryFilter([]) }}
              style={{ padding: '0.3rem 0.75rem', border: '1px solid #8b5cf6', borderRadius: '6px', background: '#faf5ff', color: '#7c3aed', fontSize: '0.75rem', cursor: 'pointer' }}>
              Clear Filters
            </button>
          )}
        </div>

        {hasFilters && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', padding: '0.5rem', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#7c3aed' }}>Filters:</span>
            {b2bAgingFilter.map(f => filterBadge(AGING_BUCKETS.find(b => b.key === f)?.label || f, () => toggleFilter(b2bAgingFilter, setB2bAgingFilter, f)))}
            {b2bVendorFilter.map(f => filterBadge(f, () => toggleFilter(b2bVendorFilter, setB2bVendorFilter, f)))}
            {b2bStatusFilter.map(f => filterBadge(f.replace(/_/g, ' '), () => toggleFilter(b2bStatusFilter, setB2bStatusFilter, f)))}
            {b2bCategoryFilter.map(f => filterBadge(f, () => toggleFilter(b2bCategoryFilter, setB2bCategoryFilter, f)))}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {kpiCard('Total B2B Pendency', b2bData.total, '#7c3aed', '#faf5ff', '#f3e8ff', '#e9d5ff')}
          {kpiCard('Critical (>30d)', b2bData.critical, '#dc2626', '#fef2f2', '#fee2e2', '#fecaca')}
          {kpiCard('Urgent (16-30d)', b2bData.urgent, '#d97706', '#fffbeb', '#fef3c7', '#fde68a')}
        </div>

        {/* Aging */}
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Aging Distribution (click to filter)</h3>
          {agingBar(b2bData.aging, b2bData.total, (k) => toggleFilter(b2bAgingFilter, setB2bAgingFilter, k), b2bAgingFilter)}
        </div>

        {/* Vendor + Status side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Vendor Distribution (click to filter)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '250px', overflowY: 'auto' }}>
              {Object.entries(b2bData.vendorDist).sort((a, b) => b[1] - a[1]).map(([vendor, count]) => {
                const isActive = b2bVendorFilter.length === 0 || b2bVendorFilter.includes(vendor)
                return (
                  <div key={vendor} onClick={() => toggleFilter(b2bVendorFilter, setB2bVendorFilter, vendor)}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: isActive ? '#f9fafb' : 'transparent', opacity: isActive ? 1 : 0.5, fontSize: '0.75rem' }}>
                    <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor}</span>
                    <span style={{ fontWeight: 600 }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Status (click to filter)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {Object.entries(b2bData.statusDist).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                const isActive = b2bStatusFilter.length === 0 || b2bStatusFilter.includes(status)
                return (
                  <div key={status} onClick={() => toggleFilter(b2bStatusFilter, setB2bStatusFilter, status)}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: isActive ? '#f9fafb' : 'transparent', opacity: isActive ? 1 : 0.5, fontSize: '0.75rem' }}>
                    <span>{status.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 600 }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Category Breakdown (click to filter)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {INVENTORY_CATEGORIES.map(cat => {
              const data = b2bData.categoryBreakdown[cat.name]
              if (!data) return null
              const isActive = b2bCategoryFilter.length === 0 || b2bCategoryFilter.includes(cat.name)
              return (
                <div key={cat.name} onClick={() => toggleFilter(b2bCategoryFilter, setB2bCategoryFilter, cat.name)}
                  style={{ padding: '0.75rem', borderRadius: '6px', cursor: 'pointer', background: cat.bg, border: `1px solid ${cat.border}`, opacity: isActive ? 1 : 0.5 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: cat.text }}>{data.total}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cat.name}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Color × Size pivot */}
        {b2bData.sortedColors.length > 0 && renderColorSizePivot(
          b2bData.sortedColors.map(c => ({ color: c, sizes: b2bData.skuBreakdown[c] || {}, total: Object.values(b2bData.skuBreakdown[c] || {}).reduce((s: number, v: number) => s + v, 0) })),
          b2bData.sortedSizes,
          'Color × Size Breakdown'
        )}
      </div>
    )
  }

  // ─── Tab: Inventory Stock ──────────────────────────────────────────────────

  const renderInventory = () => {
    if (loading.inv) return <p>Loading inventory data...</p>
    if (errors.inv) return <p style={{ color: '#dc2626' }}>{errors.inv}</p>
    if (!invData) return <p>No inventory data available</p>

    // Build flat Color×Size data across all categories
    const allColorRows: { color: string; displayName: string; sizes: Record<string, number>; total: number }[] = []
    const allSizesSet = new Set<string>()
    for (const cat of invData.categoryData) {
      const cfg = INVENTORY_CATEGORIES.find(c => c.name === cat.name)
      const colors = cfg?.colors || []
      for (const c of colors) {
        const sizes = cat.colorSizePivot[c] || {}
        const total = Object.values(sizes).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0)
        if (total > 0) {
          allColorRows.push({ color: c, displayName: COLOR_DISPLAY_NAMES[c] || c, sizes, total })
          Object.keys(sizes).forEach(s => allSizesSet.add(s))
        }
      }
    }
    const allSizesSorted = sortSizes(Array.from(allSizesSet))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Inventory Stock (Unicommerce)</h2>
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Filtered to BLR warehouses &middot; {invData.totalQuantity} total units</span>
        </div>

        {/* By Category — cards with per-color breakdown */}
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>By Category</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {invData.categoryData.map((cat: any) => {
              const cfg = INVENTORY_CATEGORIES.find(c => c.name === cat.name)
              if (!cfg) return null
              const colors = cfg.colors
              return (
                <div key={cat.name} style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: cfg.text }}>{cat.name}</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: cfg.text }}>{cat.totalQuantity}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    {colors.map((c: string) => {
                      const colorTotal = Object.values(cat.colorSizePivot[c] || {}).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0)
                      if (colorTotal === 0) return null
                      return (
                        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: '#374151' }}>{c}</span>
                          <span style={{ fontWeight: 600, color: cfg.text }}>{colorTotal}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* SKU Breakdown (Color x Size) — single flat table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>SKU Breakdown (Color x Size)</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: '180px' }}>Color</th>
                  {allSizesSorted.map(s => <th key={s} style={{ ...thStyle, textAlign: 'center', minWidth: '50px' }}>{s.padStart(2, '0')}</th>)}
                  <th style={{ ...thStyle, textAlign: 'center', color: '#7c3aed', minWidth: '55px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {allColorRows.map(row => (
                  <tr key={row.color} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.4rem 0.75rem' }}>
                      <span style={{ fontWeight: 600 }}>{row.color}</span>
                      {' '}<span style={{ color: '#9ca3af' }}>{row.displayName}</span>
                    </td>
                    {allSizesSorted.map(s => {
                      const v = row.sizes[s] || 0
                      return <td key={s} style={{ ...tdCenter, color: v > 0 ? '#2563eb' : '#d1d5db' }}>{v || '-'}</td>
                    })}
                    <td style={{ ...tdCenter, fontWeight: 700, color: '#7c3aed' }}>{row.total}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid #d1d5db', background: '#f9fafb' }}>
                  <td style={{ padding: '0.4rem 0.75rem', fontWeight: 700 }}>Total</td>
                  {allSizesSorted.map(s => {
                    const colTotal = allColorRows.reduce((sum, r) => sum + (r.sizes[s] || 0), 0)
                    return <td key={s} style={{ ...tdCenter, fontWeight: 700, color: '#2563eb' }}>{colTotal || '-'}</td>
                  })}
                  <td style={{ ...tdCenter, fontWeight: 700, color: '#7c3aed' }}>{invData.totalQuantity}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ─── Tab: B2C Demand ───────────────────────────────────────────────────────

  const renderB2CDemand = () => {
    if (loading.b2c || loading.inv) return <p>Loading demand data...</p>
    if (!b2cDemandData) return <p>No B2C demand data available</p>

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>B2C Demand Analysis</h2>
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Unfulfillable = Pendency - min(Pendency, Inventory)</span>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
          {kpiCard('Pendency', b2cDemandData.totalPendency, '#2563eb', '#eff6ff', '#dbeafe', '#bfdbfe')}
          {kpiCard('Inventory', b2cDemandData.totalInventory, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
          {kpiCard('Fulfillable', b2cDemandData.totalFulfillable, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
          {kpiCard('Unfulfillable', b2cDemandData.totalUnfulfillable, '#dc2626', '#fef2f2', '#fee2e2', '#fecaca')}
          {kpiCard('Fill Rate', `${b2cDemandData.fulfillmentRate}%`, b2cDemandData.fulfillmentRate >= 80 ? '#059669' : '#d97706', b2cDemandData.fulfillmentRate >= 80 ? '#f0fdf4' : '#fffbeb', b2cDemandData.fulfillmentRate >= 80 ? '#dcfce7' : '#fef3c7', b2cDemandData.fulfillmentRate >= 80 ? '#a7f3d0' : '#fde68a')}
        </div>

        {/* Category breakdown */}
        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Category Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {b2cDemandData.categoryData.map((cat: any) => (
              <div key={cat.name} style={{ padding: '0.75rem', borderRadius: '6px', background: cat.bg, border: `1px solid ${cat.border}` }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: cat.text, marginBottom: '0.25rem' }}>{cat.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.15rem', fontSize: '0.7rem' }}>
                  <span style={{ color: '#6b7280' }}>Pendency:</span><span style={{ fontWeight: 600 }}>{cat.pendency}</span>
                  <span style={{ color: '#6b7280' }}>Inventory:</span><span style={{ fontWeight: 600 }}>{cat.inventory}</span>
                  <span style={{ color: '#6b7280' }}>Unfulfillable:</span><span style={{ fontWeight: 600, color: '#dc2626' }}>{cat.unfulfillable}</span>
                  <span style={{ color: '#6b7280' }}>Fill Rate:</span><span style={{ fontWeight: 600, color: cat.fulfillmentRate >= 80 ? '#059669' : '#d97706' }}>{cat.fulfillmentRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Demand pivot */}
        {renderDemandPivot(b2cDemandData.demand, b2cDemandData.sortedColors, b2cDemandData.sortedSizes, 'Unfulfillable Demand — Color × Size')}
      </div>
    )
  }

  // ─── Tab: B2B Demand ───────────────────────────────────────────────────────

  const renderB2BDemand = () => {
    if (loading.b2b || loading.inv || loading.b2c) return <p>Loading B2B demand data...</p>
    if (!b2bDemandData) return <p>No B2B demand data available</p>

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>B2B Demand Analysis</h2>
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Available = Inventory - B2C Fulfillable &middot; B2B only "variant_selected" status</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
          {kpiCard('B2B Pendency', b2bDemandData.totalPendency, '#7c3aed', '#faf5ff', '#f3e8ff', '#e9d5ff')}
          {kpiCard('Available Inv', b2bDemandData.totalInventory, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
          {kpiCard('Fulfillable', b2bDemandData.totalFulfillable, '#059669', '#f0fdf4', '#dcfce7', '#a7f3d0')}
          {kpiCard('Unfulfillable', b2bDemandData.totalUnfulfillable, '#dc2626', '#fef2f2', '#fee2e2', '#fecaca')}
          {kpiCard('Fill Rate', `${b2bDemandData.fulfillmentRate}%`, b2bDemandData.fulfillmentRate >= 80 ? '#059669' : '#d97706', b2bDemandData.fulfillmentRate >= 80 ? '#f0fdf4' : '#fffbeb', b2bDemandData.fulfillmentRate >= 80 ? '#dcfce7' : '#fef3c7', b2bDemandData.fulfillmentRate >= 80 ? '#a7f3d0' : '#fde68a')}
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>Category Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {b2bDemandData.categoryData.map((cat: any) => (
              <div key={cat.name} style={{ padding: '0.75rem', borderRadius: '6px', background: cat.bg, border: `1px solid ${cat.border}` }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: cat.text, marginBottom: '0.25rem' }}>{cat.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.15rem', fontSize: '0.7rem' }}>
                  <span style={{ color: '#6b7280' }}>Pendency:</span><span style={{ fontWeight: 600 }}>{cat.pendency}</span>
                  <span style={{ color: '#6b7280' }}>Available:</span><span style={{ fontWeight: 600 }}>{cat.inventory}</span>
                  <span style={{ color: '#6b7280' }}>Unfulfillable:</span><span style={{ fontWeight: 600, color: '#dc2626' }}>{cat.unfulfillable}</span>
                  <span style={{ color: '#6b7280' }}>Fill Rate:</span><span style={{ fontWeight: 600, color: cat.fulfillmentRate >= 80 ? '#059669' : '#d97706' }}>{cat.fulfillmentRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {renderDemandPivot(b2bDemandData.demand, b2bDemandData.sortedColors, b2bDemandData.sortedSizes, 'Unfulfillable Demand — Color × Size')}
      </div>
    )
  }

  // ─── Main Render ───────────────────────────────────────────────────────────

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'consolidated', label: 'Dashboard' },
    { key: 'b2c-aging', label: 'B2C Pendency' },
    { key: 'b2b-aging', label: 'B2B Pendency' },
    { key: 'inventory', label: 'Inventory Stock' },
    { key: 'b2c-demand', label: 'B2C Demand' },
    { key: 'b2b-demand', label: 'B2B Demand' },
  ]

  return (
    <div className="reports-page">
      <div className="page-header" style={{ marginBottom: '0.75rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Reports</h1>
        {isAllLoading && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Loading data...</span>}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: activeTab === t.key ? 600 : 400,
              border: 'none', borderBottom: activeTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none', cursor: 'pointer', color: activeTab === t.key ? '#2563eb' : '#6b7280',
              marginBottom: '-2px', transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'consolidated' && renderConsolidated()}
      {activeTab === 'b2c-aging' && renderB2CAging()}
      {activeTab === 'b2b-aging' && renderB2BAging()}
      {activeTab === 'inventory' && renderInventory()}
      {activeTab === 'b2c-demand' && renderB2CDemand()}
      {activeTab === 'b2b-demand' && renderB2BDemand()}
    </div>
  )
}

// ─── Shared Styles ─────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.5rem', textAlign: 'left', background: '#f9fafb',
  borderBottom: '2px solid #d1d5db', fontSize: '0.7rem', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}

const tdCenter: React.CSSProperties = {
  padding: '0.35rem 0.5rem', textAlign: 'center',
}

export default Reports
