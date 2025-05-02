import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();
import { getDate } from './../date/formatedDate.js'
import bcrypt from 'bcryptjs';

const client = new MongoClient(process.env.MONGODB_URI)
const db = client.db('TOM')
const users = db.collection('Users')
const userProfile = db.collection('usersProfile')

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
export {
    getUsersByEntrenadorId,
    find,
    create,
    remove,
    login,
    findById,
    addUserProperty,
    findProfileByID,
    upsertUserDetails
}
