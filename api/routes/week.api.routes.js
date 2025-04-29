import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import * as usersController from '../controllers/users.api.controllers.js'
import {isLogin, isAdmin} from '../middleware/auth.middleware.js'

const router = express.Router()

// Semana
router.route('/api/week/:week_id')
    .get([isLogin], RoutineController.findByWeekId)
    .patch([isLogin, isAdmin], RoutineController.editWeek)
    .delete([isLogin, isAdmin],RoutineController.deleteWeek)


//Para crear una semana de la rutina de un usuario
router.route('/api/user/:userId/routine')
    .get(RoutineController.findRoutineByUserId)
    .post([isLogin, isAdmin],RoutineController.createWeek)
    .patch(usersController.upsertUserDetails);

router.route('/api/user/:userId/routine/clon')
    .get(usersController.getProfileByUserId)
    .post([isLogin],RoutineController.createClonLastWeek)

router.route('/api/user/:user_id/routine/par/week')
    .post([isLogin, isAdmin],RoutineController.createPARweekInRoutine)




export default router