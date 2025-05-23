import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import * as usersController from '../controllers/users.api.controllers.js'
import {isLogin, isAdmin} from '../middleware/auth.middleware.js'

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


//Para crear una semana de la rutina de un usuario
router.route('/api/user/:userId/routine')
    .get(RoutineController.findRoutineByUserId)
    .post([isLogin, isAdmin],RoutineController.createWeek)
    .patch([isLogin],usersController.upsertUserDetails);

router.route('/api/user/:userId/routine/clon')
    .get(usersController.getProfileByUserId)
    .post([isLogin],RoutineController.createClonLastWeek)

router.route('/api/user/:user_id/routine/par/week')
    .post([isLogin, isAdmin],RoutineController.createPARweekInRoutine)


router.route('/api/user/:user_id/routine/par')
    .get([isLogin, isAdmin],RoutineController.getPAR)
    .post([isLogin, isAdmin],RoutineController.createPARweek)

router.route('/api/par/:id_par')
    .put(RoutineController.updatePAR)
    .delete([isLogin, isAdmin],RoutineController.deletePAR)

    router.route('/api/week/:week_id/day')
    .patch([isLogin, isAdmin],RoutineController.editWeekName)
    
router.route('/api/routine/par/multi')
.post(RoutineController.createPARforMultipleUsersController);

router.post(
    '/api/routine/progression/multi', RoutineController.createProgressionForMultipleUsersController
  );

router.post(
    '/api/par/:par_id/progression', RoutineController.createProgressionFromPARController
  );

export default router