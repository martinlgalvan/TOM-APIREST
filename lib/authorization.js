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

export { coachCanManageStudent, ownsStudent, idToString }
