import { ObjectId } from 'mongodb'
import { connect, db } from './db.js'

const collection = () => db.collection('nutritionPlans')

export async function findPlan(studentId) {
  await connect()
  return collection().findOne({ _id: new ObjectId(studentId) })
}

export async function savePlan(studentId, coachId, plan) {
  await connect()
  const updatedAt = new Date().toISOString()
  await collection().updateOne(
    { _id: new ObjectId(studentId) },
    { $set: { student_id: new ObjectId(studentId), coach_id: new ObjectId(coachId), plan, updatedAt } },
    { upsert: true }
  )
  return { plan, updatedAt }
}
