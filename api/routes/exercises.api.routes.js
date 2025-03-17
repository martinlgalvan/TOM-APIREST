import express from 'express'
import * as RoutineController from '../controllers/routine.api.controllers.js'

import {isLogin, isAdmin, userEditor} from '../middleware/auth.middleware.js'

const router = express.Router()


//  Ejercicio
router.route('/api/week/:week_id/day/:day_id/exercise')
    .put([isLogin], RoutineController.editById)


router.route('/api/week/:week_id/day/:day_id')
    .get([isLogin, isAdmin],RoutineController.findExercises)



//Warmup part

router.route('/api/week/:week_id/day/:day_id/warmup')
    .post([isLogin,isAdmin],RoutineController.createWarmUp)

router.route('/api/week/:week_id/warmup/:warmup_id')
    .get([isLogin, isAdmin],RoutineController.findWarmup)

router.route('/api/week/:week_id/day/:day_id/warmup/')
    .put(RoutineController.editWarmUp)

router.route('/api/week/:week_id/day/:day_id/warmup/:warmup_id')
    .delete([isLogin,isAdmin], RoutineController.deletewarmUp)

export default router