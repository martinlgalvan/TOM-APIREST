import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();

const options = { keepAlive: true };

const client = new MongoClient(process.env.MONGODB_URI,options)
const db = client.db('TOM')
const tokens = db.collection('Tokens')

async function create(token) {
    await client.connect()

    await tokens.insertOne(token)
}


async function findByToken(token) {
    await client.connect()

    const tokenFound = await tokens.findOne({ token })

    return tokenFound
}


async function deleteByToken(token) {
    await client.connect()

    await tokens.deleteOne({ token })
}

export {
    create,
    findByToken,
    deleteByToken
}
