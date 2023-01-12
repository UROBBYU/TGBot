import Parser from 'rss-parser'
import fs from 'fs/promises'

const parser = new Parser({
	customFields: {
		item: ['contentLength', 'categoy', 'guid']
	}
})

export type Anime = {
	title: string
	originalTitle: string
	type: string
	description: string
	slug: string
	bannerID: number
	torrents: {
		series: string
		type: string
		contentLength: number
		publishDate: Date
		url: string
	}[]
}

export const getAnimes = () => Promise.all([
	fs.readFile('./lastRSS.json')
		.then((f) => JSON.parse(f.toString()) as Record<string, Anime>),
	parser.parseURL('https://darklibria.it/rss.xml').then((feed) => {
		const animes = {} as Record<string, Anime>

		feed.items.forEach((item) => {
			// eslint-disable-next-line max-len
			const [_, t, ts, tt, ot] = /(.+?)\s*\/\s*серии:\s(.+?)\s\[(.+?)\]\s*\/\s*(.+)/.exec(
				item.title
			)

			if (!_) throw new Error("Couldn't parse item title")

			const torrent = {
				series: ts,
				type: tt,
				contentLength: +item.contentLength,
				publishDate: new Date(item.pubDate + 'Z'),
				url: item.enclosure.url
			}

			const anim = {
				title: t,
				originalTitle: ot,
				type: item.categoy,
				description: item.content,
				slug: item.link.substring(item.link.lastIndexOf('/') + 1),
				bannerID: item.guid.substring(
					0,
					item.guid.length - item.contentLength.length
				),
				torrents: [torrent]
			}

			if (animes[ot]) animes[ot].torrents.push(torrent)
			else animes[ot] = anim
		})

		return animes
	})
]).then(([lastAnimes, newAnimes]) => {
	for (const name in lastAnimes) lastAnimes[name].torrents.forEach(v => {
		v.publishDate = new Date(v.publishDate)
	})

	const commonAnimes = {} as Record<string, Anime>

	for (const name in lastAnimes) if (name in newAnimes) {
		const lAnime = lastAnimes[name]
		const nAnime = newAnimes[name]

		let flag = true
		for (const torr of lAnime.torrents) {
			const i = nAnime.torrents.find((v) =>
				v.publishDate.toJSON() === torr.publishDate.toJSON())

			if (!i) {
				const fi = nAnime.torrents
					.findIndex(v => v.type === torr.type)

				if (!~fi) nAnime.torrents.push(torr)
				else if (torr.publishDate.getTime()
					> nAnime.torrents[fi].publishDate.getTime()) {
					nAnime.torrents[fi] = torr
				}
				flag = false
			}
		}

		if (flag && nAnime.torrents.length <= lAnime.torrents.length) {
			commonAnimes[name] = lAnime
			delete newAnimes[name]
		}
	}

	fs.writeFile(
		'./lastRSS.json',
		JSON.stringify({
			...commonAnimes,
			...newAnimes
		})
	)

	return newAnimes
})
