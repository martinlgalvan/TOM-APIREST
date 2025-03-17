// pushSubscription.services.js
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

// Carga las variables de entorno
dotenv.config();

const options = { keepAlive: true };
const client = new MongoClient(process.env.MONGODB_URI, options);
const db = client.db('TOM');
// Definimos la colección "subscriptions"
const subscriptionsCollection = db.collection('subscriptions');

/**
 * Guarda una suscripción de notificaciones push en la base de datos.
 * @param {Object} subscription - Objeto de suscripción recibido del front.
 * @param {string} userId - (Opcional) ID del usuario al que pertenece la suscripción.
 */
async function saveSubscription(subscription, userId) {
    const newSubscription = {
        ...subscription,
        userId: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null,
        createdAt: new Date()
      };
    
  
    console.log("Intentando conectar a MongoDB...");
    return client.connect()
      .then(() => {
        return subscriptionsCollection.insertOne(newSubscription);
      })
      .then(result => {
        return newSubscription;
      })
      .catch(err => {
        throw err;
      });
  }
/**
 * Obtiene las suscripciones asociadas a un usuario.
 * @param {string} userId - ID del usuario.
 */
async function getSubscriptionsByUser(userId) {
  return client.connect()
    .then(() => subscriptionsCollection.find({ userId: new ObjectId(userId) }).toArray());
}

/**
 * Elimina una suscripción por su ID.
 * @param {string} subscriptionId - ID de la suscripción en la base de datos.
 */
async function deleteSubscription(subscriptionId) {
  return client.connect()
    .then(() => subscriptionsCollection.deleteOne({ _id: new ObjectId(subscriptionId) }))
    .then(result => {
      if (result.deletedCount === 0) {
        throw new Error('La suscripción no fue encontrada o no se eliminó.');
      }
      return { message: 'Suscripción eliminada exitosamente' };
    });
}

export {
  saveSubscription,
  getSubscriptionsByUser,
  deleteSubscription
};
