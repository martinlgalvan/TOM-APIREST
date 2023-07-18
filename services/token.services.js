import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://martinlgalvan:Onenote11@168.197.48.203:27017/',options)
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
