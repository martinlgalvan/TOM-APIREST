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
        // Si created_at es Date, esto basta; si fuera string ISO, podés envolver con {$toDate:"$created_at"}.
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

async function createWeek(week, user_id, block_id = null) {
  const timestamp = new Date().getTime()
  const newWeek = {
    ...week,
    user_id: new ObjectId(user_id),
    created_at: getDate(),
    timestamp,
    block_id: block_id ? new ObjectId(block_id) : (week.block_id ? new ObjectId(week.block_id) : null)
  }
  await client.connect()
  await routine.insertOne(newWeek)
  return newWeek
}

async function createPARforMultipleUsers(PAR, user_ids) {
  const timestamp = new Date().getTime();
  const newPARs = user_ids.map((userId) => ({
    ...PAR,
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
      throw new Error(`Error al crear PAR para múltiples usuarios: ${err.message}`);
    });
}

async function createProgressionForMultipleUsers(template, user_ids) {
  const timestamp = Date.now();
  await client.connect();
  const newWeeks = [];

  for (const userId of user_ids) {
    const routines = await getRoutineByUserId(userId);
    const lastWeek = routines[0];
    if (!lastWeek) continue;

    const clone = JSON.parse(JSON.stringify(lastWeek));
    clone._id = new ObjectId();
    clone.user_id = new ObjectId(userId);
    clone.created_at = getDate();
    clone.timestamp = timestamp;
    clone.name = `Semana ${routines.length + 1}`;

    clone.routine.forEach((day, dayIndex) => {
      const templDay = Array.isArray(template.routine) ? template.routine[dayIndex] : null;

      if (templDay) {
        if (templDay.name && templDay.name.trim() !== '') {
          day.name = templDay.name;
        }

        // === EXERCISES ===
        if (Array.isArray(templDay.exercises) && Array.isArray(day.exercises)) {
          day.exercises.forEach((ex, exIndex) => {
            const templEx = templDay.exercises[exIndex];
            if (!templEx) return;

            // CIRCUITO
            if (ex.circuit && Array.isArray(ex.circuit)) {
              ex.circuit.forEach((c, cIndex) => {
                const templC = templEx.circuit?.[cIndex];
                if (templC) {
                  mergeFields(c, templC, ['reps', 'peso', 'video']);
                }
              });
              mergeFields(ex, templEx, ['type', 'typeOfSets', 'notas', 'numberExercise']);
            } else {
              // SIMPLE
              mergeFields(ex, templEx, [
                'type', 'sets', 'reps', 'peso', 'rest',
                'video', 'notas', 'numberExercise', 'valueExercise'
              ]);

              const templBackoff = templEx?.name?.backoff;
              if (Array.isArray(templBackoff)) {
                if (typeof ex.name === 'string') {
                  ex.name = { name: ex.name, backoff: templBackoff };
                } else if (typeof ex.name === 'object' && typeof ex.name.name === 'string') {
                  ex.name.backoff = templBackoff;
                }
              }
            }
          });
        }

        // === WARMUP ===
        if (Array.isArray(templDay.warmup) && Array.isArray(day.warmup)) {
          day.warmup.forEach((wu, wuIndex) => {
            const templWu = templDay.warmup[wuIndex];
            if (templWu) {
              mergeFields(wu, templWu, [
                'sets', 'reps', 'peso', 'video',
                'notas', 'numberWarmup', 'valueWarmup'
              ]);
            }
          });
        }

        // === MOVILITY ===
        if (Array.isArray(templDay.movility) && Array.isArray(day.movility)) {
          day.movility.forEach((mob, mobIndex) => {
            const templMob = templDay.movility[mobIndex];
            if (templMob) {
              mergeFields(mob, templMob, [
                'sets', 'reps', 'peso', 'video',
                'notas', 'numberMobility', 'valueMobility'
              ]);
            }
          });
        }
      }

      // === ID REGENERATION ===
      day._id = new ObjectId();

      if (Array.isArray(day.exercises)) {
        day.exercises = day.exercises.map(ex => ({
          ...ex,
          exercise_id: new ObjectId()
        }));
      }

      if (Array.isArray(day.warmup)) {
        day.warmup = day.warmup.map(wu => ({
          ...wu,
          warmup_id: new ObjectId()
        }));
      }

      if (Array.isArray(day.movility)) {
        day.movility = day.movility.map(mob => ({
          ...mob,
          movility_id: new ObjectId()
        }));
      }
    });

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
    throw new Error('No se modificó la semana');
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
    throw new Error('No hay campos válidos para actualizar.');
  }

  const result = await routine.updateOne(
    { _id: new ObjectId(weekId) },
    { $set: { ...toSet, updated_at: new Date() } }
  );

  if (!result.modifiedCount) {
    throw new Error('No se modificó la semana');
  }
  return result;
}

export {
  getRoutine,
  getRoutineById,
  getLastWeekCreatedAtByUserIds,
  getRoutineByUserId,
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
