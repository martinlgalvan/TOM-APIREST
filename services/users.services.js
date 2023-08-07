import { MongoClient, ObjectId } from 'mongodb'
import {getDate} from './../date/formatedDate.js'
import bcrypt from 'bcrypt'

const client = new MongoClient('mongodb+srv://martinlgalvan:onenote11@tom-cluster.nreeedp.mongodb.net/?retryWrites=true&w=majority')
const db = client.db('TOM')
const users = db.collection('Users')

async function findById(id) {
    await client.connect()

    const user = await users.findOne({ _id: ObjectId(id) })

    return user
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

async function create(user,entrenador_id,logo) {
    const newUser = { 
        ...user,
        entrenador_id: new ObjectId(entrenador_id),
        logo: logo,
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

export {
    getUsersByEntrenadorId,
    find,
    create,
    remove,
    login,
    findById

}

