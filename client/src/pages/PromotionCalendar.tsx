import { useState, useCallback, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, type SlotInfo, type Event } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { promotionsApi, type Promotion } from '../services/api'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

const CHANNELS = ['Marketplace', 'Retail', 'B2C', 'D2C']
const COUNTRIES = ['US', 'UK', 'DE', 'FR', 'IN', 'JP', 'CA', 'AU', 'BR', 'MX']

interface CalendarEvent extends Event {
  resource?: Promotion
}

const emptyForm = {
  promo_name: '',
  country: '',
  channel: '',
  start_date: '',
  end_date: '',
  discount_percent: 0,
  notes: '',
  status: 'scheduled' as string,
}

function PromotionCalendar() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: async () => {
      const res = await promotionsApi.list()
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => promotionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) =>
      promotionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      closeModal()
    },
  })

  const events: CalendarEvent[] = useMemo(
    () =>
      promotions.map((p) => {
        const discount = Number(p.discount_percent) || 0
        const parts = [p.country, p.channel, discount > 0 ? `${discount}% off` : null].filter(Boolean)
        return {
          title: parts.length > 0 ? `${p.promo_name} (${parts.join(' · ')})` : p.promo_name,
          start: new Date(p.start_date + 'T00:00:00'),
          end: new Date(p.end_date + 'T23:59:59'),
          allDay: true,
          resource: p,
        }
      }),
    [promotions]
  )

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const status = event.resource?.status || 'scheduled'
    const colorMap: Record<string, string> = {
      active: '#22c55e',
      scheduled: '#3b82f6',
      completed: '#94a3b8',
      cancelled: '#ef4444',
    }
    return {
      style: {
        backgroundColor: colorMap[status] || '#3b82f6',
        borderRadius: '4px',
        color: '#fff',
        border: 'none',
        padding: '2px 6px',
      },
    }
  }, [])

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    const startDate = format(slotInfo.start, 'yyyy-MM-dd')
    const endDate = format(slotInfo.end, 'yyyy-MM-dd')
    setForm({ ...emptyForm, start_date: startDate, end_date: endDate })
    setEditingId(null)
    setModalOpen(true)
  }, [])

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    const p = event.resource
    if (!p) return
    setForm({
      promo_name: p.promo_name,
      country: p.country || '',
      channel: p.channel || '',
      start_date: p.start_date.split('T')[0],
      end_date: p.end_date.split('T')[0],
      discount_percent: Number(p.discount_percent) || 0,
      notes: p.notes || '',
      status: p.status,
    })
    setEditingId(p.id)
    setModalOpen(true)
  }, [])

  const handleSave = () => {
    if (!form.promo_name || !form.start_date || !form.end_date) return
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="promotion-calendar">
      <div className="page-header">
        <h1 className="page-title">Promotion Calendar</h1>
        <p style={{ color: 'var(--text-light)', marginTop: '0.25rem' }}>
          View and manage promotions on a monthly calendar
        </p>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#22c55e', display: 'inline-block' }} /> Active
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#3b82f6', display: 'inline-block' }} /> Scheduled
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#94a3b8', display: 'inline-block' }} /> Completed
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#ef4444', display: 'inline-block' }} /> Cancelled
          </span>
        </div>
        <div style={{ height: 600 }}>
          <Calendar
            localizer={localizer}
            events={events}
            defaultView="month"
            views={['month']}
            selectable
            popup
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventPropGetter}
          />
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem' }}>
              {editingId ? 'Edit Promotion' : 'Add Promotion'}
            </h2>

            <div className="form-group">
              <label className="form-label">Promotion Name</label>
              <input
                className="form-input"
                value={form.promo_name}
                onChange={(e) => setForm({ ...form, promo_name: e.target.value })}
                placeholder="e.g. Summer Sale"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Country</label>
                <select
                  className="form-input"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Channel</label>
                <select
                  className="form-input"
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                >
                  <option value="">Select channel</option>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Discount %</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="100"
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
                />
              </div>

              {editingId && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-outline" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving || !form.promo_name || !form.start_date || !form.end_date}
              >
                {isSaving ? 'Saving...' : editingId ? 'Update Promotion' : 'Save Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }
        .form-group {
          margin-bottom: 1rem;
        }
        .form-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 0.375rem;
          color: var(--text);
        }
        .form-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.875rem;
          background: white;
          color: var(--text);
        }
        .form-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        textarea.form-input {
          resize: vertical;
        }
        .rbc-calendar {
          font-family: inherit;
        }
        .rbc-toolbar button {
          border-radius: 6px;
        }
        .rbc-toolbar button.rbc-active {
          background-color: var(--primary);
          color: white;
        }
      `}</style>
    </div>
  )
}

export default PromotionCalendar
