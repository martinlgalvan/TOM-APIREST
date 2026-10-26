import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'

describe('nutrition plan persistence', () => {
  let mongod
  let directClient
  let service
  let database

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongod.getUri()
    service = await import('./nutrition.services.js')
    directClient = new MongoClient(process.env.MONGODB_URI)
    await directClient.connect()
    database = directClient.db('TOM')
  }, 60000)

  afterAll(async () => {
    const { closeSharedConnectionForTests } = await import('./db.js')
    await closeSharedConnectionForTests()
    if (directClient) await directClient.close()
    if (mongod) await mongod.stop()
  })

  test('upserts one plan per student and records the last coach', async () => {
    const studentId = new ObjectId().toString()
    const firstCoach = new ObjectId().toString()
    const secondCoach = new ObjectId().toString()
    const first = { days: [{ name: 'Entrenamiento' }] }
    const second = { days: [{ name: 'Descanso' }] }
    await service.savePlan(studentId, firstCoach, first)
    await service.savePlan(studentId, secondCoach, second)
    const result = await service.findPlan(studentId)
    expect(result.plan).toEqual(second)
    expect(result.coach_id.toString()).toBe(secondCoach)
    expect(await database.collection('nutritionPlans').countDocuments({ student_id: new ObjectId(studentId) })).toBe(1)
  })

  test('rejects malformed or excessive meal options', async () => {
    const { validPlan } = await import('../routes/nutrition.api.routes.js')
    const plan = {
      targets: { kcal: 2000 }, customTargets: [],
      days: [{ id: 'd1', name: 'Día 1', notes: '', meals: [{
        id: 'm1', name: 'Desayuno', options: [{ id: 'o1', name: 'Opción 1', foods: [{ rowId: 'f1', name: 'Avena', grams: 100 }] }]
      }] }]
    }
    expect(validPlan(plan)).toBe(true)
    expect(validPlan({ ...plan, days: [] })).toBe(false)
    expect(validPlan({ ...plan, days: [{ ...plan.days[0], meals: [{ ...plan.days[0].meals[0], options: [] }] }] })).toBe(false)
    expect(validPlan({ ...plan, days: [{ ...plan.days[0], meals: [{ ...plan.days[0].meals[0], options: [{ ...plan.days[0].meals[0].options[0], foods: [{ rowId: 'f1', name: 'Avena', grams: -2 }] }] }] }] })).toBe(false)
  })
})
