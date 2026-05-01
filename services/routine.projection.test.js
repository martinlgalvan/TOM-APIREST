import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

describe('createProgressionForMultipleUsers service', () => {
  let mongod;
  let directClient;
  let db;
  let RoutineService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();

    RoutineService = await import('./routine.services.js');

    directClient = new MongoClient(process.env.MONGODB_URI);
    await directClient.connect();
    db = directClient.db('TOM');
  });

  afterAll(async () => {
    if (RoutineService?.closeRoutineServiceConnectionForTests) {
      await RoutineService.closeRoutineServiceConnectionForTests();
    }
    if (directClient) await directClient.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await db.collection('Routine').deleteMany({});
  });

  test('preserva nombres por alumno y aplica volumen de la proyeccion', async () => {
    const juanId = new ObjectId();
    const martinId = new ObjectId();
    const motherDayId = new ObjectId();
    const motherExerciseId = new ObjectId();
    const motherCircuitId = new ObjectId();
    const motherCircuitItemId = 'mother-circuit-item-1';

    const projectionTemplate = {
      name: 'Proyeccion 1',
      routine: [
        {
          _id: new ObjectId(),
          source_day_id: motherDayId.toString(),
          name: 'Dia 1',
          exercises: [
            {
              exercise_id: new ObjectId(),
              source_exercise_id: motherExerciseId.toString(),
              type: 'exercise',
              numberExercise: 1,
              name: 'Sentadilla madre',
              sets: 5,
              reps: 3,
              peso: '150',
              rest: '03:00',
              notas: 'subir carga'
            },
            {
              exercise_id: new ObjectId(),
              source_exercise_id: motherCircuitId.toString(),
              type: 'AMRAP',
              numberExercise: 2,
              name: 'Circuito madre',
              typeOfSets: 'AMRAP',
              notas: 'mantener ritmo',
              circuit: [
                {
                  idRefresh: 'projection-circuit-item-1',
                  source_circuit_item_id: motherCircuitItemId,
                  name: 'Remo madre',
                  reps: 12,
                  peso: '40',
                  video: 'template-video'
                }
              ]
            }
          ],
          warmup: [],
          movility: []
        }
      ]
    };

    await db.collection('Routine').insertMany([
      {
        _id: new ObjectId(),
        user_id: juanId,
        name: 'Semana Juan',
        timestamp: 100,
        routine: [
          {
            _id: new ObjectId(),
            name: 'Dia custom Juan',
            exercises: [
              {
                exercise_id: motherExerciseId,
                type: 'exercise',
                numberExercise: 7,
                name: 'Sentadilla Juan',
                sets: 3,
                reps: 5,
                peso: '100'
              },
              {
                exercise_id: motherCircuitId,
                type: 'AMRAP',
                numberExercise: 8,
                name: 'Circuito Juan',
                circuit: [
                  {
                    idRefresh: motherCircuitItemId,
                    name: 'Remo Juan',
                    reps: 8,
                    peso: '20',
                    video: 'juan-video'
                  }
                ]
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      },
      {
        _id: new ObjectId(),
        user_id: martinId,
        name: 'Semana Martin',
        timestamp: 100,
        routine: [
          {
            _id: new ObjectId(),
            name: 'Dia custom Martin',
            exercises: [
              {
                exercise_id: motherExerciseId,
                type: 'exercise',
                numberExercise: 1,
                name: 'Sentadilla Martin',
                sets: 4,
                reps: 4,
                peso: '110'
              },
              {
                exercise_id: motherCircuitId,
                type: 'AMRAP',
                numberExercise: 2,
                name: 'Circuito Martin',
                circuit: [
                  {
                    idRefresh: motherCircuitItemId,
                    name: 'Remo Martin',
                    reps: 9,
                    peso: '25',
                    video: 'martin-video'
                  }
                ]
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      }
    ]);

    const created = await RoutineService.createProgressionForMultipleUsers(
      projectionTemplate,
      [juanId.toString(), martinId.toString()]
    );

    const juanWeek = created.find((week) => String(week.user_id) === juanId.toString());
    const martinWeek = created.find((week) => String(week.user_id) === martinId.toString());

    expect(juanWeek.routine[0].exercises[0].name).toBe('Sentadilla Juan');
    expect(juanWeek.routine[0].exercises[0].sets).toBe(5);
    expect(juanWeek.routine[0].exercises[0].reps).toBe(3);
    expect(juanWeek.routine[0].exercises[0].peso).toBe('150');
    expect(juanWeek.routine[0].exercises[0].source_exercise_id).toBe(motherExerciseId.toString());
    expect(String(juanWeek.routine[0].exercises[0].exercise_id)).not.toBe(motherExerciseId.toString());

    expect(martinWeek.routine[0].exercises[0].name).toBe('Sentadilla Martin');
    expect(martinWeek.routine[0].exercises[0].sets).toBe(5);
    expect(martinWeek.routine[0].exercises[0].reps).toBe(3);
    expect(martinWeek.routine[0].exercises[0].peso).toBe('150');

    expect(juanWeek.routine[0].exercises[1].name).toBe('Circuito Juan');
    expect(juanWeek.routine[0].exercises[1].circuit[0].name).toBe('Remo Juan');
    expect(juanWeek.routine[0].exercises[1].circuit[0].reps).toBe(12);
    expect(juanWeek.routine[0].exercises[1].circuit[0].peso).toBe('40');

    expect(martinWeek.routine[0].exercises[1].name).toBe('Circuito Martin');
    expect(martinWeek.routine[0].exercises[1].circuit[0].name).toBe('Remo Martin');
    expect(martinWeek.routine[0].exercises[1].circuit[0].reps).toBe(12);
    expect(martinWeek.routine[0].exercises[1].circuit[0].peso).toBe('40');
  });

  test('mantiene nombres personalizados cuando la semana madre fue asignada con source ids regenerando runtime ids', async () => {
    const juanId = new ObjectId();
    const martinId = new ObjectId();
    const motherDayId = new ObjectId();
    const motherExerciseId = new ObjectId();

    const motherWeek = {
      name: 'Semana madre',
      routine: [
        {
          _id: motherDayId,
          name: 'Dia madre',
          exercises: [
            {
              exercise_id: motherExerciseId,
              type: 'exercise',
              numberExercise: 1,
              name: 'Ejercicio madre',
              sets: 3,
              reps: 5,
              peso: '100'
            }
          ],
          warmup: [],
          movility: []
        }
      ]
    };

    await RoutineService.createWeek(motherWeek, juanId.toString(), null, { templateAssignment: true });
    await RoutineService.createWeek(motherWeek, martinId.toString(), null, { templateAssignment: true });

    const juanAssigned = await db.collection('Routine').findOne({ user_id: juanId });
    const martinAssigned = await db.collection('Routine').findOne({ user_id: martinId });

    expect(juanAssigned.routine[0].source_day_id).toBe(motherDayId.toString());
    expect(juanAssigned.routine[0].exercises[0].source_exercise_id).toBe(motherExerciseId.toString());
    expect(String(juanAssigned.routine[0].exercises[0].exercise_id)).not.toBe(motherExerciseId.toString());

    juanAssigned.timestamp = 100;
    juanAssigned.routine[0].name = 'Dia Juan';
    juanAssigned.routine[0].exercises[0].name = 'Sentadilla Juan';
    martinAssigned.timestamp = 100;
    martinAssigned.routine[0].name = 'Dia Martin';
    martinAssigned.routine[0].exercises[0].name = 'Sentadilla Martin';

    await db.collection('Routine').replaceOne({ _id: juanAssigned._id }, juanAssigned);
    await db.collection('Routine').replaceOne({ _id: martinAssigned._id }, martinAssigned);

    const [juanProjection, martinProjection] = await RoutineService.createProgressionForMultipleUsers(
      {
        name: 'Proyeccion 1',
        routine: [
          {
            _id: new ObjectId(),
            source_day_id: motherDayId.toString(),
            name: 'Dia proyectado',
            exercises: [
              {
                exercise_id: new ObjectId(),
                source_exercise_id: motherExerciseId.toString(),
                type: 'exercise',
                numberExercise: 1,
                name: 'Ejercicio proyectado',
                sets: 5,
                reps: 3,
                peso: '140'
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      },
      [juanId.toString(), martinId.toString()]
    );

    expect(juanProjection.routine[0].name).toBe('Dia proyectado');
    expect(juanProjection.routine[0].exercises[0].name).toBe('Sentadilla Juan');
    expect(juanProjection.routine[0].exercises[0].sets).toBe(5);
    expect(juanProjection.routine[0].exercises[0].reps).toBe(3);
    expect(juanProjection.routine[0].exercises[0].peso).toBe('140');

    expect(martinProjection.routine[0].name).toBe('Dia proyectado');
    expect(martinProjection.routine[0].exercises[0].name).toBe('Sentadilla Martin');
    expect(martinProjection.routine[0].exercises[0].sets).toBe(5);
    expect(martinProjection.routine[0].exercises[0].reps).toBe(3);
    expect(martinProjection.routine[0].exercises[0].peso).toBe('140');
  });

  test('sincroniza bloque y block_id al asignar madre y al aplicar proyeccion', async () => {
    const userId = new ObjectId();
    const motherDayId = new ObjectId();
    const motherExerciseId = new ObjectId();
    const initialBlockId = new ObjectId().toString();
    const projectedBlockId = new ObjectId().toString();

    await RoutineService.createWeek(
      {
        name: 'Semana madre con bloque',
        block: {
          _id: initialBlockId,
          name: 'Bloque Inicial'
        },
        routine: [
          {
            _id: motherDayId,
            name: 'Dia 1',
            exercises: [
              {
                exercise_id: motherExerciseId,
                type: 'exercise',
                numberExercise: 1,
                name: 'Ejercicio base',
                sets: 3,
                reps: 5
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      },
      userId.toString(),
      null,
      { templateAssignment: true }
    );

    const assigned = await db.collection('Routine').findOne({ user_id: userId });
    expect(assigned.block._id).toBe(initialBlockId);
    expect(String(assigned.block_id)).toBe(initialBlockId);

    assigned.timestamp = 100;
    assigned.routine[0].exercises[0].name = 'Nombre propio';
    await db.collection('Routine').replaceOne({ _id: assigned._id }, assigned);

    const [projected] = await RoutineService.createProgressionForMultipleUsers(
      {
        name: 'Proyeccion bloque',
        block: {
          _id: projectedBlockId,
          name: 'Bloque Proyectado'
        },
        routine: [
          {
            _id: new ObjectId(),
            source_day_id: motherDayId.toString(),
            name: 'Dia 1',
            exercises: [
              {
                exercise_id: new ObjectId(),
                source_exercise_id: motherExerciseId.toString(),
                type: 'exercise',
                numberExercise: 1,
                name: 'Ejercicio plantilla',
                sets: 4,
                reps: 4
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      },
      [userId.toString()]
    );

    expect(projected.block._id).toBe(projectedBlockId);
    expect(String(projected.block_id)).toBe(projectedBlockId);
    expect(projected.routine[0].exercises[0].name).toBe('Nombre propio');
  });

  test('usa la posicion antes que el nombre para datos legacy sin source ids', async () => {
    const userId = new ObjectId();

    await db.collection('Routine').insertOne({
      _id: new ObjectId(),
      user_id: userId,
      name: 'Semana legacy',
      timestamp: 100,
      routine: [
        {
          _id: new ObjectId(),
          name: 'Dia custom',
          exercises: [
            {
              exercise_id: new ObjectId(),
              type: 'exercise',
              name: 'Nombre del alumno',
              sets: 3,
              reps: 8
            }
          ],
          warmup: [],
          movility: []
        }
      ]
    });

    const [created] = await RoutineService.createProgressionForMultipleUsers(
      {
        name: 'Template legacy',
        routine: [
          {
            _id: new ObjectId(),
            name: 'Dia template',
            exercises: [
              {
                exercise_id: new ObjectId(),
                type: 'exercise',
                name: 'Nombre plantilla',
                sets: 6,
                reps: 2
              }
            ],
            warmup: [],
            movility: []
          }
        ]
      },
      [userId.toString()]
    );

    expect(created.routine[0].exercises[0].name).toBe('Nombre del alumno');
    expect(created.routine[0].exercises[0].sets).toBe(6);
    expect(created.routine[0].exercises[0].reps).toBe(2);
  });
});
