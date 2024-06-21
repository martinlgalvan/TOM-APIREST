import { MongoClient, ObjectId } from 'mongodb'
import {getDate} from './../date/formatedDate.js'
import bcrypt from 'bcrypt'

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/')
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

async function create(user,entrenador_id,logo, color, textColor) {
    const newUser = { 
        ...user,
        entrenador_id: new ObjectId(entrenador_id),
        logo: logo,
        color: color,
        textColor: textColor,
        created_at: getDate()}

    await client.connect()

    const userExist = await users.findOne({ email: newUser.email })

    if (userExist) {
        throw new Error('El email ya existe')
    }

    const salt = await bcrypt.genSalt(10)

    newUser.password = await bcrypt.hash(newUser.password, salt)

    await users.insertOne(newUser)

    return newUser
}

async function remove(id) {
    await client.connect()

    await users.deleteOne({ _id: ObjectId(id) })
}


async function addUserProperty(userId, color, textColor) {
    try {
        const trainer = await findById(userId); // Obtener el entrenador
        
        if (!trainer) {
            throw new Error('Entrenador no encontrado');
        }
        
        // Agregar las propiedades al entrenador
        trainer.color = color;
        trainer.textColor = textColor;
        
        // Actualizar el entrenador con las nuevas propiedades
        await users.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { color: color, textColor: textColor } }
        );
        
        // Actualizar a todos los alumnos del entrenador
        const updatedStudents = await users.updateMany(
            { entrenador_id: new ObjectId(userId) }, // Filtrar alumnos por el ID del entrenador
            { $set: { color: color, textColor: textColor } }
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
    }
    try {
        // Buscar y actualizar los detalles del usuario, o crear uno nuevo si no existe
        const userDetails = await userProfile.findOneAndUpdate(
            { user_id: new ObjectId(userId)},
            { $set: newDetails },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Devolver los detalles del usuario actualizados o creados
        return userDetails;
    } catch (error) {
        throw new Error(`Error al actualizar o crear los detalles del usuario: ${error.message}`);
    }
}

async function findProfileByID(id) {
    try {
        await client.connect();
        const user = await userProfile.findOne({ user_id: ObjectId(id) });
        return user;
    } catch (error) {
        throw new Error(`Error al buscar el usuario: ${error.message}`);
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

