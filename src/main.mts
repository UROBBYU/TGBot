import express from 'express'
import TeleBot from 'telebot'
import numeral from 'numeral'
import fs from 'fs'
import https from 'https'
import process from 'process'
import { getAnimes } from './checkRSS.mjs'
import type { Server as HTTPServer } from 'http'

type User = {
	id: number
	name: string
}

type Err = {
	ok: boolean
	error_code: number
	description: string
}

export const writeJSON = (path: string, data: object) =>
	fs.writeFileSync(path, JSON.stringify(data))

export const readJSON = <R extends object>(path: string): R =>
	JSON.parse(fs.readFileSync(path).toString())

export const fetchText = (url: string) => new Promise<string>((res, rej) =>
	https.get(url).on('error', rej).once('response', r => {
		let data = Buffer.from('')
		
		r.on('data', d => { data = Buffer.concat([data, d]) })
		r.once('end', () => {
			if (r.complete) res(data.toString())
			else rej(new Error('Data wasn\'t transmitted correctly'))
		})
	})
)

class Main {
	magnetServer: HTTPServer
	telebot = new TeleBot({
		token: process.env.TG_Delta_Token
	})
	users = readJSON('./users.json') as Record<
		number,
		User
	>

	start() {
		this.magnetServer = this.startMagnetServer()
		this.startBotServer()
	}

	startMagnetServer() {
		return express().get('/darkmagnet/:slug/:type', async (req, res) => {
			req.params.type = req.params.type.replaceAll(' ', ' ')
			const { slug, type } = req.params

			const url = `https://tv3.darklibria.it/release/${slug}`

			const page = await fetchText(url).catch(err => {
				console.warn(`Failed to access magnet - '${url}'\n`, err)
				res.sendStatus(400)
			})

			if (!page) return

			// eslint-disable-next-line max-len
			const regex = new RegExp(`<tr class="torrent">.*?${type}<.*?"(magnet:\\?.+?)".*?<\\/tr>`, 's')

			const magnet = regex.exec(page)

			if (!magnet) {
				// eslint-disable-next-line max-len
				console.warn(`Requested magnet cannot be fulfilled - ${url} - ${type}`)
				res.sendStatus(400)
				return
			}

			res.redirect(magnet[1])
		}).listen(5500, () => console.log(`Magnet server is running on:
http://uhostu.auscomm.com:5500/darkmagnet/`))
	}

	startBotServer() {
		this.telebot.on('/start', (msg) => {
			const user = {
				id: msg.from.id,
				name: msg.from.username
			}
			if (!this.users[user.id]) {
				this.users[user.id] = user
				this.saveUserData()
			}
		})

		this.telebot.on('/hello', (msg) => {
			msg.reply.text('Добро пожаловать господин!', {
				parseMode: 'HTML'
			})
				.catch(err => console.log(err))
		})

		this.telebot.start()
	}

	saveUserData() {
		writeJSON('./users.json', this.users)
	}
}

const main = new Main()

main.start()

const checkBlocked = (id: number, err: Err) => {
	if (err.description === 'Forbidden: bot was blocked by the user') {
		delete main.users[id]
		main.saveUserData()
	} else {
		console.log('Unknown error while fetching TG API:', err)
	}
}

const offsetStr = (str: string, offset: number) => {
	const lO = ' '.repeat(Math.floor(offset / 2))
	const rO = ' '.repeat(Math.ceil(offset / 2))

	return '<code>' + lO + str + rO + '</code>'
}

const a = (href: string, text: string) => `<a href="${href}">${text}</a>`

const runUpdate = async () => {
	console.log('Checking RSS-Feed for new animes...')

	const animes = await getAnimes()

	const animArr = Object.values(animes)
	if (!animArr.length)
		return console.log('No new animes found')

	console.log(`Sending ${animArr.length} updates to users`)
	for (const id in main.users) {
		for (const oName in animes) {
			const anime = animes[oName]

			const link = `https://tv3.darklibria.it/release/${anime.slug}`
			
			const torrs = anime.torrents.map(v => {
				return {
					series: v.series,
					type: v.type,
					size: numeral(v.contentLength).format('0.00 b'),
					tURL: a(v.enclosure.url, '📦'),
					// eslint-disable-next-line max-len
					mURL: a(`http://uhostu.asuscomm.com:5500/darkmagnet/${anime.slug}/${v.type}`, '🧲')
				}
			})

			const { sML, tML, szML } = torrs.reduce((t, v) => ({
				sML: Math.max(t.sML, v.series.length),
				tML: Math.max(t.tML, v.type.length),
				szML: Math.max(t.szML, v.size.length)
			}), {
				sML: 0,
				tML: 0,
				szML: 0
			})

			const torrStr = torrs.map(v => {
				const sO = sML - v.series.length
				const tO = tML - v.type.length
				const szO = szML - v.size.length

				// eslint-disable-next-line max-len
				return `${offsetStr(v.series, sO)} | ${offsetStr(v.type, tO)} | ${offsetStr(v.size, szO)} | ${v.tURL} ${v.mURL}`
			}).join('\n')

			// eslint-disable-next-line max-len
			const descLen = 1024 - (64 + anime.title.length + anime.originalTitle.length + (sML + tML + szML + 13) * torrs.length)

			if (descLen < 0) throw new Error('Negative description length', {
				cause: anime.originalTitle
			})

			let desc = anime.description.replaceAll('\r', '')

			if (descLen < desc.length)
				desc = desc.substring(0,descLen - 1) + a(link,'</i><b>…</b><i>')

			const caption = `<a href="${link}"><b>❇️ Новое аниме!</b></a>
<b>Название:</b> <code>${anime.title}</code>
<b>Ориг. название:</b> <code>${anime.originalTitle}</code>
<b>Описание:</b> <i>${desc}</i>

<b>Торрент:</b>
${torrStr}`

			// console.log(descLen, desc)

			// eslint-disable-next-line max-len
			main.telebot.sendPhoto(id, `https://tv3.darklibria.it/upload/release/350x500/${anime.bannerID}.jpg`, {
				parseMode: 'html',
				caption
			}).catch(err => checkBlocked(+id, err))
		}
	}
}

runUpdate().then(() => setInterval(runUpdate, 3600000))