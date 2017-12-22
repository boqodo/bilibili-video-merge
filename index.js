const fs = require('fs')
const path = require('path')
const stream = require('stream')

const downloaddir = 'C:\\Users\\boqodo\\AppData\\Local\\Packages\\36699Atelier39.forWin10_pke1vz55rvc1r\\LocalCache\\BilibiliDownload'
const outvideodir = 'D:\\ztest-demo'

async function start(dir) {
    let files = await readdir(dir)
    files.forEach(async f => {
        let fpath = path.join(dir, f)
        let stats = await stat(fpath)
        let isdir = stats.isDirectory()
        if (isdir) {
            let videodirs = await readdir(fpath)
            videodirs.forEach(async v => {
                let videodirpath = path.join(fpath, v)
                let vstats = await stat(videodirpath)
                if (vstats.isDirectory()) {
                    let videofiles = await readdir(videodirpath)

                    let flvs = []
                    let videoname
                    videofiles.forEach(async i => {
                        let ext = path.extname(i)
                        let filepath = path.join(videodirpath, i)
                        if (ext === '.info') {
                            let infojson = JSON.parse(fs.readFileSync(filepath))
                            videoname = infojson.PartName
                        } else if (ext === '.flv') {
                            flvs.push(filepath)
                        }
                    })
                    
                    let write = fs.createWriteStream(path.join(outvideodir,videoname+".flv"))
                    flvs.forEach(flv=>{
                        fs.createReadStream(flv).pipe(write,{end: false})
                    })
                }
            })
        }
    })
}

function stat(path) {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (err) reject(err)
            resolve(stats)
        })
    })
}

function readdir(path) {
    return new Promise((resolve, reject) => {
        fs.readdir(path, (err, files) => {
            if (err) reject(err)
            resolve(files)
        })
    })
}

try {
    start(downloaddir)
} catch (err) {
    console.log(err)
}
