// api/nav.js — Vercel serverless function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { isin } = req.query
  if (!isin) return res.status(400).json({ error: 'isin required' })

  try {
    // 1. Trouver le ticker Yahoo via ISIN
    const searchRes = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=1&newsCount=0&enableFuzzyQuery=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const searchData = await searchRes.json()
    const quote = searchData?.quotes?.[0]
    if (!quote?.symbol) return res.status(404).json({ error: 'not found', isin })
    const symbol = quote.symbol

    // 2. Récupérer 1 an de données pour calculer 1M / 3M / 1Y
    const priceRes = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const priceData = await priceRes.json()
    const result = priceData?.chart?.result?.[0]
    if (!result) return res.status(404).json({ error: 'no price data', symbol })

    const closes = result.indicators?.quote?.[0]?.close || []
    const timestamps = result.timestamps || result.timestamp || []

    // Nettoyer les nulls
    const valid = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter(x => x.c != null)

    if (valid.length === 0) return res.status(404).json({ error: 'no closes', symbol })

    const last    = valid[valid.length - 1]
    const prev    = valid[valid.length - 2]
    const now     = last.t * 1000
    const oneW    = now - 7   * 24 * 3600 * 1000
    const oneM    = now - 30  * 24 * 3600 * 1000
    const threeM  = now - 91  * 24 * 3600 * 1000
    const oneY    = now - 365 * 24 * 3600 * 1000

    function closest(targetMs) {
      return valid.reduce((best, x) => {
        return Math.abs(x.t * 1000 - targetMs) < Math.abs(best.t * 1000 - targetMs) ? x : best
      }).c
    }

    function perf(from) {
      if (!from || !last.c) return null
      return Math.round(((last.c - from) / from) * 10000) / 100
    }

    const vl1W  = closest(oneW)
    const vl1M  = closest(oneM)
    const vl3M  = closest(threeM)
    const vl1Y  = closest(oneY)

    return res.status(200).json({
      isin,
      symbol,
      name: result.meta?.longName || result.meta?.shortName || quote.longname || '',
      currency: result.meta?.currency || 'EUR',
      vl:     Math.round(last.c * 100) / 100,
      change: prev ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : null,
      date:   new Date(last.t * 1000).toLocaleDateString('fr-FR'),
      perf1W:  perf(vl1W),
      perf1M:  perf(vl1M),
      perf3M:  perf(vl3M),
      perf1Y:  perf(vl1Y),
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
