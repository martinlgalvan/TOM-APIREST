import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv';

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



export {
    getPAR,
    createPAR,
    updatePAR,
    deletePAR

}


