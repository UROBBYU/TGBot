import express from 'express'
import { fetchText, ts } from './utils.mjs'

export default () => 
	express().get('/darkmagnet/:slug/:type', async (req, res) => {
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
	}).listen(5500, () =>
		console.log(
			ts(`Magnet server is running on:
http://uhostu.asuscomm.com:5500/darkmagnet/`)
		)
	)