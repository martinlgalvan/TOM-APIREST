import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Cliente de Mongo COMPARTIDO por todos los services.
 *
 * Por que: antes cada archivo de services/ creaba su propio `new MongoClient`.
 * En serverless eso significa que cada instancia que levanta Vercel abre un
 * pool de conexiones por cada service que se importe (eran 5 vivos), en vez de
 * uno solo. Con varias instancias concurrentes se agotan las conexiones del
 * cluster. Un unico cliente = un unico pool por instancia.
 */
const client = new MongoClient(process.env.MONGODB_URI)
const db = client.db('TOM')

/**
 * connect() del driver es idempotente, pero en frio varias llamadas en paralelo
 * (tipico en serverless: la request dispara 3 queries a la vez) pueden arrancar
 * el handshake mas de una vez. Memorizamos la promesa para que el primer caller
 * conecte y el resto espere el mismo handshake.
 */
let connectPromise = null

async function connect() {
  if (!connectPromise) {
    connectPromise = client.connect().catch((error) => {
      // Si fallo, limpiamos para que el proximo intento reconecte de verdad
      // en vez de quedar cacheada una promesa rechazada para siempre.
      connectPromise = null
      throw error
    })
  }
  return connectPromise
}

/**
 * Solo para tests: cierra el cliente compartido y resetea el memo.
 */
async function closeSharedConnectionForTests() {
  connectPromise = null
  try {
    await client.close()
  } catch {
    // noop
  }
}

export { client, db, connect, closeSharedConnectionForTests }
