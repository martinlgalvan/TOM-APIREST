import { MongoClient, ObjectId } from 'mongodb'
import {getDate} from './../date/formatedDate.js'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:S0YM4RT1N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const routine = db.collection('Routine')

async function getRoutine(filter){
    const filterQuery = {
        ...filter
    }

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

async function getRoutineByUserId(id) {
    return client.connect()
      .then(function() {
        return routine.find({ user_id: new ObjectId(id) })
        .sort({ "created_at.fecha": -1, "created_at.hora": -1 })
          .toArray();
      });
  } 
  

async function createDay(day, weekId){

    return client.connect()
        .then(function (galeriaServ){
            return routine.updateOne({ _id: new ObjectId(weekId) }, { $push: {routine: day}})
        })
                
    }

async function deleteDay(week_id, day_id ){
        return client.connect()
            .then(function(){
                return routine.updateOne({ _id: new ObjectId(week_id), "routine._id": new ObjectId(day_id) },
                { $pull: { "routine": {_id : new ObjectId(day_id) } }})
            })
    }    


async function createWeek(week,user_id){
    const newWeek = {
        ...week,
        user_id: new ObjectId(user_id),
        created_at: getDate()
    }

    return client.connect()
        .then(function(){
            return routine.insertOne(newWeek)
        })
        .then(function (){
            return newWeek
        })
}


async function deleteWeek(weekId){
    return client.connect()
        .then(function(){
            return routine.deleteOne({ _id: new ObjectId(weekId) })
        })
}   

async function editWeek(weekID, week){
    
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
                { "routine._id": new ObjectId(day_id) },
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

async function createExercise(week_id, day_id, exercise, id ){

    const newExercise = {
        ...exercise,
        exercise_id: new ObjectId(id)
    }

    return client.connect()
        .then(function (galeriaServ){
            return routine.updateOne({ _id: new ObjectId(week_id), $or: [{"routine._id": day_id}, {"routine._id": new ObjectId(day_id)}] },
            { $push: { "routine.$[element].exercises" : newExercise } }, { arrayFilters: [ { $or: [{"element._id": day_id}, {"element._id": new ObjectId(day_id)}] } ] })
        })  
}


async function editExercise(week_id,day_id, exercise){

    return client.connect()
        .then(function(){
            return routine.updateOne(
                {  _id: new ObjectId(week_id) },
                { $set: { "routine.$[day].exercises" : exercise } }, { arrayFilters: [{"day._id": new ObjectId(day_id)}]})
             
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
                {  _id: new ObjectId(week_id), "routine.exercises.exercise_id": new ObjectId(exercise_id) },
                { $set: { "routine.$[day].exercises.$[element]" : newExercise } }, { arrayFilters: [{"day._id": new ObjectId(day_id)} ,{"element.exercise_id": new ObjectId(exercise_id) }]})
             
        })
}


async function deleteExercise(week_id,day_id, exercise_id){

    return client.connect()
        .then(function(){
            return routine.updateOne({ _id: new ObjectId(week_id) },
            { $pull: { "routine.$[day].exercises": { $or: [{exercise_id : new ObjectId(exercise_id)},{exercise_id : exercise_id} ]} }}, {arrayFilters: [{ $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] }]})
             
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
        .then(function (galeriaServ){
            return routine.updateOne({ _id: new ObjectId(week_id), $or: [{"routine._id": day_id}, {"routine._id": new ObjectId(day_id)}] },
            { $push: { "routine.$[element].warmup" : warmUp } }, { arrayFilters: [ { $or: [{"element._id": day_id}, {"element._id": new ObjectId(day_id)}] } ] })
        })  
}

async function editWarmUp(week_id,day_id, warmup_id, warmup){

    const newWarmup = {
        ...warmup,
        warmup_id: new ObjectId(warmup_id)
    }

    return client.connect()
        .then(function(){
            return routine.updateOne(
                {  _id: new ObjectId(week_id), $or: [{"routine.warmup.warmup_id": warmup_id}, {"routine.warmup.warmup_id": new ObjectId(warmup_id)}]  },
                { $set: { "routine.$[day].warmup.$[element]" : newWarmup } }, { arrayFilters: [ {"day._id": new ObjectId(day_id)}, {"element.warmup_id": new ObjectId(warmup_id)} ] })
             
        })
}


async function deleteWarmup(week_id,day_id, warmup_id){

    return client.connect()
        .then(function(){
            return routine.updateOne({ _id: new ObjectId(week_id) },
            { $pull: { "routine.$[day].warmup": {warmup_id : new ObjectId(warmup_id) } }}, {arrayFilters: [{ $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] }]})
             
        })
}

export {
    getRoutine,
    getRoutineById,
    getRoutineByUserId,
    createWeek,
    editWeek,
    deleteWeek,
    createDay,
    deleteDay,
    editDay,

    createExercise,
    editExercise,
    editExerciseInAmrap,
    deleteExercise,
    findExercises,

    findWarmUp,
    createWarmUp,
    editWarmUp,
    deleteWarmup

}








/*    //¿Por qué tánto quilombo acá, en vez de una query simple? Por qué en la aplicación busqué crear copias de elementos, y las realicé en el front.
    //No hubo manera de introducirlas con el objectID, por lo que la primera vez que se edita es un string normal, aunque sigue siendo un objectID en el front.
    //Por lo que al editar por primera vez, ya se convierte en OBJECT ID en la base de datos, normalizandola.
    return client.connect()
        .then(function(){
            return routine.updateOne(
                {  _id: new ObjectId(week_id), $or: [{"routine.exercises.exercise_id": exercise_id}, {"routine.exercises.exercise_id": new ObjectId(exercise_id)}]  },
                { $set: { "routine.$[day].exercises.$[element]" : newExercise } }, { arrayFilters: [ { $or: [{"day._id": day_id}, {"day._id": new ObjectId(day_id)}] }, {$or: [{"element.exercise_id": exercise_id}, {"element.exercise_id": new ObjectId(exercise_id)}]} ] })
             
        })*/