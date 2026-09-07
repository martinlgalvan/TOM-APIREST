import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

/* Dar de baja a un alumno tiene que llevarse sus semanas. Antes solo se borraba
   el usuario y las semanas quedaban en Routine sin dueno: no se veian ni se
   podian borrar desde la aplicacion, y se acumulaban con cada baja. */

describe('remove(): la baja del alumno se lleva sus semanas', () => {
  let mongod;
  let directClient;
  let db;
  let UsersService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();

    UsersService = await import('./users.services.js');

    directClient = new MongoClient(process.env.MONGODB_URI);
    await directClient.connect();
    db = directClient.db('TOM');
  });

  afterAll(async () => {
    if (UsersService?.closeUsersServiceConnectionForTests) {
      await UsersService.closeUsersServiceConnectionForTests();
    }
    if (directClient) await directClient.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await db.collection('Users').deleteMany({});
    await db.collection('Routine').deleteMany({});
  });

  test('borra al alumno y todas sus semanas', async () => {
    const alumno = new ObjectId();
    await db.collection('Users').insertOne({ _id: alumno, name: 'Alumno', role: 'common' });
    await db.collection('Routine').insertMany([
      { user_id: alumno, name: 'Semana 1' },
      { user_id: alumno, name: 'Semana 2' },
      { user_id: alumno, name: 'Semana 3' },
    ]);

    const resultado = await UsersService.remove(String(alumno));

    expect(resultado).toEqual({ deletedCount: 1, semanasBorradas: 3 });
    expect(await db.collection('Users').countDocuments({ _id: alumno })).toBe(0);
    expect(await db.collection('Routine').countDocuments({ user_id: alumno })).toBe(0);
  });

  test('no toca las semanas de otros alumnos', async () => {
    const alumno = new ObjectId();
    const otro = new ObjectId();

    await db.collection('Users').insertMany([
      { _id: alumno, name: 'Se va', role: 'common' },
      { _id: otro, name: 'Se queda', role: 'common' },
    ]);
    await db.collection('Routine').insertMany([
      { user_id: alumno, name: 'Semana del que se va' },
      { user_id: otro, name: 'Semana del que se queda' },
    ]);

    await UsersService.remove(String(alumno));

    expect(await db.collection('Users').countDocuments({ _id: otro })).toBe(1);
    const quedan = await db.collection('Routine').find({}).toArray();
    expect(quedan).toHaveLength(1);
    expect(quedan[0].name).toBe('Semana del que se queda');
  });

  test('un alumno sin semanas se borra igual', async () => {
    const alumno = new ObjectId();
    await db.collection('Users').insertOne({ _id: alumno, name: 'Sin rutina', role: 'common' });

    const resultado = await UsersService.remove(String(alumno));

    expect(resultado).toEqual({ deletedCount: 1, semanasBorradas: 0 });
    expect(await db.collection('Users').countDocuments({})).toBe(0);
  });
});
