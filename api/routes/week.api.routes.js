import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'
import * as ListExercisesController from '../controllers/listExercises.api.controllers.js'
import {isLogin, isAdmin} from '../middleware/auth.middleware.js'

const router = express.Router()

// Semana
router.route('/api/week/:week_id')
    .get([isLogin, isAdmin],RoutineController.findByWeekId)
    .patch([isLogin, isAdmin],RoutineController.editWeek)
    .delete([isLogin, isAdmin],RoutineController.deleteWeek)


//Para crear una semana de la rutina de un usuario
router.route('/api/user/:userId/routine')
    .get(RoutineController.findRoutineByUserId)
    .post(RoutineController.createWeek)

router.route('/api/user/:userId/routine/clon')
    .post(RoutineController.createClonLastWeek)

router.route('/api/user/:userId/routine/par')
    .post(RoutineController.createPAR)

router.route('/api/user/:userId/routine/par/week')
    .post(RoutineController.createPARweek)

// Días 

router.route('/api/week/:week_id/day')
    .post([isLogin, isAdmin],RoutineController.createDay)

//  Día y creación de un ejercicio
router.route('/api/week/:week_id/day/:day_id')
    .patch([isLogin, isAdmin], RoutineController.editDay)
    .post([isLogin,isAdmin],RoutineController.createExercise)
    .delete([isLogin, isAdmin],RoutineController.deleteDay)


// Lista de ejercicios
//Editar un ejercicio

router.route('/api/listExercises')
    .get([isLogin],ListExercisesController.findExercises)


router.route('/api/listExercises/newExercise')
    .post([isLogin, isAdmin],ListExercisesController.createExercise)

export default router