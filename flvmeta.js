const fs = require('fs')
const highWaterMark = 64 * 1024
/**
 * 数据类型的规范约定
 * len表示长度，需要读取的字节数
 * handler 表示该数据类型的处理方法
 */
const dataTypes = {
    '2': {
        len: 2,
        handler: stringHandler
    },
    '12': {
        len: 4,
        handler: stringHandler
    },
    '0': {
        len: 8,
        handler: numberHandler
    },
    '1': {
        len: 1,
        handler: boolHandler
    },
    '8': {
        len: 4,
        handler: ecmaHandler
    },
    '3': {
        len: 2,
        handler: objHandler
    },
    '10': {
        len: 4,
        handler: arrayHandler
    }
}
/**
 * Tag 数据类型和处理函数的规范约定
 */
const tags = {
    18: parseScriptTag,
    8: parseSoundTag,
    9: parseVideoTag
}

/**flv头所占字节数  */
const flvHeaderBytes = 9
/**flv tag之前表示tag长度的所占字节数 */
const flvTagPrevTagBytes = 4
/**flv tag头所占字节数 */
const flvTagHeaderBytes = 11

function parse(flvfile) {

    return new Promise((resolve, reject) => {
        let readStream = fs.createReadStream(flvfile, { highWaterMark: highWaterMark })

        let dataTriggerTimes = 0  //记录data触发的次数
        const flv = {}

        let remainBuffer
        let remainBytes
        let remainType
        let remainFlvTagHeader

        readStream.on('data', (chunk) => {
            try {
                dataTriggerTimes++
                const read = readBytes()

                // 第一次触发时，读取flv的头信息
                if (dataTriggerTimes === 1) {
                    if (chunk.length >= flvHeaderBytes) {
                        let headerBuffer = read(flvHeaderBytes)
                        let header = parseFlvHeader(headerBuffer)
                        flv.header = header
                    } else {
                        throw Error(`字节数不能少于${flvHeaderBytes}`)
                    }
                    if (read(flvTagPrevTagBytes).readInt32BE() !== 0) throw Error('第一个TagSize不为0')
                }

                let flvTagHeaderBuffer
                let flvTagBodyBuffer
                let flvTagHeader
                // 读取数据不够，在再次触发data时，需要进行读取剩余字节数和拼接缓冲区
                if (remainBuffer) {
                    let moreBuffer = read(remainBytes)
                    if (!moreBuffer) return

                    if (remainType === 0) {  // 读取tag header不够时处理
                        flvTagHeaderBuffer = Buffer.concat([remainBuffer, moreBuffer])
                        flvTagHeader = parseFlvTagHeader(flvTagHeaderBuffer)
                    } else if (remainType === 1) { //读取tag body 不够时处理
                        flvTagBodyBuffer = Buffer.concat([remainBuffer, moreBuffer])
                        let flvTagBody = parseFlvTagBody(remainFlvTagHeader.type, flvTagBodyBuffer)

                        if (flvTagHeader.type === 18) {
                            flv.meta = flvTagBody
                            readStream.close()
                        }
                    } else {
                        throw Error('不支持的剩余缓冲区类型')
                    }

                    remainBytes = undefined
                    remainBuffer = undefined
                    remainType = undefined
                    remainFlvTagHeader = undefined
                }
                if (!flvTagHeader) {
                    flvTagHeaderBuffer = read(flvTagHeaderBytes)
                    if (!flvTagHeaderBuffer) {
                        remainType = 0
                        return
                    }
                    flvTagHeader = parseFlvTagHeader(flvTagHeaderBuffer)
                }


                while (flvTagHeader) {
                    flvTagBodyBuffer = read(flvTagHeader.bodyBytes + flvTagPrevTagBytes)
                    if (!flvTagBodyBuffer) {
                        remainFlvTagHeader = flvTagHeader
                        remainType = 1
                        return
                    }
                    let flvTagBody = parseFlvTagBody(flvTagHeader.type, flvTagBodyBuffer)
                    if (flvTagHeader.type === 18) {
                        Object.assign(flv, flvTagBody)
                        readStream.close()
                    }

                    flvTagHeaderBuffer = read(flvTagHeaderBytes)
                    if (!flvTagHeaderBuffer) {
                        remainType = 0
                        return
                    }
                    flvTagHeader = parseFlvTagHeader(flvTagHeaderBuffer)
                }
            } catch (e) {
                reject(e)
            }

            function readBytes() {
                let start = 0
                return (bytes) => {
                    let end = start + bytes
                    // 缓冲区中读取剩下的数据字节数，少于本次需要读取的字节数
                    // 需要先记录保存数据，再次触发data事件时，读取剩下的所需的字节数
                    if (end > chunk.length) {
                        let allBuffer = chunk.slice(start)
                        remainBuffer = remainBuffer ? Buffer.concat([remainBuffer, allBuffer]) : allBuffer
                        remainBytes = end - chunk.length
                        return undefined
                    } else {
                        let buffer = chunk.slice(start, end)
                        start = end
                        return buffer
                    }
                }
            }
        })
        readStream.on('error', (err) => {
            reject(err)
        })
        readStream.on('close', () => {
            resolve(flv)
        })
    })
}

/**
 * 解析Flv头信息
 *
 * @param {Buffer} buffer
 * @returns {Object} 包含头信息的对象
 */
function parseFlvHeader(buffer) {
    const header = {}
    const filetype = buffer.slice(0, 3).toString('utf-8')
    if (filetype !== 'FLV') throw Error('非flv格式文件')
    header.filetype = filetype

    header.version = buffer[3]

    const streaminfo = buffer[4]
    header.hasAudio = (streaminfo & 0xff) >> 2   // 倒数第三位
    header.hasVideo = streaminfo & 0x01 //最后一位

    header.length = buffer.readInt32BE(5)
    return header
}
/**
 * 解析flv Tag头信息
 *
 * @param {Buffer} buffer
 * @returns {Object} 返回tag的类型和tag对应的数据内容所占字节数
 */
function parseFlvTagHeader(buffer) {
    let type = buffer[0] & 0x1f   //tag头类型 
    let bodyBytes = len(buffer.slice(1, 4)) // tag数据区长度
    let time = len(buffer.slice(4, 4 + 3))
    let timeex = buffer[7]
    let streamsID = buffer.slice(8)
    let sval = len(streamsID)
    return {
        type: type,
        bodyBytes: bodyBytes
    }
}
/**
 * 解析Flv Tag的数据内容
 *
 * @param {number} type  Tag头的类型
 * @param {Buffer} buffer
 * @returns {object} 解析的内容对象
 */
function parseFlvTagBody(type, buffer) {
    const tagbody = buffer.slice(0, buffer.length - flvTagPrevTagBytes)
    const fun = tags[type]
    return fun(tagbody)
}
/**
 * 解析tag类型为脚本数据的Tag
 *
 * @param {Buffer} tagbody
 * @returns {Object} 解析的内容对象
 */
function parseScriptTag(tagbody) {
    let type = tagbody[0]
    let dataType = dataTypes[type]
    let len = dataType.len
    let handlerFun = dataType.handler
    let resobj = handlerFun(len, tagbody.slice(1))
    let body = resobj.body
    if (body.length !== 0) {
        let value = {}
        value[resobj.value] = parseScriptTag(body)
        return value
    } else {
        return resobj.value
    }
}

/**
 * 解析音频tag
 *
 * @param {buffer} tagbody
 * @returns {Object}
 */
function parseSoundTag(tagbody) {
    let soundHeader = tagbody[0]
    return header(soundHeader)

    function header(soundHeader) {
        return {
            format: (soundHeader & 0xf0) >> 4,
            rate: (soundHeader & 0x0c) >> 2,
            size: (soundHeader & 0x02) >> 1,
            type: (soundHeader & 0x01)
        }
    }
}
/**
 * 解析视频Tag
 *
 * @param {buffer} tagbody
 * @returns {Object}
 */
function parseVideoTag(tagbody) {
    let videoHeader = tagbody[0]
    return header(videoHeader)

    function header(videoHeader) {
        return {
            type: videoHeader >> 4,
            enid: videoHeader & 0x07
        }
    }
}

/**
 * 数据类型为数组的处理器
 *
 * @param {number} total    数据内容长度所占字节数
 * @param {Buffer} tagbody
 * @returns {Object}
 */
function arrayHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    let body = tagbody.slice(end)
    let values = []
    while (typedatalen) {

        let type = body[0]
        let dataType = dataTypes[type]
        let dlen = dataType.len
        let handlerFun = dataType.handler
        let resobj = handlerFun(dlen, body.slice(1))
        body = resobj.body
        values.push(resobj.value)
        typedatalen--
    }
    return {
        value: values,
        body: body
    }
}
/**
 * 数据类型为Object的处理器
 *
 * @param {number} total    数据内容长度所占字节数
 * @param {Buffer} tagbody
 * @returns {Object}
 */
function objHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    let key = tagbody.slice(end, end + typedatalen).toString()
    let body = tagbody.slice(end + typedatalen)

    let value = {}
    let times = 0
    while (len(body.slice(0, 3)) !== 0x09) {

        times++
        let type
        let isOdd = (times & 1) != 0
        if (!isOdd) {
            type = 2  // string
        } else {
            type = body[0]
            body = body.slice(1)
        }

        let dataType = dataTypes[type]
        let len = dataType.len
        let handlerFun = dataType.handler
        let resobj = handlerFun(len, body)
        body = resobj.body
        if (!isOdd) {
            key = resobj.value
        } else {
            value[key] = resobj.value
        }
    }
    body = body.slice(3)
    return {
        value: value,
        body: body
    }
}
/**
 * 数字类型处理器
 *
 * @param {number} total   数据内容长度所占字节数
 * @param {Buffer} tagbody
 * @returns {Object}
 */
function numberHandler(total, tagbody) {
    let end = total
    let typedatalen = tagbody.readDoubleBE(0)
    return {
        value: typedatalen,
        body: tagbody.slice(end)
    }
}
/**
 * 布尔类型处理器
 *
 * @param {number} total 数据内容长度所占字节数
 * @param {Buffer} tagbody
 * @returns {Object}
 */
function boolHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    return {
        value: typedatalen ? true : false,
        body: tagbody.slice(end)
    }
}
/**
 * 字符串类型处理器
 *
 * @param {number} total    数据内容长度所占字节数
 * @param {Buffer} tagbody
 * @returns {Object}
 */
function stringHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    return {
        value: tagbody.slice(end, end + typedatalen).toString(),
        body: tagbody.slice(end + typedatalen)
    }
}
/**
 * ECMA类型（类型Map）的处理器
 *
 * @param {number} total    数据内容长度所占字节数
 * @param {Buffer} body
 * @returns {Object}
 */
function ecmaHandler(total, body) {
    let end = total
    let sum = len(body.slice(1, end))  //总个数
    body = body.slice(end)
    let value = {}
    while (sum) {

        let keylen = len(body.slice(0, 2))
        let key = body.slice(2, 2 + keylen) //string
        let valtype = body[2 + keylen]

        let dataType = dataTypes[valtype]

        let dlen = dataType.len
        let handlerFun = dataType.handler
        let resobj = handlerFun(dlen, body.slice(2 + keylen + 1))
        body = resobj.body
        value[key.toString()] = resobj.value
        sum--
    }
    let isend = len(body.slice(0, 3)) === 0x09

    return {
        value: value,
        body: isend ? body.slice(3) : body
    }
}
/**
 * 计算长度
 *
 * @param {Buffer} bytearr
 * @returns {number}
 */
function len(bytearr) {
    let l = bytearr.length
    let r = 0
    bytearr.forEach((e, i) => {
        let bit = (l - 1 - i) * 8
        r = r | (e & 0xff) << bit
    })
    return r
}


module.exports = (flvfile) => {
    return parse(flvfile)
}