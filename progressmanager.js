class ProgressManager {
	constructor(options) {
		this.queue = []
		this.stream = process.stderr
		this.isFirst = true
		this.headlen = 0
	}

	createProgress(options) {
		let opts = {}
		Object.assign(opts, options)
		opts.curr = opts.curr || 0
		let headlen = opts.head.length
		if (this.headlen < headlen) {
			this.headlen = headlen
		}
		let p = new Progress(opts)
		this.queue.push(p)
		return p
	}
	/**
	 *  事件触发渲染
	 *
	 * @param {Progress} p
	 * @param {number} len
	 * @memberof DownloadManager
	 */
	tick(p, len) {
		let txts = []
		this.queue.forEach(i => {
			if (i === p) {
				i.curr += len
			}
			txts.push(i.render(this.headlen))
		})

		if (this.isFirst) {
			this.isFirst = false
			this.stream.moveCursor(0, 0)
		} else {
			//-((txts.length-1)+1)  计算从0开始，+1 则是多一个空行，控制台不会不断跳动
			this.stream.moveCursor(0, -(txts.length - 1 + 1))
			this.stream.clearLine(0)
			this.stream.cursorTo(0)
		}
		this.stream.write('\n') //不让输出控制台抖动
		this.stream.write(txts.join('\n'))
	}
	finish(p) {
		let isfinish = true
		this.queue.forEach(i => {
			if (i === p) {
				i.isfinish = true
			}
			isfinish = isfinish && i.isfinish
		})
		if (isfinish) {
			this.stream.write('\n')
		}
	}
}
class Progress {
	constructor(options) {
		this.total = options.total
		this.curr = options.curr
		this.head = options.head
	}
	render(headlen) {
		if(this.curr === 0 ){
			this.start = new Date()
		}
	
		let ratio = this.curr / this.total
		ratio = Math.min(Math.max(ratio, 0), 1)
		let percent = ratio * 100
		percent = percent.toFixed(2)
		let val = parseInt(50 * ratio)
		let progresstext = ''.padEnd(val, '=') + ''.padEnd(50 - val, '-')
		let head = this.head.padEnd(headlen, ' ')
		let elapsed = (new Date() - this.start) || 1
		let rate = this.curr / (elapsed / 1000) / 1024
		return `${head}:[${progresstext}] ${percent}%  ${Math.round(rate)}/kbps`
	}
}

exports = module.exports = new ProgressManager()
