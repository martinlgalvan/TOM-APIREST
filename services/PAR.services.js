import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';
import {getDate} from './../date/formatedDate.js'

// Carga las variables de entorno desde el archivo .env
dotenv.config();

const options = { keepAlive: true };

const client = new MongoClient(process.env.MONGODB_URI,options)
const db = client.db('TOM')
const par = db.collection('PAR')



async function getPAR(id){
    return client.connect()
        .then(async function (){
            return par.find({  $or: [{user_id: id}, {user_id: new ObjectId(id)}]}).toArray()
        }) 
}



async function createPAR(PAR,user_id){

    const newPAR = {
        ...PAR,
        user_id: new ObjectId(user_id)
    }

    return client.connect()
        .then(function(){
            return par.insertOne(newPAR)
        })
        .then(function (){
            return newPAR
        })
}

async function updatePAR(id, updatedPAR) {
    const filter = { _id: new ObjectId(id) };

    // Copia el objeto y elimina el campo `_id` si existe
    const { _id, ...updatedFields } = updatedPAR;

    const update = { $set: updatedFields };

    try {
        await client.connect();
        const result = await par.updateOne(filter, update);

        if (result.matchedCount === 0) {
            throw new Error('El PAR no fue encontrado.');
        }

        return { message: 'PAR actualizado exitosamente' };
    } catch (err) {
        console.log(err.message)
        throw new Error(`Error al actualizar el PAR: ${err.message}`);
    }
}


async function deletePAR(id) {
    const filter = { _id: new ObjectId(id) };

    return client.connect()
        .then(() => {
            return par.deleteOne(filter);
        })
        .then((result) => {
            if (result.deletedCount === 0) {
                throw new Error('el PAR no fue encontrada o no se eliminó.');
            }
            return { message: 'PAR eliminada exitosamente' };
        })
        .catch((err) => {
            
            throw new Error(`Error al eliminar el PAR: ${err.message}`);
        });
}

async function createProgressionFromPAR(parId) {
    await client.connect();
    const original = await par.findOne({ _id: new ObjectId(parId) });
    if (!original) throw new Error('PAR no encontrado');

    // Buscar cuántas progresiones ya existen para este PAR
    const existingProgressionsCount = await par.countDocuments({ parent_par_id: new ObjectId(parId) });

    const clone = JSON.parse(JSON.stringify(original));
    clone._id = new ObjectId();
    clone.parent_par_id = original._id;  // enlace al PAR original
    clone.created_at = getDate();
    clone.timestamp = new Date().getTime();

    // Asignar nombre: nombre original + Progresión N
    clone.name = `${original.name || "PAR"} - Progresión ${existingProgressionsCount + 1}`;

    if (Array.isArray(clone.routine)) {
        clone.routine.forEach((day, index) => {
            day._id = new ObjectId();
            // 🔥 Copiamos el mismo nombre del día original
            day.name = original.routine[index]?.name || `Día ${index + 1}`;
            
            // También re-generamos IDs internos
            if (Array.isArray(day.exercises)) {
                day.exercises = day.exercises.map(ex => ({
                    ...ex,
                    exercise_id: new ObjectId(),
                    name: typeof ex.name === 'object' ? { ...ex.name } : ex.name // copiamos nombre si es string o si es objeto
                }));
            }
            if (Array.isArray(day.warmup)) {
                day.warmup = day.warmup.map(wu => ({ ...wu, warmup_id: new ObjectId(), name: wu.name || '' }));
            }
            if (Array.isArray(day.mobility)) {
                day.mobility = day.mobility.map(mob => ({ ...mob, mobility_id: new ObjectId(), name: mob.name || '' }));
            }
        });
    }

    await par.insertOne(clone);
    return clone;
}





export {
    getPAR,
    createPAR,
    updatePAR,
    deletePAR,
    createProgressionFromPAR

}


