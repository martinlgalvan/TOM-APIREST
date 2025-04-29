import express from 'express'
import * as usersController from '../controllers/users.api.controllers.js'
import * as BlocksController from '../controllers/blocks.api.controller.js'
import * as ColumnController from '../controllers/routine.api.controllers.js'

import { saveSubscription} from './../../services/pushSubscription.services.js';

import {isLogin, isAdmin} from '../middleware/auth.middleware.js'
import {ValidateLogin, ValidateRegister} from '../middleware/validar.middleware.js'
import checkPlanLimit from '../middleware/checkPlanLimit.middleware.js'
import isPlanPaid from '../middleware/isPlanPaid.middleware.js'
import { skipForBlocks } from '../middleware/skipForBlocks.js';

const router = express.Router()


// Sesion
router.route('/api/users/login')
    .post([ValidateLogin], usersController.login)

router.route('/api/users/logout')
    .post(usersController.logout)





export default router