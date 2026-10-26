import express from 'express'
import { isLogin, isAdmin } from '../middleware/auth.middleware.js'
import { ownsStudent, idToString } from '../lib/authorization.js'
import * as NutritionService from '../services/nutrition.services.js'

const router = express.Router()

export function validPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false
  if (!plan.targets || typeof plan.targets !== 'object') return false
  if (!Array.isArray(plan.days) || plan.days.length < 1 || plan.days.length > 31) return false
  if (!Array.isArray(plan.customTargets) || plan.customTargets.length > 40) return false
  return plan.days.every((day) =>
    typeof day.id === 'string' && day.id.length <= 100 &&
    typeof day.name === 'string' && day.name.trim() && day.name.length <= 100 &&
    typeof day.notes === 'string' && day.notes.length <= 5000 &&
    Array.isArray(day.meals) && day.meals.length >= 1 && day.meals.length <= 20 &&
    day.meals.every((meal) =>
      typeof meal.id === 'string' && meal.id.length <= 100 &&
      typeof meal.name === 'string' && meal.name.trim() && meal.name.length <= 100 &&
      Array.isArray(meal.options) && meal.options.length >= 1 && meal.options.length <= 12 &&
      meal.options.every((option) =>
        typeof option.id === 'string' && option.id.length <= 100 &&
        typeof option.name === 'string' && option.name.trim() && option.name.length <= 100 &&
        Array.isArray(option.foods) && option.foods.length <= 60 &&
        option.foods.every((food) =>
          food && typeof food.rowId === 'string' &&
          typeof food.name === 'string' && food.name.length <= 200 &&
          Number.isFinite(Number(food.grams)) && Number(food.grams) >= 0 && Number(food.grams) <= 100000
        )
      )
    )
  )
}

router.get('/api/nutrition/plan/:userId', [isLogin, ownsStudent('userId')], async (req, res) => {
  try {
    const record = await NutritionService.findPlan(req.params.userId)
    // La reasignación del alumno no debe revelar el plan del entrenador anterior.
    const currentCoachId = idToString(req.targetUser.entrenador_id)
    if (!record || idToString(record.coach_id) !== currentCoachId) return res.json({ plan: null })
    return res.json({ plan: record.plan, updatedAt: record.updatedAt })
  } catch (error) {
    console.error('[NUTRITION] get plan failed:', error?.message)
    return res.status(500).json({ message: 'No se pudo cargar el plan nutricional.' })
  }
})

router.put('/api/nutrition/plan/:userId', [isLogin, isAdmin, ownsStudent('userId')], async (req, res) => {
  if (idToString(req.user._id) === idToString(req.targetUser._id)) {
    return res.status(403).json({ message: 'Un entrenador no puede asignarse su propio plan.' })
  }
  if (!validPlan(req.body?.plan)) {
    return res.status(400).json({ message: 'El plan nutricional tiene datos inválidos.' })
  }
  try {
    const saved = await NutritionService.savePlan(req.params.userId, req.user._id, req.body.plan)
    return res.json(saved)
  } catch (error) {
    console.error('[NUTRITION] save plan failed:', error?.message)
    return res.status(500).json({ message: 'No se pudo guardar el plan nutricional.' })
  }
})

export default router
