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
        return users.find(
          { entrenador_id: new ObjectId(entrenador_id) },
          { projection: { password: 0 } }
        )
        .sort({ "created_at.fecha": -1, "created_at.hora": -1 })
        .toArray();
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
