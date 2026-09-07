import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import * as usersController from '../controllers/users.api.controllers.js'
import {isLogin, isAdmin} from '../middleware/auth.middleware.js'
import { ownsStudent } from '../lib/authorization.js'

const router = express.Router()

//  Ejercicio
router.route('/api/week/:week_id/day/:day_id/exercise')
    .put([isLogin], RoutineController.editById)

router.route('/api/week/:week_id/day/:day_id')
    .get([isLogin, isAdmin],RoutineController.findExercises)

// Semana
router.route('/api/week/:week_id')
    .get([isLogin], RoutineController.findByWeekId)
    .patch([isLogin, isAdmin], RoutineController.editWeek)
    .delete([isLogin, isAdmin],RoutineController.deleteWeek)

router.get('/api/weeks/last-created', [isLogin], RoutineController.getLastWeeksByUserIds);

// ✅ NUEVO: actualizacion generica de propiedades simples de la semana
router.route('/api/week/:week_id/properties')
    .patch([isLogin, isAdmin], RoutineController.updateWeekProperties)

// ✅ NUEVO: acciones masivas (visibilidad/bloque/eliminar) sobre varias semanas de un mismo alumno
// El alumno viaja en el body ({ userId, ids }), por eso ownsStudent lee de ahi.
router.route('/api/weeks/bulk')
    .patch([isLogin, isAdmin, ownsStudent('userId', { from: 'body' })], RoutineController.bulkUpdateWeeks)
    .delete([isLogin, isAdmin, ownsStudent('userId', { from: 'body' })], RoutineController.bulkDeleteWeeks)


//Para crear una semana de la rutina de un usuario
// El GET lo usan tanto el alumno (su propia rutina) como el entrenador (la de
// su alumno): ownsStudent cubre los dos casos y cierra el acceso publico.
router.route('/api/user/:userId/routine')
    .get([isLogin, ownsStudent('userId')], RoutineController.findRoutineByUserId)
    .post([isLogin, isAdmin, ownsStudent('userId')],RoutineController.createWeek)
    // El alumno edita su propio perfil y el entrenador el de su alumno:
    // ownsStudent permite ambos y corta el resto.
    .patch([isLogin, ownsStudent('userId')],usersController.upsertUserDetails);

router.route('/api/user/:userId/routine/clon')
    .get([isLogin, ownsStudent('userId')], usersController.getProfileByUserId)
    .post([isLogin],RoutineController.createClonLastWeek)

router.route('/api/user/:user_id/routine/par/week')
    .post([isLogin, isAdmin],RoutineController.createPARweekInRoutine)

router.route('/api/user/:user_id/routine/par')
    .get([isLogin, isAdmin],RoutineController.getPAR)
    .post([isLogin, isAdmin],RoutineController.createPARweek)

router.route('/api/par/:id_par')
    .put([isLogin, isAdmin],RoutineController.updatePAR)
    .delete([isLogin, isAdmin],RoutineController.deletePAR)

router.route('/api/week/:week_id/day')
    .patch([isLogin, isAdmin],RoutineController.editWeekName)

router.route('/api/routine/par/multi')
    .post([isLogin, isAdmin],RoutineController.createPARforMultipleUsersController);

router.post(
    '/api/routine/progression/multi',
    [isLogin, isAdmin],
    RoutineController.createProgressionForMultipleUsersController
);

router.post(
    '/api/par/:par_id/progression',
    [isLogin, isAdmin],
    RoutineController.createProgressionFromPARController
);

export default router
