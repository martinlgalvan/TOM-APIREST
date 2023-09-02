import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const exercises = db.collection('Routine')

async function findExercises(week_id,day_id){
    return client.connect()
        .then(async function (){
            return routine.findOne({  _id: new ObjectId(week_id), "routine._id": new ObjectId(day_id) })
        }) 
}


async function createExercise(dayID, rutine, id){

    const newRutine = {
        ...rutine,
        exercise_id: new ObjectId(id)
    }

    return client.connect()
        .then(function (galeriaServ){
            return exercises.updateOne({ day_id: new ObjectId(dayID) }, { $push: {exercises: newRutine}})
        })
        .then(function(result){
            if(result.modifiedCount === 0){
                return exercises.insertOne({ day_id: new ObjectId(dayID), exercises: [newRutine] })
            }

        })   
                
}
async function deleteExercise(week_id, exercise_id){
    return client.connect()
        .then(function(){
            return exercises.updateOne({ _id: new ObjectId(week_id) },
            { $pull: { "routine.0.exercises": {exercise_id : new ObjectId(exercise_id) } }})
        })
}

async function editExercise(dayId, exerciseId, exercise){

    const newExercise = {
        ...exercise,
        exercise_id: new ObjectId(exerciseId)
    }
    
    return client.connect()
        .then(function(){
            return exercises.updateOne(
                { day_id: new ObjectId(dayId), "exercises.exercise_id": new ObjectId(exerciseId) },
                { $set: { "exercises.$" : newExercise } }
             )
        })
}


export {
    createExercise,
    findExercises,
    deleteExercise,
    editExercise
}