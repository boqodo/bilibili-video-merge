const path = require('path')
const flvmerge = require('./flvmerge.js')
const downloaddir = '下载路径'

let flvfile1 = path.join(downloaddir, "4892142\\1", "4892142_1_0.flv")
let flvfile2 = path.join(downloaddir, "4892142\\1", "4892142_1_1.flv");


(async()=>{
    let flvfiles = [flvfile1,flvfile2]
    try {
        let metas = await flvmerge(flvfiles)
        console.log(metas)
    } catch (e) {
        console.log(e)
    }
})()