import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'

describe('private nutrition foods HTTP access', () => {
  let mongod
  let directClient
  let server
  let baseUrl
  const coachA = new ObjectId()
  const coachB = new ObjectId()
  const student = new ObjectId()
  const food = { name: 'Pan de masa madre', group: 'Panificados', kcal: 250, protein: 8, carbs: 48, fat: 2, fiber: 3, sodium: 410, nutrients: { 'Calcio (mg)': 50 }, reference: 'Etiqueta' }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongod.getUri()
    process.env.JWT_SECRET = 'private-foods-test-secret-with-at-least-32-characters'
    directClient = new MongoClient(process.env.MONGODB_URI)
    await directClient.connect()
    await directClient.db('TOM').collection('Users').insertMany([
      { _id: coachA, role: 'admin', name: 'Coach A' },
      { _id: coachB, role: 'admin', name: 'Coach B' },
      { _id: student, role: 'user', name: 'Alumno', entrenador_id: coachA }
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

  async function request(method, actor, path = '', body) {
    const token = actor ? jwt.sign({ id: actor.toString() }, process.env.JWT_SECRET) : null
    const response = await fetch(`${baseUrl}/api/nutrition/foods${path}`, {
      method,
      headers: { ...(token ? { 'auth-token': token } : {}), 'Content-Type': 'application/json', Cookie: 'refresh_token=test' },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return { status: response.status, data: await response.json() }
  }

  test('requires login and admin role', async () => {
    expect((await request('GET', null)).status).toBe(401)
    expect((await request('GET', student)).status).toBe(403)
    expect((await request('POST', student, '', food)).status).toBe(403)
  })

  test('rejects invalid values and duplicate names', async () => {
    expect((await request('POST', coachA, '', { ...food, kcal: -1 })).status).toBe(400)
    expect((await request('POST', coachA, '', { ...food, nutrients: { '$bad': 2 } })).status).toBe(400)
    expect((await request('POST', coachA, '', food)).status).toBe(201)
    expect((await request('POST', coachA, '', { ...food, name: '  pán DE masa madre ' })).status).toBe(409)
  })

  test('scopes list, edit and delete to the owner', async () => {
    const ownerList = await request('GET', coachA)
    expect(ownerList.status).toBe(200)
    expect(ownerList.data.foods).toHaveLength(1)
    const foodId = ownerList.data.foods[0].id
    expect((await request('GET', coachB)).data.foods).toHaveLength(0)
    expect((await request('PUT', coachB, `/${foodId}`, { ...food, name: 'Ajeno' })).status).toBe(404)
    expect((await request('DELETE', coachB, `/${foodId}`)).status).toBe(404)
    const updated = await request('PUT', coachA, `/${foodId}`, { ...food, kcal: 260 })
    expect(updated.status).toBe(200)
    expect(updated.data.food.kcal).toBe(260)
    expect((await request('DELETE', coachA, `/${foodId}`)).status).toBe(200)
    expect((await request('GET', coachA)).data.foods).toHaveLength(0)
  })
})
