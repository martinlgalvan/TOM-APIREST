/**
 * Datos del panel interno. Solo lectura: lo que edita cuentas vive aparte.
 *
 * Todo se calcula con agregaciones en la base y no trayendo documentos a
 * memoria: la coleccion de rutinas pesa mas de 100 MB y traerla entera para
 * contarla tumbaria la funcion.
 */
import { ObjectId } from 'mongodb'
import { client, db } from './db.js'

const users = db.collection('Users')
const routine = db.collection('Routine')

/* Las fechas viejas se guardaron como { fecha: "DD/MM/AAAA", hora: "..." } y
   las nuevas como Date. Esta expresion devuelve una fecha real en los dos
   casos, y null cuando no hay con que. */
function fechaReal(campo) {
  return {
    $switch: {
      branches: [
        { case: { $eq: [{ $type: `$${campo}` }, 'date'] }, then: `$${campo}` },
        {
          case: { $eq: [{ $type: `$${campo}` }, 'string'] },
          then: { $dateFromString: { dateString: `$${campo}`, onError: null, onNull: null } }
        },
        {
          case: { $eq: [{ $type: `$${campo}.fecha` }, 'string'] },
          then: {
            $dateFromString: {
              dateString: `$${campo}.fecha`,
              format: '%d/%m/%Y',
              timezone: 'America/Argentina/Buenos_Aires',
              onError: null,
              onNull: null
            }
          }
        }
      ],
      default: null
    }
  }
}

/**
 * Negocio: cuantos entrenadores hay por plan y cuantos estan al dia.
 */
async function metricasDeNegocio() {
  await client.connect()

  const porPlan = await users.aggregate([
    { $match: { role: 'admin' } },
    {
      $group: {
        _id: { $ifNull: ['$plan', 'Sin plan'] },
        total: { $sum: 1 },
        pagos: { $sum: { $cond: [{ $eq: ['$isPlanPaid', true] }, 1, 0] } }
      }
    },
    { $sort: { total: -1 } }
  ]).toArray()

  const altasPorMes = await users.aggregate([
    { $match: { role: 'admin' } },
    { $addFields: { _alta: fechaReal('created_at') } },
    { $match: { _alta: { $ne: null } } },
    { $group: { _id: { $dateToString: { date: '$_alta', format: '%Y-%m' } }, total: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 12 }
  ]).toArray()

  return {
    porPlan: porPlan.map((p) => ({ plan: p._id, entrenadores: p.total, pagos: p.pagos })),
    altasPorMes: altasPorMes.map((m) => ({ mes: m._id, altas: m.total })).reverse()
  }
}

/**
 * Uso real: quien tiene alumnos, quien viene cargando rutinas y quien no
 * aparece hace rato.
 */
async function metricasDeUso() {
  await client.connect()

  const alumnosPorEntrenador = await users.aggregate([
    { $match: { role: 'common', entrenador_id: { $ne: null } } },
    { $group: { _id: '$entrenador_id', alumnos: { $sum: 1 } } },
    { $sort: { alumnos: -1 } }
  ]).toArray()

  const rutinasPorMes = await routine.aggregate([
    { $addFields: { _cuando: fechaReal('created_at') } },
    { $match: { _cuando: { $ne: null } } },
    { $group: { _id: { $dateToString: { date: '$_cuando', format: '%Y-%m' } }, total: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 12 }
  ]).toArray()

  /* Ultima actividad de cada entrenador: la semana mas nueva que haya cargado
     a cualquiera de sus alumnos. */
  const ultimaActividad = await users.aggregate([
    { $match: { role: 'common', entrenador_id: { $ne: null } } },
    { $lookup: { from: 'Routine', localField: '_id', foreignField: 'user_id', as: 'semanas' } },
    { $unwind: { path: '$semanas', preserveNullAndEmptyArrays: false } },
    { $addFields: { _cuando: { $ifNull: ['$semanas.updated_at', '$semanas.timestamp'] } } },
    { $match: { _cuando: { $ne: null } } },
    { $group: { _id: '$entrenador_id', ultima: { $max: '$_cuando' } } }
  ]).toArray()

  const totalEntrenadores = await users.countDocuments({ role: 'admin' })
  const conAlumnos = alumnosPorEntrenador.length

  return {
    totalEntrenadores,
    entrenadoresConAlumnos: conAlumnos,
    entrenadoresSinAlumnos: totalEntrenadores - conAlumnos,
    totalAlumnos: await users.countDocuments({ role: 'common' }),
    rutinasPorMes: rutinasPorMes.map((m) => ({ mes: m._id, rutinas: m.total })).reverse(),
    alumnosPorEntrenador: alumnosPorEntrenador.map((e) => ({
      entrenador_id: String(e._id),
      alumnos: e.alumnos,
      ultimaActividad: ultimaActividad.find((u) => String(u._id) === String(e._id))?.ultima || null
    }))
  }
}

/**
 * Salud de los datos: lo que veniamos mirando a mano.
 */
async function metricasDeDatos() {
  await client.connect()

  const totalRutinas = await routine.countDocuments({})

  const duenos = (await routine.distinct('user_id')).filter(Boolean)
  const vivos = new Set(
    (await users.find({ _id: { $in: duenos } }).project({ _id: 1 }).toArray()).map((u) => String(u._id))
  )
  const sinDueno = duenos.filter((d) => !vivos.has(String(d)))
  const rutinasHuerfanas = sinDueno.length
    ? await routine.countDocuments({ user_id: { $in: sinDueno } })
    : 0

  const alumnosConRutina = new Set(duenos.map(String))
  const totalAlumnos = await users.countDocuments({ role: 'common' })
  const alumnosSinRutina = await users.countDocuments({
    role: 'common',
    _id: { $nin: [...alumnosConRutina].map((id) => new ObjectId(id)) }
  })

  const stats = await db.command({ collStats: 'Routine' }).catch(() => null)

  return {
    totalRutinas,
    rutinasHuerfanas,
    alumnosDeBaja: sinDueno.length,
    totalAlumnos,
    alumnosSinRutina,
    rutinasSinFechaDeEdicion: await routine.countDocuments({ updated_at: { $exists: false } }),
    tamanoRutinasMB: stats ? Number((stats.size / 1048576).toFixed(1)) : null
  }
}

/**
 * La lista de entrenadores del panel, con lo que hace falta para administrarlos.
 * Nunca devuelve la contrasena.
 */
async function listarEntrenadores() {
  await client.connect()

  const entrenadores = await users
    .find({ role: 'admin' })
    .project({ password: 0 })
    .sort({ name: 1 })
    .toArray()

  const conteo = await users.aggregate([
    { $match: { role: 'common', entrenador_id: { $ne: null } } },
    { $group: { _id: '$entrenador_id', alumnos: { $sum: 1 } } }
  ]).toArray()

  return entrenadores.map((e) => ({
    ...e,
    alumnos: conteo.find((c) => String(c._id) === String(e._id))?.alumnos || 0
  }))
}

export { metricasDeNegocio, metricasDeUso, metricasDeDatos, listarEntrenadores }
