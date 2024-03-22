import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
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
    deletePAR

}


