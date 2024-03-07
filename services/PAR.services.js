import { MongoClient, ObjectId } from 'mongodb'

const options = { keepAlive: true };

const client = new MongoClient('mongodb://m4rt1n:s0yM4RT1NG4LV4N@62.72.51.41:27017/',options)
const db = client.db('TOM')
const par = db.collection('PAR')

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
export {
    createPAR

}


