/* Arranque local. La definicion del servidor -CORS, middlewares y rutas- vive
   en api/index.js, que es tambien el punto de entrada de produccion. Antes
   este archivo era una copia completa de aquel, y cualquier arreglo que se
   hiciera en uno no llegaba al otro. Aca solo queda lo propio de correr como
   proceso: las guardas y el listen. */
import app from './api/index.js'

/* Una promesa sin manejar no debe dejar la API caida para todos los usuarios.
   Se registra y se sigue sirviendo. En produccion no aplica: cada invocacion
   es aislada y la plataforma la recicla sola. */
process.on('unhandledRejection', function (motivo) {
  console.error('Promesa sin manejar:', motivo)
})

process.on('uncaughtException', function (error) {
  console.error('Excepcion no capturada:', error)
})

app.listen(2022, function () {
  console.log('server started')
})
