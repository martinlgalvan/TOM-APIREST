// pushNotifications.js
import webpush from 'web-push';

// Reemplaza estas claves con las que generaste
const publicKey = 'BAkoeYGPjfM34YiwIG_EAXYhKAweaFX1Xh0hAU1hHhEvryswLlMcDgAf9HrVUquQkm33cgZgOvi1QENlA5tP8oU';
const privateKey = 'ddylc_gY90WUVvW2KV_iBxA6jDsS-IYQ3k2sMpv7beE';

webpush.setVapidDetails(
  'martinlgalvan00@gmail.com', // Cambia este correo por uno real
  publicKey,
  privateKey
);

/**
 * Envía una notificación push a la suscripción dada.
 * @param {Object} subscription - Objeto de suscripción obtenido en el front.
 * @param {Object} data - Datos a enviar en la notificación (title, body, icon, url, etc.)
 */
export function sendPushNotification(subscription, data) {
  return webpush.sendNotification(subscription, JSON.stringify(data))
    .then(() => {
      console.log("Notificación enviada exitosamente");
    })
    .catch((error) => {
      console.error("Error enviando notificación:", error);
    });
}
