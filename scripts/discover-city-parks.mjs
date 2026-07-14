// 一次性診斷腳本:測試各縣市候選公園開放資料 API,確認哪些真的能用、欄位長什麼樣子。
// 只在 CI 手動跑一次收集結果,不是正式同步管線的一部分。
const candidates = [
  { city: '新北市', url: 'https://data.ntpc.gov.tw/api/datasets/b3a30a19-4b89-4da2-8d99-18200dc5dfde/json' },
  { city: '新北市(公園2015泰山)', url: 'https://data.ntpc.gov.tw/api/datasets/04f78ac3-15ff-4af9-b13d-b6ef31584b28/json' },
  { city: '桃園市', url: 'https://data.tycg.gov.tw/opendata/datalist/datasetMeta/download?id=4e233760-cb9c-4bca-bef2-e14ac80b1667' },
  { city: '桃園市(CKAN)', url: 'https://data.tycg.gov.tw/api/3/action/package_show?id=4e233760-cb9c-4bca-bef2-e14ac80b1667' },
  { city: '臺中市(CKAN search)', url: 'https://opendata.taichung.gov.tw/api/3/action/package_search?q=%E5%85%AC%E5%9C%92' },
  { city: '臺南市(CKAN search)', url: 'https://data.tainan.gov.tw/api/3/action/package_search?q=%E5%85%AC%E5%9C%92' },
  { city: '高雄市(CKAN search)', url: 'https://data.kcg.gov.tw/api/3/action/package_search?q=%E5%85%AC%E5%9C%92' },
]

async function probe({ city, url }) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'HolidayGoWhere/2.0 (research; https://github.com/donald5043/HolidayGoWhere)', accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()
    let preview = text.slice(0, 300)
    let parsedInfo = ''
    try {
      const json = JSON.parse(text)
      if (Array.isArray(json)) {
        parsedInfo = `array[${json.length}] keys=${Object.keys(json[0] || {}).join(',')}`
      } else if (json.result?.results) {
        parsedInfo = `CKAN search: ${json.result.count} results; titles=${json.result.results.slice(0, 8).map((r) => r.title).join(' | ')}`
      } else if (json.result) {
        parsedInfo = `CKAN show: title=${json.result.title}; resources=${(json.result.resources || []).map((r) => `${r.name}(${r.format})`).join(', ')}`
      } else {
        parsedInfo = `object keys=${Object.keys(json).join(',')}`
      }
    } catch {
      parsedInfo = '(not JSON)'
    }
    console.log(`\n=== ${city} ===\nURL: ${url}\nstatus: ${res.status} | content-type: ${contentType}\n${parsedInfo}\npreview: ${preview.replace(/\n/g, ' ')}`)
  } catch (error) {
    console.log(`\n=== ${city} ===\nURL: ${url}\nERROR: ${error.message}`)
  }
}

for (const candidate of candidates) {
  await probe(candidate)
}
