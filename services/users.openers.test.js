import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

describe('users openers persistence', () => {
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
    await db.collection('usersProfile').deleteMany({});
  });

  test('save/get templates by coach stores in usersProfile', async () => {
    const coachId = new ObjectId().toString();

    const templates = [
      {
        name: 'Plantilla Open Nacional',
        description: 'Base SBD',
        basePlan: {
          meetName: 'Nacional Open',
          meetDate: '2026-10-10',
          lifts: {
            squat: { open: { weight: '200', result: 'eq_wraps_belt', note: 'seguro' } },
          },
        },
      },
    ];

    const saved = await UsersService.saveOpenersTemplatesByCoach(coachId, templates);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Plantilla Open Nacional');
    expect(saved[0].basePlan.lifts.squat.open.result).toBe('eq_wraps_belt');

    const rawProfile = await db.collection('usersProfile').findOne({ user_id: new ObjectId(coachId) });
    expect(Array.isArray(rawProfile?.competition_openers_templates)).toBe(true);
    expect(rawProfile.competition_openers_templates[0].name).toBe('Plantilla Open Nacional');

    const loaded = await UsersService.getOpenersTemplatesByCoach(coachId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].basePlan.lifts.squat.open.result).toBe('eq_wraps_belt');
  });

  test('save/get plans by user keeps new equipment values and maps legacy values', async () => {
    const userId = new ObjectId().toString();

    const plans = [
      {
        meetName: 'Torneo Regional',
        lifts: {
          squat: { open: { weight: '180', result: 'planned', note: 'legacy' } },
          bench: { open: { weight: '120', result: 'eq_knee_sleeves', note: 'nuevo' } },
          deadlift: { open: { weight: '220', result: 'eq_wraps', note: '' } },
        },
      },
    ];

    const saved = await UsersService.saveOpenersPlansByUser(userId, plans);
    expect(saved).toHaveLength(1);
    expect(saved[0].lifts.squat.open.result).toBe('eq_none');
    expect(saved[0].lifts.bench.open.result).toBe('eq_knee_sleeves');
    expect(saved[0].lifts.deadlift.open.result).toBe('eq_wraps');

    const rawProfile = await db.collection('usersProfile').findOne({ user_id: new ObjectId(userId) });
    expect(Array.isArray(rawProfile?.competition_openers_plans)).toBe(true);
    expect(rawProfile.competition_openers_plans[0].lifts.squat.open.result).toBe('eq_none');

    const loaded = await UsersService.getOpenersPlansByUser(userId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].lifts.squat.open.result).toBe('eq_none');
    expect(loaded[0].lifts.bench.open.result).toBe('eq_knee_sleeves');
  });
});
