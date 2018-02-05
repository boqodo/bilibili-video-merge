const r2 = require('r2')
const fs = require('fs')
const { spawn } = require('child_process')
const puppeteer = require('puppeteer')
const { URL } = require('url')
const path = require('path')
const cheerio = require('cheerio')
const EventEmitter = require('events')
const ProgressManager = require('./progressmanager')
const _ = require('lodash')
// chrome安装目录
const executablePath =
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'

// 要下载的动画地址
const videourl = 'https://www.bilibili.com/bangumi/play/ep114966'
// 下载动画存放目录
const savedir = 'D:\\bilibilisavedir'
// 第几季，从0开始
let seasonnum = 0
// 第几集到第几集（包含）
let [first, last] = [40, 41]
first = first || 0
last = last || Number.MAX_SAFE_INTEGER

/**
 * 根据任意一集动画的地址，提取对应动画各季下的动画地址
 *
 * @param {string} url
 * @returns {Promise.<{[index:string]:Array.<string>}>}
 */
async function extraSeason(url) {
	let text = await r2(url).text
	let $ = cheerio.load(text)
	let seasonurl = $('meta[property="og:url"]').attr('content')
	seasonurl = seasonurl.endsWith('/')
		? seasonurl.substring(0, seasonurl.length - 1)
		: seasonurl
	let last = seasonurl.lastIndexOf('/')
	let seasonval = seasonurl.substring(last + 1 + 2)
	let store = await extraVideoItemUrls(seasonval)
	return store
}
async function extraVideoItemUrls(sval) {
	let store = await parseSearson(sval)
	let ss = store.searsons
	delete store['searsons']

	if (ss && ss.length > 0) {
		let promises = []
		ss.filter(s => s.season_id != sval).forEach(s => {
			promises.push(parseSearson(s.season_id))
		})
		let sss = await Promise.all(promises)
		sss.forEach(s => {
			delete s['searsons']
			Object.assign(store, s)
		})
	}
	return store

	async function parseSearson(seasonval) {
		let searsonlisturl = `https://bangumi.bilibili.com/view/web_api/season?season_id=${seasonval}`
		let json = await r2(searsonlisturl).json
		let key = json.result.title
		let _store = {}
		if (!_store[key]) {
			let videoItems = []
			json.result.episodes.forEach(ep => {
				let videoitemurl = `https://www.bilibili.com/bangumi/play/ep${ep.ep_id}`
				videoItems.push({
					url: videoitemurl,
					title: ep.index_title,
					num: ep.index
				})
			})
			_store[key] = videoItems
		}
		_store.searsons = json.result.seasons
		return _store
	}
}

async function getSeasonUrls(videourl) {
	videourl = videourl.endsWith('/')
		? videourl.substring(0, videourl.length - 1)
		: videourl
	let last = videourl.lastIndexOf('/')
	let videono = videourl.substring(last + 1)
	let file = `./${videono}.json`
	try {
		let buffer = fs.readFileSync(file)
		return JSON.parse(buffer)
	} catch (e) {
		let store = await extraSeason(videourl)
		fs.writeFileSync(file, JSON.stringify(store))
		return store
	}
}

/**
 * 使用puppeteer操作浏览器打开地址并下载
 *
 * @param {Array.<string>} downloadvideourls
 */
async function openbrowserhandler(downloadvideourls) {
	const browser = await puppeteer.launch({
		headless: true,
		executablePath: executablePath
	})

	const emit = new EventEmitter()
	let count = 0
	let realvideos = []
	emit.on('parseResponseComplete', async args => {
		count++
		realvideos = realvideos.concat(args)
		if (count === downloadvideourls.length) {
			await browser.close()
			let downpromises = []
			realvideos.forEach(rv => {
				downpromises.push(download(rv))
			})
			let ress = await Promise.all(downpromises)
			console.log('下载完成！')

			let map = _.groupBy(ress, file => path.basename(file).split('-')[0])
			let mergepromises = []
			let mergelistfiles = []
			let savefilepaths = []
			for (let k in map) {
				let v = map[k]
				let savefilepath = path.join(savedir, k + '.flv')
				let mergelisttxt = path.join(savedir, k + 'mergelist.txt')
				mergelistfiles.push(mergelisttxt)
				savefilepaths.push(savefilepath)
				mergepromises.push(merge(v, savefilepath, mergelisttxt))
			}
			await Promise.all(mergepromises)
			console.log('合并完成！')
			mergelistfiles.forEach(m => fs.unlinkSync(m))
			console.log('清理合并文件完成！')
			await Promise.all(savefilepaths.map(metaDataHandler))
			console.log('视频信息处理完成！')
		}
	})
	downloadvideourls.forEach(async video => {
		let videourl = video.url
		const page = await browser.newPage()
		await page.on('response', async response => {
			const url = response.url()
			if (url.indexOf('/playurl?') !== -1 && response.ok) {
				let json = await response.json()
				let downs = []
				json.durl.forEach((item, index) => {
					let downurl = new URL(item.url)
					let videoitem = {
						downurl: downurl,
						seqnum: index,
						filesize: item.size
					}
					downs.push(Object.assign(videoitem, video))
				})
				emit.emit('parseResponseComplete', downs)
			}
		})
		await page.goto(videourl, { timeout: 0, waitUntil: 'networkidle0' })
	})
}

/**
 * 下载视频分段信息到指定目录
 *
 * @param {{downurl:string,seqnum:number,url: string,title: string,num: number}} video  视频对象
 */
async function download(video) {
	return new Promise(async (resolve, reject) => {
		console.log(video)
		let referer = video.url
		let downloadurl = video.downurl
		let filename = `${video.num}${video.title}-${video.seqnum}.flv`
		let savefile = path.join(savedir, filename)
		console.log(savefile)
		let isdown = await isDownloaded({
			filename: savefile,
			filesize: video.filesize
		})
		if (!isdown) {
			let headers = {
				Host: downloadurl.host,
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/58.0',
				Accept: '*/*',
				'Accept-Language': 'zh-CN,zh;q=0.9',
				'Accept-Encoding': 'gzip, deflate, br',
				'Access-Control-Request-Headers': 'range',
				'Access-Control-Request-Method': 'GET',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				Origin: 'https://www.bilibili.com',
				Pragma: 'no-cache',
				Referer: referer
			}
			let res = await r2(downloadurl.href, { headers }).response

			let bar = ProgressManager.createProgress({
				total:video.filesize,
				head:savefile
			})
			let write = fs.createWriteStream(savefile)
			res.body.on('error', data => {
				reject(data)
			})
			res.body.on('data', function(chunk) {
				ProgressManager.tick(bar,chunk.length)
			})
			res.body.on('end', () => {
				ProgressManager.finish(bar)
				resolve(savefile)
			})
			res.body.pipe(write)
		} else {
			resolve(savefile)
		}
	})
}
async function isDownloaded(downitem) {
	let file = downitem.filename
	let filesize = downitem.filesize
	return new Promise((resolve, reject) => {
		fs.stat(file, (err, stats) => {
			if (err) {
				err.code === 'ENOENT' ? resolve(false) : reject(err)
			}
			resolve(stats && stats.size === filesize)
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
			//console.log(`yamdi stdout: ${data}`)
		})

		ls.stderr.on('data', data => {
			//console.log(`yamdi stderr: ${data}`)
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
;(async () => {
	let store = await getSeasonUrls(videourl)
	let ss = Object.keys(store)
		.filter((_, i) => i === seasonnum)
		.map(k => store[k])
		.pop()
	let urls = ss.filter((_, i) => i >= first && i <= last)
	await openbrowserhandler(urls)
})()
