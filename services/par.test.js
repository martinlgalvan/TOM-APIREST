import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { createProgressionFromPAR } from './PAR.services.js';

// Pruebas de integracion para createProgressionFromPAR
describe('createProgressionFromPAR service', () => {
  let mongod;
  let client;
  let db;

  beforeAll(async () => {
    // Iniciar MongoDB en memoria
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;

    // Conexion de prueba
    client = new MongoClient(uri, { useUnifiedTopology: true });
    await client.connect();
    db = client.db('TOM');
  });

  afterAll(async () => {
    if (client) await client.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    // Limpiar coleccion PAR antes de cada test
    await db.collection('PAR').deleteMany({});
  });

  test('crea la primera progresion a partir de la rutina madre', async () => {
    const motherId = new ObjectId();
    const motherDoc = {
      _id: motherId,
      name: 'Mother Routine',
      routine: [
        {
          _id: new ObjectId(),
          name: 'Day 1',
          exercises: [{ exercise_id: new ObjectId(), name: 'Ex1', reps: 5, sets: 3 }],
          warmup: [],
          mobility: []
        }
      ],
      timestamp: Date.now()
    };

    await db.collection('PAR').insertOne(motherDoc);

    const newProg = await createProgressionFromPAR(motherId.toHexString());

    // Validaciones basicas
    expect(newProg).toBeDefined();
    expect(newProg.parent_par_id.toString()).toBe(motherId.toString());
    expect(newProg.name).toBe('Mother Routine - Progresion 1');
    expect(typeof newProg.created_at.fecha).toBe('string');
    expect(typeof newProg.created_at.hora).toBe('string');
    expect(typeof newProg.timestamp).toBe('number');

    // Verificar clonacion profunda
    expect(Array.isArray(newProg.routine)).toBe(true);
    expect(newProg.routine.length).toBe(1);
    expect(newProg.routine[0]._id).toBeInstanceOf(ObjectId);
    expect(newProg.routine[0]._id).not.toEqual(motherDoc.routine[0]._id);
    expect(newProg.routine[0].exercises[0].exercise_id).toBeInstanceOf(ObjectId);
    expect(newProg.routine[0].exercises[0].exercise_id)
      .not.toEqual(motherDoc.routine[0].exercises[0].exercise_id);
  });

  test('crea la segunda progresion basada en la ultima progresion existente', async () => {
    const motherId = new ObjectId();
    await db.collection('PAR').insertOne({
      _id: motherId,
      name: 'Mother Routine',
      routine: [{ _id: new ObjectId(), name: 'Day 1', exercises: [], warmup: [], mobility: [] }],
      timestamp: Date.now()
    });

    const firstProg = await createProgressionFromPAR(motherId.toHexString());
    const secondProg = await createProgressionFromPAR(motherId.toHexString());

    // Validar nombre y orden
    expect(secondProg.name).toBe('Mother Routine - Progresion 2');
    expect(secondProg.parent_par_id.toString()).toBe(motherId.toString());
    expect(secondProg.timestamp).toBeGreaterThan(firstProg.timestamp);

    // Verificar que existen madre + dos progresiones
    const count = await db.collection('PAR').countDocuments({});
    expect(count).toBe(3);
  });
});
