const path = require('path')
const flvmerge = require('./flvmerge.js')
const downloaddir = 'C:\\Users\\boqodo\\AppData\\Local\\Packages\\36699Atelier39.forWin10_pke1vz55rvc1r\\LocalCache\\BilibiliDownload'

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