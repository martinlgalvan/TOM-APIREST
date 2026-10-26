import { ObjectId } from 'mongodb'
import { connect, db } from './db.js'

const collection = () => db.collection('nutritionPrivateFoods')
let indexPromise

async function ensureUniqueNameIndex() {
  if (!indexPromise) {
    indexPromise = collection().createIndex({ coach_id: 1, name_key: 1 }, { unique: true }).catch((error) => {
      indexPromise = null
      throw error
    })
  }
  await indexPromise
}

const nameKey = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

const toPublicFood = (record) => ({
  id: record._id.toString(),
  name: record.name,
  group: record.group,
  kcal: record.kcal,
  protein: record.protein,
  carbs: record.carbs,
  fat: record.fat,
  fiber: record.fiber,
  sodium: record.sodium,
  nutrients: record.nutrients,
  reference: record.reference,
  updatedAt: record.updatedAt
})

export async function listPrivateFoods(coachId) {
  await connect()
  const rows = await collection().find({ coach_id: new ObjectId(coachId) }).sort({ name_key: 1 }).toArray()
  return rows.map(toPublicFood)
}

export async function createPrivateFood(coachId, input) {
  await connect()
  await ensureUniqueNameIndex()
  const coach_id = new ObjectId(coachId)
  const normalizedName = nameKey(input.name)
  const existing = await collection().findOne({ coach_id, name_key: normalizedName })
  if (existing) return { conflict: true }
  const updatedAt = new Date().toISOString()
  const record = { ...input, coach_id, name_key: normalizedName, updatedAt }
  let insertedId
  try {
    ({ insertedId } = await collection().insertOne(record))
  } catch (error) {
    if (error?.code === 11000) return { conflict: true }
    throw error
  }
  return { food: toPublicFood({ ...record, _id: insertedId }) }
}

export async function updatePrivateFood(coachId, foodId, input) {
  await connect()
  await ensureUniqueNameIndex()
  const coach_id = new ObjectId(coachId)
  const _id = new ObjectId(foodId)
  const normalizedName = nameKey(input.name)
  const existing = await collection().findOne({ coach_id, name_key: normalizedName, _id: { $ne: _id } })
  if (existing) return { conflict: true }
  const updatedAt = new Date().toISOString()
  let result
  try {
    result = await collection().findOneAndUpdate(
      { _id, coach_id },
      { $set: { ...input, name_key: normalizedName, updatedAt } },
      { returnDocument: 'after' }
    )
  } catch (error) {
    if (error?.code === 11000) return { conflict: true }
    throw error
  }
  return result.value ? { food: toPublicFood(result.value) } : { notFound: true }
}

export async function deletePrivateFood(coachId, foodId) {
  await connect()
  const result = await collection().deleteOne({ _id: new ObjectId(foodId), coach_id: new ObjectId(coachId) })
  return result.deletedCount === 1
}
