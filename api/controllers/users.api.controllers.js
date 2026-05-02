import jwt from 'jsonwebtoken'

import * as UsersService from '../../services/users.services.js'
import * as BlockService from '../../services/block.services.js'
import * as RoutineServices from '../../services/routine.services.js'
import * as RefreshTokenService from '../../services/refreshTokens.services.js'
import {
  clearRefreshCookie,
  getJwtSecret,
  getRefreshSecret,
  issueSession,
  sanitizeUser
} from '../lib/authSession.js'
// import * as TokenService from '../../services/token.services.js'  // <- ya no se usa si JWT-only

//----------------------------------------------------*

function extractToken(req) {
  const direct = req.headers['auth-token']
  if (direct) return direct

  const auth = req.headers.authorization || req.headers.Authorization
  if (auth && typeof auth === 'string') {
    const [type, value] = auth.split(' ')
    if (type?.toLowerCase() === 'bearer' && value) return value
  }

  return null
}

async function login(req, res) {
  try {
    const user = await UsersService.login(req.body)

    const { accessToken } = await issueSession(res, user)

    return res.status(200).json({ token: accessToken, user: sanitizeUser(user) })
  } catch (err) {
    return res.status(400).json({ message: err.message })
  }
}

async function refresh(req, res) {
  try {
    const token = req.cookies?.refresh_token
    if (!token) {
      clearRefreshCookie(res)
      return res.status(401).json({ message: 'No refresh token', code: 'REFRESH_MISSING' })
    }

    let decoded
    try {
      decoded = jwt.verify(token, getRefreshSecret())
    } catch (e) {
      const code = e?.name === 'TokenExpiredError' ? 'REFRESH_EXPIRED' : 'REFRESH_INVALID'
      clearRefreshCookie(res)
      return res.status(401).json({ message: 'Refresh invalido/expirado', code })
    }

    if (decoded?.purpose !== 'refresh') {
      clearRefreshCookie(res)
      return res.status(401).json({ message: 'Refresh invalido (purpose)', code: 'REFRESH_INVALID' })
    }

    const userId = String(decoded.id)

    const ok = await RefreshTokenService.existsAndActive({ userId, token })
    if (!ok) {
      clearRefreshCookie(res)
      return res.status(401).json({ message: 'Refresh revocado/no valido', code: 'REFRESH_REVOKED' })
    }

    // rotacion sliding
    await RefreshTokenService.revoke({ userId, token })

    const user = await UsersService.findById(userId)
    if (!user) {
      clearRefreshCookie(res)
      return res.status(401).json({ message: 'Usuario no encontrado', code: 'USER_NOT_FOUND' })
    }

    const { accessToken } = await issueSession(res, user)

    return res.status(200).json({ token: accessToken, user: sanitizeUser(user) })
  } catch (err) {
    return res.status(500).json({ message: 'Error interno', error: err.message })
  }
}

async function logout(req, res) {
  try {
    const token = req.cookies?.refresh_token

    if (token) {
      try {
        const decoded = jwt.verify(token, getRefreshSecret())
        if (decoded?.purpose === 'refresh') {
          await RefreshTokenService.revoke({ userId: String(decoded.id), token })
        }
      } catch {}
    }

    clearRefreshCookie(res)
    return res.json({ message: 'Logout exitoso' })
  } catch (err) {
    return res.status(500).json({ message: 'Error interno', error: err.message })
  }
}

//----------------------------------------------------*

async function getUserById(req, res) {
  const id = req.params.userId

  try {
    const user = await UsersService.findById(id)
    if (user) {
      res.status(200).json(user)
    } else {
      res.status(404).json({ message: "Usuario no encontrado." })
    }
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el usuario.", error: error.message })
  }
}

async function find(req, res) {
  const filter = {}

  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ message: 'No se envio un token' })
    return
  }

  try {
    jwt.verify(token, getJwtSecret())
  } catch (err) {
    res.status(401).json({ message: 'Token invalido' })
    return
  }

  try {
    const users = await UsersService.find(filter)
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: 'Error interno' })
  }
}

function getUsersByEntrenador(req, res) {
  const entrenador_id = req.params.idEntrenador
  const debug = req.query.debug === 'true' || req.query.debug === '1'

  if (req.query.blocks === 'true') {
    return BlockService.findByUserId(entrenador_id)
      .then(blocks => res.status(200).json(blocks))
      .catch(error => {
        console.error('[getUsersByEntrenador][blocks]', error)
        res.status(500).json({ message: "Error al obtener los bloques.", error: error.message })
      })
  }

  if (req.query.withLastWeek === 'true') {
    return UsersService.getUsersByEntrenadorIdWithLastWeek(entrenador_id, { debug })
      .then(users => {
        if (users) return res.status(200).json(users)
        return res.status(404).json({ message: "No es posible realizar esta accion." })
      })
      .catch(error => {
        console.error('[getUsersByEntrenador][withLastWeek]', error)
        res.status(500).json({ message: "Error al obtener los usuarios con ultima semana.", error: error.message })
      })
  }

  UsersService.getUsersByEntrenadorId(entrenador_id)
    .then(users => {
      if (users) {
        res.status(200).json(users)
      } else {
        res.status(404).json({ message: "No es posible realizar esta accion." })
      }
    })
    .catch(error => {
      console.error('[getUsersByEntrenador][default]', error)
      res.status(500).json({ message: "Error al obtener los usuarios.", error: error.message })
    })
}

function create(req, res) {
  const entrenador_id = req.params.idEntrenador

  if (req.body.type === 'block') {
    const blockData = req.body.data
    return BlockService.createBlock(entrenador_id, blockData)
      .then(block => res.status(201).json(block))
      .catch(err => res.status(400).json({ message: err.message }))
  }

  if (req.body.type === 'clone_block') {
    const blockId = req.body.blockId
    return BlockService.cloneBlock(blockId, entrenador_id)
      .then(result => res.status(201).json(result))
      .catch(err => res.status(400).json({ message: err.message }))
  }

  const logo = req.body.logo
  const user = {
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: "common"
  }

  UsersService.create(user, entrenador_id, logo)
    .then(user => {
      res.json(user)
    })
    .catch(err => {
      res.status(err.status || 500).json({ message: err.message })
    })
}

function removeUser(req, res) {
  const id = req.params.userId

  UsersService.remove(id)
    .then(() => {
      res.json({ message: 'Usuario eliminado' })
    })
    .catch(err => {
      res.status(500).json({ message: err.message })
    })
}

async function addUserProperty(req, res) {
  const userId = req.params.userId
  const category = req.body.category

  try {
    const user = await UsersService.addUserProperty(userId, category)
    res.status(200).json({ message: `Propiedad '${category}' agregada correctamente al usuario`, user })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

async function getProfileByUserId(req, res) {
  const id = req.params.userId

  try {
    const user = await UsersService.findProfileByID(id)
    if (user) {
      res.status(200).json(user)
    } else {
      res.status(404).json({ message: "Perfil no encontrado." })
    }
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el perfil.", error: error.message })
  }
}

async function upsertUserDetails(req, res) {
  const userId = req.params.userId
  const details = req.body

  try {
    const { action, profile } = await UsersService.upsertUserDetails(userId, details)
    res.status(200).json({
      message: action === 'created' ? 'Perfil creado correctamente' : 'Perfil actualizado correctamente',
      action: action,
      userProfile: profile
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

async function getOpenersTemplatesByCoach(req, res) {
  const { coachId } = req.params
  try {
    const templates = await UsersService.getOpenersTemplatesByCoach(coachId)
    res.status(200).json({ templates })
  } catch (error) {
    const code = /invalido|invalido/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function saveOpenersTemplatesByCoach(req, res) {
  const { coachId } = req.params
  const templates = Array.isArray(req.body) ? req.body : req.body?.templates

  if (!Array.isArray(templates)) {
    return res.status(400).json({ message: "Debes enviar 'templates' como arreglo." })
  }

  try {
    const saved = await UsersService.saveOpenersTemplatesByCoach(coachId, templates)
    res.status(200).json({ templates: saved })
  } catch (error) {
    const code = /invalido|invalido/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function getOpenersPlansByUser(req, res) {
  const { userId } = req.params
  try {
    const plans = await UsersService.getOpenersPlansByUser(userId)
    res.status(200).json({ plans })
  } catch (error) {
    const code = /invalido|invalido/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function saveOpenersPlansByUser(req, res) {
  const { userId } = req.params
  const plans = Array.isArray(req.body) ? req.body : req.body?.plans

  if (!Array.isArray(plans)) {
    return res.status(400).json({ message: "Debes enviar 'plans' como arreglo." })
  }

  try {
    const saved = await UsersService.saveOpenersPlansByUser(userId, plans)
    res.status(200).json({ plans: saved })
  } catch (error) {
    const code = /invalido|invalido/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function createAnnouncement(req, res) {
  try {
    const data = req.body
    const result = await UsersService.createAnnouncement(data)
    res.status(201).json({ message: "Anuncio creado", id: result.insertedId })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getAnnouncementsByCreator(req, res) {
  try {
    const creatorId = req.params.creatorId
    const anuncios = await UsersService.getAnnouncementsByCreator(creatorId)
    res.status(200).json(anuncios)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function editAnnouncement(req, res) {
  try {
    const announcementId = req.params.announcementId
    const updates = req.body
    await UsersService.editAnnouncement(announcementId, updates)
    res.json({ message: "Anuncio editado correctamente" })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function deleteAnnouncement(req, res) {
  try {
    const announcementId = req.params.announcementId
    await UsersService.deleteAnnouncement(announcementId)
    res.json({ message: "Anuncio eliminado correctamente" })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getUnreadAnnouncements(req, res) {
  const userId = req.params.userId

  try {
    const user = await UsersService.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" })
    }

    const announcements = await UsersService.getAnnouncementsForUser(userId, user.category)
    res.status(200).json(announcements)
  } catch (err) {
    console.error("Error al obtener anuncios:", err)
    res.status(500).json({ message: "Error al obtener anuncios" })
  }
}

async function markAnnouncementRead(req, res) {
  try {
    const { announcementId, userId } = req.params
    await UsersService.markAnnouncementAsRead(announcementId, userId)
    res.json({ message: "Anuncio marcado como leido" })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getAnnouncementViewsWithNames(req, res) {
  try {
    const announcementId = req.params.announcementId
    const readers = await UsersService.getAnnouncementViewsWithNames(announcementId)
    res.status(200).json({ viewers: readers, count: readers.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getAnnouncementViews(req, res) {
  try {
    const announcementId = req.params.announcementId
    const readers = await UsersService.getAnnouncementViews(announcementId)
    res.status(200).json({ viewers: readers, count: readers.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getAnnouncementsHistory(req, res) {
  try {
    const userId = req.params.userId
    const user = await UsersService.findById(userId)
    const result = await UsersService.getAnnouncementsHistory(userId, user.category)
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function getAnnouncementViewCountsByCreator(req, res) {
  try {
    const creatorId = req.params.creatorId
    const counts = await UsersService.getAnnouncementViewCountsByCreator(creatorId)
    res.status(200).json(counts)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

async function setUserPaymentStatus(req, res) {
  const { userId } = req.params
  const { isPaid } = req.body

  try {
    const result = await UsersService.updateUserPaymentStatus(userId, isPaid)
    res.status(200).json({ message: 'Estado de pago actualizado correctamente', result })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

async function updatePaymentInfo(req, res) {
  const { userId } = req.params
  const paymentInfo = req.body

  try {
    const result = await UsersService.updateUserPaymentInfo(userId, paymentInfo)
    res.status(200).json({ message: 'Informacion de pago actualizada', result })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

async function getLedgerGrouped(req, res) {
  const { ownerId } = req.params
  const { from, to, limit = 200, sort = 'desc' } = req.query
  try {
    const out = await UsersService.getLedgerGrouped(ownerId, {
      from, to, limit: Number(limit), sort: String(sort)
    })
    res.status(200).json(out)
  } catch (error) {
    const code = /invalid|param/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function listItems(req, res) {
  const { ownerId } = req.params
  const { tipo, from, to, page = 1, limit = 20, sort = 'desc' } = req.query
  try {
    const out = await UsersService.listItems(ownerId, {
      tipo, from, to, page: Number(page), limit: Number(limit), sort: String(sort)
    })
    res.status(200).json(out)
  } catch (error) {
    const code = /invalid|param|tipo|monto|categoria/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function getSummary(req, res) {
  const { ownerId } = req.params
  const { from, to } = req.query
  try {
    const out = await UsersService.getSummary(ownerId, { from, to })
    res.status(200).json(out)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

async function createExpense(req, res) {
  const { ownerId } = req.params
  const { categoria, nombre, monto, descripcion, fecha } = req.body || {}
  try {
    const item = await UsersService.createExpense(ownerId, { categoria, nombre, monto, descripcion, fecha })
    res.status(201).json(item)
  } catch (error) {
    const code = /invalid|falt|categoria|monto/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function createCashflow(req, res) {
  const { ownerId } = req.params
  const { tipo, concepto, monto, descripcion, fecha } = req.body || {}
  try {
    const item = await UsersService.createCashflow(ownerId, { tipo, concepto, monto, descripcion, fecha })
    res.status(201).json(item)
  } catch (error) {
    const code = /invalid|falt|tipo|monto/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function createExtraSale(req, res) {
  const { ownerId } = req.params
  const { nombre, monto, fecha } = req.body || {}
  try {
    const sale = await UsersService.createExtraSale(ownerId, { nombre, monto, fecha })
    res.status(201).json(sale)
  } catch (error) {
    const code = /invalid|falt|monto/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function updateItem(req, res) {
  const { ownerId, itemId } = req.params
  const patch = req.body || {}
  try {
    const item = await UsersService.updateItem(ownerId, itemId, patch)
    if (!item) return res.status(404).json({ message: 'Item no encontrado' })
    res.status(200).json(item)
  } catch (error) {
    const code = /invalid|param|tipo|monto|categoria/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

async function deleteItem(req, res) {
  const { ownerId, itemId } = req.params
  try {
    const ok = await UsersService.deleteItem(ownerId, itemId)
    if (!ok) return res.status(404).json({ message: 'Item no encontrado' })
    res.status(200).json({ message: 'Item eliminado' })
  } catch (error) {
    const code = /invalid|param/i.test(error.message) ? 400 : 500
    res.status(code).json({ message: error.message })
  }
}

export {
  getUserById,
  getUsersByEntrenador,
  find,
  create,
  removeUser,
  login,
  logout,
  refresh,
  addUserProperty,
  getProfileByUserId,
  upsertUserDetails,
  getOpenersTemplatesByCoach,
  saveOpenersTemplatesByCoach,
  getOpenersPlansByUser,
  saveOpenersPlansByUser,

  createAnnouncement,
  getUnreadAnnouncements,
  getAnnouncementViewsWithNames,
  markAnnouncementRead,
  getAnnouncementViews,
  getAnnouncementsByCreator,
  editAnnouncement,
  deleteAnnouncement,

  getAnnouncementsHistory,
  getAnnouncementViewCountsByCreator,

  setUserPaymentStatus,
  updatePaymentInfo,
  getLedgerGrouped,
  listItems,
  getSummary,
  createExpense,
  createCashflow,
  createExtraSale,
  updateItem,
  deleteItem
}

