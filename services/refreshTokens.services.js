import { ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import crypto from 'crypto'

dotenv.config()

const client = new MongoClient(process.env.MONGODB_URI, { keepAlive: true })
const db = client.db('TOM')

// Nombre de coleccion (podes ajustarlo si queres)
const refreshTokens = db.collection('RefreshTokens')

// ===================== HELPERS =====================

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function toObjectId(id) {
  if (id instanceof ObjectId) return id
  if (typeof id === 'string' && ObjectId.isValid(id)) return new ObjectId(id)
  // Si no es valido, lo guardamos como string (fallback)
  return id
}

// ===================== CRUD =====================

/**
 * Guarda un refresh token (guardamos SOLO el hash).
 * @param {Object} params
 * @param {string|ObjectId} params.userId
 * @param {string} params.token refresh token plano (se hashea adentro)
 * @param {Date} params.expiresAt
 */
export async function save({ userId, token, expiresAt }) {
  await client.connect()

  const doc = {
    user_id: toObjectId(userId),
    token_hash: sha256(token),
    expires_at: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
    created_at: new Date(),
    updated_at: new Date(),
    revoked_at: null
  }

  const res = await refreshTokens.insertOne(doc)
  return { ...doc, _id: res.insertedId }
}

/**
 * Chequea si existe y esta activo (no revocado y no expirado).
 */
export async function existsAndActive({ userId, token }) {
  await client.connect()

  const user_id = toObjectId(userId)
  const token_hash = sha256(token)

  const doc = await refreshTokens.findOne({
    user_id,
    token_hash,
    revoked_at: null,
    expires_at: { $gt: new Date() }
  })

  return !!doc
}

/**
 * Revoca un refresh token especifico (el que se uso).
 */
export async function revoke({ userId, token }) {
  await client.connect()

  const user_id = toObjectId(userId)
  const token_hash = sha256(token)

  await refreshTokens.updateOne(
    { user_id, token_hash, revoked_at: null },
    { $set: { revoked_at: new Date(), updated_at: new Date() } }
  )
}

/**
 * Revoca TODOS los refresh tokens de un usuario (logout all devices).
 */
export async function revokeAllForUser(userId) {
  await client.connect()

  const user_id = toObjectId(userId)

  await refreshTokens.updateMany(
    { user_id, revoked_at: null },
    { $set: { revoked_at: new Date(), updated_at: new Date() } }
  )
}

/**
 * (Opcional) Limpia tokens expirados (si no usas TTL index).
 */
export async function deleteExpired() {
  await client.connect()

  const res = await refreshTokens.deleteMany({
    expires_at: { $lte: new Date() }
  })

  return { deleted: res.deletedCount || 0 }
}

export async function closeRefreshTokensServiceConnectionForTests() {
  await client.close()
}
