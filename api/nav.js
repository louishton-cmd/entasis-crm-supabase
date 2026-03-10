// api/nav.js — Vercel serverless function
// Proxy Yahoo Finance pour éviter CORS
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { isin } = req.query
  if (!isin) return res.status(400).json({ error: 'isin required' })

  try {
    // 1. Chercher le ticker Yahoo via ISIN
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=1&newsCount=0&enableFuzzyQuery=false`
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const searchData = await searchRes.json()
    const quote = searchData?.quotes?.[0]
    if (!quote?.symbol) return res.status(404).json({ error: 'not found', isin })

    const symbol = quote.symbol

    // 2. Récupérer la VL actuelle
    const priceUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`
    const priceRes = await fetch(priceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const priceData = await priceRes.json()
    const meta = priceData?.chart?.result?.[0]?.meta
    if (!meta) return res.status(404).json({ error: 'no price data', symbol })

    const closes = priceData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []
    const validCloses = closes.filter(c => c != null)
    const lastClose = validCloses[validCloses.length - 1]
    const prevClose = validCloses[validCloses.length - 2]
    const change = lastClose && prevClose ? ((lastClose - prevClose) / prevClose) * 100 : null

    const timestamps = priceData?.chart?.result?.[0]?.timestamp || []
    const lastTs = timestamps[timestamps.length - 1]
    const lastDate = lastTs ? new Date(lastTs * 1000).toLocaleDateString('fr-FR') : null

    return res.status(200).json({
      isin,
      symbol,
      name: meta.longName || meta.shortName || quote.longname || quote.shortname,
      currency: meta.currency,
      vl: lastClose ? Math.round(lastClose * 100) / 100 : null,
      change: change ? Math.round(change * 100) / 100 : null,
      date: lastDate,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
