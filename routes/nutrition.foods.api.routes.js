import express from 'express'
import { ObjectId } from 'mongodb'
import { isLogin, isAdmin } from '../middleware/auth.middleware.js'
import * as FoodsService from '../services/nutrition.foods.services.js'

const router = express.Router()
const requiredNumbers = ['kcal', 'protein', 'carbs', 'fat']
const optionalNumbers = ['fiber', 'sodium']

export function parsePrivateFood(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 150) return null
  if (typeof raw.group !== 'string' || !raw.group.trim() || raw.group.trim().length > 100) return null
  if (raw.reference != null && (typeof raw.reference !== 'string' || raw.reference.length > 300)) return null
  for (const field of requiredNumbers) {
    if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]) || raw[field] < 0 || raw[field] > 10000) return null
  }
  for (const field of optionalNumbers) {
    if (raw[field] != null && (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]) || raw[field] < 0 || raw[field] > 100000)) return null
  }
  const nutrients = raw.nutrients ?? {}
  if (!nutrients || typeof nutrients !== 'object' || Array.isArray(nutrients) || Object.keys(nutrients).length > 39) return null
  for (const [key, value] of Object.entries(nutrients)) {
    if (key.length < 1 || key.length > 100 || !/^[\p{L}\p{N}\s,:+()\-µ]+$/u.test(key)) return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000) return null
  }
  return {
    name: raw.name.trim().replace(/\s+/g, ' '),
    group: raw.group.trim().replace(/\s+/g, ' '),
    kcal: raw.kcal,
    protein: raw.protein,
    carbs: raw.carbs,
    fat: raw.fat,
    fiber: raw.fiber ?? null,
    sodium: raw.sodium ?? null,
    nutrients,
    reference: raw.reference?.trim() || ''
  }
}

router.get('/api/nutrition/foods', [isLogin, isAdmin], async (req, res) => {
  try {
    const foods = await FoodsService.listPrivateFoods(req.user._id)
    return res.json({ foods })
  } catch (error) {
    console.error('[NUTRITION] list private foods failed:', error?.message)
    return res.status(500).json({ message: 'No se pudieron cargar tus alimentos.' })
  }
})

router.post('/api/nutrition/foods', [isLogin, isAdmin], async (req, res) => {
  const input = parsePrivateFood(req.body)
  if (!input) return res.status(400).json({ message: 'Revisá el nombre, grupo y valores por 100 g.' })
  try {
    const result = await FoodsService.createPrivateFood(req.user._id, input)
    if (result.conflict) return res.status(409).json({ message: 'Ya tenés un alimento con ese nombre.' })
    return res.status(201).json(result)
  } catch (error) {
    console.error('[NUTRITION] create private food failed:', error?.message)
    return res.status(500).json({ message: 'No se pudo crear el alimento.' })
  }
})

router.put('/api/nutrition/foods/:foodId', [isLogin, isAdmin], async (req, res) => {
  if (!ObjectId.isValid(req.params.foodId)) return res.status(400).json({ message: 'Identificador de alimento inválido.' })
  const input = parsePrivateFood(req.body)
  if (!input) return res.status(400).json({ message: 'Revisá el nombre, grupo y valores por 100 g.' })
  try {
    const result = await FoodsService.updatePrivateFood(req.user._id, req.params.foodId, input)
    if (result.conflict) return res.status(409).json({ message: 'Ya tenés un alimento con ese nombre.' })
    if (result.notFound) return res.status(404).json({ message: 'Alimento no encontrado.' })
    return res.json(result)
  } catch (error) {
    console.error('[NUTRITION] update private food failed:', error?.message)
    return res.status(500).json({ message: 'No se pudo actualizar el alimento.' })
  }
})

router.delete('/api/nutrition/foods/:foodId', [isLogin, isAdmin], async (req, res) => {
  if (!ObjectId.isValid(req.params.foodId)) return res.status(400).json({ message: 'Identificador de alimento inválido.' })
  try {
    const deleted = await FoodsService.deletePrivateFood(req.user._id, req.params.foodId)
    if (!deleted) return res.status(404).json({ message: 'Alimento no encontrado.' })
    return res.json({ deleted: true })
  } catch (error) {
    console.error('[NUTRITION] delete private food failed:', error?.message)
    return res.status(500).json({ message: 'No se pudo eliminar el alimento.' })
  }
})

export default router
