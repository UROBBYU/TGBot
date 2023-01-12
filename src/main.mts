/* eslint-disable no-useless-escape */
import TeleBot from 'telebot'
import { env, chdir } from 'process'
import { getAnimes } from './checkRSS.mjs'
import {
	findAnime,
	genCap,
	getAnime,
	readJSON,
	ts,
	writeJSON
} from './utils.mjs'
import magnet from './magnet.mjs'

chdir('D:/Programming/JS/TGBot')

type Err = {
	ok: boolean
	error_code: number
	description: string
}

class Main {
	magnetServer: ReturnType<typeof magnet>
	telebot = new TeleBot({
		token: env.TG_Delta_Token
	})
	users = readJSON('./users.json') as Record<string, string>

	start() {
		this.magnetServer = this.startMagnetServer()
		this.startBotServer()
		this.runUpdate().then(() => setInterval(this.runUpdate, 3600000))
	}

	startMagnetServer() {
		return magnet()
	}

	startBotServer() {
		this.telebot.on('/start', (msg) => {
			const id = msg.from.id

			if (!this.users[id]) {
				this.users[id] = msg.from.username
				this.saveUserData()
			}

			msg.reply.text(`Добро пожаловать\\!
Теперь я буду уведомлять вас о выходе новых серий, ня\\.

А ещё вы можете поручить мне найти для вас тайтл просто написав:
\`Найди <название тайтла>\``, {
				parseMode: 'MarkdownV2'
			}).catch(err => this.checkBlocked(msg.from.id, err))
		})

		this.telebot.on('text', msg => {
			const txt = msg.text as string
			if (txt.startsWith('/')) return

			if (/^(([Пп]рив(ет)?)|([Хх]ай)|([Кк]у))[!\.\?]?$/.test(txt))
				msg.reply.text('Добро пожаловать господин, ня!')
					.catch(err => this.checkBlocked(msg.from.id, err))

			else if (/^[Нн]айди .+$/.test(txt)) {
				msg.reply.text('Сию секунду господин!')
					.catch(err => this.checkBlocked(msg.from.id, err))

				const notFound = () => msg.reply.text(
					'😿 Мне очень жаль, но я не смогла ничего найти, ня!'
				).catch(err => this.checkBlocked(msg.from.id, err))

				findAnime(txt.substring(6)).then(anime => {
					if (!anime) return notFound()
					msg.reply.photo(anime.image, {
						parseMode: 'html',
						caption: genCap({ ...anime, message: '🕵️‍♀️ Нашла!' })
					}).catch(err => this.checkBlocked(msg.from.id, err))
				}).catch(err => {
					console.warn(
						ts('Got error while searching for anime:\n'),
						err
					)
					notFound()
				})

			} else msg.reply.text('Ня?')
				.catch(err => this.checkBlocked(msg.from.id, err))
		})

		this.telebot.start()
	}

	runUpdate = async () => {
		console.log(ts('Checking RSS-Feed for new animes...'))
	
		const slugs = Object.keys(await getAnimes())

		if (!slugs.length) return console.log(ts('No new animes found'))

		console.log(ts(`Parsing ${slugs.length} new titles...`))

		const animes = await Promise.all(slugs.map(slug => getAnime(slug)))

		const messages = animes.map(anime => ({
			opts: {
				caption: genCap({ ...anime, message: '❇️ Новое аниме!' }),
				parseMode: 'html'
			},
			image: anime.image
		}))
	
		console.log(ts(`Sending updates to users`))
	
		for (const id in this.users)
			for (const message of messages)
				this.telebot.sendPhoto(id, message.image, message.opts)
					.catch((err) => this.checkBlocked(+id, err))
	}

	checkBlocked(id: number, err: Err) {
		if (err.description === 'Forbidden: bot was blocked by the user') {
			delete this.users[id]
			this.saveUserData()
		} else {
			console.error(ts('Unknown error while fetching TG API:'), err)
		}
	}

	saveUserData() {
		writeJSON('./users.json', this.users)
	}
}

const main = new Main()

main.start()
