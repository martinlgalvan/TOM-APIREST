import { ObjectId } from 'mongodb'
import * as UsersService from '../services/users.services.js'

function idToString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof ObjectId) return value.toString()
  if (typeof value?.toString === 'function') return value.toString()
  return String(value)
}

/**
 * UNICO lugar donde se decide si un entrenador puede administrar a un alumno.
 *
 * Todos los endpoints que tocan a un alumno pasan por aca, asi que cambiar la
 * regla de negocio es cambiar esta funcion y nada mas.
 *
 * ---------------------------------------------------------------------------
 * PUNTO DE EXTENSION - alumno compartido entre 2 entrenadores
 * ---------------------------------------------------------------------------
 * Hoy el vinculo es 1-a-1: el alumno tiene un unico `entrenador_id`.
 * Cuando exista la funcionalidad de compartir un alumno entre entrenadores, la
 * forma prevista es guardar en el alumno un array con los entrenadores
 * habilitados (por ej. `coach_ids: [ObjectId, ObjectId]`) y agregar el chequeo
 * marcado abajo. No hay que tocar ningun controller ni ninguna ruta: alcanza
 * con descomentar/extender este bloque.
 */
function coachCanManageStudent(coach, student) {
  if (!coach || !student) return false

  const coachId = idToString(coach._id)
  if (!coachId) return false

  // 1) El usuario siempre puede operar sobre si mismo (ej: su propia info de pago).
  if (coachId === idToString(student._id)) return true

  // Solo los entrenadores administran alumnos.
  if (coach.role !== 'admin') return false

  // 2) Vinculo clasico: el alumno pertenece a este entrenador.
  if (coachId === idToString(student.entrenador_id)) return true

  // 3) EXTENSION FUTURA - alumno compartido:
  // if (Array.isArray(student.coach_ids) &&
  //     student.coach_ids.some((cid) => idToString(cid) === coachId)) {
  //   return true
  // }

  return false
}

/**
 * Middleware: exige que el usuario logueado pueda administrar al usuario
 * apuntado por `req.params[paramName]`.
 *
 * Si el id no viaja en la URL sino en el body (caso de las acciones masivas,
 * que reciben `{ userId, ids[] }`), se pasa `{ from: 'body' }`.
 *
 * Deja el alumno ya cargado en `req.targetUser` para que el controller no
 * tenga que volver a buscarlo en la base (evita un viaje de ida y vuelta
 * duplicado por request).
 */
function ownsStudent(paramName = 'userId', { from = 'params' } = {}) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'No autenticado' })
    }

    const source = from === 'body' ? req.body : req.params
    const targetId = source?.[paramName]

    if (!targetId || !ObjectId.isValid(targetId)) {
      return res.status(400).json({ code: 'INVALID_ID', message: 'Identificador de usuario invalido.' })
    }

    try {
      // Caso "sobre uno mismo" (el alumno guardando su propio perfil, que pasa
      // seguido): `isLogin` ya trajo ese documento, asi que no lo pedimos otra
      // vez. Sin esto, cada guardado del alumno pagaria una query extra.
      const target = idToString(req.user._id) === idToString(targetId)
        ? req.user
        : await UsersService.findById(targetId)

      if (!target) {
        return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado.' })
      }

      if (!coachCanManageStudent(req.user, target)) {
        return res.status(403).json({
          code: 'NOT_YOUR_STUDENT',
          message: 'No tenes permiso para administrar a este usuario.'
        })
      }

      req.targetUser = target
      next()
    } catch (error) {
      console.error('[AUTHZ] ownsStudent failed:', error?.message)
      return res.status(500).json({ code: 'AUTHZ_INTERNAL', message: 'Error interno' })
    }
  }
}

/**
 * Quienes son superadministradores del panel interno.
 *
 * Sale de la variable de entorno SUPERADMIN_IDS -ids separados por coma-, no
 * del codigo ni de la base, por tres motivos:
 *
 *   1. Este repositorio es publico. Un id escrito en el codigo queda a la vista
 *      de cualquiera, como ya pasa con la lista de testers de nutricion.
 *   2. Cambiar quien manda no necesita tocar codigo ni deployar: se edita la
 *      variable en Vercel y listo.
 *   3. No hay ningun camino dentro de la aplicacion que pueda otorgar el
 *      permiso. Un `role` guardado en la base se puede escribir desde la
 *      aplicacion; una variable de entorno del servidor, no.
 *
 * Si la variable no esta definida, no hay superadministradores. Se falla
 * cerrado a proposito: es preferible que el panel no ande a que quede abierto
 * porque alguien se olvido de configurarlo.
 */
function superAdminIds() {
  return String(process.env.SUPERADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

function isSuperAdminUser(user) {
  const permitidos = superAdminIds()
  if (!permitidos.length) return false

  const id = idToString(user?._id)
  if (!id) return false

  return permitidos.includes(id)
}

/**
 * Middleware para todo lo que cuelga del panel interno.
 *
 * Va SIEMPRE despues de isLogin, que es quien deja en req.user el usuario
 * recien leido de la base, y no lo que dijera el token.
 *
 * Responde 404 y no 403 a proposito: un 403 confirma que la ruta existe y que
 * hay un panel detras. Para quien no tiene permiso, esto no existe.
 */
function isSuperAdmin(req, res, next) {
  if (isSuperAdminUser(req.user)) return next()

  console.warn(`[AUTHZ] acceso al panel interno rechazado: usuario ${idToString(req.user?._id) || '(sin sesion)'}`)
  return res.status(404).json({ code: 'NOT_FOUND', message: 'No encontrado' })
}

export {
  coachCanManageStudent,
  ownsStudent,
  idToString,
  isSuperAdmin,
  isSuperAdminUser,
  superAdminIds
}
