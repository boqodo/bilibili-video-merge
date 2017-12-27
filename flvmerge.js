const flvmeta = require('./flvmeta.js')
const assert = require('assert')
const path = require('path')

/**
 * 解析所有文件的元信息
 * 
 * @param {Array.<string>} flvfiles 
 * @returns {Promise.<Array.<string>>}
 */
function parseMetas(flvfiles) {
    return new Promise((resolve, reject) => {
        try {
            let metas = []
            flvfiles.forEach(async (f, index) => {
                let meta = await flvmeta(f)
                metas.push(meta)
                if (index === (flvfiles.length - 1)) {
                    resolve(metas)
                }
            })
        } catch (e) {
            reject(e)
        }
    })
}

/**
 * 合并flv文件
 * @param {Array} flvfiles 
 */
module.exports = async (flvfiles) => {
    let metas = await parseMetas(flvfiles)
    let mergemeta = metas.shift()
    metas.forEach(m => {
        assert.deepEqual(m.header,mergemeta.header,'文件格式信息不一致！')
        assert.strictEqual(m.onMetaData.creator,mergemeta.onMetaData.creator)
        assert.strictEqual(m.onMetaData.metadatacreator,mergemeta.onMetaData.metadatacreator)
        assert.strictEqual(m.onMetaData.hasKeyframes,mergemeta.onMetaData.hasKeyframes)
        assert.strictEqual(m.onMetaData.hasVideo,mergemeta.onMetaData.hasVideo)
        assert.strictEqual(m.onMetaData.hasAudio,mergemeta.onMetaData.hasAudio)
        assert.strictEqual(m.onMetaData.hasMetadata,mergemeta.onMetaData.hasMetadata)
        
        mergemeta.onMetaData.canSeekToEnd = mergemeta.onMetaData.canSeekToEnd || m.onMetaData.canSeekToEnd
        mergemeta.onMetaData.duration += m.onMetaData.duration
        mergemeta.onMetaData.datasize += m.onMetaData.datasize
        mergemeta.onMetaData.videosize += m.onMetaData.videosize
        mergemeta.onMetaData.filesize += m.onMetaData.filesize

        mergemeta.onMetaData.lasttimestamp += m.onMetaData.duration
        mergemeta.onMetaData.lastkeyframetimestamp = mergemeta.onMetaData.duration  + m.onMetaData.lastkeyframetimestamp
        mergemeta.onMetaData.lastkeyframelocation = mergemeta.onMetaData.filesize + m.onMetaData.lastkeyframelocation

        assert.strictEqual(m.onMetaData.framerate.toFixed(2),mergemeta.onMetaData.framerate.toFixed(2))
        assert.strictEqual(m.onMetaData.audiocodecid,mergemeta.onMetaData.audiocodecid)
        assert.strictEqual(m.onMetaData.audiosamplerate,mergemeta.onMetaData.audiosamplerate)
        assert.strictEqual(m.onMetaData.audiosamplesize,mergemeta.onMetaData.audiosamplesize)
        assert.strictEqual(m.onMetaData.stereo,mergemeta.onMetaData.stereo)

        //TODO: 元信息合并
        
    })
    return mergemeta
}