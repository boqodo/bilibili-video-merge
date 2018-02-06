const r2 = require('r2')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const crypto = require('crypto')
const { URL, URLSearchParams } = require('url')
const _ = require('lodash')
const ProgressManager = require('./progressmanager')

const videourl =
	'http://tv.cctv.com/2017/10/17/VIDEPwGJLUoyBE1Fl4kBJS1Q171017.shtml'
const savedir = 'D:\\ztest-demo\\pp\\test\\'
// 第几集到第几集（包含）
let [first, last] = [47, 47]
first = first || 0
last = last || Number.MAX_SAFE_INTEGER
;(async () => {
	try {
		let store = await getSeasonUrls(videourl)

		let videos = store.filter((_, i) => i >= first && i <= last)
		if (!videos || videos.length === 0) {
			console.log('未有匹配的可下载资源')
			return
		}

		let urlress = await Promise.all(videos.map(parsedownloadurl))
		let realvideos = _.flattenDeep(urlress)

		let downress = await Promise.all(realvideos.map(download))
		console.log('下载完成！')
		let map = _.groupBy(downress, file => path.basename(file).split('-')[0])
		let mergepromises = []
		let mergelistfiles = []
		let savefilepaths = []
		for (let k in map) {
			let v = map[k]
			let savefilepath = path.join(savedir, k + '.mp4')
			let mergelisttxt = path.join(savedir, k + 'mergelist.txt')
			mergelistfiles.push(mergelisttxt)
			savefilepaths.push(savefilepath)
			mergepromises.push(merge(v, savefilepath, mergelisttxt))
		}
		await Promise.all(mergepromises)
		console.log('合并完成！')
		mergelistfiles.forEach(m => fs.unlinkSync(m))
		console.log('清理合并文件完成！')
	} catch (e) {
		console.error(e)
	}
})()

async function parsedownloadurl(video) {
	let ourl = `http://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${video.guid}`
	let json = await r2(ourl).json

	let chapter = Object.keys(json.video)
		.filter(v => v.indexOf('chapter') > -1)
		.sort()
		.pop()
	let downs = await Promise.all(
		json.video[chapter].map(async (item, index) => {
			let downurl = new URL(item.url)
			let filesize = await filesizeHandler(item.url)
			let videoitem = {
				downurl: downurl,
				seqnum: index,
				filesize: filesize,
				title: json.title
			}
			return videoitem
		})
	)
	return downs
}
async function filesizeHandler(url) {
	let res = await r2.head(url).response
	return res.headers.get('content-length')
}

async function getSeasonUrls(videourl) {
	videourl = videourl.endsWith('/')
		? videourl.substring(0, videourl.length - 1)
		: videourl
	let last = videourl.lastIndexOf('/')
	let videono = videourl.substring(last + 1)
	let file = `./${path.basename(videono, '.shtml')}.json`
	try {
		let buffer = fs.readFileSync(file)
		return JSON.parse(buffer)
	} catch (e) {
		let store = await extraSeason(videourl)
		fs.writeFileSync(file, JSON.stringify(store))
		return store
	}
}

async function extraSeason(url) {
	let text = await r2(url).text
	let $ = cheerio.load(text)
	let videoid = $('meta[name="contentid"]').attr('content')
	let guidregex = /var guid = "(\w{32})";/gi
	let [, guid] = guidregex.exec(text)
	let cidregex = /var column_id = "(\w{20})";/gi
	let [, topicid] = cidregex.exec(text)
	let listurl = `http://api.cntv.cn/video/getVideoListByTopicIdInfo?videoid=${videoid}&topicid=${topicid}&serviceId=cbox&type=0&t=json`
	let json = await r2(listurl).json
	return json.data
}

async function download(video) {
	return new Promise(async (resolve, reject) => {
		let referer = video.url
		let downloadurl = video.downurl
		let filename = `${video.title}-${video.seqnum}.mp4`
		let savefile = path.join(savedir, filename)
		let downstatus = await downloadedStatus({
			filename: savefile,
			filesize: video.filesize
		})
		if (!downstatus) {
			let headers = {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/58.0'
			}
			let res = await r2(downloadurl.href, { headers }).response

			let bar = ProgressManager.createProgress({
				total: video.filesize,
				head: savefile
			})
			let write = fs.createWriteStream(savefile)
			res.body.on('error', data => {
				reject(data)
			})
			res.body.on('data', function(chunk) {
				ProgressManager.tick(bar, chunk.length)
			})
			res.body.on('end', () => {
				ProgressManager.finish(bar)
				resolve(savefile)
			})
			res.body.pipe(write)
		} else {
			if (downstatus.isPart) {
				console.log(video.filesize - downstatus.cursize)
				let headers = {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/58.0'
				}
				headers['Range'] = `bytes=${downstatus.cursize}-`
				let res = await r2(downloadurl.href, { headers }).response

				let bar = ProgressManager.createProgress({
					total: video.filesize - downstatus.cursize,
					head: savefile
				})
				let write = fs.createWriteStream(savefile, {
					flags: 'r+',
					start: downstatus.cursize
				})
				res.body.on('error', data => {
					reject(data)
				})
				res.body.on('data', function(chunk) {
					ProgressManager.tick(bar, chunk.length)
				})
				res.body.on('end', () => {
					ProgressManager.finish(bar)
					resolve(savefile)
				})
				res.body.pipe(write)
			} else {
				resolve(savefile)
			}
		}
	})
}
async function downloadedStatus(downitem) {
	let file = downitem.filename
	let filesize = downitem.filesize
	return new Promise((resolve, reject) => {
		fs.stat(file, (err, stats) => {
			if (err) {
				err.code === 'ENOENT' ? resolve(false) : reject(err)
			}
			if (!stats) {
				resolve(false)
			} else {
				resolve({ isPart: stats.size !== filesize, cursize: stats.size })
			}
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
			//console.log(`ffmpeg stdout: ${data}`)
		})

		ls.stderr.on('data', data => {
			//console.log(`ffmpeg stderr: ${data}`)
		})

		ls.on('close', code => {
			code === 0 ? resolve(true) : reject(code)
		})
	})
}
