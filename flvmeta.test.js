const flvmeta = require('./flvmeta.js');
const path = require('path');


(async () => {
    const downloaddir = 'flv所在目录'
    let flvfile = path.join(downloaddir,"xxx.flv")
    try {
        let flv = await flvmeta(flvfile)
        console.log(JSON.stringify(flv))
    } catch (e) {
        console.log(e)
    }
})()
