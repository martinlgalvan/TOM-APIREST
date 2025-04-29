import { ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const client = new MongoClient(process.env.MONGODB_URI, { keepAlive: true })
const db = client.db('TOM')
const blocks = db.collection('Blocks')

function recursivelyConvertIds(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => recursivelyConvertIds(item));
  } else if (obj && typeof obj === 'object') {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.endsWith('_id') && typeof value === 'string' && ObjectId.isValid(value)) {
        newObj[key] = new ObjectId(value);
      } else {
        newObj[key] = recursivelyConvertIds(value);
      }
    }
    return newObj;
  } else {
    return obj;
  }
}

function sanitizeUpdateData(data) {
  const clonedData = { ...data };
  delete clonedData._id;
  return recursivelyConvertIds(clonedData);
}

export async function findByUserId(userId) {
  await client.connect()
  return blocks.find({ user_id: new ObjectId(userId) }).sort({ order: 1 }).toArray()
}

export async function createBlock(userId, blockData) {
  await client.connect()
  const newBlock = {
    ...blockData,
    user_id: new ObjectId(userId),
    created_at: new Date(),
    updated_at: new Date()
  }
  const result = await blocks.insertOne(newBlock)
  return { ...newBlock, _id: result.insertedId }
}

export async function cloneBlock(blockId, userId) {
    await client.connect()
  
    const originalBlock = await blocks.findOne({ _id: new ObjectId(blockId) })
    const weeks = await routine.find({ block_id: originalBlock._id }).toArray()
  
    const newBlock = {
      ...originalBlock,
      _id: undefined,
      name: originalBlock.name + ' (Copia)',
      created_at: new Date(),
      updated_at: new Date()
    }
  
    const insertRes = await blocks.insertOne(newBlock)
  
    const clonedWeeks = weeks.map(w => ({
      ...w,
      _id: undefined,
      name: w.name + ' (copia)',
      block_id: insertRes.insertedId,
      user_id: new ObjectId(userId),
      created_at: getDate(),
      timestamp: new Date().getTime()
    }))
  
    await routine.insertMany(clonedWeeks)
  
    return { block: insertRes.insertedId, weeks: clonedWeeks.length }
  }
  

export async function findById(blockId) {
  await client.connect()
  return blocks.findOne({ _id: new ObjectId(blockId) })
}

export async function updateBlock(blockId, updateData) {
  await client.connect();

  const sanitizedData = sanitizeUpdateData(updateData);

  await blocks.updateOne(
    { _id: new ObjectId(blockId) },
    { $set: { ...sanitizedData, updated_at: new Date() } }
  );

  return findById(blockId);
}

export async function deleteBlock(blockId) {
  await client.connect()
  await blocks.deleteOne({ _id: new ObjectId(blockId) })
}
