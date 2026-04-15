import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();
import { getDate } from './../date/formatedDate.js'
import bcrypt from 'bcryptjs';
import { getISOWeek } from 'date-fns';

const client = new MongoClient(process.env.MONGODB_URI)
const db = client.db('TOM')
const users = db.collection('Users')
const userProfile = db.collection('usersProfile')
const announcements = db.collection('Announcements');
const routine = db.collection('Routine'); // <-- ✅ FALTABA ESTA LINEA
const finance = db.collection('Finance');

async function findById(id) {
    try {
        await client.connect();
        const user = await users.findOne({ _id: ObjectId(id) });
        return user;
    } catch (error) {
        throw new Error(`Error al buscar el usuario: ${error.message}`);
    }
}


async function getUsersByEntrenadorId(entrenador_id) {
  return client.connect()
    .then(async function () {
      return users
        .find(
          { entrenador_id: new ObjectId(entrenador_id) },
          { projection: { password: 0 } }
        )
        .sort({ "created_at.fecha": -1, "created_at.hora": -1 })
        .toArray();
    });
}

// Normaliza un campo de fecha que puede venir como Date | string ISO | {fecha, hora}
function normalizeFieldToDate(field) {
  try {
    if (!field) return null;

    // Si ya es Date
    if (field instanceof Date) return field;

    // Si es string (ISO u otro)
    if (typeof field === 'string') {
      const d = new Date(field);
      return isNaN(d.getTime()) ? null : d;
    }

    // Si es objeto {fecha, hora}
    if (typeof field === 'object' && field.fecha) {
      const fecha = String(field.fecha || '').trim();          // "DD/MM/YYYY"
      let hora = String(field.hora || '00:00:00').trim();      // "HH:mm:ss" o "HH:mm:ss AM/PM"

      // Limpio AM/PM si viniera con 24h (e.g. "15:20:00 PM")
      hora = hora.replace(' AM', '').replace(' PM', '');

      // Parse manual DD/MM/YYYY HH:mm:ss
      const [d, m, y] = fecha.split('/').map(Number);
      let hh = 0, mm = 0, ss = 0;
      const parts = hora.split(':').map(s => s.replace(/[^\d]/g, ''));
      if (parts[0]) hh = Number(parts[0]);
      if (parts[1]) mm = Number(parts[1]);
      if (parts[2]) ss = Number(parts[2]);

      const iso = new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
      return isNaN(iso.getTime()) ? null : iso;
    }

    return null;
  } catch {
    return null;
  }
}

function asString(value, maxLen = 500) {
    if (value == null) return '';
    const str = String(value).trim();
    return str.length > maxLen ? str.slice(0, maxLen) : str;
}

const VALID_EQUIPMENT_RESULTS = new Set([
    'eq_none',
    'eq_knee_sleeves',
    'eq_knee_sleeves_belt',
    'eq_wraps',
    'eq_wraps_belt'
]);

const LEGACY_RESULT_MAP = {
    planned: 'eq_none',
    done: 'eq_none',
    miss: 'eq_none',
    skip: 'eq_none'
};

function asDateOnlyString(value) {
    if (!value) return '';
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function normalizeAttemptNode(node = {}) {
    const rawResult = asString(node?.result, 40).toLowerCase();
    const mappedLegacy = LEGACY_RESULT_MAP[rawResult];
    const normalizedResult = mappedLegacy || rawResult;
    const validResult = VALID_EQUIPMENT_RESULTS.has(normalizedResult) ? normalizedResult : 'eq_none';
    return {
        weight: asString(node?.weight, 60),
        result: validResult,
        note: asString(node?.note, 500)
    };
}

function normalizeLiftNode(node = {}) {
    return {
        open: normalizeAttemptNode(node?.open),
        second: normalizeAttemptNode(node?.second),
        third: normalizeAttemptNode(node?.third),
        notes: asString(node?.notes, 1000)
    };
}

function normalizeOpenersPlan(plan = {}) {
    const now = new Date().toISOString();
    const incomingId = asString(plan?.id || plan?._id, 80);
    return {
        id: incomingId || new ObjectId().toString(),
        meetName: asString(plan?.meetName, 160),
        meetDate: asDateOnlyString(plan?.meetDate),
        notes: asString(plan?.notes, 2000),
        lifts: {
            squat: normalizeLiftNode(plan?.lifts?.squat),
            bench: normalizeLiftNode(plan?.lifts?.bench),
            deadlift: normalizeLiftNode(plan?.lifts?.deadlift)
        },
        source_template_id: asString(plan?.source_template_id, 80),
        source_template_name: asString(plan?.source_template_name, 160),
        created_at: plan?.created_at || now,
        updated_at: now
    };
}

function normalizeOpenersTemplate(template = {}) {
    const now = new Date().toISOString();
    const incomingId = asString(template?.id || template?._id, 80);
    const basePlan = template?.basePlan && typeof template.basePlan === 'object'
        ? template.basePlan
        : (template?.plan && typeof template.plan === 'object' ? template.plan : template);

    return {
        id: incomingId || new ObjectId().toString(),
        name: asString(template?.name || template?.templateName, 160),
        description: asString(template?.description, 600),
        basePlan: normalizeOpenersPlan(basePlan),
        created_at: template?.created_at || now,
        updated_at: now
    };
}

function normalizeUserDetailsPayload(details = {}) {
    const out = { ...(details || {}) };

    if (Object.prototype.hasOwnProperty.call(out, 'competition_openers_plans')) {
        const rawPlans = Array.isArray(out.competition_openers_plans) ? out.competition_openers_plans : [];
        out.competition_openers_plans = rawPlans.map((plan) => normalizeOpenersPlan(plan));
    }

    if (Object.prototype.hasOwnProperty.call(out, 'competition_openers_templates')) {
        const rawTemplates = Array.isArray(out.competition_openers_templates) ? out.competition_openers_templates : [];
        out.competition_openers_templates = rawTemplates.map((tpl) => normalizeOpenersTemplate(tpl));
    }

    return out;
}

function asObjectIdOrThrow(id, fieldName = 'id') {
    try {
        return new ObjectId(id);
    } catch (error) {
        throw new Error(`${fieldName} invalido: ${id}`);
    }
}

async function getOpenersTemplatesByCoach(coachId) {
    await client.connect();
    const coachObjectId = asObjectIdOrThrow(coachId, 'coachId');
    const profile = await userProfile.findOne(
        { user_id: coachObjectId },
        { projection: { competition_openers_templates: 1 } }
    );
    const templates = Array.isArray(profile?.competition_openers_templates)
        ? profile.competition_openers_templates
        : [];
    return templates.map((tpl) => normalizeOpenersTemplate(tpl));
}

async function saveOpenersTemplatesByCoach(coachId, templates = []) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const normalizedTemplates = safeTemplates.map((tpl) => normalizeOpenersTemplate(tpl));
    const { profile } = await upsertUserDetails(coachId, {
        competition_openers_templates: normalizedTemplates
    });
    const storedTemplates = Array.isArray(profile?.competition_openers_templates)
        ? profile.competition_openers_templates
        : normalizedTemplates;
    return storedTemplates.map((tpl) => normalizeOpenersTemplate(tpl));
}

async function getOpenersPlansByUser(userId) {
    await client.connect();
    const userObjectId = asObjectIdOrThrow(userId, 'userId');
    const profile = await userProfile.findOne(
        { user_id: userObjectId },
        { projection: { competition_openers_plans: 1 } }
    );
    const plans = Array.isArray(profile?.competition_openers_plans)
        ? profile.competition_openers_plans
        : [];
    return plans.map((plan) => normalizeOpenersPlan(plan));
}

async function saveOpenersPlansByUser(userId, plans = []) {
    const safePlans = Array.isArray(plans) ? plans : [];
    const normalizedPlans = safePlans.map((plan) => normalizeOpenersPlan(plan));
    const { profile } = await upsertUserDetails(userId, {
        competition_openers_plans: normalizedPlans
    });
    const storedPlans = Array.isArray(profile?.competition_openers_plans)
        ? profile.competition_openers_plans
        : normalizedPlans;
    return storedPlans.map((plan) => normalizeOpenersPlan(plan));
}

async function closeUsersServiceConnectionForTests() {
    try {
        await client.close();
    } catch (error) {
        // noop
    }
}

// Intenta encontrar UNA rutina de un usuario probando multiples campos/tipos.
// Devuelve { matchedBy, doc } o null.
async function debugFindOneRoutineForUser(routineCol, uid) {
  const uidObj = new ObjectId(uid);
  const uidStr = uidObj.toString();

  const candidates = [
    { q: { user_id: uidObj }, by: 'user_id:ObjectId' },
    { q: { user_id: uidStr }, by: 'user_id:string' },
    { q: { id_user: uidObj }, by: 'id_user:ObjectId' },
    { q: { id_user: uidStr }, by: 'id_user:string' },
    { q: { usuario_id: uidObj }, by: 'usuario_id:ObjectId' },
    { q: { usuario_id: uidStr }, by: 'usuario_id:string' },
    { q: { userId: uidObj }, by: 'userId:ObjectId' },
    { q: { userId: uidStr }, by: 'userId:string' },
  ];

  for (const c of candidates) {
    const doc = await routineCol.findOne(c.q, { projection: { created_at: 1, updated_at: 1 } });
    if (doc) return { matchedBy: c.by, doc };
  }
  return null;
}

// ===== Funcion principal =====

async function getUsersByEntrenadorIdWithLastWeek(entrenador_id, opts = {}) {
  const debug = !!opts.debug;

  return client.connect().then(async function () {
    const usersCol = users;            // ya definido arriba
    const routineCol = routine;        // A S E G U R A T E: const routine = db.collection('Routine')

    if (debug) {
      console.log('----- DEBUG withLastWeek START -----');
      console.time('withLastWeek');

      // 0) Ver colecciones y counts
      const colls = await db.listCollections().toArray();
      console.log('[DEBUG] collections =', colls.map(c => c.name));

      for (const name of ['Routine','routine','Routines']) {
        try {
          const cnt = await db.collection(name).countDocuments();
          console.log(`[DEBUG] count ${name} =`, cnt);
        } catch (e) {
          console.log(`[DEBUG] count ${name} => error (${e.message})`);
        }
      }

      // 0.2) muestrita de Routine
      try {
        const one = await routineCol.findOne({}, { projection: { _id:1, user_id:1, id_user:1, usuario_id:1, userId:1, created_at:1, updated_at:1 } });
        console.log('[DEBUG] sample from Routine =', one);
      } catch(e) {
        console.log('[DEBUG] Routine.findOne error:', e.message);
      }

      // muestra de usuarios
      const sampleUsers = await usersCol
        .find({ entrenador_id: new ObjectId(entrenador_id) }, { projection: { _id: 1, name: 1, email: 1 } })
        .limit(3)
        .toArray();

      console.log(`[DEBUG] entrenador_id=${entrenador_id} → ${sampleUsers.length} usuarios de muestra:`,
        sampleUsers.map(u => ({ id: u._id.toString(), name: u.name, email: u.email }))
      );
    }

    // === PIPELINE oficial ===
    const result = await usersCol.aggregate([
      { $match: { entrenador_id: new ObjectId(entrenador_id) } },

      // Campos que devolvemos del usuario
      {
        $project: {
          _id: 1,
          entrenador_id: 1,
          name: 1,
          email: 1,
          category: 1,
          created_at: 1
        }
      },

      // Join con la coleccion correcta: "Routine"
      {
        $lookup: {
          from: 'Routine',             // 👈 nombre real
          let: { uidStr: { $toString: '$_id' } },
          pipeline: [
            {
              // match si cualquiera de estos campos (cast a string) coincide con el _id del user (string)
              $match: {
                $expr: {
                  $in: [
                    "$$uidStr",
                    [
                      { $toString: "$user_id" },
                      { $toString: "$id_user" },
                      { $toString: "$usuario_id" },
                      { $toString: "$userId" }
                    ]
                  ]
                }
              }
            },

            // Normalizamos created_at y updated_at (date|string|{fecha,hora})
            {
              $addFields: {
                _created_date: {
                  $switch: {
                    branches: [
                      { case: { $eq: [{ $type: "$created_at" }, "date"] }, then: "$created_at" },
                      { case: { $eq: [{ $type: "$created_at" }, "string"] },
                        then: {
                          $dateFromString: {
                            dateString: "$created_at",
                            timezone: "America/Argentina/Buenos_Aires",
                            onError: null, onNull: null
                          }
                        }
                      },
                      { case: { $eq: [{ $type: "$created_at" }, "object"] },
                        then: {
                          $let: {
                            vars: {
                              d: { $ifNull: ["$created_at.fecha", "" ] },
                              t: { $ifNull: ["$created_at.hora",  "00:00:00" ] }
                            },
                            in: {
                              $ifNull: [
                                // 24h sin AM/PM
                                {
                                  $dateFromString: {
                                    dateString: { $concat: [
                                      "$$d", " ",
                                      {
                                        $replaceAll: {
                                          input: {
                                            $replaceAll: { input: "$$t", find: " PM", replacement: "" }
                                          },
                                          find: " AM",
                                          replacement: ""
                                        }
                                      }
                                    ]},
                                    format: "%d/%m/%Y %H:%M:%S",
                                    timezone: "America/Argentina/Buenos_Aires",
                                    onError: null, onNull: null
                                  }
                                },
                                // 12h con AM/PM
                                {
                                  $dateFromString: {
                                    dateString: { $concat: ["$$d", " ", "$$t"] },
                                    format: "%d/%m/%Y %I:%M:%S %p",
                                    timezone: "America/Argentina/Buenos_Aires",
                                    onError: null, onNull: null
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    ],
                    default: null
                  }
                },

                _updated_date: {
                  $switch: {
                    branches: [
                      { case: { $eq: [{ $type: "$updated_at" }, "date"] }, then: "$updated_at" },
                      { case: { $eq: [{ $type: "$updated_at" }, "string"] },
                        then: {
                          $dateFromString: {
                            dateString: "$updated_at",
                            timezone: "America/Argentina/Buenos_Aires",
                            onError: null, onNull: null
                          }
                        }
                      },
                      { case: { $eq: [{ $type: "$updated_at" }, "object"] },
                        then: {
                          $let: {
                            vars: {
                              d: { $ifNull: ["$updated_at.fecha", "" ] },
                              t: { $ifNull: ["$updated_at.hora",  "00:00:00" ] }
                            },
                            in: {
                              $ifNull: [
                                {
                                  $dateFromString: {
                                    dateString: { $concat: [
                                      "$$d", " ",
                                      {
                                        $replaceAll: {
                                          input: {
                                            $replaceAll: { input: "$$t", find: " PM", replacement: "" }
                                          },
                                          find: " AM",
                                          replacement: ""
                                        }
                                      }
                                    ]},
                                    format: "%d/%m/%Y %H:%M:%S",
                                    timezone: "America/Argentina/Buenos_Aires",
                                    onError: null, onNull: null
                                  }
                                },
                                {
                                  $dateFromString: {
                                    dateString: { $concat: ["$$d", " ", "$$t"] },
                                    format: "%d/%m/%Y %I:%M:%S %p",
                                    timezone: "America/Argentina/Buenos_Aires",
                                    onError: null, onNull: null
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    ],
                    default: null
                  }
                }
              }
            },

            // Orden por updated si existe, sino por created
            { $addFields: { _sort_date: { $ifNull: ["$_updated_date", "$_created_date"] } } },
            { $sort: { _sort_date: -1 } },
            { $limit: 1 },

            // Devolvemos un shape simple
            { $project: { _id: 0, created_at: "$_created_date", updated_at: "$_updated_date" } }
          ],
          as: 'lastWeek'
        }
        
      },

      // A nivel usuario: tomamos el primer (y unico) elemento del array
      {
        $addFields: {
          last_week_created_at: { $ifNull: [ { $arrayElemAt: [ "$lastWeek.created_at", 0 ] }, null ] },
          last_week_updated_at: { $ifNull: [ { $arrayElemAt: [ "$lastWeek.updated_at", 0 ] }, null ] }
        }
      },
      { $project: { lastWeek: 0 } },

      // (opcional) tu orden original por creado del usuario
      { $sort: { "created_at.fecha": -1, "created_at.hora": -1 } }
    ]).toArray();

    if (debug) {
      const nonNull = result.filter(u => u.last_week_created_at || u.last_week_updated_at).length;
      console.log(`[DEBUG] total usuarios: ${result.length} | con lastWeek no nulo: ${nonNull}`);
      console.timeEnd('withLastWeek');
      console.log('----- DEBUG withLastWeek END -----');
    }

    return result;
  });
}

async function login(userLogin) {
    await client.connect()

    const user = await users.findOne({ email: userLogin.email })

    if (!user) {
        throw new Error('No existe el usuario')
    }

    const isMatch = await bcrypt.compare(userLogin.password, user.password)

    if (!isMatch) {
        throw new Error('Contrasena incorrecta')
    }

    return user
}

async function find(filter) {
    await client.connect()

    const usersCollection = await users.find(filter).toArray()

    return usersCollection
}

async function create(user, entrenador_id, logo) {
    const newUser = { 
        ...user,
        entrenador_id: new ObjectId(entrenador_id),
        logo: logo,
        created_at: getDate()
    };

    await client.connect();

    const userExist = await users.findOne({ email: newUser.email });

    if (userExist) {
        // Se crea un error con status 400 para que el front pueda manejarlo correctamente
        const error = new Error('Ese email ya existe, por favor ingresa otro');
        error.status = 400;
        throw error;
    }

    const salt = await bcrypt.genSalt(10);
    newUser.password = await bcrypt.hash(newUser.password, salt);
    await users.insertOne(newUser);
    return newUser;
}

async function remove(id) {
    await client.connect()

    await users.deleteOne({ _id: ObjectId(id) })
}

async function addUserProperty(userId, category) {
    try {
        const trainer = await findById(userId); // Obtener el entrenador
        
        if (!trainer) {
            throw new Error('Entrenador no encontrado');
        }
        
        // Agregar las propiedades al entrenador
        trainer.category = category;

        
        // Actualizar el entrenador con las nuevas propiedades
        await users.updateOne(
            { $or: [{"_id" : userId}, {"_id" : new ObjectId(userId)}] },
            { $set: { category: category } }
        );
        
        // Actualizar a todos los alumnos del entrenador
        const updatedStudents = await users.updateMany(
            { entrenador_id: new ObjectId(userId) },
            { $set: { category: category} }
        );
        
        // Devolver el entrenador actualizado
        return trainer;
    } catch (error) {
        throw new Error(`Error al agregar la propiedad al usuario: ${error.message}`);
    }
}

async function upsertUserDetails(userId, details) {
    const timestamp = new Date().getTime();
    const normalizedDetails = normalizeUserDetailsPayload(details);
    const newDetails = {
        ...normalizedDetails,
        last_edit: getDate(),
        timestamp: timestamp
    };

    let convertedUserId;
    try {
        convertedUserId = new ObjectId(userId);
    } catch (error) {
        throw new Error(`El userId proporcionado no es valido: ${userId}`);
    }

    try {
        await client.connect();

        const existingProfile = await userProfile.findOne({
            user_id: convertedUserId
        });

        if (existingProfile) {
            await userProfile.updateOne(
                { _id: existingProfile._id },
                { $set: newDetails }
            );

            return {
                action: 'updated',
                profile: await userProfile.findOne({ _id: existingProfile._id })
            };
        } else {
            // Armado explicito del nuevo perfil
            const newProfile = {
                user_id: convertedUserId,
                ...newDetails
            };

            // Validacion defensiva
            if (!newProfile.user_id || typeof newProfile.user_id !== 'object') {
                throw new Error('Error al crear perfil: user_id no es valido o esta ausente.');
            }

            // Insercion del nuevo documento
            const insertResult = await userProfile.insertOne(newProfile);

            return {
                action: 'created',
                profile: await userProfile.findOne({ _id: insertResult.insertedId })
            };
        }
    } catch (error) {
        throw new Error(`Error al actualizar o crear los detalles del usuario: ${error.message}`);
    }
}
async function findProfileByID(id) {
    let convertedUserId;

    try {
        convertedUserId = new ObjectId(id);
    } catch (error) {
        throw new Error(`El userId proporcionado no es valido: ${id}`);
    }

    try {
        await client.connect();

        const [profile, user] = await Promise.all([
            userProfile.findOne({ user_id: convertedUserId }),
            users.findOne({ _id: convertedUserId }, { projection: { category: 1 } })
        ]);

        if (!user) {
            throw new Error(`No se encontro el usuario con id: ${id}`);
        }

        if (profile) {
            return {
                ...profile,
                category: user.category || null
            };
        } else {
            return {
                category: user.category || null
            };
        }

    } catch (error) {
        throw new Error(`Error al buscar el perfil del usuario: ${error.message}`);
    }
}

async function createAnnouncement(data) {
    await client.connect();

    // Convertir usuarios a ObjectId
    if (Array.isArray(data.target_users)) {
        data.target_users = data.target_users.map(id => new ObjectId(id));
    }

    // Normalizar fechas
    if (data.show_at_date && typeof data.show_at_date === 'string') {
        data.show_at_date = new Date(data.show_at_date);
    }

    if (data.creator_id && typeof data.creator_id === 'string') {
        data.creator_id = new ObjectId(data.creator_id);
    }

    // Validar estructura de links
    if (!Array.isArray(data.link_urls)) {
        data.link_urls = [];
    } else {
        data.link_urls = data.link_urls.map(url => String(url).trim()).filter(Boolean);
    }

    // Validar modo
    data.mode = data.mode || 'once';
    if (data.mode === 'once') {
        data.repeat_day = null;
        data.day_of_month = null;
    } else if (data.mode === 'repeat') {
        data.show_at_date = null;
        data.day_of_month = null;
    } else if (data.mode === 'monthly') {
        data.show_at_date = null;
        data.repeat_day = null;
    }

    data.read_by = [];
    data.created_at = new Date();

    return announcements.insertOne(data);
}


async function getAnnouncementsByCreator(creatorId) {
    await client.connect();
    return announcements.find({ creator_id: new ObjectId(creatorId) }).toArray();
}

async function editAnnouncement(announcementId, updates) {
    await client.connect();

    // Validacion defensiva del ID
    let idToEdit;
    try {
        idToEdit = new ObjectId(announcementId);
    } catch (err) {
        throw new Error("ID de anuncio invalido");
    }

    // Convertir target_users
    if (Array.isArray(updates.target_users)) {
        updates.target_users = updates.target_users.map(uid => {
            try {
                return new ObjectId(uid);
            } catch (err) {
                console.error("ID invalido en target_users:", uid);
                return null;
            }
        }).filter(Boolean); // elimina los nulos
    }

    // Convertir creator_id
    if (updates.creator_id && typeof updates.creator_id === 'string') {
        try {
            updates.creator_id = new ObjectId(updates.creator_id);
        } catch (err) {
            console.warn("creator_id invalido:", updates.creator_id);
            updates.creator_id = null;
        }
    }

    // Convertir show_at_date si es string
    if (updates.show_at_date && typeof updates.show_at_date === 'string') {
        updates.show_at_date = new Date(updates.show_at_date);
    }

    // Validar link_urls
    if (!Array.isArray(updates.link_urls)) {
        updates.link_urls = [];
    } else {
        updates.link_urls = updates.link_urls.map(url => String(url).trim()).filter(Boolean);
    }

    // Normalizacion de modo
    updates.mode = updates.mode || 'once';
    if (updates.mode === 'once') {
        updates.repeat_day = null;
        updates.day_of_month = null;
    } else if (updates.mode === 'repeat') {
        updates.show_at_date = null;
        updates.day_of_month = null;
    } else if (updates.mode === 'monthly') {
        updates.show_at_date = null;
        updates.repeat_day = null;
    }

    return announcements.updateOne(
        { _id: idToEdit },
        { $set: updates }
    );
}




async function deleteAnnouncement(announcementId) {
    await client.connect();
    return announcements.deleteOne({ _id: new ObjectId(announcementId) });
}

async function getAnnouncementViewsWithNames(announcementId) {
    await client.connect();
    const announcement = await announcements.findOne({ _id: new ObjectId(announcementId) });

    if (!announcement || !announcement.read_by?.length) return [];

    const usersRead = await users.find({ _id: { $in: announcement.read_by } }).toArray();

    return usersRead.map(u => ({
        _id: u._id,
        name: u.name,
        email: u.email
    }));
}

async function getAnnouncementsForUser(userId, category) {
  await client.connect();

  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user) throw new Error("Usuario no encontrado");

  const now = new Date();
  const today = new Date(now.toISOString().split("T")[0]); // 00:00:00 de hoy
  const dayOfMonth = now.getUTCDate();
  const currentWeek = getISOWeek(now);
  const dayOfWeek = now.toLocaleDateString('es-ES', { weekday: 'long' }).toLowerCase(); // ej: 'martes'
  const userObjectId = new ObjectId(userId);

  const anuncios = await announcements.find({
    $or: [
      { target_users: userObjectId },
      {
        target_categories: { $in: [category] },
        creator_id: user.entrenador_id
      }
    ]
  }).toArray();

  const visibles = anuncios.filter(anuncio => {
    const modo = anuncio.mode;
    const readLogs = Array.isArray(anuncio.read_log) ? anuncio.read_log : [];

    const logsUsuario = readLogs
      .filter(log => log.user_id?.toString() === userId)
      .map(log => new Date(log.date));

    const fueLeidoEn = (filtroFn) => logsUsuario.some(filtroFn);

    if (modo === 'once') {
      const showDate = new Date(anuncio.show_at_date);
      if (now >= showDate) {
        // Compatibilidad: historicamente algunos read_log guardaron solo YYYY-MM-DD.
        // Eso cae a medianoche y podia dejar el anuncio "no leido" aunque ya se hubiese visto.
        return !fueLeidoEn(logDate => {
          if (Number.isNaN(logDate.getTime())) return false;
          const sameUtcDay =
            logDate.getUTCFullYear() === showDate.getUTCFullYear() &&
            logDate.getUTCMonth() === showDate.getUTCMonth() &&
            logDate.getUTCDate() === showDate.getUTCDate();

          return logDate >= showDate || sameUtcDay;
        });
      }
      return false;
    }

    if (modo === 'repeat') {
      if (anuncio.repeat_day?.toLowerCase() === dayOfWeek) {
        return !fueLeidoEn(logDate => getISOWeek(logDate) === currentWeek);
      }
      return false;
    }

    if (modo === 'monthly') {
      if (anuncio.day_of_month === dayOfMonth || dayOfMonth > anuncio.day_of_month) {
        return !fueLeidoEn(logDate => logDate.getUTCDate() >= anuncio.day_of_month && logDate.getUTCMonth() === now.getUTCMonth());
      }
      return false;
    }

    return false;
  });

  return visibles;
}








async function markAnnouncementAsRead(announcementId, userId) {
    await client.connect();

    const readAt = new Date();

    return announcements.updateOne(
        { _id: new ObjectId(announcementId) },
        {
            $addToSet: {
                read_log: {
                    user_id: new ObjectId(userId),
                    date: readAt
                },
                read_by: new ObjectId(userId)
            }
        }
    );
}

// Auditoria: quien lo vio
async function getAnnouncementViews(announcementId) {
    await client.connect();
    const doc = await announcements.findOne({ _id: new ObjectId(announcementId) });
    return doc?.read_by || [];
}

 async function getAnnouncementViewCountsByCreator(creatorId) {
  const docs = await announcements
  .find({ creator_id: new ObjectId(creatorId) })
    .project({ _id: 1, read_by: 1 })
    .toArray();

  const result = {};
  docs.forEach(doc => {
    result[doc._id.toString()] = doc.read_by?.length || 0;
  });

  return result;
}

async function getAnnouncementsHistory(userId, category) {
    await client.connect();

    const now = new Date();
    const dayOfMonth = now.getUTCDate();

    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (!user) throw new Error("Usuario no encontrado");

    const matchUserOrCategorySameTrainer = {
        $or: [
            { target_users: { $in: [new ObjectId(userId)] } },
            {
                target_categories: { $in: [category] },
                creator_id: user.entrenador_id
            }
        ]
    };

    const readCond = { read_by: { $in: [new ObjectId(userId)] } };

    const upcoming = await announcements
        .find({
            $and: [
                matchUserOrCategorySameTrainer,
                {
                    $or: [
                        { mode: 'repeat' },
                        { mode: 'once' },
                        { mode: 'monthly', day_of_month: { $lte: dayOfMonth } }
                    ]
                },
                {
                    $or: [
                        { read_by: { $exists: false } },
                        { read_by: { $not: { $elemMatch: { $eq: new ObjectId(userId) } } } }
                    ]
                }
            ]
        })
        .sort({ created_at: -1 })  // 👈 orden descendente
        .toArray();

    const past = await announcements
        .find({
            $and: [
                matchUserOrCategorySameTrainer,
                readCond
            ]
        })
        .sort({ created_at: -1 })  // 👈 orden descendente
        .toArray();

    return { upcoming, past };
}




async function updateUserPaymentStatus(userId, isPaid) {
    try {
        await client.connect();
        const result = await users.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { isPaid: Boolean(isPaid) } }
        );
        if (result.matchedCount === 0) throw new Error("Usuario no encontrado");
        return { userId, isPaid };
    } catch (err) {
        throw new Error(`Error al actualizar estado de pago: ${err.message}`);
    }
}

async function updateUserPaymentInfo(userId, paymentInfo) {
  try {
    await client.connect();

    // Validacion defensiva
    if (typeof paymentInfo !== 'object') {
      throw new Error('paymentInfo debe ser un objeto');
    }

    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { payment_info: { ...paymentInfo } } }
    );

    if (result.matchedCount === 0) {
      throw new Error("Usuario no encontrado");
    }

    return { userId, payment_info: paymentInfo };
  } catch (err) {
    throw new Error(`Error al actualizar payment_info: ${err.message}`);
  }
}

function ledgerDocBase(ownerId) {
  return {
    user_id: new ObjectId(ownerId),
    createdAt: new Date(),   // ← solo metadatos
  };
}

async function getOrCreateLedgerDoc(ownerId) {
  await ensureConn();
  const col = financeCol();
  const owner = new ObjectId(ownerId);
  const now = new Date();

  const r = await col.findOneAndUpdate(
    { user_id: owner },
    {
      $setOnInsert: ledgerDocBase(ownerId), // ya NO trae 'updatedAt' ni arrays
      $set: { updatedAt: now }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return r.value;
}


// Para generar subdocs con _id propio (arrays)
function subdocBase(fields = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(),
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

function applyDateFilter(arr, from, to) {
  const f = dateOrNull(from), t = dateOrNull(to);
  if (!f && !t) return arr;
  return arr.filter(x => {
    const d = dateOrNull(x?.fecha);
    if (!d) return false;
    if (f && d < f) return false;
    if (t && d > t) return false;
    return true;
  });
}

function sortByFechaAndId(arr, sort = 'desc') {
  const dir = sortDir(sort); // 1 asc / -1 desc
  return arr.slice().sort((a, b) => {
    const da = dateOrNull(a?.fecha)?.getTime() ?? 0;
    const db = dateOrNull(b?.fecha)?.getTime() ?? 0;
    if (da !== db) return dir * (da - db);
    // desempate por _id
    return dir * (String(a._id).localeCompare(String(b._id)));
  });
}

// Helpers
async function ensureConn() {
  if (!client.topology?.isConnected?.()) await client.connect();
}
function financeCol() { return finance; }  // 👈 ahora explicito
function clampLimit(n) { const v = Math.max(1, Number(n)||20); return Math.min(v, 500); }
function sortDir(s) { return String(s).toLowerCase() === 'asc' ? 1 : -1; }
function dateOrNull(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
function dateOrNow(s) { const d = dateOrNull(s); return d || new Date(); }
function numOrThrow(n) { const v = Number(n); if (!Number.isFinite(v) || v <= 0) throw new Error('monto invalido'); return v; }

const EXPENSE_CATS = new Set(['Proveedor','Alquiler','Servicios','Impuestos','Insumos','Mantenimiento','Otro']);
const VALID_KIND = new Set(['expense','cashflow','extrasale']);

// Canonical doc shape (1 doc por movimiento)
function newDocBase(userId, kind, fields) {
  return {
    user_id: new ObjectId(userId),
    kind, // 'expense' | 'cashflow' | 'extrasale'
    ...fields,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ====== Lecturas ======

export async function getLedgerGrouped(ownerId, { from, to, limit = 200, sort = 'desc' } = {}) {
  if (!ownerId) throw new Error('param ownerId requerido');
  const doc = await getOrCreateLedgerDoc(ownerId);

  const lim = clampLimit(limit);

  const expenses = sortByFechaAndId(applyDateFilter(doc.expenses || [], from, to), sort).slice(0, lim);
  const cashflows = sortByFechaAndId(applyDateFilter(doc.cashflows || [], from, to), sort).slice(0, lim);
  const extraSales = sortByFechaAndId(applyDateFilter(doc.extraSales || [], from, to), sort).slice(0, lim);

  return { expenses, cashflows, extraSales };
}


export async function listItems(ownerId, { tipo, from, to, page = 1, limit = 20, sort = 'desc' } = {}) {
  if (!ownerId) throw new Error('param ownerId requerido');
  const doc = await getOrCreateLedgerDoc(ownerId);

  const p = Math.max(1, Number(page) || 1);
  const l = clampLimit(limit);

  // Unificamos arrays con "kind" explicito y normalizamos cashflow tipo
  const E = (doc.expenses || []).map(x => ({ ...x, kind: 'expense' }));
  const C = (doc.cashflows || []).map(x => ({ ...x, kind: 'cashflow', tipo: x.tipo || x.cashflow_tipo })); // espejo 'tipo'
  const S = (doc.extraSales || []).map(x => ({ ...x, kind: 'extrasale' }));

  let all = [...E, ...C, ...S];

  if (tipo) {
    const k = String(tipo).toLowerCase();
    if (!VALID_KIND.has(k)) throw new Error('param tipo invalido');
    all = all.filter(x => x.kind === k);
  }

  all = applyDateFilter(all, from, to);
  all = sortByFechaAndId(all, sort);

  const total = all.length;
  const start = (p - 1) * l;
  const items = all.slice(start, start + l);

  return { items, page: p, limit: l, total };
}


export async function getSummary(ownerId, { from, to } = {}) {
  if (!ownerId) throw new Error('param ownerId requerido');
  const doc = await getOrCreateLedgerDoc(ownerId);

  const expenses   = applyDateFilter(doc.expenses   || [], from, to);
  const cashflows  = applyDateFilter(doc.cashflows  || [], from, to);
  const extraSales = applyDateFilter(doc.extraSales || [], from, to);

  let ingresos = 0, retiros = 0, gastos = 0;

  for (const e of expenses) gastos += Number(e.monto) || 0;

  // sumar ingresos de cashflows
  for (const c of cashflows) {
    const T = (c.tipo || c.cashflow_tipo || '').toUpperCase();
    if (T === 'INGRESO') ingresos += Number(c.monto) || 0;
    else if (T === 'RETIRO') retiros += Number(c.monto) || 0;
  }

  // sumar ventas como ingresos
  for (const s of extraSales) ingresos += Number(s.monto) || 0;

  return { ingresos, retiros, gastos, saldo: ingresos - retiros - gastos };
}


// ====== Altas ======

export async function createExpense(ownerId, { categoria, nombre, monto, descripcion, fecha }) {
  if (!ownerId) throw new Error('param ownerId requerido');
  if (!categoria || !EXPENSE_CATS.has(String(categoria))) throw new Error('categoria invalida');
  if (!nombre) throw new Error('falta nombre');

  await ensureConn();
  const col = financeCol();

  const item = subdocBase({
    categoria: String(categoria),
    nombre: String(nombre),
    monto: numOrThrow(monto),
    descripcion: descripcion ? String(descripcion) : '',
    fecha: dateOrNow(fecha)
  });

  const now = new Date();
  await col.updateOne(
    { user_id: new ObjectId(ownerId) },
    {
      // 👇 SOLO metadatos en el upsert. NO arrays aca.
      $setOnInsert: { user_id: new ObjectId(ownerId), createdAt: now },
      $push: { expenses: item },   // el array se crea si no existe
      $set: { updatedAt: now }
    },
    { upsert: true }
  );

  return item;
}



export async function createCashflow(ownerId, { tipo, concepto, monto, descripcion, fecha }) {
  if (!ownerId) throw new Error('param ownerId requerido');
  const T = String(tipo).toUpperCase();
  if (T !== 'INGRESO' && T !== 'RETIRO') throw new Error('tipo invalido');
  if (!concepto) throw new Error('falta concepto');

  await ensureConn();
  const col = financeCol();
  const item = subdocBase({
    // Guardamos ambas por compatibilidad con el front:
    tipo: T,
    cashflow_tipo: T,
    concepto: String(concepto),
    monto: numOrThrow(monto),
    descripcion: descripcion ? String(descripcion) : '',
    fecha: dateOrNow(fecha)
  });

const now = new Date();
await col.updateOne(
  { user_id: new ObjectId(ownerId) },
  {
    $setOnInsert: { user_id: new ObjectId(ownerId), createdAt: now }, // 🔸 SIN 'cashflows'
    $push: { cashflows: item },
    $set: { updatedAt: now }
  },
  { upsert: true }
);

  return item;
}


export async function createExtraSale(ownerId, { nombre, monto, fecha }) {
  if (!ownerId) throw new Error('param ownerId requerido');
  if (!nombre) throw new Error('falta nombre');

  await ensureConn();
  const col = financeCol();

  const when = dateOrNow(fecha);
  const amount = numOrThrow(monto);

  const sale = subdocBase({
    nombre: String(nombre),
    monto: amount,
    fecha: when
  });

  const now = new Date();
  await col.updateOne(
    { user_id: new ObjectId(ownerId) },
    {
      $setOnInsert: { user_id: new ObjectId(ownerId), createdAt: now }, // 👈 solo metadatos
      $push: { extraSales: sale },                                       // 👈 sin mirror
      $set: { updatedAt: now }
    },
    { upsert: true }
  );

  return sale; // 👈 solo sale
}




// ====== Edicion ======

export async function updateItem(ownerId, itemId, patch) {
  if (!ownerId) throw new Error('param ownerId requerido');
  let _id; try { _id = new ObjectId(itemId); } catch { throw new Error('param itemId invalido'); }

  await ensureConn();
  const col = financeCol();
  const owner = new ObjectId(ownerId);
  const now = new Date();

  // Intentamos en cada array; validamos segun el array detectado
  // EXPENSES
  let current = await col.findOne({ user_id: owner, 'expenses._id': _id }, { projection: { 'expenses.$': 1 } });
  if (current?.expenses?.length) {
    const set = { 'expenses.$[e].updatedAt': now };
    if (patch.fecha) set['expenses.$[e].fecha'] = dateOrNow(patch.fecha);
    if (patch.monto != null) set['expenses.$[e].monto'] = numOrThrow(patch.monto);
    if (patch.descripcion != null) set['expenses.$[e].descripcion'] = String(patch.descripcion);
    if (patch.categoria) {
      if (!EXPENSE_CATS.has(String(patch.categoria))) throw new Error('categoria invalida');
      set['expenses.$[e].categoria'] = String(patch.categoria);
    }
    if (patch.nombre) set['expenses.$[e].nombre'] = String(patch.nombre);

    const r = await col.findOneAndUpdate(
      { user_id: owner, 'expenses._id': _id },
      { $set: { ...set, updatedAt: now } },
      { arrayFilters: [{ 'e._id': _id }], returnDocument: 'after' }
    );
    const updated = (r.value?.expenses || []).find(x => String(x._id) === String(_id));
    return updated || null;
  }

  // CASHFLOWS
  current = await col.findOne({ user_id: owner, 'cashflows._id': _id }, { projection: { 'cashflows.$': 1 } });
  if (current?.cashflows?.length) {
    const set = { 'cashflows.$[c].updatedAt': now };
    if (patch.fecha) set['cashflows.$[c].fecha'] = dateOrNow(patch.fecha);
    if (patch.monto != null) set['cashflows.$[c].monto'] = numOrThrow(patch.monto);
    if (patch.descripcion != null) set['cashflows.$[c].descripcion'] = String(patch.descripcion);
    if (patch.tipo) {
      const T = String(patch.tipo).toUpperCase();
      if (T !== 'INGRESO' && T !== 'RETIRO') throw new Error('tipo invalido');
      set['cashflows.$[c].tipo'] = T;
      set['cashflows.$[c].cashflow_tipo'] = T; // espejo
    }
    if (patch.concepto) set['cashflows.$[c].concepto'] = String(patch.concepto);

    const r = await col.findOneAndUpdate(
      { user_id: owner, 'cashflows._id': _id },
      { $set: { ...set, updatedAt: now } },
      { arrayFilters: [{ 'c._id': _id }], returnDocument: 'after' }
    );
    const updated = (r.value?.cashflows || []).find(x => String(x._id) === String(_id));
    return updated || null;
  }

  // EXTRASALES
  current = await col.findOne({ user_id: owner, 'extraSales._id': _id }, { projection: { 'extraSales.$': 1 } });
  if (current?.extraSales?.length) {
    const set = { 'extraSales.$[s].updatedAt': now };
    if (patch.fecha) set['extraSales.$[s].fecha'] = dateOrNow(patch.fecha);
    if (patch.monto != null) set['extraSales.$[s].monto'] = numOrThrow(patch.monto);
    if (patch.nombre) set['extraSales.$[s].nombre'] = String(patch.nombre);
    if (patch.descripcion != null) set['extraSales.$[s].descripcion'] = String(patch.descripcion);

    const r = await col.findOneAndUpdate(
      { user_id: owner, 'extraSales._id': _id },
      { $set: { ...set, updatedAt: now } },
      { arrayFilters: [{ 's._id': _id }], returnDocument: 'after' }
    );
    const updated = (r.value?.extraSales || []).find(x => String(x._id) === String(_id));
    return updated || null;
  }

  return null;
}


// ====== Borrado ======

export async function deleteItem(ownerId, itemId) {
  if (!ownerId) throw new Error('param ownerId requerido');
  let _id; try { _id = new ObjectId(itemId); } catch { throw new Error('param itemId invalido'); }

  await ensureConn();
  const col = financeCol();
  const owner = new ObjectId(ownerId);
  const r = await col.updateOne(
    { user_id: owner },
    {
      $pull: {
        expenses: { _id },
        cashflows: { _id },
        extraSales: { _id }
      },
      $set: { updatedAt: new Date() }
    }
  );
  return r.modifiedCount > 0;
}



export {
    getUsersByEntrenadorId,
    getUsersByEntrenadorIdWithLastWeek,
    find,
    create,
    remove,
    login,
    findById,
    addUserProperty,
    findProfileByID,
    upsertUserDetails,
    getOpenersTemplatesByCoach,
    saveOpenersTemplatesByCoach,
    getOpenersPlansByUser,
    saveOpenersPlansByUser,
    closeUsersServiceConnectionForTests,

    createAnnouncement,
    getAnnouncementsForUser,
    getAnnouncementViewsWithNames,
    markAnnouncementAsRead,
    getAnnouncementViews,
    getAnnouncementsByCreator,
    editAnnouncement,
    deleteAnnouncement,
    getAnnouncementsHistory,
    getAnnouncementViewCountsByCreator,

    updateUserPaymentStatus,
    updateUserPaymentInfo
}
