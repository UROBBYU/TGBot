import { writeFileSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import https from 'https'
import parseHTML from 'html-ps'

export const writeJSON = (path: string, data: object) =>
	writeFileSync(path, JSON.stringify(data))

export const readJSON = <R extends object>(path: string): R =>
	JSON.parse(readFileSync(path).toString())

export const readAsyncJSON = <R extends object>(src: string) =>
	readFile(src)
		.then((f) => JSON.parse(f.toString()) as R)

export const fetch = (
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

export const offsetStr = (str: string, offset: number) => {
	const lO = ' '.repeat(Math.floor(offset / 2))
	const rO = ' '.repeat(Math.ceil(offset / 2))

	return '<code>' + lO + str + rO + '</code>'
}

export const a = (href: string, text: string) => `<a href="${href}">${text}</a>`

export const genCap = ({
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
			tURL: a('https://tv3.darklibria.it' + v.url, '📦'),
			// eslint-disable-next-line max-len
			mURL: a(`http://uhostu.asuscomm.com:5500/darkmagnet/${slug}/${encodeURIComponent(v.type)}`, '🧲')
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

export const getAnime = async (slug: string) => {
	const link = 'https://tv3.darklibria.it/release/' + slug

	const animPageSrc = await fetch(link)

	if (!animPageSrc) throw new Error('Couldn\'t fetch title page', {
		cause: link
	})

	const animPage = parseHTML(animPageSrc)

	if (!animPage) throw new Error('Couldn\'t parse title page', {
		cause: link
	})

	const imgPath = animPage
		.getElementsByTagName('picture')[0]
		.getElementsByTagName('img')[0]
		.getAttribute('src')

	const image = 'https://tv3.darklibria.it' + imgPath
	const title = animPage.getElementById('russian_name').innerText
	const oT = animPage.getElementById('original_name').innerText
	const description = animPage.getElementById('description').innerText

	const torrs = animPage.getElementById('torrents_table_in_release')
		?.getElementsByTagName('tbody')[0]
		?.getElementsByTagName('tr')
		?.map(v => {
			const [seriesE, typeE, sizeE] = v.getElementsByTagName('ul')

			return ({
				series: seriesE.innerText,
				type: typeE.innerText,
				size: sizeE.innerText,
				url: v.getElementsByTagName('a')[0].getAttribute('href')
			})
		}) ?? []

	return {
		image,
		title,
		originalTitle: oT,
		description,
		slug,
		torrents: torrs
	}
}

export const findAnime = async (query: string) => {
	const findPageLink = 'https://darklibria.it/search?find='
		+ encodeURIComponent(query)
	const findPageSrc = await fetch(findPageLink)

	if (!findPageSrc) throw new Error('Couldn\'t fetch search page', {
		cause: findPageLink
	})

	const findPage = parseHTML(findPageSrc)

	if (!findPage) throw new Error('Couldn\'t parse search page', {
		cause: findPageLink
	})

	const linkPad = findPage
		.getElementById('torrents_table')
		?.getElementsByTagName('table')[0]

	if (!linkPad) return null

	const link = linkPad
		?.getElementsByTagName('a')[0]
		?.getAttribute('href')

	if (!link) throw new Error('Couldn\'t get title link', {
		cause: findPageLink
	})

	return getAnime(link.substring(link.lastIndexOf('/') + 1))
}