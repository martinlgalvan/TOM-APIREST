// routes/push.api.routes.js
import express from 'express';
import { saveSubscription, getSubscriptionsByUser, deleteSubscription } from './../../services/pushSubscription.services.js';

const router = express.Router();

/**
 * Endpoint para guardar una suscripción.
 * Se espera recibir un objeto de suscripción en el body y, opcionalmente, un userId.
 */
router.post('/api/save-subscription', async (req, res) => {
    console.log("Recibí la petición con body:", req.body);
    try {
        const { subscription, userId } = req.body;
        if (!subscription) {
            return res.status(400).json({ message: 'Falta el objeto de suscripción.' });
        }
        const result = await saveSubscription(subscription, userId);
        res.status(201).json({ message: 'Suscripción guardada correctamente.', data: result });
    } catch (err) {
        res.status(500).json({ message: 'Error al guardar la suscripción.' });
    }
});

/**
 * Endpoint para obtener las suscripciones de un usuario.
 */
router.get('/api/subscriptions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscriptions = await getSubscriptionsByUser(userId);
    res.json({ data: subscriptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener las suscripciones.' });
  }
});

/**
 * Endpoint para eliminar una suscripción.
 */
router.delete('/api/subscription/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteSubscription(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar la suscripción.' });
  }
});

export default router;
