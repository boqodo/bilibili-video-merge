const fs = require('fs')
const path = require('path')
const downloaddir = 'C:\\Users\\boqodo\\AppData\\Local\\Packages\\36699Atelier39.forWin10_pke1vz55rvc1r\\LocalCache\\BilibiliDownload'

let flvfile = path.join(downloaddir, "4892142\\1", "4892142_1_0.flv")

let stream = fs.createReadStream(flvfile, { highWaterMark: 64 * 1024 })

const tagheaderlen = 11
let totalsum = 9 + 4 //总长度
let rectimes = 0  //readable触发次数

let remainbuffer
let remainlength

let bodyremainbuffer
let bodyremainlength
let remaintagtype


let totallength = 0

stream.on('readable', () => {
    let rlength = stream._readableState.length
    if (rlength === 0) {
        console.log("close")
        console.log("totalsum" + totalsum + "\ttotallength" + totallength + "\trectimes" + rectimes)
        return
    }

    totallength += rlength
    rectimes++
    if (rectimes === 1) {
        let header = stream.read(9)
        skip(stream, 4)  // 第一个tag没有长度都为0
    }

    if (bodyremainlength > 0 && bodyremainbuffer) {

        let remain = stream._readableState.length
        if (bodyremainlength <= remain) {
            let bodybuf = Buffer.concat([bodyremainbuffer, stream.read(bodyremainlength)])
            dispatcher(remaintagtype, bodybuf)
            remaintagtype = undefined
            bodyremainlength = undefined
            bodyremainbuffer = undefined
        } else {
            bodyremainbuffer = Buffer.concat([bodyremainbuffer, stream.read(remain)])
            bodyremainlength = bodyremainlength - remain
            return
        }
    }


    let tagheader
    if (remainlength > 0 && remainbuffer) {
        let remain = stream._readableState.length
        if (remainlength <= remain) {
            tagheader = Buffer.concat([remainbuffer, stream.read(remainlength)])
            remainlength = undefined
            remainbuffer = undefined
        } else {
            let rbuf = stream.read(remain)
            remainbuffer = Buffer.concat([remainbuffer, rbuf])
            remainlength = remainlength - remain
            return
        }
    } else {
        tagheader = stream.read(tagheaderlen)
    }

    while (tagheader) {
        let tagtype = tagheader[0] & 0x1f   //tag头类型 
        let tagbodylen = len(tagheader.slice(1, 4)) // tag数据区长度
        //console.log("tagtype:" + tagtype + "\ttagbodylen:" + tagbodylen)
        let time = len(tagheader.slice(4, 4 + 3))

        let timeex = tagheader[7]
        let streamsID = tagheader.slice(8)
        let sval = len(streamsID)


        tagbodylen = tagbodylen + 4 //4个字节存放整个tag的长度

        let remain = stream._readableState.length
        if (tagbodylen <= remain) {
            remaintagtype = undefined
            bodyremainlength = undefined
            bodyremainbuffer = undefined

            let tagbody = stream.read(tagbodylen)
            dispatcher(tagtype, tagbody)
            remain = stream._readableState.length
            if (tagheaderlen <= remain) {
                remainlength = undefined
                remainbuffer = undefined

                tagheader = stream.read(tagheaderlen)
            } else {
                remainbuffer = remain === 0 ? new Buffer(0) : stream.read(remain)
                remainlength = tagheaderlen - remain
                break
            }
        } else {
            remaintagtype = tagtype
            bodyremainbuffer = remain === 0 ? new Buffer(0) : stream.read(remain) //处理流刚好读完，stream.read(0)为null的情况
            bodyremainlength = tagbodylen - remain
            break
        }
    }



    function dispatcher(tagtype, tagbody) {
        let taglen = len(tagbody.slice(tagbody.length - 4))
        totalsum += taglen
        tagbody = tagbody.slice(0, tagbody.length - 4)
        switch (tagtype) {
            case 8:
                parseSoundTag(tagbody)
                break
            case 9:
                parseVideoTag(tagbody)
                break
            case 18:
                parseScriptTag(tagbody)
                break
            default:
                break
        }
    }
})

const dataTypes = {
    '2': {
        len: 2,
        handler: handler
    },
    '12': {
        len: 4,
        handler: handler
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
function arrayHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    let body = tagbody.slice(end)
    while (typedatalen) {

        let type = body[0]
        let dataType = dataTypes[type]
        let dlen = dataType.len
        let handlerFun = dataType.handler
        body = handlerFun(dlen, body.slice(1))
        typedatalen--
    }
    return body
}

function objHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    console.log(tagbody.slice(end, end + typedatalen).toString())
    let type = tagbody[end + typedatalen]

    let flag = 0

    return objFieldHandler(type, tagbody.slice(end + typedatalen + 1))

    function objFieldHandler(type, body) {
        flag++
        let dataType = dataTypes[type]
        let dlen = dataType.len
        let handlerFun = dataType.handler
        let result = handlerFun(dlen, body)
        let isend = len(result.slice(0, 3)) === 0x09
        if (!isend) {
            if (flag % 2 === 1) {
                return objFieldHandler(2, result)
            } else {
                return objFieldHandler(result[0], result.slice(1))
            }
        } else {
            return result.slice(3)
        }
    }
}

function numberHandler(total, tagbody) {
    let end = total
    let typedatalen = tagbody.readDoubleBE(0)
    console.log(typedatalen)
    return tagbody.slice(end)
}

function boolHandler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    console.log(typedatalen ? true : false)
    return tagbody.slice(end)
}

function handler(total, tagbody) {
    let end = total
    let typedatalen = len(tagbody.slice(0, end))
    console.log(tagbody.slice(end, end + typedatalen).toString())
    return tagbody.slice(end + typedatalen)
}

function parseScriptTag(tagbody) {
    if (tagbody.length !== 0) {
        let type = tagbody[0]
        let dataType = dataTypes[type]
        let len = dataType.len
        let handlerFun = dataType.handler
        parseScriptTag(handlerFun(len, tagbody.slice(1)))
    }
}
function ecmaHandler(total, body) {
    let end = total
    let sum = len(body.slice(1, end))  //总个数
    body = body.slice(end)
    while (sum) {

        let keylen = len(body.slice(0, 2))
        let key = body.slice(2, 2 + keylen) //string
        console.log(key.toString())
        let valtype = body[2 + keylen]

        let dataType = dataTypes[valtype]

        let dlen = dataType.len
        let handlerFun = dataType.handler
        body = handlerFun(dlen, body.slice(2 + keylen + 1))
        sum--
    }
    let isend = len(body.slice(0, 3)) === 0x09
    return isend ? body.slice(3) : body
}

function len(bytearr) {
    let l = bytearr.length
    let r = 0
    bytearr.forEach((e, i) => {
        let bit = (l - 1 - i) * 8
        r = r | (e & 0xff) << bit
    })
    return r
}
function skip(stream, num) {
    stream.read(num)
}


//--------------

function parseSoundTag(tagbody) {
    let soundHeader = tagbody[0]
    console.log(header(soundHeader))


    function header(soundHeader) {
        return {
            format: (soundHeader & 0xf0) >> 4,
            rate: (soundHeader & 0x0c) >> 2,
            size: (soundHeader & 0x02) >> 1,
            type: (soundHeader & 0x01)
        }
    }
}

function parseVideoTag(tagbody) {
    let videoHeader = tagbody[0]
    console.log(header(videoHeader))

    function header(videoHeader) {
        return {
            type: videoHeader >> 4,
            enid: videoHeader & 0x07
        }
    }
}