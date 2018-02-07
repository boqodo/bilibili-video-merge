const fs = require('fs')
const path = require('path')
const stream = require('stream')
const { spawn } = require('child_process')

// bilibili客户端下载文件所在目录 如：C:\\Users\\xxx\\AppData\\Local\\Packages\\LocalCache\\BilibiliDownload
const downloaddir = 'BilibiliDownload'
// 合并文件后输出的目录 如: D:\\bilibili
const outvideodir = '保存文件目录'
// 合并第几集到第几集
let [first, last] = [0, 99]
first = first === void 0 ? 0 : first
last = last === void 0 ? Number.MAX_SAFE_INTEGER : last
async function start(dir) {
	let files = await readdir(dir)
	files.forEach(async f => {
		let fpath = path.join(dir, f)
		let stats = await stat(fpath)
		let isdir = stats.isDirectory()
		if (isdir) {
			let videodirs = await readdir(fpath)
			videodirs.filter(v => v >= first && v <= last).forEach(async v => {
				let videodirpath = path.join(fpath, v)
				let vstats = await stat(videodirpath)
				if (vstats.isDirectory()) {
					let videofiles = await readdir(videodirpath)

					let flvs = []
					let videoname
					videofiles.forEach(i => {
						let ext = path.extname(i)
						let filepath = path.join(videodirpath, i)
						if (ext === '.info') {
							let infojson = JSON.parse(fs.readFileSync(filepath))
							videoname = infojson.PartName
						} else if (ext === '.flv') {
							flvs.push(filepath)
						}
					})

					let savefilepath = path.join(outvideodir, videoname + '.flv')
					let mergelisttxt = path.join(outvideodir, videoname + 'mergelist.txt')
					let res = await merge(flvs, savefilepath, mergelisttxt)
					fs.unlinkSync(mergelisttxt)
					console.log(`${savefilepath}合并${res ? '' : '不'}成功!`)
					await metaDataHandler(savefilepath)
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

function merge(filepaths, savefilepath, mergelisttxt) {
	let files = ''
	filepaths.forEach(f => {
		files += `file '${f}'\r\n`
	})
	fs.writeFileSync(mergelisttxt, files)
	return new Promise((resolve, reject) => {
		let ls = spawn('ffmpeg', [
			'-f',
			'concat',
			'-safe',
			'-1',
			'-i',
			mergelisttxt,
			'-c',
			'copy',
			'-y',
			savefilepath
		])
		ls.stdout.on('data', data => {
			//console.log(`stdout: ${data}`)
		})

		ls.stderr.on('data', data => {
			//console.log(`stderr: ${data}`)
		})

		ls.on('close', code => {
			code === 0 ? resolve(true) : reject(code)
		})
	})
}

function metaDataHandler(savefilepath) {
	let finalsavefilepath = path.join(
		path.dirname(savefilepath),
		path.basename(savefilepath, '.flv') + '_m.flv'
	)
	return new Promise((resolve, reject) => {
		let ls = spawn('yamdi', ['-i', savefilepath, '-o', finalsavefilepath])
		ls.stdout.on('data', data => {
			console.log(`yamdi stdout: ${data}`)
		})

		ls.stderr.on('data', data => {
			console.log(`yamdi stderr: ${data}`)
		})

		ls.on('close', code => {
			if(code === 0){
				fs.unlinkSync(savefilepath)
				fs.renameSync(finalsavefilepath,savefilepath)
				resolve(true)
			}else{
				reject(code)
			}
		})
	})
}

try {
	start(downloaddir)
} catch (err) {
	console.log(err)
}
