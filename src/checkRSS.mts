import Parser from 'rss-parser'
import { readAsyncJSON, writeJSON } from './utils.mjs'

const parser = new Parser()

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

export type AnimeFile = Record<string, number>

export const getAnimes = () => Promise.all([
	readAsyncJSON<AnimeFile>('./lastRSS.json'),
	parser.parseURL('https://darklibria.it/rss.xml').then((feed) => {
		const animes = {} as AnimeFile

		feed.items.forEach((item) => {
			const slug = item.link.substring(item.link.lastIndexOf('/') + 1)
			const torrent = new Date(item.pubDate + 'Z').getTime()

			animes[slug] = Math.max(animes[slug] ?? 0, torrent)
		})

		return animes
	})
]).then(([lastAnimes, newAnimes]) => {
	const commonAnimes = {} as AnimeFile

	for (const slug in newAnimes) {
		if (slug in lastAnimes) {
			const lAnime = lastAnimes[slug]
			const nAnime = newAnimes[slug]

			if (nAnime === lAnime) {
				commonAnimes[slug] = nAnime
				delete newAnimes[slug]
			}
		}
	}

	writeJSON('./lastRSS.json', {
		...commonAnimes,
		...newAnimes
	})

	return newAnimes
})
