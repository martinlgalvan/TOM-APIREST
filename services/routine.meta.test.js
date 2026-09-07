import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

/* getRoutineByUserId con soloMeta: el listado de semanas no necesita el cuerpo
   de cada una. Con muchas semanas la respuesta completa pesa cientos de kb y
   quien la lista solo usa nombre, fecha y visibilidad. */
describe('getRoutineByUserId con proyeccion de metadatos', () => {
  let mongod;
  let clienteDirecto;
  let db;
  let RoutineService;
  const userId = new ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();

    RoutineService = await import('./routine.services.js');

    clienteDirecto = new MongoClient(process.env.MONGODB_URI);
    await clienteDirecto.connect();
    db = clienteDirecto.db('TOM');

    await db.collection('Routine').insertMany([
      {
        user_id: userId,
        name: 'Semana 1',
        visibility: 'visible',
        timestamp: 1,
        created_at: '2026-01-01',
        block: 'Fuerza',
        /* Los dias reales llevan _id: el front navega y rotula con el. */
        routine: [{ _id: new ObjectId(), name: 'Dia 1', exercises: [{ name: 'Sentadilla', sets: 3 }] }],
      },
      {
        user_id: userId,
        name: 'Semana 2',
        visibility: 'hidden',
        timestamp: 2,
        created_at: '2026-01-08',
        routine: [{ _id: new ObjectId(), name: 'Dia 1', exercises: [{ name: 'Press banca', sets: 4 }] }],
      },
    ]);
  });

  afterAll(async () => {
    await RoutineService.closeRoutineServiceConnectionForTests();
    await clienteDirecto.close();
    await mongod.stop();
  });

  test('sin opciones devuelve las semanas completas, como siempre', async () => {
    const semanas = await RoutineService.getRoutineByUserId(String(userId));

    expect(semanas).toHaveLength(2);
    expect(semanas[0].routine).toBeDefined();
    expect(semanas[0].routine[0].exercises[0].name).toBeDefined();
  });

  test('con soloMeta viajan los dias pero no los ejercicios', async () => {
    const semanas = await RoutineService.getRoutineByUserId(String(userId), { soloMeta: true });

    expect(semanas).toHaveLength(2);
    for (const semana of semanas) {
      /* Los dias se conservan porque la lista del alumno rotula con ellos los
         comentarios semanales; el peso real esta en exercises, que no viaja. */
      expect(Array.isArray(semana.routine)).toBe(true);
      for (const dia of semana.routine) {
        expect(dia.name).toBeDefined();
        expect(dia._id).toBeDefined();
        expect(dia.exercises).toBeUndefined();
      }
    }
  });

  test('con soloMeta siguen estando los campos que usa un listado', async () => {
    const semanas = await RoutineService.getRoutineByUserId(String(userId), { soloMeta: true });
    const porNombre = Object.fromEntries(semanas.map((s) => [s.name, s]));

    expect(porNombre['Semana 1'].visibility).toBe('visible');
    expect(porNombre['Semana 1'].created_at).toBe('2026-01-01');
    expect(porNombre['Semana 1'].block).toBe('Fuerza');
    expect(porNombre['Semana 2'].visibility).toBe('hidden');
    expect(String(porNombre['Semana 2'].user_id)).toBe(String(userId));
    expect(porNombre['Semana 2']._id).toBeDefined();
  });

  test('mantiene el orden por timestamp descendente', async () => {
    const semanas = await RoutineService.getRoutineByUserId(String(userId), { soloMeta: true });

    expect(semanas.map((s) => s.name)).toEqual(['Semana 2', 'Semana 1']);
  });

  test('un usuario sin semanas devuelve una lista vacia', async () => {
    const semanas = await RoutineService.getRoutineByUserId(String(new ObjectId()), { soloMeta: true });

    expect(semanas).toEqual([]);
  });
});
