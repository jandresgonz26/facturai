'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ServiceCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Trash2, Plus, Loader2 } from 'lucide-react'

export function ServiceCategoryManager() {
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [newName, setNewName] = useState('')
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        fetchCategories()
    }, [])

    const fetchCategories = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('service_categories')
            .select('*')
            .order('name')

        if (error) {
            console.error('Error fetching categories:', error)
            toast.error('Error al cargar categorías')
        } else {
            setCategories(data || [])
        }
        setLoading(false)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return

        setAdding(true)
        const { error } = await supabase
            .from('service_categories')
            .insert({ name: newName.trim() })

        if (error) {
            if (error.code === '23505') {
                toast.error('Esta categoría ya existe')
            } else {
                toast.error('Error al agregar categoría')
            }
        } else {
            toast.success('Categoría agregada')
            setNewName('')
            fetchCategories()
        }
        setAdding(false)
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from('service_categories')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('No se puede eliminar: Categoría en uso')
        } else {
            toast.success('Categoría eliminada')
            fetchCategories()
        }
    }

    return (
        <div className="space-y-4">
            <form onSubmit={handleAdd} className="flex gap-2">
                <Input
                    placeholder="Nueva Categoría (ej: Consultoría)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <Button type="submit" disabled={adding}>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar
                </Button>
            </form>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {loading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : categories.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                        No hay categorías configuradas.
                    </div>
                ) : (
                    categories.map((cat) => (
                        <div key={cat.id} className="flex items-center justify-between p-2 bg-muted/30 rounded border text-sm">
                            <span>{cat.name}</span>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(cat.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
