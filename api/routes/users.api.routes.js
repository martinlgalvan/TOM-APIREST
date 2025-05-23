import express from 'express'
import * as usersController from '../controllers/users.api.controllers.js'
import * as ColumnController from '../controllers/routine.api.controllers.js'


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


//Para encontrar usuarios según el id del entrenador, y crearlos
router.route('/api/users/:idEntrenador')
    .get(usersController.getUsersByEntrenador)
    .post(
       [isLogin, skipForBlocks(isAdmin, checkPlanLimit, isPlanPaid, ValidateRegister)],
        usersController.create
      );

router.route('/api/block/:blockId')
  .get([isLogin, isAdmin], ColumnController.getBlockById)
  .patch([isLogin, isAdmin], ColumnController.editBlock)
  .delete([isLogin, isAdmin], ColumnController.deleteBlock)


//Para encontrar y/o eliminar un usuario
router.route('/api/user/:userId')
    .get([isLogin],usersController.getUserById)
    .delete([isLogin, isAdmin, isPlanPaid],usersController.removeUser)
    .patch([isLogin, isAdmin, isPlanPaid],usersController.addUserProperty)

// Ruta para generar un QR para un usuario específico
router.get('/api/generate-qr/:userId', ColumnController.generateUserQR);

// Ruta para iniciar sesión usando el QR
router.post('/api/qr-login', ColumnController.loginWithQR);

router.route('/api/announcements')
  .post([isLogin, isAdmin], usersController.createAnnouncement);

router.route('/api/announcements/user/:userId')
  .get([isLogin], usersController.getUnreadAnnouncements);

router.route('/api/announcements/:announcementId/read/:userId')
  .post([isLogin], usersController.markAnnouncementRead);

router.route('/api/announcements/:announcementId/views')
  .get([isLogin], usersController.getAnnouncementViews);

  router.route('/api/announcements/:creatorId/views-count')
  .get([isLogin],usersController.getAnnouncementViewCountsByCreator);

  router.get('/api/announcements/creator/:creatorId',
    [isLogin],
    usersController.getAnnouncementsByCreator
  );

  router.get('/api/announcements/:announcementId/viewers',[isLogin], usersController.getAnnouncementViewsWithNames );
  
  // Editar anuncio
  router.patch('/api/announcements/:announcementId',
    [isLogin],
    usersController.editAnnouncement
  );
  
  // Eliminar anuncio
  router.delete('/api/announcements/:announcementId',
    [isLogin],
    usersController.deleteAnnouncement
  );

  router.get('/api/announcements/user/:userId/history',[isLogin], usersController.getAnnouncementsHistory);


export default router