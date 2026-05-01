import { MongoClient, ObjectId } from 'mongodb'
import {getDate} from './../date/formatedDate.js'
import dotenv from 'dotenv';

dotenv.config();

const options = { keepAlive: true };

const client = new MongoClient(process.env.MONGODB_URI,options)
const db = client.db('TOM')
const routine = db.collection('Routine')

async function getRoutine(filter){
  const filterQuery = { ...filter }
  if(filterQuery.rutina) {
      filterQuery.rutina = { $regex: filterQuery.rutina}
  }
  return client.connect()
      .then(async function () {
          return routine.find(filterQuery).toArray()
      })
}

async function getRoutineById(id){
  return client.connect()
      .then(function(){
          return routine.find({ _id: new ObjectId(id) }).toArray()
      })
}

async function getLastWeekCreatedAtByUserIds(userObjectIds){
  return client.connect()
    .then(function(){
      return routine.aggregate([
        { $match: { user_id: { $in: userObjectIds } } },
        // Si created_at es Date, esto basta; si fuera string ISO, podes envolver con {$toDate:"$created_at"}.
        { $group: { _id: "$user_id", created_at: { $max: "$created_at" } } },
        { $project: { _id: 0, user_id: "$_id", created_at: 1 } }
      ]).toArray();
    });
}

async function getRoutineByUserId(id) {
  return client.connect()
    .then(function() {
      return routine.find({ user_id: new ObjectId(id) })
      .sort({ "timestamp": -1}).toArray();
    });
} 

async function closeRoutineServiceConnectionForTests() {
  try {
    await client.close();
  } catch {
    // noop
  }
}

async function createDay(day, weekId){
  return client.connect()
      .then(function (){
          return routine.updateOne({ _id: new ObjectId(weekId) }, { $push: {routine: day}})
      })
}

async function deleteDay(week_id, day_id ){
  return client.connect()
      .then(function(){
          return routine.updateOne(
            { _id: new ObjectId(week_id), $or: [{"routine._id" : day_id}, {"routine._id" : new ObjectId(day_id)}] },
            { $pull: { "routine": {$or: [{_id : day_id}, {_id : new ObjectId(day_id)}]} }})
      })
}    

async function createWeek(week, user_id, block_id = null, options = {}) {
  const timestamp = new Date().getTime()
  const weekBlockState = resolveWeekBlockState(week);
  const newWeek = {
    ...week,
    routine: options?.templateAssignment ? prepareRoutineForTemplateAssignment(week?.routine) : week?.routine,
    block: weekBlockState.block,
    user_id: new ObjectId(user_id),
    created_at: getDate(),
    timestamp,
    block_id: block_id ? new ObjectId(block_id) : weekBlockState.block_id
  }
  await client.connect()
  await routine.insertOne(newWeek)
  return newWeek
}

async function createPARforMultipleUsers(PAR, user_ids) {
  const timestamp = new Date().getTime();
  const newPARs = user_ids.map((userId) => ({
    ...PAR,
    routine: prepareRoutineForTemplateAssignment(PAR?.routine),
    ...resolveWeekBlockState(PAR),
    user_id: new ObjectId(userId),
    created_at: getDate(),
    timestamp
  }));
  return client.connect()
    .then(() => {
      return routine.insertMany(newPARs);
    })
    .then(() => {
      return newPARs;
    })
    .catch((err) => {
      throw new Error(`Error al crear PAR para multiples usuarios: ${err.message}`);
    });
}

// === Helpers locales para createProgressionForMultipleUsers ===

// Alinea nombres: si el template trae "mobility", lo mapeamos a "movility".
// Si trae ambas, priorizamos "movility".
function normalizeMovilityKeys(day) {
  const d = { ...day };
  if (d && d.mobility && !d.movility) d.movility = d.mobility;
  delete d.mobility;
  return d;
}

// Convierte posibles variantes de "name" a string para comparar (si viene objeto {name, backoff}).
function keyOfName(nameField) {
  if (typeof nameField === 'string') return nameField.trim();
  if (nameField && typeof nameField === 'object' && typeof nameField.name === 'string') {
    return nameField.name.trim();
  }
  return '';
}

function preserveNameAndApplyTemplateDetails(target, template) {
  if (!target || !template || template.name === undefined) return;

  const baseName = keyOfName(target.name);
  const templateName = keyOfName(template.name);
  const finalName = baseName || templateName;
  const templateMeta = template.name && typeof template.name === 'object' ? template.name : {};
  const targetMeta = target.name && typeof target.name === 'object' ? { ...target.name } : null;
  const hasTemplateBackoff = Array.isArray(templateMeta.backoff);
  const hasTemplateApprox = Array.isArray(templateMeta.approx);

  // Si no habia ejercicio previo del alumno, el ejercicio nuevo conserva el nombre del template.
  if (!baseName && !targetMeta && !hasTemplateBackoff && !hasTemplateApprox) {
    target.name = template.name;
    return;
  }

  if (targetMeta || hasTemplateBackoff || hasTemplateApprox) {
    const nextName = targetMeta || { name: finalName };
    nextName.name = finalName;
    if (hasTemplateBackoff) nextName.backoff = templateMeta.backoff;
    if (hasTemplateApprox) nextName.approx = templateMeta.approx;
    target.name = nextName;
    return;
  }

  if (!target.name && finalName) target.name = finalName;
}

function preservedPlainName(baseName, templateName) {
  return keyOfName(baseName) || keyOfName(templateName) || '';
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
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

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function toObjectIdOrNull(value) {
  const id = plainId(value);
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function resolveWeekBlockState(sourceWeek, fallbackWeek = null) {
  const sourceHasBlock = hasOwn(sourceWeek, 'block');
  const sourceHasBlockId = hasOwn(sourceWeek, 'block_id');
  const fallbackHasBlock = hasOwn(fallbackWeek, 'block');
  const fallbackHasBlockId = hasOwn(fallbackWeek, 'block_id');

  let blockValue;
  let rawBlockId;

  if (sourceHasBlock) {
    blockValue = sourceWeek.block ?? null;
    rawBlockId = sourceWeek.block == null
      ? null
      : firstPlainId(
          sourceWeek.block_id,
          sourceWeek.block?._id,
          sourceWeek.block?.block_id
        );
  } else if (sourceHasBlockId) {
    blockValue = fallbackHasBlock ? clonePlain(fallbackWeek.block) : null;
    rawBlockId = sourceWeek.block_id;
  } else if (fallbackHasBlock) {
    blockValue = fallbackWeek.block ?? null;
    rawBlockId = firstPlainId(
      fallbackWeek.block_id,
      fallbackWeek.block?._id,
      fallbackWeek.block?.block_id
    );
  } else if (fallbackHasBlockId) {
    blockValue = null;
    rawBlockId = fallbackWeek.block_id;
  } else {
    blockValue = null;
    rawBlockId = null;
  }

  return {
    block: blockValue == null ? null : clonePlain(blockValue),
    block_id: toObjectIdOrNull(rawBlockId)
  };
}

function syntheticSource(prefix, parentSource, index) {
  return `${prefix}:${parentSource || 'root'}:${index}`;
}

function stampTemplateExerciseSources(exercise, parentSource, index) {
  const out = clonePlain(exercise);

  if (out.type === 'block') {
    const blockSource =
      firstPlainId(out.source_block_id, out.template_block_id, out.original_block_id, out.block_id, out.exercise_id) ||
      syntheticSource('block', parentSource, index);

    out.source_block_id = blockSource;
    out.exercises = (Array.isArray(out.exercises) ? out.exercises : []).map((inner, innerIndex) =>
      stampTemplateExerciseSources(inner, blockSource, innerIndex)
    );
    return out;
  }

  const exerciseSource =
    firstPlainId(out.source_exercise_id, out.template_exercise_id, out.original_exercise_id, out.exercise_id) ||
    syntheticSource('exercise', parentSource, index);

  out.source_exercise_id = exerciseSource;

  if (Array.isArray(out.circuit)) {
    out.circuit = out.circuit.map((item, itemIndex) => ({
      ...clonePlain(item),
      source_circuit_item_id:
        firstPlainId(item?.source_circuit_item_id, item?.template_circuit_item_id, item?.original_circuit_item_id, item?.idRefresh) ||
        syntheticSource('circuit-item', exerciseSource, itemIndex)
    }));
  }

  return out;
}

function stampTemplateRoutineSources(routineArray) {
  return (Array.isArray(routineArray) ? routineArray : []).map((day, dayIndex) => {
    const out = clonePlain(day);
    const daySource =
      firstPlainId(out.source_day_id, out.template_day_id, out.original_day_id, out._id) ||
      syntheticSource('day', '', dayIndex);

    out.source_day_id = daySource;
    out.exercises = (Array.isArray(out.exercises) ? out.exercises : []).map((ex, exIndex) =>
      stampTemplateExerciseSources(ex, daySource, exIndex)
    );
    out.warmup = (Array.isArray(out.warmup) ? out.warmup : []).map((wu, wuIndex) => ({
      ...clonePlain(wu),
      source_warmup_id:
        firstPlainId(wu?.source_warmup_id, wu?.template_warmup_id, wu?.original_warmup_id, wu?.warmup_id) ||
        syntheticSource('warmup', daySource, wuIndex)
    }));
    out.movility = (Array.isArray(out.movility) ? out.movility : []).map((mob, mobIndex) => ({
      ...clonePlain(mob),
      source_movility_id:
        firstPlainId(mob?.source_movility_id, mob?.template_movility_id, mob?.original_movility_id, mob?.movility_id) ||
        syntheticSource('movility', daySource, mobIndex)
    }));

    return out;
  });
}

function identityValues(element, kind) {
  if (!element || typeof element !== 'object') return [];

  let values = [];
  if (kind === 'exercise') {
    values = element.type === 'block'
      ? [element.source_block_id, element.template_block_id, element.original_block_id, element.block_id, element.exercise_id]
      : [element.source_exercise_id, element.template_exercise_id, element.original_exercise_id, element.exercise_id];
  } else if (kind === 'warmup') {
    values = [element.source_warmup_id, element.template_warmup_id, element.original_warmup_id, element.warmup_id];
  } else if (kind === 'movility') {
    values = [element.source_movility_id, element.template_movility_id, element.original_movility_id, element.movility_id];
  } else if (kind === 'circuit-item') {
    values = [element.source_circuit_item_id, element.template_circuit_item_id, element.original_circuit_item_id, element.idRefresh];
  }

  return values.map(plainId).filter(Boolean);
}

function hasSharedIdentity(templateEl, baseEl, kind) {
  const templateIds = identityValues(templateEl, kind);
  if (!templateIds.length) return false;

  const baseIds = new Set(identityValues(baseEl, kind));
  return templateIds.some((id) => baseIds.has(id));
}

function numberKey(element, kind) {
  if (!element || typeof element !== 'object') return '';
  if (kind === 'exercise' && element.numberExercise != null && element.numberExercise !== '') return String(element.numberExercise);
  if (kind === 'warmup' && element.numberWarmup != null && element.numberWarmup !== '') return String(element.numberWarmup);
  if (kind === 'movility' && element.numberMobility != null && element.numberMobility !== '') return String(element.numberMobility);
  return '';
}

function findUniqueIndex(list, predicate) {
  const matches = [];
  for (let i = 0; i < list.length; i++) {
    if (predicate(list[i], i)) matches.push(i);
  }
  return matches.length === 1 ? matches[0] : -1;
}

// No usamos el nombre como identidad primaria porque cada alumno puede personalizarlo.
function matchIndex(templateEl, baseList, kind, fallbackIndex) {
  if (!Array.isArray(baseList) || !baseList.length) return -1;

  const identityIndex = findUniqueIndex(baseList, (baseEl) => hasSharedIdentity(templateEl, baseEl, kind));
  if (identityIndex >= 0) return identityIndex;

  const tNumber = numberKey(templateEl, kind);
  if (tNumber) {
    const numberIndex = findUniqueIndex(baseList, (baseEl) => numberKey(baseEl, kind) === tNumber);
    if (numberIndex >= 0) return numberIndex;
  }

  if (fallbackIndex < baseList.length) return fallbackIndex;

  const tName = keyOfName(templateEl?.name);
  if (tName) {
    return findUniqueIndex(baseList, (baseEl) => keyOfName(baseEl?.name) === tName);
  }

  return -1;
}

/**
 * Sincroniza una lista (ejercicios/warmup/movility) **guiada por el template**,
 * mergeando campos "suaves" como ya hacias:
 * - Si un item existe en base (match por clave estable) se toma ese como base y se pisan campos con template usando mergeFields.
 * - Si no existe en base, se crea **nuevo** desde template.
 * - No se arrastran "sobrantes" de base que no esten en template (respeta eliminaciones).
 *
 * @param {Array} templList lista del template (en orden final deseado)
 * @param {Array} baseList lista base del usuario (ultima semana)
 * @param {'exercise'|'warmup'|'movility'} kind
 * @param {Function} applyMergeFn callback que recibe (baseItem, templItem) y hace los mergeFields especificos (tu logica existente).
 * @returns {Array} lista sincronizada
 */
function syncByTemplateList(templList, baseList, kind, applyMergeFn) {
  const result = [];
  const safeTempl = Array.isArray(templList) ? templList : [];

  for (let idx = 0; idx < safeTempl.length; idx++) {
    const templItem = safeTempl[idx];
    if (!templItem) continue;

    const baseIdx = matchIndex(templItem, baseList, kind, idx);
    const baseItem = baseIdx >= 0 ? baseList[baseIdx] : {};

    // Copia superficial para poder mutar y luego regenerar IDs
    const merged = JSON.parse(JSON.stringify(baseItem || {}));
    applyMergeFn(merged, templItem);
    result.push(merged);
  }

  return result;
}

function setExerciseSourceFromTemplate(target, template) {
  if (!target || !template) return;

  if (template.type === 'block') {
    target.source_block_id =
      firstPlainId(target.source_block_id, template.source_block_id, template.block_id, target.block_id, template.exercise_id) ||
      target.source_block_id;
    return;
  }

  target.source_exercise_id =
    firstPlainId(target.source_exercise_id, template.source_exercise_id, template.exercise_id, target.exercise_id) ||
    target.source_exercise_id;
}

function setWarmupSourceFromTemplate(target, template) {
  if (!target || !template) return;
  target.source_warmup_id =
    firstPlainId(target.source_warmup_id, template.source_warmup_id, template.warmup_id, target.warmup_id) ||
    target.source_warmup_id;
}

function setMovilitySourceFromTemplate(target, template) {
  if (!target || !template) return;
  target.source_movility_id =
    firstPlainId(target.source_movility_id, template.source_movility_id, template.movility_id, target.movility_id) ||
    target.source_movility_id;
}

function regenerateExerciseRuntimeIds(node) {
  const out = clonePlain(node);

  if (out.type === 'block') {
    out.block_id = new ObjectId();
    out.exercises = (Array.isArray(out.exercises) ? out.exercises : []).map(regenerateExerciseRuntimeIds);
    return out;
  }

  out.exercise_id = new ObjectId();

  if (Array.isArray(out.circuit)) {
    out.circuit = out.circuit.map((item) => ({
      ...clonePlain(item),
      idRefresh: new ObjectId().toString()
    }));
  }

  return out;
}

function regenerateWarmupRuntimeId(warmup) {
  return { ...clonePlain(warmup), warmup_id: new ObjectId() };
}

function regenerateMovilityRuntimeId(movility) {
  return { ...clonePlain(movility), movility_id: new ObjectId() };
}

function prepareRoutineForTemplateAssignment(routineArray) {
  const templRoutine = stampTemplateRoutineSources(routineArray);
  return templRoutine.map((templDay) => {
    const day = normalizeMovilityKeys(templDay);

    return {
      ...clonePlain(day),
      _id: new ObjectId(),
      exercises: (Array.isArray(day.exercises) ? day.exercises : []).map(regenerateExerciseRuntimeIds),
      warmup: (Array.isArray(day.warmup) ? day.warmup : []).map(regenerateWarmupRuntimeId),
      movility: (Array.isArray(day.movility) ? day.movility : []).map(regenerateMovilityRuntimeId),
    };
  });
}


// === Reemplazo completo de tu createProgressionForMultipleUsers ===

async function createProgressionForMultipleUsers(template, user_ids) {
  const timestamp = Date.now();
  await client.connect();
  const newWeeks = [];

  // La estructura final sale del template, pero cada nodo queda marcado con su origen estable.
  const templRoutine = stampTemplateRoutineSources(template?.routine);

  for (const userId of user_ids) {
    const routines = await getRoutineByUserId(userId);
    const lastWeek = routines[0];
    if (!lastWeek) continue;

    // Base clon: mantenemos tu estrategia de clonar la ultima semana
    const clone = JSON.parse(JSON.stringify(lastWeek));
    clone._id = new ObjectId();
    clone.user_id = new ObjectId(userId);
    clone.created_at = getDate();
    clone.timestamp = timestamp;
    clone.name = `Semana ${routines.length + 1}`;
    const weekBlockState = resolveWeekBlockState(template, clone);
    clone.block = weekBlockState.block;
    clone.block_id = weekBlockState.block_id;

    // === SINCRONIZACION DE ESTRUCTURA: la estructura final la dicta el template ===
    // Normalizamos posibles "mobility" -> "movility" en template
    const normalizedTemplDays = templRoutine.map(normalizeMovilityKeys);

    // Armamos nueva lista de dias SOLO a partir del template
    const baseDays = Array.isArray(lastWeek.routine) ? lastWeek.routine.map(normalizeMovilityKeys) : [];
    const newDays = [];

    normalizedTemplDays.forEach((templDay, dayIndex) => {
      // Elegir "baseDay" por mejor match: numberDay > name > indice
      const findBaseDayIndex = (td) => {
        const sourceDayId = firstPlainId(td?.source_day_id, td?._id);
        if (sourceDayId) {
          const i = baseDays.findIndex((bd) =>
            [bd?.source_day_id, bd?.template_day_id, bd?.original_day_id, bd?._id]
              .map(plainId)
              .includes(sourceDayId)
          );
          if (i >= 0) return i;
        }
        // por numberDay
        if (td?.numberDay != null) {
          const i = baseDays.findIndex((bd) => bd?.numberDay === td.numberDay);
          if (i >= 0) return i;
        }
        // por name
        const tName = keyOfName(td?.name);
        if (tName) {
          const i = baseDays.findIndex((bd) => keyOfName(bd?.name) === tName);
          if (i >= 0) return i;
        }
        // fallback por indice
        return dayIndex < baseDays.length ? dayIndex : -1;
      };

      const baseIdx = findBaseDayIndex(templDay);
      const baseDay = baseIdx >= 0 ? baseDays[baseIdx] : {};

      // Copiamos base para mutar
      const day = JSON.parse(JSON.stringify(baseDay || {}));
      day.source_day_id = firstPlainId(day.source_day_id, templDay.source_day_id, templDay._id, day._id) || day.source_day_id;

      // ==== NAME del dia
      if (templDay?.name && String(templDay.name).trim() !== '') {
        day.name = templDay.name;
      }

      // ==== EXERCISES ====
const applyMergeExercise = (ex, templEx) => {
  if (!templEx) return;

  // Campos solo de UI: no se deben persistir
  delete ex.changed;
  delete ex.supSuffix;
  delete ex._origIndex;
  delete ex._origIndexInBlock;

  if (templEx.type === 'block') {
    const baseExercises = Array.isArray(ex.exercises) ? ex.exercises : [];
    setExerciseSourceFromTemplate(ex, templEx);

    ex.type = 'block';
    ex.name = preservedPlainName(ex.name, templEx.name);
    ex.color = templEx.color ?? ex.color;
    ex.notas = templEx.notas ?? ex.notas;
    ex.numberExercise = templEx.numberExercise ?? ex.numberExercise;
    ex.valueExercise = templEx.valueExercise ?? ex.valueExercise;
    ex.exercises = syncByTemplateList(
      templEx.exercises,
      baseExercises,
      'exercise',
      applyMergeExercise
    );
    return;
  }

  const templHasCircuit = Array.isArray(templEx.circuit);
  setExerciseSourceFromTemplate(ex, templEx);

  // Si el template es circuito, la estructura final debe salir del template,
  // pero los nombres cargados por el alumno se preservan por posicion.
  if (templHasCircuit) {
    const baseCircuit = Array.isArray(ex.circuit) ? ex.circuit : [];

    ex.type = templEx.type;
    ex.typeOfSets = templEx.typeOfSets ?? '';
    ex.name = preservedPlainName(ex.name, templEx.name);
    ex.notas = templEx.notas ?? '';
    ex.numberExercise = templEx.numberExercise;
    ex.valueExercise = templEx.valueExercise ?? ex.valueExercise;

    ex.circuit = (templEx.circuit || []).map((item, itemIndex) => {
      const baseIndex = matchIndex(item, baseCircuit, 'circuit-item', itemIndex);
      const baseItem = baseIndex >= 0 ? baseCircuit[baseIndex] : {};
      const sourceItemId =
        firstPlainId(baseItem?.source_circuit_item_id, item?.source_circuit_item_id, item?.idRefresh, baseItem?.idRefresh) ||
        syntheticSource('circuit-item', ex.source_exercise_id, itemIndex);

      return {
        ...clonePlain(baseItem),
        source_circuit_item_id: sourceItemId,
        name: preservedPlainName(baseItem?.name, item?.name),
        reps: item?.reps ?? '',
        peso: item?.peso ?? '',
        video: item?.video ?? baseItem?.video ?? '',
      };
    });

    // Evita basura de ejercicio simple previo
    delete ex.sets;
    delete ex.reps;
    delete ex.peso;
    delete ex.rest;
    delete ex.video;
    return;
  }

  // Si el template NO es circuito, borramos restos de circuito previo
  delete ex.circuit;
  delete ex.typeOfSets;

  mergeFields(ex, templEx, [
    'type', 'sets', 'reps', 'peso', 'rest',
    'video', 'notas', 'numberExercise', 'valueExercise'
  ]);

  // El template aporta progresion y backoff/aproximaciones, pero no pisa el nombre del alumno.
  preserveNameAndApplyTemplateDetails(ex, templEx);
};


      // Lista final de ejercicios, SIGUE la del template (respeta altas/bajas)
      day.exercises = syncByTemplateList(
        templDay?.exercises,
        Array.isArray(baseDay?.exercises) ? baseDay.exercises : [],
        'exercise',
        applyMergeExercise
      );

      // ==== WARMUP ====
      const applyMergeWarmup = (wu, templWu) => {
        setWarmupSourceFromTemplate(wu, templWu);
        mergeFields(wu, templWu, [
          'name',
          'sets', 'reps', 'peso', 'video',
          'notas', 'numberWarmup', 'valueWarmup'
        ]);
      };

      day.warmup = syncByTemplateList(
        templDay?.warmup,
        Array.isArray(baseDay?.warmup) ? baseDay.warmup : [],
        'warmup',
        applyMergeWarmup
      );

      // ==== MOVILITY (normalizado) ====
      const applyMergeMov = (mob, templMob) => {
        setMovilitySourceFromTemplate(mob, templMob);
        mergeFields(mob, templMob, [
          'name',
          'sets', 'reps', 'peso', 'video',
          'notas', 'numberMobility', 'valueMobility'
        ]);
      };

      day.movility = syncByTemplateList(
        templDay?.movility,
        Array.isArray(baseDay?.movility) ? baseDay.movility : [],
        'movility',
        applyMergeMov
      );

      // ==== ID REGENERATION ====
      day._id = new ObjectId();

      day.exercises = (Array.isArray(day.exercises) ? day.exercises : [])
        .map(regenerateExerciseRuntimeIds);

      day.warmup = (Array.isArray(day.warmup) ? day.warmup : [])
        .map(regenerateWarmupRuntimeId);

      if (Array.isArray(day.movility)) {
        day.movility = day.movility.map(regenerateMovilityRuntimeId);
      }

      newDays.push(day);
    });

    // La rutina final es EXACTAMENTE la del template (orden y cantidad),
    // con campos mergeados desde la base donde correspondia.
    clone.routine = newDays;

    newWeeks.push(clone);
  }

  await routine.insertMany(newWeeks);
  return newWeeks;
}


function mergeFields(target, source, fields) {
  fields.forEach(field => {
    const val = source[field];
    if (val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      target[field] = val;
    }
  });
}

async function updateBlockOfWeek(weekId, blockData) {
  await client.connect();
  const result = await db.collection('Routine').updateOne(
    { _id: new ObjectId(weekId) },
    { $set: { block: blockData, updated_at: new Date() } }
  );
  if (result.modifiedCount === 1) {
    return result;
  } else {
    throw new Error('No se modifico la semana');
  }
}

async function deleteWeek(weekId){
  return client.connect()
      .then(function(){
          return routine.deleteOne({ _id: new ObjectId(weekId) })
      })
}   

async function editWeek(weekID, routineArray) {
  return client.connect()
      .then(function () {
          return routine.updateOne(
              { _id: new ObjectId(weekID) },
              { $set: { routine: routineArray, updated_at: new Date() } }
          );
      });
}

async function editWeekName(weekID, week){
  return client.connect()
      .then(function(){
          return routine.updateOne(
              { _id: new ObjectId(weekID)},
              { $set: week }
           )
      })
}

async function editDay(week_id, day_id, day){
  return client.connect()
      .then(function(){
          return routine.updateOne(
              { $or: [{"routine._id": day_id}, {"routine._id": new ObjectId(day_id)}]},
              { $set: {"routine.$.name" : day}  }
           )
      })
}

async function findExercises(week_id,day_id){
  return client.connect()
      .then(async function (){
          return routine.findOne({  _id: new ObjectId(week_id), "routine._id": new ObjectId(day_id) })
      }) 
}

async function editExercise(week_id,day_id, exercise){
  return client.connect()
      .then(function(){
          return routine.updateOne(
              {  _id: new ObjectId(week_id) },
              { $set: { "routine.$[day].exercises" : exercise, updated_user_at: new Date()  } },
              { arrayFilters: [ { $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] } ] })
      })
}

async function editExerciseInAmrap(week_id,day_id, exercise_id, exercise){
  const newExercise = {
      ...exercise,
      exercise_id: new ObjectId(exercise_id)
  }
  return client.connect()
      .then(function(){
          return routine.updateOne(
              {  _id: new ObjectId(week_id), $or: [{"routine.exercises.exercise_id": exercise_id}, {"routine.exercises.exercise_id": new ObjectId(exercise_id)}]},
              { $set: { "routine.$[day].exercises.$[element]" : newExercise } },
              { arrayFilters: [
                { $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] } ,
                { $or: [{"element.exercise_id": exercise_id}, {"element.exercise_id": new ObjectId(exercise_id)}] }]}
          )
      })
}

async function deleteExercise(week_id,day_id, exercise_id){
  return client.connect()
      .then(function(){
          return routine.updateOne(
            { _id: new ObjectId(week_id) },
            { $pull: { "routine.$[day].exercises": { $or: [{exercise_id : new ObjectId(exercise_id)},{exercise_id : exercise_id} ]} } },
            {arrayFilters: [{ $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] }]}
          )
      })
}

// BLOQUE DE MOVILIDAD / ENTRADA EN CALOR

async function findWarmUp(week_id,warmup_id){
  return client.connect()
      .then(async function (){
          return routine.findOne({  _id: new ObjectId(week_id), "routine.warmup.warmup_id": new ObjectId(warmup_id) })
      }) 
}

async function createWarmUp(week_id, day_id, warmup, id ){
  const warmUp = {
      ...warmup,
      warmup_id: new ObjectId(id)
  }
  return client.connect()
      .then(function (){
          return routine.updateOne(
            { _id: new ObjectId(week_id), $or: [{"routine._id": day_id}, {"routine._id": new ObjectId(day_id)}] },
            { $push: { "routine.$[element].warmup" : warmUp } },
            { arrayFilters: [ { $or: [{"element._id": day_id}, {"element._id": new ObjectId(day_id)}] } ] })
      })  
}

async function editWarmUp(week_id,day_id, warmup){
  return client.connect()
      .then(function(){
          return routine.updateOne(
              {  _id: new ObjectId(week_id) },
              { $set: { "routine.$[day].warmup" : warmup } },
              { arrayFilters: [ { $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] } ] })
      })
}

async function deleteWarmup(week_id,day_id, warmup_id){
  return client.connect()
      .then(function(){
          return routine.updateOne(
            { _id: new ObjectId(week_id) },
            { $pull: { "routine.$[day].warmup": {warmup_id : new ObjectId(warmup_id) } } },
            {arrayFilters: [{ $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] }]}
          )
      })
}

async function createPAR(PAR,user_id){
  const newPAR = {
      ...PAR,
      user_id: new ObjectId(user_id)
  }
  return client.connect()
      .then(function(){
          return routine.insertOne(newPAR)
      })
      .then(function (){
          return newPAR
      })
}

async function updateWeekFields(
  weekId,
  partial,
  allowedKeys = ['visibility','name','block','block_id','tags','visible_at','comments']
) {
  await client.connect();

  // Filtramos `partial` por la whitelist
  const toSet = Object.keys(partial).reduce((acc, key) => {
    if (allowedKeys.includes(key)) acc[key] = partial[key];
    return acc;
  }, {});

  if (!Object.keys(toSet).length) {
    throw new Error('No hay campos validos para actualizar.');
  }

  const result = await routine.updateOne(
    { _id: new ObjectId(weekId) },
    { $set: { ...toSet, updated_at: new Date() } }
  );

  if (!result.modifiedCount) {
    throw new Error('No se modifico la semana');
  }
  return result;
}

export {
  getRoutine,
  getRoutineById,
  getLastWeekCreatedAtByUserIds,
  getRoutineByUserId,
  closeRoutineServiceConnectionForTests,
  createWeek,
  editWeek,
  editWeekName,
  deleteWeek,
  createDay,
  deleteDay,
  editDay,

  editExercise,
  editExerciseInAmrap,
  deleteExercise,
  findExercises,

  findWarmUp,
  createWarmUp,
  editWarmUp,
  deleteWarmup,
  createPARforMultipleUsers,
  createProgressionForMultipleUsers,

  updateBlockOfWeek,

  // NUEVO
  updateWeekFields,
  
  createPAR
}
