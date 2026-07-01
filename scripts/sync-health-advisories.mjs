import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')
const OUTPUT = path.join(PUBLIC_DATA_DIR, 'health-advisories.json')

const NOW = new Date().toISOString()
const CDC_FETCH_RETRIES = Number(process.env.CDC_FETCH_RETRIES || 3)
const CDC_SEARCH_TIMEOUT_MS = Number(process.env.CDC_SEARCH_TIMEOUT_MS || 30000)
const CDC_RESOURCE_TIMEOUT_MS = Number(process.env.CDC_RESOURCE_TIMEOUT_MS || 30000)
const DISCLAIMER = '本提醒依政府公開資料整理，不能取代醫師診斷或治療建議；如孩子有不適或疑慮，請諮詢專業醫療人員。'

const SOURCES = {
  hpaDevelopment: {
    name: '兒童發展篩檢服務',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/List.aspx?nodeid=4856',
  },
  hpaHandbook: {
    name: '兒童健康手冊',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/EBook.aspx?nodeid=1139',
  },
  hpaEducation: {
    name: '兒童衛教手冊',
    agency: '衛生福利部國民健康署',
    url: 'https://www.hpa.gov.tw/Pages/EBook.aspx?nodeid=1459',
  },
  cdcOpenData: {
    name: '疾病管制署資料開放平台',
    agency: '衛生福利部疾病管制署',
    url: 'https://data.cdc.gov.tw/zh_TW/pages/developer',
  },
}

const officialSeeds = [
  {
    id: 'hpa-development-screening-under-7',
    category: 'development',
    severity: 'notice',
    title: '未滿 7 歲可以留意兒童發展篩檢時程',
    summary: '國健署兒童發展篩檢服務涵蓋粗大動作、精細動作、語言認知與社會發展；出門玩時也可以順手觀察孩子的動作與互動。',
    action: 'Q媽提醒：若接近篩檢年齡區間，出門前可以把兒童健康手冊一起放進包包。',
    applicableAges: [
      { label: '6至10個月', minMonths: 6, maxMonths: 10 },
      { label: '10個月至1歲6個月', minMonths: 10, maxMonths: 18 },
      { label: '1歲6個月至2歲', minMonths: 18, maxMonths: 24 },
      { label: '2至3歲', minMonths: 24, maxMonths: 36 },
      { label: '3至5歲', minMonths: 36, maxMonths: 60 },
      { label: '5至未滿7歲', minMonths: 60, maxMonths: 83 },
    ],
    regions: ['全國'],
    source: { ...SOURCES.hpaDevelopment, fetchedAt: NOW, dataPeriod: '國健署公開資訊' },
    evidence: '國健署公開資訊列出未滿7歲兒童新增6次兒童發展篩檢服務，服務項目包含粗大動作、精細動作、語言認知、社會發展。',
  },
  {
    id: 'hpa-child-handbook-outing-safety',
    category: 'safety',
    severity: 'info',
    title: '親子出遊前，先快速掃一次安全風險',
    summary: '兒童健康手冊包含家中常見嬰幼兒安全陷阱與緊急狀況處理等章節；外出到遊戲場、餐廳或商場，也可以用同樣概念檢查環境。',
    action: 'Q媽提醒：到新場地先看出口、洗手台、樓梯與尖角，讓孩子開始玩之前先少一點意外風險。',
    applicableAges: [{ label: '0至6歲', minMonths: 0, maxMonths: 83 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaHandbook, fetchedAt: NOW, dataPeriod: '兒童健康手冊' },
    evidence: '國健署兒童健康手冊提供兒童發展、預防接種、緊急狀況處理與衛教資料等章節。',
  },
  {
    id: 'hpa-child-education-infant-care',
    category: 'safety',
    severity: 'info',
    title: '小小孩出門，睡眠與照護用品也要想在前面',
    summary: '兒童衛教手冊包含早產兒居家照護、嬰兒猝死症預防、副食品添加、營養與事故傷害預防等育兒保健資訊。',
    action: 'Q媽提醒：0–2 歲出門可以多確認尿布、替換衣物、餵食用品與安全睡眠安排。',
    applicableAges: [{ label: '0至2歲', minMonths: 0, maxMonths: 35 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaEducation, fetchedAt: NOW, dataPeriod: '兒童衛教手冊' },
    evidence: '國健署兒童衛教手冊提供家長及主要照顧者育兒保健資訊，包含嬰兒照護、副食品、營養與預防事故傷害。',
  },
  {
    id: 'hpa-child-nutrition-outing',
    category: 'nutrition',
    severity: 'info',
    title: '半日行程也要幫孩子保留喝水與點心節奏',
    summary: '兒童衛教手冊收錄嬰幼兒與兒童期每日膳食營養素等資訊；安排親子行程時，別只看景點，也要預留補水與用餐時間。',
    action: 'Q媽提醒：戶外放電或排隊活動前，先準備水、簡單點心與休息點，爸媽比較不會被臨時狀況追著跑。',
    applicableAges: [{ label: '0至12歲', minMonths: 0, maxMonths: 155 }],
    regions: ['全國'],
    source: { ...SOURCES.hpaEducation, fetchedAt: NOW, dataPeriod: '兒童衛教手冊' },
    evidence: '國健署兒童衛教手冊包含副食品添加、嬰幼兒與兒童期營養等育兒保健資訊。',
  },
]

const ageRanges = {
  allChildren: [{ label: '0至12歲', minMonths: 0, maxMonths: 155 }],
  babyToddler: [{ label: '0至2歲', minMonths: 0, maxMonths: 35 }],
  preschool: [{ label: '3至5歲', minMonths: 36, maxMonths: 71 }],
  schoolAge: [{ label: '6至12歲', minMonths: 72, maxMonths: 155 }],
  underSeven: [{ label: '0至未滿7歲', minMonths: 0, maxMonths: 83 }],
  mixedUnderSeven: [
    { label: '0至2歲', minMonths: 0, maxMonths: 35 },
    { label: '3至5歲', minMonths: 36, maxMonths: 71 },
  ],
}

function healthSeed({
  id,
  category,
  severity = 'info',
  title,
  summary,
  action,
  age = ageRanges.allChildren,
  source,
  dataPeriod,
  evidence,
}) {
  return {
    id,
    category,
    severity,
    title,
    summary,
    action,
    applicableAges: age,
    regions: ['全國'],
    source: {
      ...source,
      fetchedAt: NOW,
      dataPeriod,
    },
    evidence,
  }
}

const expandedOfficialSeeds = [
  ...officialSeeds,
  healthSeed({
    id: 'hpa-outing-check-energy-appetite',
    category: 'safety',
    title: '出門前先看精神、食慾與活動力',
    summary: '兒童健康手冊與兒童衛教資料都強調日常觀察的重要性；若孩子精神、食慾或活動力明顯和平常不同，行程可以先放慢。',
    action: 'Q媽提醒：今天若要跑多個點，先把行程改成一個主景點加一個休息點，爸媽比較不會硬撐。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊與兒童衛教資料整理，提醒家長出遊前觀察孩子狀態。',
  }),
  healthSeed({
    id: 'hpa-outing-hydration-breaks',
    category: 'nutrition',
    title: '半日行程也要安排喝水與休息',
    summary: '兒童衛教手冊收錄兒童營養與照護資訊；外出時若只排景點、不排休息點，孩子容易在後半段失去耐心。',
    action: 'Q媽提醒：每段活動中間留 15–20 分鐘喝水、吃點心或換尿布，行程會穩很多。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊之兒童照護與營養主題整理。',
  }),
  healthSeed({
    id: 'hpa-baby-diaper-bag-before-going',
    category: 'safety',
    title: '0–2 歲出門，尿布包比景點更重要',
    summary: '嬰幼兒照護重視規律與安全；對小小孩來說，乾淨尿布、替換衣物與餵食用品常常比多跑一個景點更關鍵。',
    action: 'Q媽提醒：尿布、濕紙巾、替換衣物、常用安撫物先放同一袋，臨時狀況比較不慌。',
    age: ageRanges.babyToddler,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊嬰幼兒照護主題整理。',
  }),
  healthSeed({
    id: 'hpa-baby-safe-sleep-nap',
    category: 'safety',
    title: '小小孩午睡點要先想好',
    summary: '嬰幼兒照護資料提醒家長重視安全睡眠與照護環境；外出若跨過午睡時間，先確認哪裡可以安靜休息。',
    action: 'Q媽提醒：選景點時優先看有沒有育嬰室、親子廁所、安靜角落或可推車通行的室內空間。',
    age: ageRanges.babyToddler,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊嬰幼兒照護與安全睡眠主題整理。',
  }),
  healthSeed({
    id: 'hpa-baby-feeding-rhythm',
    category: 'nutrition',
    title: '0–2 歲行程跟著餵食節奏排',
    summary: '嬰幼兒照護需要兼顧餵食與休息節奏；行程若剛好卡在餵奶或副食品時間，爸媽會更辛苦。',
    action: 'Q媽提醒：先排「餵食點」再排「拍照點」，親子出遊會順很多。',
    age: ageRanges.babyToddler,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊嬰幼兒餵食與照護主題整理。',
  }),
  healthSeed({
    id: 'hpa-development-observe-play',
    category: 'development',
    title: '玩也是觀察發展的小窗口',
    summary: '兒童發展篩檢服務涵蓋動作、語言認知與社會互動；出遊時可以自然觀察孩子怎麼走、怎麼拿、怎麼跟人互動。',
    action: 'Q媽提醒：不用把旅行變考試，只要把觀察到的狀況記下來，回診或篩檢時比較好描述。',
    age: ageRanges.underSeven,
    source: SOURCES.hpaDevelopment,
    dataPeriod: '兒童發展篩檢服務',
    evidence: '依國健署兒童發展篩檢服務項目整理。',
  }),
  healthSeed({
    id: 'hpa-preschool-large-movement',
    category: 'development',
    title: '3–5 歲適合安排跑跳放電，但要留退場路線',
    summary: '學齡前孩子活動量高，戶外跑跳能釋放精力；但環境安全、動線與休息點仍需要爸媽先看過。',
    action: 'Q媽提醒：到公園先看出口、車道、水邊、樓梯與遮蔭處，再讓孩子開始跑。',
    age: ageRanges.preschool,
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童安全與照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-preschool-language-sharing',
    category: 'development',
    title: '3–5 歲可以把景點變成聊天素材',
    summary: '兒童發展包含語言認知與社會互動；旅行中的看見、等待、選擇，都可以變成親子對話。',
    action: 'Q媽提醒：問孩子「你看到什麼、想先去哪裡、剛剛最喜歡什麼」，比一直趕行程更有收穫。',
    age: ageRanges.preschool,
    source: SOURCES.hpaDevelopment,
    dataPeriod: '兒童發展篩檢服務',
    evidence: '依國健署兒童發展篩檢服務語言認知與社會發展面向整理。',
  }),
  healthSeed({
    id: 'hpa-school-age-choice',
    category: 'development',
    title: '6–12 歲可以讓孩子參與行程選擇',
    summary: '較大的孩子開始有更明確的偏好；讓孩子在兩三個選項中做選擇，能增加參與感，也減少臨場爭執。',
    action: 'Q媽提醒：出門前讓孩子選「想看展、想放電、想吃點心」其中一個，行程會比較有共同感。',
    age: ageRanges.schoolAge,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童照護與親子互動主題整理。',
  }),
  healthSeed({
    id: 'hpa-school-age-screen-break',
    category: 'safety',
    title: '長途移動後，先讓孩子動一動',
    summary: '兒童照護重視活動與休息平衡；長時間搭車或排隊後，孩子需要伸展與轉換情緒。',
    action: 'Q媽提醒：抵達景點先找安全空地走一圈，再進入需要安靜排隊的區域。',
    age: ageRanges.schoolAge,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童照護與日常活動主題整理。',
  }),
  healthSeed({
    id: 'hpa-playground-first-scan',
    category: 'safety',
    title: '遊戲場先掃一圈，再開始玩',
    summary: '兒童安全重點是先辨識環境風險；新的遊戲場不急著衝，先看地面、尖角、高低落差與人流。',
    action: 'Q媽提醒：爸媽先花 30 秒看遊具、地墊、出口與水邊，孩子玩起來會安全很多。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童事故傷害預防概念整理。',
  }),
  healthSeed({
    id: 'hpa-stairs-escalator-watch',
    category: 'safety',
    title: '商場與車站，樓梯手扶梯要特別慢',
    summary: '公共場所的樓梯、手扶梯、電梯與車道，是親子出遊常見需要注意的動線。',
    action: 'Q媽提醒：推車改搭電梯，小孩走手扶梯時牽好手，不要邊走邊看手機。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童安全與事故傷害預防概念整理。',
  }),
  healthSeed({
    id: 'hpa-restaurant-hot-food',
    category: 'safety',
    title: '餐廳熱湯熱飲先放遠',
    summary: '兒童事故傷害預防提醒家長留意燙傷與環境危險；餐廳裡熱湯、熱茶、電線和尖角都要先看。',
    action: 'Q媽提醒：孩子坐下前先把熱湯熱飲移到大人側，餐具與剪刀也不要放在桌邊。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊事故傷害預防主題整理。',
  }),
  healthSeed({
    id: 'hpa-handwash-before-eating',
    category: 'disease',
    title: '吃東西前先洗手，是最便宜的行前準備',
    summary: '疾管署公開資料持續監測腸病毒與類流感；在人多的親子館、餐廳、商場活動後，手部清潔很重要。',
    action: 'Q媽提醒：包包固定放一包濕紙巾或乾洗手，但有水有肥皂時仍優先好好洗手。',
    source: SOURCES.cdcOpenData,
    dataPeriod: '疾管署開放資料監測',
    evidence: '依疾管署腸病毒與類流感開放資料監測主題，搭配兒童外出清潔情境整理。',
  }),
  healthSeed({
    id: 'cdc-indoor-play-clean-hands',
    category: 'disease',
    title: '室內遊戲場玩完，先洗手再吃點心',
    summary: '疾管署資料每日監測腸病毒急診就診人次；室內遊戲場人多、接觸共用設施多，清潔節奏要先排進行程。',
    action: 'Q媽提醒：把「玩完洗手」設定成點心前的固定步驟，孩子比較容易接受。',
    source: SOURCES.cdcOpenData,
    dataPeriod: '腸病毒急診監測資料',
    evidence: '依疾管署腸病毒急診監測開放資料與親子室內活動情境整理。',
  }),
  healthSeed({
    id: 'cdc-crowded-indoor-mask-option',
    category: 'disease',
    title: '人很多的室內空間，先準備備用口罩',
    summary: '疾管署資料每日監測類流感急診就診人次；如果行程會進入人多密閉空間，可以先把備用口罩放進包包。',
    action: 'Q媽提醒：不是每個地方都需要戴，但孩子或爸媽覺得不舒服時，有備用品比較安心。',
    source: SOURCES.cdcOpenData,
    dataPeriod: '類流感急診監測資料',
    evidence: '依疾管署類流感急診監測開放資料與室內活動情境整理。',
  }),
  healthSeed({
    id: 'cdc-sick-child-rest',
    category: 'disease',
    title: '孩子不舒服，行程可以改成休息日',
    summary: '疾管署監測資料用來觀察傳染病趨勢；若孩子已經有明顯不適，最好的親子安排有時是延後出門。',
    action: 'Q媽提醒：不要硬跑行程。改成外帶、短散步或在家活動，通常比全家累壞更好。',
    source: SOURCES.cdcOpenData,
    dataPeriod: '疾管署開放資料監測',
    evidence: '依疾管署急診傳染病監測資料與兒童出遊情境整理。',
  }),
  healthSeed({
    id: 'hpa-rainy-day-indoor-choice',
    category: 'safety',
    title: '雨天備案不只看室內，也要看動線',
    summary: '帶孩子遇到雨天時，室內景點、停車距離、推車動線與廁所位置都會影響體驗。',
    action: 'Q媽提醒：雨天優先選停車近、有電梯、廁所清楚、可坐下休息的地方。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊安全照護概念，延伸到雨天親子出遊情境。',
  }),
  healthSeed({
    id: 'hpa-sun-outdoor-shade',
    category: 'safety',
    title: '戶外放電要先找遮蔭與補水點',
    summary: '戶外活動前先確認遮蔭、飲水、廁所與休息處，孩子比較能玩得久，也比較不容易情緒爆炸。',
    action: 'Q媽提醒：公園或農場行程先找樹蔭、販賣機、洗手間，再開始大放電。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童照護與營養補水概念整理。',
  }),
  healthSeed({
    id: 'hpa-car-seat-rest-stop',
    category: 'safety',
    title: '車程久一點，要安排下車伸展',
    summary: '親子出遊常卡在交通時間；長途移動後安排短暫休息，能幫孩子轉換狀態。',
    action: 'Q媽提醒：超過一段長車程就安排休息站或短步行，不要一下車就衝排隊。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童安全與日常照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-toilet-before-queue',
    category: 'safety',
    title: '排隊前先問一次廁所',
    summary: '孩子常在排隊或剛入場時才說想上廁所；先確認廁所位置，能減少臨時折返。',
    action: 'Q媽提醒：進場、點餐、排隊前問一次，上完廁所再開始下一段比較穩。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童照護與外出安全概念整理。',
  }),
  healthSeed({
    id: 'hpa-stroller-route',
    category: 'safety',
    title: '推車家庭先看電梯與坡道',
    summary: '0–2 歲或需要推車的家庭，景點好不好玩之外，動線是否友善會直接影響爸媽體力。',
    action: 'Q媽提醒：先找電梯、坡道、哺乳室、親子廁所，再決定要不要深入景點。',
    age: ageRanges.babyToddler,
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童外出照護與安全概念整理。',
  }),
  healthSeed({
    id: 'hpa-food-backup',
    category: 'nutrition',
    title: '孩子餓了才找餐廳，通常太晚',
    summary: '兒童飲食與作息需要穩定節奏；熱門景點附近餐廳可能排隊，備用點心能讓等待變短。',
    action: 'Q媽提醒：包包放簡單點心和水，餐廳排隊時就是救援隊。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童營養與日常照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-new-food-simple',
    category: 'nutrition',
    title: '出遊日餐點簡單一點也很好',
    summary: '外出時環境變化多，孩子的飲食選擇可以先求穩定，不一定要每餐都嘗鮮。',
    action: 'Q媽提醒：安排一餐孩子熟悉的食物，爸媽也會輕鬆很多。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童營養與照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-overstimulated-child',
    category: 'development',
    title: '孩子不是不乖，可能只是刺激太多',
    summary: '親子出遊有聲音、人群、等待與新環境；孩子累了或刺激過多時，可能需要安靜退場。',
    action: 'Q媽提醒：保留一個「不用拍照、不用排隊」的休息角落，常常比多玩一項更值得。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童照護與親子互動概念整理。',
  }),
  healthSeed({
    id: 'hpa-transition-warning',
    category: 'development',
    title: '離開前先預告，比突然喊走更有效',
    summary: '孩子面對活動轉換時需要心理準備；提前預告能降低哭鬧與拉扯。',
    action: 'Q媽提醒：離開前 5 分鐘先說一次，再讓孩子選最後一件小事，例如最後溜一次或拍一張照。',
    age: ageRanges.mixedUnderSeven,
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊親子互動與兒童照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-family-restroom',
    category: 'safety',
    title: '親子廁所不是加分，是救援點',
    summary: '帶孩子外出時，尿布、換衣服、如廁與洗手都可能突然發生；親子廁所能大幅降低爸媽壓力。',
    action: 'Q媽提醒：到景點先看廁所在哪裡，不要等孩子急了才找。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童外出照護與安全概念整理。',
  }),
  healthSeed({
    id: 'hpa-crowd-exit-plan',
    category: 'safety',
    title: '人多的活動，先約好走散集合點',
    summary: '市集、展覽與大型活動人流多，先看出口和集合點，能降低臨時慌張。',
    action: 'Q媽提醒：到場第一件事先指給孩子看服務台、出口或明顯地標。',
    age: ageRanges.schoolAge,
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童安全與事故傷害預防概念整理。',
  }),
  healthSeed({
    id: 'hpa-small-toy-waiting',
    category: 'development',
    title: '等待時間也要有備案',
    summary: '孩子的耐心有限，餐廳、停車、入場排隊都可能成為情緒引爆點。',
    action: 'Q媽提醒：準備一本小書、貼紙或安靜玩具，等候時間會柔軟很多。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童照護與親子互動概念整理。',
  }),
  healthSeed({
    id: 'hpa-return-home-cleanup',
    category: 'disease',
    title: '回家第一件事：洗手、換衣、整理包包',
    summary: '疾管署監測腸病毒與類流感等資料；外出回家後建立清潔流程，是親子旅遊很實用的小習慣。',
    action: 'Q媽提醒：孩子回家先洗手，大人順手把水壺、餐具、濕紙巾補齊，下次出門更快。',
    source: SOURCES.cdcOpenData,
    dataPeriod: '疾管署開放資料監測',
    evidence: '依疾管署急診傳染病監測資料與兒童外出清潔情境整理。',
  }),
  healthSeed({
    id: 'hpa-parent-rest-is-plan',
    category: 'safety',
    title: '爸媽休息也是行程的一部分',
    summary: '親子出遊不是越滿越好；照顧者疲累時，判斷力和耐心都會下降。',
    action: 'Q媽提醒：每半日安排一個爸媽能坐下的點，親子旅遊才走得長久。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊家庭照護與兒童安全概念整理。',
  }),
  healthSeed({
    id: 'hpa-morning-one-main-place',
    category: 'safety',
    title: '半日行程，一個主景點就很夠',
    summary: '對孩子來說，移動、等待、吃飯、上廁所都會消耗能量；半日行程不需要塞滿。',
    action: 'Q媽提醒：一個主景點加一個備案點，比三個景點趕場更像真正的休假。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊兒童日常照護與親子互動概念整理。',
  }),
  healthSeed({
    id: 'hpa-photo-not-pressure',
    category: 'development',
    title: '不要為了拍照，把孩子逼到爆炸',
    summary: '出遊紀錄很重要，但孩子的情緒與安全更重要；拍照可以短、快、自然。',
    action: 'Q媽提醒：如果孩子不想拍，先玩、先休息，通常等等自然會有更好的照片。',
    source: SOURCES.hpaEducation,
    dataPeriod: '兒童衛教手冊',
    evidence: '依國健署兒童衛教手冊親子互動與兒童照護概念整理。',
  }),
  healthSeed({
    id: 'hpa-backup-clothes',
    category: 'safety',
    title: '備用衣物不只給嬰兒，也給玩水玩沙的孩子',
    summary: '親子景點常有水、沙、草地或流汗活動；一套備用衣物能讓後半段行程不崩盤。',
    action: 'Q媽提醒：就算孩子已經上小學，玩水玩沙日也建議帶輕便換洗衣物。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊兒童外出照護與安全概念整理。',
  }),
  healthSeed({
    id: 'hpa-check-official-opening',
    category: 'safety',
    title: '出發前看一次官方開放資訊',
    summary: '親子行程最怕到現場才發現休館、施工或活動異動；官方資訊比社群貼文更適合當最後確認。',
    action: 'Q媽提醒：出門前最後 10 分鐘，確認營業時間、停車、票價和是否需要預約。',
    source: SOURCES.hpaHandbook,
    dataPeriod: '兒童健康手冊',
    evidence: '依國健署兒童健康手冊外出安全照護概念整理。',
  }),
]

function withCommonFields(item) {
  return {
    ...item,
    mascot: 'qMom',
    disclaimer: DISCLAIMER,
  }
}

function normalizeNumber(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function weekKey(record) {
  const year = record['年'] ?? record.year ?? record.Year
  const week = record['週'] ?? record.week ?? record.Week
  if (!year || !week) return null
  return `${year}-${String(week).padStart(2, '0')}`
}

function valueFromRecord(record, diseaseName) {
  const key = Object.keys(record).find((name) => name.includes(diseaseName) && name.includes('急診') && name.includes('人次'))
  return normalizeNumber(key ? record[key] : 0)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readPreviousPayload() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT, 'utf8'))
  } catch {
    return null
  }
}

function previousCdcAdvisoriesFor(previousPayload, failedDiseases) {
  if (!previousPayload || !Array.isArray(previousPayload.advisories) || failedDiseases.length === 0) return []
  return previousPayload.advisories.filter((advisory) =>
    advisory?.category === 'disease' &&
    advisory?.source?.agency === SOURCES.cdcOpenData.agency &&
    failedDiseases.some((diseaseName) => String(advisory.id || '').includes(`cdc-${diseaseName}-trend`)),
  )
}

async function fetchJson(url, timeoutMs = CDC_SEARCH_TIMEOUT_MS) {
  let lastError
  for (let attempt = 1; attempt <= CDC_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'HolidayGoWhere health-advisory sync (GitHub Actions)',
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < CDC_FETCH_RETRIES) {
        console.warn(`[health] fetch retry ${attempt}/${CDC_FETCH_RETRIES} failed for ${url}: ${error.message}`)
        await wait(1200 * attempt)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

async function fetchText(url, timeoutMs = CDC_RESOURCE_TIMEOUT_MS) {
  let lastError
  for (let attempt = 1; attempt <= CDC_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'text/csv,application/json,text/plain;q=0.9,*/*;q=0.8',
          'user-agent': 'HolidayGoWhere health-advisory sync (GitHub Actions)',
        },
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < CDC_FETCH_RETRIES) {
        console.warn(`[health] fetch retry ${attempt}/${CDC_FETCH_RETRIES} failed for ${url}: ${error.message}`)
        await wait(1200 * attempt)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [headers, ...values] = rows.filter((item) => item.some(Boolean))
  if (!headers) return []
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ''), cells[index] ?? ''])),
  )
}

function normalizeResource(distribution) {
  if (!distribution?.resourceDownloadUrl) return null
  return {
    format: String(distribution.resourceFormat || '').toUpperCase(),
    url: distribution.resourceDownloadUrl,
    name: distribution.resourceDescription || distribution.resourceFormat || 'CDC resource',
  }
}

async function findCdcResourceFromDataGov(datasetId) {
  const payload = await fetchJson(`https://data.gov.tw/api/v2/rest/dataset/${datasetId}`)
  const dataset = payload?.result
  const distributions = Array.isArray(dataset?.distribution) ? dataset.distribution : []
  const resources = distributions.map(normalizeResource).filter(Boolean)
  const resource =
    resources.find((item) => item.format === 'JSON') ||
    resources.find((item) => item.format === 'CSV') ||
    resources[0]
  if (!resource) return null
  return {
    dataset: dataset.title || `data.gov.tw dataset ${datasetId}`,
    metadataUrl: `https://data.gov.tw/dataset/${datasetId}`,
    resource,
  }
}

async function findCdcJsonResource(query) {
  const api = new URL('https://data.cdc.gov.tw/api/3/action/package_search')
  api.searchParams.set('q', query)
  api.searchParams.set('rows', '5')
  const payload = await fetchJson(api.toString())
  const packages = payload?.result?.results ?? []
  for (const item of packages) {
    const resources = item.resources ?? []
    const resource = resources.find((entry) => String(entry.format || '').toUpperCase() === 'JSON' && entry.url)
    if (resource) return { dataset: item.title || query, resource: { ...resource, format: 'JSON' } }
  }
  return null
}

async function findCdcResource(task) {
  if (task.dataGovDatasetId) {
    try {
      const found = await findCdcResourceFromDataGov(task.dataGovDatasetId)
      if (found) return found
    } catch (error) {
      console.warn(`[health] data.gov.tw metadata lookup failed for ${task.query}: ${error.message}`)
    }
  }
  return findCdcJsonResource(task.query)
}

async function loadResourceRecords(resource) {
  const format = String(resource.format || '').toUpperCase()
  const { data, usedUrl } = await fetchResourceWithHttpFallback(resource.url, format)
  if (format === 'CSV') return { records: parseCsv(data), usedUrl }
  const payload = typeof data === 'string' ? JSON.parse(data) : data
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result?.records)
      ? payload.result.records
      : Array.isArray(payload?.records)
        ? payload.records
        : []
  return { records, usedUrl }
}

function httpFallbackUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    parsed.protocol = 'http:'
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchResourceWithHttpFallback(url, format) {
  try {
    const data = format === 'CSV'
      ? await fetchText(url, CDC_RESOURCE_TIMEOUT_MS)
      : await fetchJson(url, CDC_RESOURCE_TIMEOUT_MS)
    return { data, usedUrl: url }
  } catch (httpsError) {
    const fallback = httpFallbackUrl(url)
    if (!fallback) throw httpsError
    console.warn(`[health] HTTPS resource failed, retrying CDC official host over HTTP: ${fallback}`)
    const data = format === 'CSV'
      ? await fetchText(fallback, CDC_RESOURCE_TIMEOUT_MS)
      : await fetchJson(fallback, CDC_RESOURCE_TIMEOUT_MS)
    return { data, usedUrl: fallback }
  }
}

async function loadCdcRecords(task) {
  const found = await findCdcResource(task)
  if (!found) return null
  const { records, usedUrl } = await loadResourceRecords(found.resource)
  return { ...found, records, usedUrl }
}

function buildDiseaseAdvisory({ diseaseName, title, records, dataset, resource, usedUrl }) {
  if (!records.length) return null
  const totals = new Map()
  for (const record of records) {
    const key = weekKey(record)
    if (!key) continue
    totals.set(key, (totals.get(key) || 0) + valueFromRecord(record, diseaseName))
  }
  const points = [...totals.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((first, second) => first.key.localeCompare(second.key))
    .filter((item) => item.value > 0)
  if (points.length < 6) return null

  const latest = points.at(-1)
  const previous = points.slice(-6, -1).map((item) => item.value).sort((a, b) => a - b)
  const median = previous[Math.floor(previous.length / 2)] || 0
  if (!latest || median <= 0) return null
  const ratio = latest.value / median
  if (ratio < 1.5) return null

  return withCommonFields({
    id: `cdc-${diseaseName}-trend-${latest.key}`,
    category: 'disease',
    severity: ratio >= 2 ? 'elevated' : 'notice',
    title,
    summary: `疾管署開放資料顯示，最新週 ${diseaseName} 急診就診人次較前 5 週中位數偏高。`,
    action: 'Q媽提醒：若前往室內遊戲場、親子館或餐廳，記得勤洗手，避免共用餐具；孩子不舒服時先暫緩出遊。',
    applicableAges: [{ label: '0至12歲', minMonths: 0, maxMonths: 155 }],
    regions: ['全國'],
    source: {
      ...SOURCES.cdcOpenData,
      name: dataset || SOURCES.cdcOpenData.name,
      url: usedUrl || resource?.url || SOURCES.cdcOpenData.url,
      fetchedAt: NOW,
      dataPeriod: latest.key,
    },
    evidence: `最新週 ${latest.key}：${latest.value}，前 5 週中位數：${median}，倍數：${ratio.toFixed(2)}。`,
  })
}

async function buildDiseaseTrendAdvisories() {
  const tasks = [
    {
      diseaseName: '腸病毒',
      query: '急診傳染病監測統計-腸病毒',
      dataGovDatasetId: 14587,
      title: '近期腸病毒急診就診人次偏高，室內遊戲要更注意清潔',
    },
    {
      diseaseName: '類流感',
      query: '急診傳染病監測統計-類流感',
      dataGovDatasetId: 14584,
      title: '近期類流感急診就診人次偏高，密閉空間多留意',
    },
  ]

  const advisories = []
  const failedDiseases = []
  const attempts = []
  for (const task of tasks) {
    let found = null
    try {
      found = await findCdcResource(task)
      if (!found) {
        failedDiseases.push(task.diseaseName)
        attempts.push({
          diseaseName: task.diseaseName,
          dataGovDatasetId: task.dataGovDatasetId,
          metadataVerified: false,
          ok: false,
          error: 'No CDC resource found',
        })
        continue
      }
      const { records, usedUrl } = await loadResourceRecords(found.resource)
      const advisory = buildDiseaseAdvisory({ ...task, ...found, records, usedUrl })
      if (advisory) advisories.push(advisory)
      attempts.push({
        diseaseName: task.diseaseName,
        dataGovDatasetId: task.dataGovDatasetId,
        metadataVerified: true,
        dataset: found.dataset,
        metadataUrl: found.metadataUrl,
        resourceUrl: found.resource?.url,
        usedUrl,
        resourceFormat: found.resource?.format,
        records: records.length,
        ok: true,
      })
    } catch (error) {
      failedDiseases.push(task.diseaseName)
      attempts.push({
        diseaseName: task.diseaseName,
        dataGovDatasetId: task.dataGovDatasetId,
        metadataVerified: Boolean(found),
        dataset: found?.dataset,
        metadataUrl: found?.metadataUrl,
        resourceUrl: found?.resource?.url,
        resourceFormat: found?.resource?.format,
        ok: false,
        error: error.message,
      })
      console.warn(`[health] CDC sync skipped for ${task.diseaseName}: ${error.message}`)
    }
  }
  return { advisories, failedDiseases, attempts }
}

const previousPayload = await readPreviousPayload()
const cdcTrendResult = await buildDiseaseTrendAdvisories()
const fallbackCdcTrends = previousCdcAdvisoriesFor(previousPayload, cdcTrendResult.failedDiseases)
if (fallbackCdcTrends.length) {
  console.warn(`[health] Reusing ${fallbackCdcTrends.length} previous CDC disease advisory/advisories because current fetch failed.`)
}

const advisories = [
  ...cdcTrendResult.advisories,
  ...fallbackCdcTrends,
  ...expandedOfficialSeeds.map(withCommonFields),
]

await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true })
await fs.writeFile(OUTPUT, JSON.stringify({
  schemaVersion: 1,
  generatedAt: NOW,
  sourcePolicy: 'Only government public data and official Ministry of Health and Welfare / Taiwan CDC sources are allowed. Do not generate medical claims with AI.',
  syncStatus: {
    cdc: {
      freshAdvisories: cdcTrendResult.advisories.length,
      fallbackAdvisories: fallbackCdcTrends.length,
      failedDiseases: cdcTrendResult.failedDiseases,
      attempts: cdcTrendResult.attempts,
      fetchRetries: CDC_FETCH_RETRIES,
      searchTimeoutMs: CDC_SEARCH_TIMEOUT_MS,
      resourceTimeoutMs: CDC_RESOURCE_TIMEOUT_MS,
    },
  },
  advisories,
}, null, 2))

console.log(`Wrote ${advisories.length} health advisories to ${path.relative(ROOT, OUTPUT)}.`)
