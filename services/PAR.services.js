import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const options = { keepAlive: true };

const client = new MongoClient(process.env.MONGODB_URI, options);
const db = client.db('TOM');
const par = db.collection('PAR');

// ---------- Utils ----------
async function ensureConn() {
  if (!client.topology || client.topology.isDestroyed()) {
    await client.connect();
  }
}

export async function closePARServiceConnectionForTests() {
  try {
    await client.close();
  } catch {
    // noop
  }
}

function plainId(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof ObjectId) return value.toString();
  if (typeof value === 'object' && '$oid' in value) return String(value.$oid || '');
  return value.toString ? value.toString() : String(value);
}

function firstPlainId(...values) {
  return values.map(plainId).find(Boolean) || '';
}

function syntheticSource(prefix, parentSource, index) {
  return `${prefix}:${parentSource || 'root'}:${index}`;
}

function toObjectIdOrNull(value) {
  const id = plainId(value);
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function resolveWeekBlockFields(week = {}) {
  if (Object.prototype.hasOwnProperty.call(week, 'block')) {
    if (week.block == null) {
      return { block: null, block_id: null };
    }

    return {
      block: { ...week.block },
      block_id: toObjectIdOrNull(week.block_id ?? week.block?._id ?? week.block?.block_id)
    };
  }

  if (Object.prototype.hasOwnProperty.call(week, 'block_id')) {
    return {
      block: week.block ?? null,
      block_id: toObjectIdOrNull(week.block_id)
    };
  }

  return {};
}

/**
 * Normaliza nombre de keys relacionadas a movilidad:
 * - Si el template trae "mobility", lo mapeamos a "movility".
 * - Si trae ambas, priorizamos "movility".
 */
function normalizeMovilityKeys(day) {
  const d = { ...day };

  if (d.mobility && !d.movility) {
    d.movility = d.mobility;
  }
  delete d.mobility; // evitamos tener ambas

  return d;
}

function cloneExerciseForProgression(exercise, parentSource, index) {
  const exCopy = { ...exercise };

  if (typeof exCopy.name === 'object' && exCopy.name !== null) {
    exCopy.name = { ...exCopy.name };
  }

  if (exCopy.type === 'block') {
    const blockSource =
      firstPlainId(exCopy.source_block_id, exCopy.template_block_id, exCopy.original_block_id, exCopy.block_id, exCopy.exercise_id) ||
      syntheticSource('block', parentSource, index);

    exCopy.source_block_id = blockSource;
    exCopy.block_id = new ObjectId();
    exCopy.exercises = Array.isArray(exCopy.exercises)
      ? exCopy.exercises.map((inner, innerIndex) => cloneExerciseForProgression(inner, blockSource, innerIndex))
      : [];
    return exCopy;
  }

  const exerciseSource =
    firstPlainId(exCopy.source_exercise_id, exCopy.template_exercise_id, exCopy.original_exercise_id, exCopy.exercise_id) ||
    syntheticSource('exercise', parentSource, index);

  exCopy.source_exercise_id = exerciseSource;
  exCopy.exercise_id = new ObjectId();

  if (Array.isArray(exCopy.circuit)) {
    exCopy.circuit = exCopy.circuit.map((c, itemIndex) => ({
      ...c,
      source_circuit_item_id:
        firstPlainId(c?.source_circuit_item_id, c?.template_circuit_item_id, c?.original_circuit_item_id, c?.idRefresh) ||
        syntheticSource('circuit-item', exerciseSource, itemIndex),
    }));
  }

  return exCopy;
}

/**
 * Clona un documento PAR (semana) como progresion:
 * - Regenera _id de la semana y _id de cada dia
 * - Regenera exercise_id / warmup_id / movility_id
 * - Mantiene user_id como ObjectId
 * - Normaliza 'mobility' -> 'movility'
 */
function clonePARForProgression(templateDoc) {
  // No usamos JSON.parse/stringify para no romper ObjectId
  const base = { ...templateDoc };

  const clone = {};
  for (const [k, v] of Object.entries(base)) {
    // Copia superficial deliberada; abajo tratamos arrays/objetos necesarios
    clone[k] = v;
  }

  // _id nuevo para la semana clonada
  clone._id = new ObjectId();

  // Asegurar que user_id sea ObjectId
  if (clone.user_id && !(clone.user_id instanceof ObjectId)) {
    try {
      clone.user_id = new ObjectId(clone.user_id);
    } catch {
      // si viniese roto, mejor no tirar; lo dejamos como estaba
    }
  }

  // Limpiamos parent_par_id si viniese del template (lo seteamos afuera)
  delete clone.parent_par_id;

  // Normalizamos/Clonamos dias
  if (Array.isArray(clone.routine)) {
    clone.routine = clone.routine.map((day, dayIndex) => {
      const nd = normalizeMovilityKeys(day);
      const daySource =
        firstPlainId(nd.source_day_id, nd.template_day_id, nd.original_day_id, nd._id) ||
        syntheticSource('day', '', dayIndex);
      const newDay = { ...nd, source_day_id: daySource, _id: new ObjectId() };

      // Exercises
      if (Array.isArray(newDay.exercises)) {
        newDay.exercises = newDay.exercises.map((ex, exIndex) =>
          cloneExerciseForProgression(ex, daySource, exIndex)
        );
      }

      // Warmup
      if (Array.isArray(newDay.warmup)) {
        newDay.warmup = newDay.warmup.map((wu, wuIndex) => ({
          ...wu,
          source_warmup_id:
            firstPlainId(wu.source_warmup_id, wu.template_warmup_id, wu.original_warmup_id, wu.warmup_id) ||
            syntheticSource('warmup', daySource, wuIndex),
          warmup_id: new ObjectId(),
        }));
      }

      // Movility (ya normalizado a 'movility')
      if (Array.isArray(newDay.movility)) {
        newDay.movility = newDay.movility.map((mo, moIndex) => ({
          ...mo,
          source_movility_id:
            firstPlainId(mo.source_movility_id, mo.template_movility_id, mo.original_movility_id, mo.movility_id) ||
            syntheticSource('movility', daySource, moIndex),
          movility_id: new ObjectId(),
        }));
      }

      // Nos aseguramos de no dejar 'mobility'
      delete newDay.mobility;

      return newDay;
    });
  }

  return clone;
}

// ---------- Services ----------

export async function getPAR(id) {
  await ensureConn();
  // Mantenemos tu comportamiento actual: devuelve array de PAR del usuario
  return par
    .find({ $or: [{ user_id: id }, { user_id: new ObjectId(id) }] })
    .toArray();
}

export async function createPAR(PAR, user_id) {
  await ensureConn();

  const now = new Date();
  const newPAR = {
    ...PAR,
    ...resolveWeekBlockFields(PAR),
    user_id: new ObjectId(user_id),
    // Fechas normalizadas
    created_at: now,        // Date usable para agregados/orden
    created_at_local: {     // opcional, para UI legible (mantengo tu estilo previo)
      fecha: now.toLocaleDateString('es-AR'),
      hora: now.toLocaleTimeString('es-AR')
    },
    timestamp: now.getTime()
  };

  const result = await par.insertOne(newPAR);
  // Hidrato _id para que el front lo tenga sin query adicional
  newPAR._id = result.insertedId;
  return newPAR;
}

export async function updatePAR(id, updatedPAR) {
  await ensureConn();

  const filter = { _id: new ObjectId(id) };
  const { _id, ...updatedFields } = updatedPAR;
  Object.assign(updatedFields, resolveWeekBlockFields(updatedFields));

  const update = {
    $set: {
      ...updatedFields,
      updated_at: new Date()
    }
  };

  const result = await par.updateOne(filter, update);
  if (result.matchedCount === 0) {
    throw new Error('El PAR no fue encontrado.');
  }
  // Conservamos tu contrato actual de respuesta
  return { message: 'PAR actualizado exitosamente' };
}

export async function deletePAR(id) {
  await ensureConn();

  const filter = { _id: new ObjectId(id) };
  const result = await par.deleteOne(filter);
  if (result.deletedCount === 0) {
    throw new Error('el PAR no fue encontrada o no se elimino.');
  }
  return { message: 'PAR eliminada exitosamente' };
}

export async function createProgressionFromPAR(parId) {
  await ensureConn();

  const inputId = new ObjectId(parId);

  // 1) Documento base (puede ser madre o una progresion)
  const doc = await par.findOne({ _id: inputId });
  if (!doc) {
    throw new Error('PAR no encontrado');
  }

  // 2) Resolver root (madre)
  const rootId = doc.parent_par_id
    ? (doc.parent_par_id instanceof ObjectId
        ? doc.parent_par_id
        : new ObjectId(doc.parent_par_id))
    : doc._id;

  const rootPar = doc.parent_par_id
    ? await par.findOne({ _id: rootId })
    : doc;

  if (!rootPar) {
    throw new Error('PAR madre no encontrada');
  }

  // 3) Buscar ultima progresion del root (por timestamp desc) asdas
  //    Incluimos compatibilidad por si parent_par_id quedo guardado como string.
  const lastProg = await par
    .find({
      $or: [
        { parent_par_id: rootId },
        { parent_par_id: rootId.toString() }
      ]
    })
    .sort({ timestamp: -1 })
    .limit(1)
    .next();

  // 4) Plantilla: ultima progresion o la madre
  const template = lastProg || rootPar;

  // 5) Contar progresiones existentes del root (ObjectId o string)
  const existingCount = await par.countDocuments({
    $or: [
      { parent_par_id: rootId },
      { parent_par_id: rootId.toString() }
    ]
  });

  // 6) Clonar profundamente y regenerar IDs, normalizar movility
  const clone = clonePARForProgression(template);

  // 7) Atributos de progresion
  const now = new Date();
  clone.parent_par_id = rootId;
  clone.created_at = now; // Date
  clone.created_at_local = {
    fecha: now.toLocaleDateString('es-AR'),
    hora: now.toLocaleTimeString('es-AR')
  };
  clone.timestamp = now.getTime();

  // Nombre base: usamos el nombre de la madre y le agregamos el numero siguiente
  // (por si la madre ya venia con sufijo de progresion).
  const baseName = String(rootPar.name || '').replace(/\s*-\s*Progresion\s+\d+$/i, '');
  clone.name = `${baseName} - Progresion ${existingCount + 1}`;

  // 8) Insertar
  await par.insertOne(clone);
  return clone;
}

export default {
  getPAR,
  createPAR,
  updatePAR,
  deletePAR,
  createProgressionFromPAR,
  closePARServiceConnectionForTests
};
