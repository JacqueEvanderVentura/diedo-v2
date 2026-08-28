import { useMemo, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag, Search } from 'lucide-react'
import { useConfigStore, CATEGORY_TYPES, CATEGORY_COLORS } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { catalogApi } from '@/services/catalogApi'
import { mapCategoryFromApi, mapCategoryCreatePayload, mapCategoryUpdatePayload } from '@/services/adapters/catalog'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CategoryFormModal } from '../components/CategoryFormModal'
import { configPageClass } from '../lib/pageShell'

function colorMeta(id) {
  return CATEGORY_COLORS.find((c) => c.id === id) || CATEGORY_COLORS[0]
}

function typeName(id) {
  return CATEGORY_TYPES.find((t) => t.id === id)?.name || id
}

export default function CategoriasPage({ embedded = false }) {
  const isOnline = useSessionStore((s) => s.isOnline())
  const localCategories = useConfigStore((s) => s.categories)
  const addCategory = useConfigStore((s) => s.addCategory)
  const updateCategory = useConfigStore((s) => s.updateCategory)
  const deleteCategory = useConfigStore((s) => s.deleteCategory)
  const setCategories = useConfigStore((s) => s.setCategories)

  const [apiCategories, setApiCategories] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await catalogApi.listCategories({ pageSize: 100 })
      const mapped = (res.items || []).map((c, i) => mapCategoryFromApi(c, i))
      setApiCategories(mapped)
      setCategories(mapped)
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar las categorías.')
    } finally {
      setLoading(false)
    }
  }, [setCategories])

  useEffect(() => {
    if (isOnline) loadCategories()
  }, [isOnline, loadCategories])

  const categories = isOnline && apiCategories ? apiCategories : localCategories

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories.filter((c) => !q || c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
  }, [categories, query])

  const handleSubmit = async (data) => {
    if (isOnline) {
      try {
        if (editing?.api) {
          const updated = await catalogApi.updateCategory(
            editing.id,
            mapCategoryUpdatePayload(data, editing.version)
          )
          const mapped = mapCategoryFromApi(updated, 0)
          setApiCategories((prev) => prev.map((c) => (c.id === mapped.id ? { ...c, ...mapped } : c)))
          setCategories(categories.map((c) => (c.id === mapped.id ? { ...c, ...mapped } : c)))
          toast.success('Categoría actualizada')
        } else {
          const created = await catalogApi.createCategory(mapCategoryCreatePayload(data))
          const mapped = mapCategoryFromApi(created, categories.length)
          setApiCategories((prev) => {
            const next = [...(prev || []), mapped]
            setCategories(next)
            return next
          })
          toast.success('Categoría creada')
        }
      } catch (err) {
        toast.error(err.message || 'No se pudo guardar la categoría.')
        return
      }
      setModalOpen(false)
      return
    }

    if (editing) {
      updateCategory(editing.id, data)
      toast.success('Categoría actualizada')
    } else {
      addCategory(data)
      toast.success('Categoría creada')
    }
    setModalOpen(false)
  }

  const handleDelete = async (c) => {
    if (isOnline && c.api) {
      try {
        await catalogApi.updateCategory(c.id, { version: c.version, status: 'archived' })
        setApiCategories((prev) => prev.filter((row) => row.id !== c.id))
        setCategories(categories.filter((row) => row.id !== c.id))
        toast.success('Categoría archivada')
      } catch (err) {
        toast.error(err.message || 'No se pudo eliminar la categoría.')
      }
      return
    }
    deleteCategory(c.id)
    toast.success('Categoría eliminada')
  }

  return (
    <div className={configPageClass(embedded)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar categorías..." className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} data-testid="categoria-new-btn"><Plus className="h-4 w-4" /> Nueva Categoría</Button>
      </div>

      {loading && <p className="text-sm text-slate-400">Cargando categorías…</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const color = colorMeta(c.color)
          return (
            <Card key={c.id} className="p-4" data-testid={`categoria-card-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: color.bg, color: color.fg }}>
                    <Tag className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-slate-800">{c.name}</h4>
                    {c.description && <p className="truncate text-sm text-slate-500">{c.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{typeName(c.type)}</Badge>
                      {!c.active && <Badge tone="neutral">Inactiva</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { setEditing(c); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <CategoryFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        category={editing}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
