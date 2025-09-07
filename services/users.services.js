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
const routine = db.collection('Routine'); // <-- ✅ FALTABA ESTA LÍNEA

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

// Intenta encontrar UNA rutina de un usuario probando múltiples campos/tipos.
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

// ===== Función principal =====

async function getUsersByEntrenadorIdWithLastWeek(entrenador_id, opts = {}) {
  const debug = !!opts.debug;

  return client.connect().then(async function () {
    const usersCol = users;            // ya definido arriba
    const routineCol = routine;        // A S E G Ú R A T E: const routine = db.collection('Routine')

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

      // Join con la colección correcta: "Routine"
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

      // A nivel usuario: tomamos el primer (y único) elemento del array
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
        throw new Error('Contraseña incorrecta')
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
    const newDetails = {
        ...details,
        last_edit: getDate(),
        timestamp: timestamp
    };

    let convertedUserId;
    try {
        convertedUserId = new ObjectId(userId);
    } catch (error) {
        throw new Error(`El userId proporcionado no es válido: ${userId}`);
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
            // Armado explícito del nuevo perfil
            const newProfile = {
                user_id: convertedUserId,
                ...newDetails
            };

            // Validación defensiva
            if (!newProfile.user_id || typeof newProfile.user_id !== 'object') {
                throw new Error('Error al crear perfil: user_id no es válido o está ausente.');
            }

            // Inserción del nuevo documento
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
        throw new Error(`El userId proporcionado no es válido: ${id}`);
    }

    try {
        await client.connect();

        const [profile, user] = await Promise.all([
            userProfile.findOne({ user_id: convertedUserId }),
            users.findOne({ _id: convertedUserId }, { projection: { category: 1 } })
        ]);

        if (!user) {
            throw new Error(`No se encontró el usuario con id: ${id}`);
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

    // Validación defensiva del ID
    let idToEdit;
    try {
        idToEdit = new ObjectId(announcementId);
    } catch (err) {
        throw new Error("ID de anuncio inválido");
    }

    // Convertir target_users
    if (Array.isArray(updates.target_users)) {
        updates.target_users = updates.target_users.map(uid => {
            try {
                return new ObjectId(uid);
            } catch (err) {
                console.error("ID inválido en target_users:", uid);
                return null;
            }
        }).filter(Boolean); // elimina los nulos
    }

    // Convertir creator_id
    if (updates.creator_id && typeof updates.creator_id === 'string') {
        try {
            updates.creator_id = new ObjectId(updates.creator_id);
        } catch (err) {
            console.warn("creator_id inválido:", updates.creator_id);
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

    // Normalización de modo
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
        // Se muestra si no fue leído el mismo día o después
        return !fueLeidoEn(logDate => logDate >= showDate);
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

    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

    return announcements.updateOne(
        { _id: new ObjectId(announcementId) },
        {
            $addToSet: {
                read_log: {
                    user_id: new ObjectId(userId),
                    date: today
                },
                read_by: new ObjectId(userId)
            }
        }
    );
}

// Auditoría: quién lo vio
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

    // Validación defensiva
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
