import { ObjectId } from 'mongodb'
import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import * as UsersService from '../../services/users.services.js';
import * as RoutineServices from '../../services/routine.services.js'
import * as PARservices from '../../services/PAR.services.js'
import { getJwtSecret, issueSession, sanitizeUser } from '../lib/authSession.js'

//HELPERS 

// Clon profundo seguro (sin JSON.stringify para no romper ObjectId)
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof ObjectId) return new ObjectId(obj.toString());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

// Regenera IDs y normaliza estructuras en TODA la semana
function remapWeekIds(week) {
  const out = deepClone(week);

  // semana
  out._id = new ObjectId();

  // opcional: normalizar visibilidad en clones
  out.visibility = 'visible';

  // dias
  out.routine = (out.routine || []).map((day, dayIdx) => {
    const d = deepClone(day);
    d._id = new ObjectId();
    d.lastEdited = new Date().toISOString();

    // warmup
    if (Array.isArray(d.warmup)) {
      d.warmup = d.warmup.map(w => ({
        ...deepClone(w),
        warmup_id: new ObjectId()
      }));
    }

    // movility (ojo al nombre que usas en DB)
    if (Array.isArray(d.movility)) {
      d.movility = d.movility.map(m => ({
        ...deepClone(m),
        movility_id: new ObjectId()
      }));
    }

    // ejercicios (incluye sueltos / bloques / circuitos)
    if (Array.isArray(d.exercises)) {
      d.exercises = d.exercises.map((ex, exIdx) => remapExerciseLike(ex));
      // Re-enumerar por si hace falta
      d.exercises.forEach((ex, i) => {
        if (ex && typeof ex === 'object') {
          ex.numberExercise = ex.numberExercise ?? (i + 1);
        }
      });
    }

    return d;
  });

  return out;
}

// Normaliza y regenera IDs segun el tipo de estructura
function remapExerciseLike(node) {
  const n = deepClone(node);

  // Ejercicio suelto
  if (n.type === 'exercise') {
    n.exercise_id = new ObjectId();

    // Si name es objeto (aproximaciones/backoff), no tocar el contenido, solo clonar
    if (n.name && typeof n.name === 'object') {
      n.name = deepClone(n.name);
    }
    return n;
  }

  // Bloque
  if (n.type === 'block') {
    n.block_id = new ObjectId();
    n.exercises = Array.isArray(n.exercises)
      ? n.exercises.map(inner => remapExerciseLike(inner))
      : [];
    return n;
  }

  // Circuito a nivel raiz o dentro de bloque (tu codigo no usa 'type' fijo aqui)
  if (Array.isArray(n.circuit)) {
    // Circuito "header"
    n.exercise_id = new ObjectId();          // para identificar el objeto-circuito en si
    n.numberExercise = n.numberExercise ?? 0;
    n.circuit = n.circuit.map(item => ({
      ...deepClone(item),
      // Items del circuito no tienen exercise_id propio; mantene un idRefresh unico
      idRefresh: (item && item.idRefresh) ? item.idRefresh : new ObjectId().toString(),
    }));
    return n;
  }

  // Fallback: si no matchea nada, tratar como ejercicio suelto por seguridad
  n.exercise_id = new ObjectId();
  return n;
}

// Verifica que no existan exercise_id duplicados por dia
function assertNoDuplicateExerciseIdsByDay(week) {
  for (const day of (week.routine || [])) {
    const ids = new Set();
    for (const ex of (day.exercises || [])) {
      collectExerciseIds(ex, ids);
    }
  }
}

function collectExerciseIds(node, idsSet) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'exercise') {
    const idStr = String(node.exercise_id);
    if (idsSet.has(idStr)) {
      const err = new Error(`exercise_id duplicado en el mismo dia: ${idStr}`);
      err.status = 400;
      throw err;
    }
    idsSet.add(idStr);
    return;
  }

  if (node.type === 'block') {
    for (const inner of (node.exercises || [])) collectExerciseIds(inner, idsSet);
    return;
  }

  if (Array.isArray(node.circuit)) {
    // El "circuito" tiene exercise_id propio (encabezado del circuito)
    if (node.exercise_id) {
      const idStr = String(node.exercise_id);
      if (idsSet.has(idStr)) {
        const err = new Error(`exercise_id duplicado (circuito) en el mismo dia: ${idStr}`);
        err.status = 400;
        throw err;
      }
      idsSet.add(idStr);
    }
    // Items del circuito NO suman exercise_id (tienen idRefresh)
    return;
  }
}

const toPlainId = (value) => {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (value instanceof ObjectId) return value.toString();
  if (typeof value === 'object' && '$oid' in value) return value.$oid;
  return value.toString ? value.toString() : value;
};

const serializeExercise = (exercise = {}) => {
  const base = { ...exercise, exercise_id: toPlainId(exercise.exercise_id) };

  if (exercise.type === 'block') {
    base.block_id = toPlainId(exercise.block_id);
    base.exercises = (exercise.exercises || []).map(serializeExercise);
    return base;
  }

  if (Array.isArray(exercise.circuit)) {
    base.circuit = exercise.circuit.map(item => ({ ...item }));
  }

  return base;
};

const serializeDay = (day = {}) => ({
  ...day,
  _id: toPlainId(day._id),
  exercises: (day.exercises || []).map(serializeExercise),
  warmup: (day.warmup || []).map(w => ({ ...w, warmup_id: toPlainId(w.warmup_id) })),
  movility: (day.movility || []).map(m => ({ ...m, movility_id: toPlainId(m.movility_id) }))
});

const serializeRoutineDoc = (doc = {}) => ({
  ...doc,
  _id: toPlainId(doc._id),
  user_id: toPlainId(doc.user_id),
  parent_par_id: toPlainId(doc.parent_par_id),
  block_id: toPlainId(doc.block_id),
  routine: (doc.routine || []).map(serializeDay)
});

const serializeMany = (docs = []) => docs.map(serializeRoutineDoc);


// =================== LIST / FIND ===================

function findAll(req, res){
  const filter = {}
  if(req.query.rutina){
      filter.rutina = req.query.rutina
  }
  RoutineServices.getRoutine(filter)
      .then(function(week){
          res.status(200).json(serializeMany(week))
      })
}

function findByWeekId(req, res){
  const week_id = req.params.week_id
  RoutineServices.getRoutineById(week_id)
      .then(function(day){
          if(day){
              res.status(200).json(serializeMany(day));
          } else{
              res.status(404).json({message: "Dia no encontrado."})
          }
      })
}

function getLastWeeksByUserIds(req, res) {
  // ids=uid1,uid2,uid3
  const idsParam = (req.query.ids || '').trim();
  if (!idsParam) {
    return res.status(400).json({ message: "Parametro 'ids' requerido (separado por comas)." });
  }

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

  let objectIds;
  try {
    objectIds = ids.map(id => new ObjectId(id));
  } catch (e) {
    return res.status(400).json({ message: "Alguno de los ids no es un ObjectId valido." });
  }

  RoutineServices.getLastWeekCreatedAtByUserIds(objectIds)
    .then(rows => res.status(200).json(rows)) // [{ user_id, created_at }]
    .catch(err => res.status(500).json({ message: "Error al obtener ultimas semanas.", error: err?.message }));
}

function findRoutineByUserId(req, res){
  const id = req.params.userId
  RoutineServices.getRoutineByUserId(id)
      .then(function(day){
          if(day){
              res.status(200).json(serializeMany(day));
          } else{
              res.status(404).json({message: "Rutina no encontrada."})
          }
      })
}

// =================== CREATE / CLONE ===================

function createWeek(req, res){
  const user_id = req.params.userId
  const firstDay = "Dia 1"

  const week = {
      name: req.body.name,
      // si queres meter visibility por default:
      visibility: req.body.visibility || 'visible',
      routine: [
          {name: firstDay,
          exercises: [],
          _id: new ObjectId()}
      ]
  }

  RoutineServices.createWeek(week,user_id)
      .then(function(week){
          res.status(201).json(serializeRoutineDoc(week));
      })
}

async function createClonLastWeek(req, res) {
  try {
    const user_id = req.params.userId;
    const { fecha } = req.body;

    // Traemos la rutina actual (asumis orden DESC en servicio)
    const data = await RoutineServices.getRoutineByUserId(user_id);
    if (!data || !data.length) {
      return res.status(404).json({ message: 'El usuario no tiene semanas previas para clonar.' });
    }

    // !No mutar! - clonar profundo y luego regenerar IDs
    const lastWeek = data[0];
    let draft = remapWeekIds(lastWeek);

    // Nombre segun modo
    if (fecha === 'isDate') {
      draft.name = `Semana del ${new Date().toLocaleDateString()}`;
    } else {
      draft.name = `Semana ${data.length + 1}`;
    }

    // Validacion de integridad: no permitir exercise_id repetidos por dia
    assertNoDuplicateExerciseIdsByDay(draft);

    // Guardar
    const saved = await RoutineServices.createWeek(draft, user_id);
    return res.status(201).json(serializeRoutineDoc(saved));
  } catch (err) {
    console.error('Error en createClonLastWeek:', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Error interno' });
  }
}

// =================== UPDATE ===================

async function editWeek(req, res) {
  const weekID = req.params.week_id;
  const payload = req.body;

  try {
    // ✅ CASO 1: Actualizacion tradicional (array = rutina semanal)
    if (Array.isArray(payload)) {
      await RoutineServices.editWeek(weekID, payload);
      const updated = await RoutineServices.getRoutineById(weekID);
      if (!updated) return res.status(404).json({ message: "Week not found." });
      const serialized = Array.isArray(updated) ? serializeMany(updated) : serializeRoutineDoc(updated);
      return res.status(200).json({ weekData: serialized });

    }

    // ✅ CASO 2: Actualizar bloque de UNA semana
    if (payload.week_id && payload.block) {
      await RoutineServices.updateBlockOfWeek(payload.week_id, payload.block);
      return res.status(200).json({ message: 'Bloque actualizado' });
    }

    // ✅ CASO 3: Actualizar bloques de VARIAS semanas
    if (Array.isArray(payload.blocks)) {
      const updates = await Promise.all(
        payload.blocks.map(entry => {
          if (!entry.week_id || !entry.block) return null;
          return RoutineServices.updateBlockOfWeek(entry.week_id, entry.block);
        })
      );
      return res.status(200).json({ message: 'Bloques multiples actualizados', modified: updates.length });
    }

    // ❌ Payload invalido
    return res.status(400).json({ message: "Formato de actualizacion no valido." });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error al actualizar semana(s).", error: error.message });
  }
}

// controller.js
async function updateWeekProperties(req, res) {
  const weekID = req.params.week_id;
  const payload = req.body;

  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ message: 'Debe enviar un objeto con propiedades a actualizar.' });
    }

    // Whitelist de campos top-level
    const ALLOWED = ['visibility', 'name', 'block', 'block_id', 'tags', 'visible_at', 'comments'];

    // Filtrar el payload por la whitelist
    const partial = Object.keys(payload).reduce((acc, key) => {
      if (ALLOWED.includes(key)) acc[key] = payload[key];
      return acc;
    }, {});

    // --- Normalizacion segura de comments (PRESERVA mode y days) ---
    if ('comments' in partial) {
      partial.comments = normalizeComments(partial.comments);
    }

    // Si llega visibility, el server define visible_at (fuente de verdad)
    if ('visibility' in partial) {
      partial.visible_at = partial.visibility === 'visible' ? new Date() : null;
    }

    if (!Object.keys(partial).length) {
      return res.status(400).json({ message: 'Ninguna propiedad valida para actualizar.' });
    }

    await RoutineServices.updateWeekFields(weekID, partial, ALLOWED);

    const updated = await RoutineServices.getRoutineById(weekID);
    return res.status(200).json({ message: 'Semana actualizada', week: updated ? serializeRoutineDoc(updated[0] || updated) : null });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al actualizar propiedades.', error: error.message });
  }
}

/**
 * Normaliza comments aceptando:
 * - modo libre: { title?, description?, mode: "free" }
 * - modo dias:  { title?, mode: "days", days: Array|Object, daysMap?: Object }
 * 
 * Soporta:
 * - days como array: [{dayId, text, label?}]
 * - days como objeto: { [dayId]: text }
 * - daysMap como objeto alternativo
 */
function normalizeComments(c) {
  const safeStr = (v, def = '') => (typeof v === 'string' ? v : def);
  const title = (safeStr(c?.title, '').trim()) || 'Comentarios semanales';
  const description = safeStr(c?.description, '');

  const mode = c?.mode === 'days' ? 'days' : 'free';

  if (mode === 'free') {
    return {
      title,
      description,
      mode: 'free'
    };
  }

  // --- mode: 'days' ---
  // 1) priorizamos array; si no, objeto (days o daysMap)
  let daysArr = [];

  if (Array.isArray(c?.days)) {
    daysArr = c.days
      .map(it => ({
        dayId: String(it?.dayId ?? '').trim(),
        label: typeof it?.label === 'string' ? it.label : undefined,
        text: safeStr(it?.text, '')
      }))
      .filter(it => it.dayId.length > 0);
  } else if (c?.days && typeof c.days === 'object') {
    daysArr = Object.keys(c.days).map(k => ({
      dayId: String(k),
      text: safeStr(c.days[k], '')
    }));
  } else if (c?.daysMap && typeof c.daysMap === 'object') {
    daysArr = Object.keys(c.daysMap).map(k => ({
      dayId: String(k),
      text: safeStr(c.daysMap[k], '')
    }));
  }

  // daysMap derivado (opcional, util para lecturas rapidas)
  const daysMap = daysArr.reduce((acc, it) => {
    acc[it.dayId] = it.text;
    return acc;
  }, {});

  return {
    title,
    description, // por si queres usarla ademas del modo dias
    mode: 'days',
    days: daysArr,
    daysMap
  };
}




function editWeekName(req, res){
  const weekID = req.params.week_id
  const newWeek = {}
  if(req.body.name){
      newWeek.name = req.body.name
  } 
  RoutineServices.editWeekName(weekID, newWeek)
      .then(function(){
          return RoutineServices.getRoutineById(weekID)
      })
      .then(function(weekID) {
          if(weekID){
              res.status(200).json({ weekID: serializeMany(weekID) })
          } else {
              res.status(404).json({ message: "Ejercicio no encontrado."})
          }
      })
}

// =================== DELETE ===================

function deleteWeek(req, res) {
  const week_id = req.params.week_id
  RoutineServices.deleteWeek(week_id)
      .then(() => {
          res.json({ message: 'Semana eliminada' })
      })
      .catch(err => {
          res.status(500).json({ message: err.message })
      })
}

// =================== DAYS / EXERCISES / WARMUP (tal cual los tenias) ===================

function createDay(req, res){
  const week_id = req.params.week_id
  const day = {
      name: req.body.name,
      exercises: [],
      _id: new ObjectId()
  }
  RoutineServices.createDay(day,week_id)
      .then(function(day){
          res.status(201).json(day)
      })
}

function editDay(req, res){
  const weekID = req.params.week_id
  const dayID = req.params.day_id
  const newName = req.body.name
  RoutineServices.editDay(weekID, dayID, newName)
      .then(function(){
          return RoutineServices.getRoutineById(weekID)
      })
      .then(function(dayID) {
          if(dayID){
              res.status(200).json({dayID})
          } else {
              res.status(404).json({ message: "Ejercicio no encontrado."})
          }
      })
}

function deleteDay(req, res) {
  const week_id = req.params.week_id
  const day_id = req.params.day_id
  RoutineServices.deleteDay(week_id,day_id)
      .then(() => {
          res.json({ message: 'Dia eliminado' })
      })
      .catch(err => {
          res.status(500).json({ message: err.message })
      })
}

async function findExercises(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id
  const exercise = await RoutineServices.findExercises(week_id,day_id)
  res.status(200).json(exercise)
}

async function createCircuit(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id

  RoutineServices.getRoutineById(week_id)
      .then(data => {
              let days = data[0].routine
              let indexDay = days.findIndex(dia => dia._id == day_id)
              let ultimoIndex = days[indexDay].exercises.length + 1
              
              let circuit = {}

              if(req.body){
                  circuit = req.body
                  circuit.numberExercise = ultimoIndex
                  circuit.valueExercise = ultimoIndex
              } 

              RoutineServices.createExercise(week_id,day_id, circuit)
                  .then(data => {
                      res.status(201).json(data)
                  })
              
      })
}

function editById(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id

  let exercise = {}
  if(req.body){
      exercise = req.body
  }

  RoutineServices.editExercise(week_id, day_id, exercise)
      .then(function(exercise) {
          if(exercise){
              res.status(200).json({exercise})
          } else {
              res.status(404).json({ message: "Ejercicio no encontrado."})
          }
      })
}

function editExerciseInCircuit(req, res) {
  const week_id = req.params.week_id;
  const day_id = req.params.day_id;
  const exercise_id = req.params.exercise_id;

  const exercise = {};

  if (req.body.type) {
      exercise.type = req.body.type;
  }
  if (req.body.typeOfSets) {
      exercise.typeOfSets = req.body.typeOfSets;
  }
  if (req.body.circuit) {
      exercise.circuit = req.body.circuit;
  }
  if (req.body.notas) {
      exercise.notas = req.body.notas;
  }
  if (req.body.numberExercise) {
      exercise.numberExercise = req.body.numberExercise;
  }
  if (req.body.valueExercise) {
      exercise.valueExercise = req.body.valueExercise;
  }

  RoutineServices.editExerciseInAmrap(week_id, day_id, exercise_id, exercise)
      .then(function(exercise) {
          if (exercise) {
              res.status(200).json({ exercise });
          } else {
              res.status(404).json({ message: "Ejercicio no encontrado." });
          }
      })
      .catch(function(error) {
          res.status(500).json({ message: error.message });
      });
}

async function deleteExercise(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id
  const exercise_id = req.params.exercise_id
  const deleteEx = await RoutineServices.deleteExercise(week_id, day_id, exercise_id)
  res.status(200).json(deleteEx)
}

// BLOQUE DE MOVILIDAD/ENTRADA EN CALOR

async function findWarmup(req, res){
  const week_id = req.params.week_id
  const warmup_id = req.params.warmup_id
  const exercise = await RoutineServices.findWarmUp(week_id,warmup_id)
  res.status(200).json(exercise)
}

async function createWarmUp(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id

  const warmUp = {
      name: req.body.name,
      sets: req.body.sets,
      reps: req.body.reps,
      video: req.body.video,
      peso: req.body.peso,
      notas: req.body.notas,
      numberWarmup: req.body.numberWarmup,
      valueWarmup: req.body.warmup
  }
  const routine = await RoutineServices.createWarmUp(week_id,day_id, warmUp)
  res.status(201).json(routine)
}

function editWarmUp(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id

  let warmUp = {}
  if(req.body){
      warmUp = req.body
  }

  RoutineServices.editWarmUp(week_id, day_id, warmUp)
      .then(function(warmUp) {
          if(warmUp){
              res.status(200).json({warmUp})
          } else {
              res.status(404).json({ message: "Warm up no encontrado."})
          }
      })
}

async function deletewarmUp(req, res){
  const week_id = req.params.week_id
  const day_id = req.params.day_id
  const warmup_id = req.params.warmup_id
  const deleteEx = await RoutineServices.deleteWarmup(week_id, day_id, warmup_id)
  res.status(200).json(deleteEx)
}

// PAR

function getPAR(req, res){
  const user_id = req.params.user_id
  PARservices.getPAR(user_id)
      .then(function(user){
          if(user){
              res.status(200).json(serializeMany(user))
          } else{
              res.status(404).json({message: "Dia no encontrado."})
          }
      })
}

function updatePAR(req, res) {
  const id_par = req.params.id_par;
  const updatedPAR = req.body;
  PARservices.updatePAR(id_par, updatedPAR)
      .then((result) => {
          res.status(200).json(result);
      })
      .catch((err) => {
          res.status(500).json({ error: err.message });
      });
}

function deletePAR(req, res) {
  const id_par = req.params.id_par;
  PARservices.deletePAR(id_par)
      .then((result) => {
          res.status(200).json(result);
      })
      .catch((err) => {
          res.status(500).json({ error: err.message });
      });
}

function createPARweek(req, res){
  const user_id = req.params.user_id
  console.log(req.body)
  const week = {
      name: req.body.name,
      routine: [{}],
      category: req.body.category
  }
  if(req.body.routine){
      week.routine = req.body.routine
  } 
  PARservices.createPAR(week,user_id)
      .then((data) => {
          res.status(201).json(serializeRoutineDoc(data))
      })
}

function createPARweekInRoutine(req, res){
  const user_id = req.params.user_id
  RoutineServices.getRoutineByUserId(user_id) 
      .then((data) =>{
          const nameParWeek = `Semana ${data.length + 1}`
          const week = {
              name: nameParWeek,
              routine: [{}],
              block: req.body.block
          }
          if(req.body.routine){
              week.routine = req.body.routine
          } 
          RoutineServices.createWeek(week, user_id, null, { templateAssignment: true })
              .then((data) => {
                  res.status(201).json(serializeRoutineDoc(data))
              })
      })
} 

function createWeekForMany(req, res) {
  const userIds = req.body.user_ids; 
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: "Debe enviar un arreglo de user_ids." });
  }
  
  const week = {
    name: req.body.name,
    routine: req.body.routine || [{}]
  };

  RoutineServices.createWeekForMany(week, userIds)
    .then((data) => {
      res.status(201).json(serializeMany(data));
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
}

function createPARforMultipleUsersController(req, res) {
  const user_ids = req.body.user_ids;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ message: "Debes enviar al menos un user_id en el arreglo 'user_ids'" });
  }

  const week = {
    name: req.body.name,
    routine: req.body.routine || [{}]
  };

  RoutineServices.createPARforMultipleUsers(week, user_ids)
    .then((data) => {
      res.status(201).json(serializeMany(data));
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
}

async function createProgressionForMultipleUsersController(req, res) {
  const { template, user_ids } = req.body;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ message: 'Debes enviar un arreglo de user_ids.' });
  }
  
  try {
    const newWeeks = await RoutineServices.createProgressionForMultipleUsers(template, user_ids);
    res.status(201).json(serializeMany(newWeeks));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createProgressionFromPARController(req, res) {
  const parId = req.params.par_id;
  try {
    const newPAR = await PARservices.createProgressionFromPAR(parId);
    res.status(201).json(serializeRoutineDoc(newPAR));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// BLOCKS

import * as BlockService from '../../services/block.services.js'

async function getBlocksByUser(req, res) {
  const { userId } = req.params
  const blocks = await BlockService.findByUserId(userId)
  res.status(200).json(blocks)
}

async function getBlockById(req, res) {
  const block = await BlockService.findById(req.params.blockId)
  res.status(200).json(block)
}

async function editBlock(req, res) {
  const updated = await BlockService.updateBlock(req.params.blockId, req.body)
  res.status(200).json(updated)
}

async function deleteBlock(req, res) {
  await BlockService.deleteBlock(req.params.blockId)
  res.status(204).send()
}

async function cloneBlock(req, res) {
  const { blockId, userId } = req.params
  const result = await BlockService.cloneBlock(blockId, userId)
  res.status(201).json(result)
}

async function generateUserQR(req, res) {
  const { userId } = req.params;

  try {
    const user = await UsersService.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const ACCESS_SECRET = getJwtSecret();

    // ✅ Token QR corto + marcado + id string
    const token = jwt.sign(
      { id: user._id.toString(), purpose: 'qr' },
      ACCESS_SECRET,
      { expiresIn: '10m' }
    );

    // URL del QR (front)
    const base = process.env.QR_LOGIN_URL || 'https://planificaciontom.com/qr-login';
    const qrData = `${base}?token=${encodeURIComponent(token)}`;

    const qrImage = await QRCode.toDataURL(qrData);

    res.status(200).json({ qrImage, token });
  } catch (error) {
    res.status(500).json({ message: "Error al generar el QR.", error: error.message });
  }
}

// Inicia sesion usando un token del QR
async function loginWithQR(req, res) {
  const { token } = req.body;

  try {
    const ACCESS_SECRET = getJwtSecret();

    // ✅ Valida token QR
    const decoded = jwt.verify(token, ACCESS_SECRET);

    // ✅ Asegura que sea token QR
    if (decoded?.purpose !== 'qr') {
      return res.status(400).json({ message: "Token invalido (purpose)." });
    }

    const userId = String(decoded.id);

    const user = await UsersService.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const { accessToken } = await issueSession(res, user)

    res.status(200).json({ token: accessToken, user: sanitizeUser(user) });
  } catch (error) {
    res.status(400).json({ message: "Token invalido o expirado.", error: error.message });
  }
}

export {
  findAll,
  createWeek,
  createClonLastWeek,
  findByWeekId,
  getLastWeeksByUserIds,
  deleteWeek,
  editWeek,
  editWeekName,
  findRoutineByUserId,

  createDay,
  deleteDay,
  editDay,

  findExercises,
  createCircuit,
  editExerciseInCircuit,
  editById,
  deleteExercise,

  findWarmup,
  createWarmUp,
  editWarmUp,
  deletewarmUp,

  getPAR,
  updatePAR,
  deletePAR,
  createPARweek,
  createPARweekInRoutine,
  createWeekForMany,
  createPARforMultipleUsersController,
  createProgressionForMultipleUsersController,
  createProgressionFromPARController,

  // NUEVO
  updateWeekProperties,

  generateUserQR,
  loginWithQR,

  getBlocksByUser,
  getBlockById,
  editBlock,
  deleteBlock,
  cloneBlock
}
