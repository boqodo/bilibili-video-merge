const flvmeta = require('./flvmeta.js');
const path = require('path');


(async () => {
    const downloaddir = '下载路径'
    
    let flvfile = path.join(downloaddir, "4892142\\1", "4892142_1_0.flv")
    //let flvfile ='D:\\ztest-demo\\pp\\test\\海底小纵队英文版 第1集.flv'
    try {
        let flv = await flvmeta(flvfile)
        console.log(JSON.stringify(flv))
    } catch (e) {
        console.log(e)
    }
})()
