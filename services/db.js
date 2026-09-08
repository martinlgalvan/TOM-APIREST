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
/**
 * TLS contra la base.
 *
 * El certificado del servidor lo firma una autoridad propia, asi que el driver
 * necesita conocerla para poder validarlo. Viaja en MONGODB_CA como base64 y no
 * como archivo suelto: en Vercel un archivo puede quedar fuera del paquete de
 * la funcion, y eso falla en produccion pero no en local, que es la peor forma
 * de enterarse.
 *
 * Si la variable no esta definida, no se activa nada y la conexion queda igual
 * que antes. Asi se puede desplegar este codigo primero y prender el cifrado
 * despues, sin que los dos pasos dependan uno del otro.
 */
/* La base en memoria de los tests corre en 127.0.0.1 y no habla TLS. Si el
   cliente intenta cifrar contra ella, la conexion se cuelga hasta agotar el
   tiempo -asi se cayeron 18 tests-.

   Se mira el destino y no NODE_ENV: hay un test que fija NODE_ENV=production a
   proposito para probar las cookies, y con esa guarda igual fallaba. Ademas el
   certificado esta emitido para la IP del servidor, con lo cual validarlo
   contra localhost no podria funcionar aunque se intentara. */
function esDestinoLocal(uri) {
  return /^mongodb(\+srv)?:\/\/(?:[^@]*@)?(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(uri || '')
}

function opcionesDeTls() {
  const uri = process.env.MONGODB_URI || ''
  if (esDestinoLocal(uri)) return {}

  const ca = (process.env.MONGODB_CA || '').trim()
  if (!ca) return {}

  return { tls: true, ca: Buffer.from(ca, 'base64') }
}

const client = new MongoClient(process.env.MONGODB_URI, opcionesDeTls())
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
