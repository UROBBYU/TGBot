/* eslint-disable no-useless-escape */
import express from 'express'
import TeleBot from 'telebot'
import numeral from 'numeral'
import parseHTML from 'html-ps'
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

export const fetchText = (
	url: string,
	options: https.RequestOptions & { body?: string } = { method: 'GET' }
) => new Promise<string>((res, rej) => {
	const req = https.request(
		url,
		options
	).on('error', rej).once('response', (r) => {
		let data = Buffer.from('')

		r.on('data', (d) => {
			data = Buffer.concat([data, d])
		})
		r.once('end', () => {
			if (r.complete) res(data.toString())
			else rej(new Error("Data wasn't transmitted correctly"))
		})
	})

	if (options?.body) req.write(options.body)
	req.end()
})

export function pad(num: number) {
	const s = '00' + num
	return s.substring(s.length - 2)
}

export const ts = (text?: string) => {
	const d = new Date()
	const h = pad(d.getHours())
	const m = pad(d.getMinutes())
	const s = pad(d.getSeconds())

	let str = `${h}:${m}:${s}`
	if (text) str += ` > ${text}`
	return str
}

const findAnime = async (uid: number, query: string) => {
	const nfRep = () => main.telebot.sendMessage(
		uid,
		'😿 Мне очень жаль, но я не смогла ничего найти, ня!'
	).catch(err => checkBlocked(uid, err))

	main.telebot.sendMessage(uid, 'Сию секунду господин!')
		.catch(err => checkBlocked(uid, err))

	try {
		// eslint-disable-next-line max-len
		const findPageSrc = await fetchText('https://darklibria.it/search?find=' + encodeURIComponent(query))

		if (!findPageSrc) return nfRep()

		const findPage = parseHTML(findPageSrc)

		if (!findPage) return nfRep()

		const link = findPage
			.getElementById('torrents_table')
			?.getElementsByTagName('table')[0]
			?.getElementsByTagName('a')[0]
			?.getAttribute('href')

		if (!link) return nfRep()

		const animPageSrc = await fetchText(link)

		if (!animPageSrc) return nfRep()

		const animPage = parseHTML(animPageSrc)

		if (!animPage) return nfRep()

		const imgPath = animPage
			.getElementsByTagName('picture')[0]
			?.getElementsByTagName('img')[0]
			?.getAttribute('src')

		const image = 'https://tv3.darklibria.it' + imgPath
		const title = animPage.getElementById('russian_name').innerText
		const originalTitle =animPage.getElementById('original_name').innerText
		const description = animPage.getElementById('description').innerText
		const slug = link.substring(link.lastIndexOf('/') + 1)

		const torrents = animPage.getElementById('torrents_table_in_release')
			?.getElementsByTagName('tbody')[0]
			?.getElementsByTagName('tr')
			?.map(v => {
				const [seriesE, typeE, sizeE] = v.getElementsByTagName('ul')

				const size = sizeE.innerText
					.replace('Кб', 'KB')
					.replace('Мб', 'MB')
					.replace('Гб', 'GB')
					.replace('Тб', 'TB')

				return ({
					series: seriesE.innerText,
					type: typeE.innerText,
					size,
					url: v.getElementsByTagName('a')[0].getAttribute('href')
				})
			}) ?? []

		// eslint-disable-next-line max-len
		main.telebot.sendPhoto(
			uid,
			image, {
				parseMode: 'html',
				caption: genCap({
					message: '🕵️‍♀️ Нашла!',
					title,
					originalTitle,
					description,
					slug,
					torrents
				})
			}
		).catch(err => checkBlocked(uid, err))
	} catch (err) {
		console.warn(ts('Got error while searching for anime:\n'), err)
		nfRep()
	}
}

class Main {
	magnetServer: HTTPServer
	telebot = new TeleBot({
		token: process.env.TG_Delta_Token
	})
	users = readJSON('./users.json') as Record<number, User>

	start() {
		this.magnetServer = this.startMagnetServer()
		this.startBotServer()
	}

	startMagnetServer() {
		return express()
			.get('/darkmagnet/:slug/:type', async (req, res) => {
				req.params.type = req.params.type.replaceAll(' ', ' ')
				const { slug, type } = req.params

				const url = `https://tv3.darklibria.it/release/${slug}`

				const page = await fetchText(url).catch((err) => {
					console.warn(
						ts(`Failed to access magnet - '${url}'\n`),
						err
					)
					res.sendStatus(400)
				})

				if (!page) return

				// eslint-disable-next-line max-len
				const regex = new RegExp(`<tr class="torrent">.*?${type}<.*?"(magnet:\\?.+?)".*?<\\/tr>`, 's')

				const magnet = regex.exec(page)

				if (!magnet) {
					// eslint-disable-next-line max-len
					console.warn(ts(`Requested magnet cannot be fulfilled - ${url} - ${type}`))
					res.sendStatus(400)
					return
				}

				res.redirect(magnet[1])
			})
			.listen(5500, () =>
				console.log(
					ts(`Magnet server is running on:
http://uhostu.auscomm.com:5500/darkmagnet/`)
				)
			)
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

			// eslint-disable-next-line max-len
			msg.reply.text(`Добро пожаловать\\!
Теперь я буду уведомлять вас о выходе новых серий, ня\\.

А ещё вы можете поручить мне найти для вас тайтл просто написав:
\`Найди <название тайтла>\``, {
				parseMode: 'MarkdownV2'
			}).catch(err => checkBlocked(msg.from.id, err))
		})

		this.telebot.on('text', msg => {
			if (msg.text.startsWith('/')) return

			if (msg.text === 'leftChatMember') {
				console.log('leftChatMember', msg.from.name)
			// eslint-disable-next-line max-len
			} else if (/^(([Пп]рив(ет)?)|([Хх]ай)|([Кк]у))[!\.\?]?$/.test(msg.text))
				msg.reply.text('Добро пожаловать господин, ня!')
					.catch(err => checkBlocked(msg.from.id, err))
			else {
				const match = /^[Нн]айди (.+)$/.exec(msg.text)
				if (match?.[1]) findAnime(msg.from.id, match[1])
				else msg.reply.text('Ня?')
					.catch(err => checkBlocked(msg.from.id, err))
			}
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
		console.error(ts('Unknown error while fetching TG API:'), err)
	}
}

const offsetStr = (str: string, offset: number) => {
	const lO = ' '.repeat(Math.floor(offset / 2))
	const rO = ' '.repeat(Math.ceil(offset / 2))

	return '<code>' + lO + str + rO + '</code>'
}

const a = (href: string, text: string) => `<a href="${href}">${text}</a>`

const genCap = ({
	message,
	title,
	originalTitle,
	slug,
	description,
	torrents
}: {
	message: string,
	title: string
	originalTitle: string,
	slug: string
	description: string
	torrents: {
		series: string
		type: string
		size: string
		url: string
	}[]
}) => {
	const link = `https://tv3.darklibria.it/release/${slug}`

	const torrs = torrents.map((v) => {
		return {
			series: v.series,
			type: v.type,
			size: v.size,
			tURL: a(v.url, '📦'),
			// eslint-disable-next-line max-len
			mURL: a(`http://uhostu.asuscomm.com:5500/darkmagnet/${slug}/${v.type}`, '🧲')
		}
	})

	const { sML, tML, szML } = torrs.reduce(
		(t, v) => ({
			sML: Math.max(t.sML, v.series.length),
			tML: Math.max(t.tML, v.type.length),
			szML: Math.max(t.szML, v.size.length)
		}),
		{
			sML: 0,
			tML: 0,
			szML: 0
		}
	)

	const torrStr = torrs.map((v) => {
		const sO = sML - v.series.length
		const tO = tML - v.type.length
		const szO = szML - v.size.length

		// eslint-disable-next-line max-len
		return `${offsetStr(v.series, sO)} | ${offsetStr(v.type, tO)} | ${offsetStr(v.size, szO)} | ${v.tURL} ${v.mURL}`
	}).join('\n')

	// eslint-disable-next-line max-len
	const descLen = 1024 - (50 + message.length + title.length + originalTitle.length + (sML + tML + szML + 13) * torrs.length)

	if (descLen < 0) throw new Error('Negative description length', {
		cause: originalTitle
	})

	let desc = description
		.replaceAll('\r', '')
		.replaceAll('<br>', '\n')
		.replaceAll(/<\/?(?<![bius(code)(pre)]( .*?))>/g, '')
		.replaceAll(/[\n]+$/g, '')

	if (descLen < desc.length)
		desc = desc.substring(0, descLen - 1)+'</i>'+a(link, '<b>…</b>')+'<i>'

	return `<a href="${link}"><b>${message}</b></a>

<b>Название:</b> <code>${title}</code>
<b>Ориг. название:</b> <code>${originalTitle}</code>
<b>Описание:</b> <i>${desc}</i>

<b>Торрент:</b>
${torrStr}`
}

const runUpdate = async () => {
	console.log(ts('Checking RSS-Feed for new animes...'))

	const animes = await getAnimes()

	const animArr = Object.values(animes)
	if (!animArr.length) return console.log(ts('No new animes found'))

	console.log(ts(`Sending ${animArr.length} updates to users`))
	for (const id in main.users) {
		for (const oName in animes) {
			const anime = animes[oName]

			// eslint-disable-next-line max-len
			main.telebot.sendPhoto(id, `https://tv3.darklibria.it/upload/release/350x500/${anime.bannerID}.jpg`, {
				parseMode: 'html',
				caption: genCap({
					message: '❇️ Новое аниме!',
					title: anime.title,
					originalTitle: anime.originalTitle,
					description: anime.description,
					slug: anime.slug,
					torrents: anime.torrents.map(v => ({
						series: v.series,
						type: v.type,
						size: numeral(v.contentLength).format('0.00 b'),
						url: v.url
					}))
				})
			}).catch((err) => checkBlocked(+id, err))
		}
	}
}

runUpdate().then(() => setInterval(runUpdate, 3600000))
