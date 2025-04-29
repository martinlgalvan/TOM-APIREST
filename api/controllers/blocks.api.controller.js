import * as BlockService from '../../services/block.services.js'

export async function getBlocksByUser(req, res) {
  const { userId } = req.params
  const blocks = await BlockService.findByUserId(userId)
  res.status(200).json(blocks)
}


export async function getBlockById(req, res) {
  const block = await BlockService.findById(req.params.blockId)
  res.status(200).json(block)
}

export async function editBlock(req, res) {
  const updated = await BlockService.updateBlock(req.params.blockId, req.body)
  res.status(200).json(updated)
}

export async function deleteBlock(req, res) {
  await BlockService.deleteBlock(req.params.blockId)
  res.status(204).send()
}

export async function cloneBlock(req, res) {
    const { blockId, userId } = req.params
    const result = await BlockService.cloneBlock(blockId, userId)
    res.status(201).json(result)
  }
