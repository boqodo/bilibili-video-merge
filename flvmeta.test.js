const flvmeta = require('./flvmeta.js');
const path = require('path');


(async () => {
    const downloaddir = 'C:\\Users\\boqodo\\AppData\\Local\\Packages\\36699Atelier39.forWin10_pke1vz55rvc1r\\LocalCache\\BilibiliDownload'
    
    let flvfile = path.join(downloaddir, "4892142\\1", "4892142_1_0.flv")
    try {
        let flv = await flvmeta(flvfile)
        console.log(JSON.stringify(flv))
    } catch (e) {
        console.log(e)
    }
})()
