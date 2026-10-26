import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'

describe('nutrition plan HTTP access', () => {
  let mongod
  let directClient
  let database
  let server
  let baseUrl
  const coachId = new ObjectId()
  const otherCoachId = new ObjectId()
  const studentId = new ObjectId()
  const plan = {
    targets: { kcal: 2000, protein: 120, carbs: 220, fat: 70 }, customTargets: [],
    days: [{ id: 'day-1', name: 'Día 1', notes: '', meals: [{
      id: 'breakfast', name: 'Desayuno', options: [{ id: 'option-1', name: 'Opción 1', foods: [{ rowId: 'food-1', name: 'Avena', grams: 80 }] }]
    }] }]
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongod.getUri()
    process.env.JWT_SECRET = 'nutrition-test-secret-with-at-least-32-characters'
    directClient = new MongoClient(process.env.MONGODB_URI)
    await directClient.connect()
    database = directClient.db('TOM')
    await database.collection('Users').insertMany([
      { _id: coachId, role: 'admin', name: 'Entrenador' },
      { _id: otherCoachId, role: 'admin', name: 'Otro entrenador' },
      { _id: studentId, role: 'user', name: 'Alumno', entrenador_id: coachId }
    ])
    const { default: app } = await import('../api/index.js')
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  }, 60000)

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    const { closeSharedConnectionForTests } = await import('./db.js')
    await closeSharedConnectionForTests()
    if (directClient) await directClient.close()
    if (mongod) await mongod.stop()
  })

  async function request(method, actorId, body) {
    const token = jwt.sign({ id: actorId.toString() }, process.env.JWT_SECRET)
    const response = await fetch(`${baseUrl}/api/nutrition/plan/${studentId}`, {
      method,
      headers: { 'auth-token': token, 'Content-Type': 'application/json', Cookie: 'refresh_token=test' },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return { status: response.status, data: await response.json() }
  }

  test('only the linked coach can publish; student can read but cannot write', async () => {
    expect((await request('PUT', otherCoachId, { plan })).status).toBe(403)
    expect((await request('PUT', studentId, { plan })).status).toBe(403)
    expect((await request('PUT', coachId, { plan })).status).toBe(200)
    const studentRead = await request('GET', studentId)
    expect(studentRead.status).toBe(200)
    expect(studentRead.data.plan.days[0].meals[0].options[0].foods[0].name).toBe('Avena')
    expect((await request('GET', otherCoachId)).status).toBe(403)
  })

  test('reassigning the student hides the previous coach plan', async () => {
    await database.collection('Users').updateOne({ _id: studentId }, { $set: { entrenador_id: otherCoachId } })
    const result = await request('GET', studentId)
    expect(result.status).toBe(200)
    expect(result.data.plan).toBeNull()
  })
})
