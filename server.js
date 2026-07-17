import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose'; // 🔹 นำเข้า Mongoose สำหรับเชื่อมต่อ Database

const app = express();
app.use(cors());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MONGODB_URI = process.env.MONGODB_URI;

// 🔹 เชื่อมต่อ MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
    .catch(err => console.error('❌ เชื่อมต่อ MongoDB ล้มเหลว:', err));

// 🔹 สร้างโครงสร้างสมุดจดถาวร (Schema) สำหรับจำสถานะหุ้น
const stockSchema = new mongoose.Schema({
    symbol: { type: String, unique: true },
    trend: String // เก็บค่า 'UPTREND' หรือ 'DOWNTREND'
});
const Stock = mongoose.model('Stock', stockSchema);

// ตะกร้าหุ้นสายเทคฯ และ ETF ที่เหมาะกับการรันเทรนด์ยาวๆ
const WATCHLIST = [
    // 🔹 1. กองทุนอิสลาม (Islamic ETFs - ปลอดภัย 100%)
    'HLAL', 'SPUS', 'SPSK', 'UMMA',
    
    // 🔹 2. เมกะเทรนด์ AI & Hardware (ผ่านเกณฑ์ AAOIFI)
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AVGO', 'TSLA', 'AMD', 'ASML',
    
    // 🔹 3. ซอฟต์แวร์ระดับองค์กร & เติบโตสูง (รายได้สะอาด)
    'ADBE', 'CRM', 'CSCO', 'PCOR', 'CRWD', 'NOW', 'SNPS', 'MELI',
    
    // 🔹 4. สุขภาพ & อุตสาหกรรม (พื้นฐานแกร่ง)
    'CAT', 'JNJ', 'TXN', 'LLY', 'NVO'
];

let cacheData = {}; 
let isReady = false; 
let initProgress = 0; 
let yahooCookie = '';
let yahooCrumb = '';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTelegramMessage(text) {
    if (!TELEGRAM_TOKEN) return; 
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
        });
    } catch (error) { console.error('❌ ส่งข้อความพลาด:', error.message); }
}

function calculateEMA(prices, period) {
    if (!prices || prices.length < period) return prices ? prices[prices.length - 1] : 0;
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
        ema = (prices[i] * k) + (ema * (1 - k));
    }
    return Math.round(ema * 100) / 100;
}

// เวลาตลาด (21:30 - 03:00 น. เวลาไทย)
function isMarketOpen() {
    const now = new Date();
    const day = now.getUTCDay(); 
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const time = hour + (minute / 60);
    if (day === 0 || day === 6) return false;
    return (time >= 14.5 && time < 20.0);
}

// 🎯 [ระบบสมองกลใหม่]: จับเทรนด์รอบใหญ่ด้วย EMA 50 และ EMA 200
function determineTrendState(ema50, ema200) {
    if (ema50 === 0 || ema200 === 0) return 'UNKNOWN';
    if (ema50 > ema200) return 'UPTREND';    // ขาขึ้น (Golden Cross)
    if (ema50 < ema200) return 'DOWNTREND';  // ขาลง (Death Cross)
    return 'UNKNOWN';
}

// 🔑 ฟังก์ชันเจาะเกราะ Yahoo (คงไว้เหมือนเดิม เพราะเสถียรมาก)
async function getYahooAuth() {
    if (yahooCookie && yahooCrumb) return { cookie: yahooCookie, crumb: yahooCrumb };
    try {
        const headers = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        };

        const resCookie = await fetch('https://fc.yahoo.com', { headers });
        const cookieStr = resCookie.headers.get('set-cookie');
        if (!cookieStr) throw new Error('เซิร์ฟเวอร์ไม่ได้ Cookie กลับมา');
        
        const resCrumb = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: { ...headers, 'Cookie': cookieStr }
        });
        const crumbStr = await resCrumb.text();
        if (crumbStr.includes('<html>')) throw new Error('Crumb ถูกบล็อกโดย Yahoo');
        
        yahooCookie = cookieStr;
        yahooCrumb = crumbStr;
        return { cookie: yahooCookie, crumb: yahooCrumb };
    } catch (e) {
        yahooCookie = ''; 
        yahooCrumb = '';
        return { cookie: '', crumb: '' };
    }
}

async function fetchStockDataNative(symbol) {
    let currentPrice = 0, changePercent = 0, prices = [];
    try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2y`;
        const chartRes = await fetch(chartUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const chartData = await chartRes.json();
        const result = chartData.chart.result[0];
        
        currentPrice = result.meta.regularMarketPrice;
        const previousClose = result.meta.chartPreviousClose || currentPrice;
        changePercent = ((currentPrice - previousClose) / previousClose) * 100;
        
        const closes = result.indicators.quote[0].close || [];
        for (let i = 0; i < closes.length; i++) {
            if (closes[i] !== null) prices.push(closes[i]);
        }
    } catch (e) {
        console.log(`⚠️ ข้ามกราฟของ ${symbol}`);
    }

    let name = symbol;
    let debtM = 0;
    let assetsM = 0;
    let isPass = true;
    let debtRatioStr = "0.0";

    try {
        const auth = await getYahooAuth();
        const finUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,price${auth.crumb ? '&crumb='+auth.crumb : ''}`;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
        if (auth.cookie) headers['Cookie'] = auth.cookie;

        const finRes = await fetch(finUrl, { headers });
        const finData = await finRes.json();
        
        if (finData.quoteSummary && finData.quoteSummary.result) {
            const finResult = finData.quoteSummary.result[0];
            name = finResult.price?.shortName || symbol;
            const marketCap = finResult.price?.marketCap?.raw || 0;
            const totalDebt = finResult.financialData?.totalDebt?.raw || 0;

            if (marketCap > 0) {
                const ratio = (totalDebt / marketCap) * 100;
                isPass = ratio <= 33;
                debtRatioStr = ratio.toFixed(1);
                debtM = (totalDebt / 1000000).toFixed(0);
                assetsM = (marketCap / 1000000).toFixed(0);
            }
        }
    } catch (e) {
        // Fallback
    }

    return {
        symbol, name, price: currentPrice, change: changePercent,
        historicalPrices: prices, debtRatio: debtRatioStr, isHalal: isPass
    };
}

async function updateAllStocks() {
    console.log('🔄 เริ่มสแกนหาเทรนด์รอบใหญ่ (EMA 50 & 200)...');
    for (let i = 0; i < WATCHLIST.length; i++) {
        const symbol = WATCHLIST[i];
        try {
            const data = await fetchStockDataNative(symbol);
            cacheData[symbol] = data;
            
            if (data.historicalPrices.length >= 200) {
                const ema50 = calculateEMA(data.historicalPrices, 50);
                const ema200 = calculateEMA(data.historicalPrices, 200);
                
                const currentState = determineTrendState(ema50, ema200);
                
                // 🔹 1. ดึงสถานะเทรนด์ล่าสุดจาก Database
                const savedStock = await Stock.findOne({ symbol: symbol });
                const previousTrend = savedStock ? savedStock.trend : null;

                if (currentState !== 'UNKNOWN') {
                    // 🔹 2. ตรวจสอบเงื่อนไขการแจ้งเตือน (ต้องมีข้อมูลเดิม และ เทรนด์เปลี่ยน)
                    // (ถ้า previousTrend เป็น null แปลว่ารันครั้งแรก จะไม่แจ้งเตือน เพื่อป้องกันสแปม)
                    if (previousTrend && currentState !== previousTrend) {
                        let alertTitle = '';
                        if (currentState === 'UPTREND') {
                            alertTitle = '🚀 <b>สัญญาณซื้อต้นรอบ (Golden Cross)</b>\n<i>เส้น EMA 50 ตัดขึ้นเหนือ EMA 200</i>';
                        } else if (currentState === 'DOWNTREND') {
                            alertTitle = '⚠️ <b>สัญญาณขายจบรอบ (Death Cross)</b>\n<i>เส้น EMA 50 ตัดลงใต้ EMA 200</i>';
                        }

                        if (isMarketOpen() && data.isHalal) {
                            await sendTelegramMessage(`${alertTitle}\n\n📌 หุ้น: <b>${symbol}</b>\n💰 ราคาปัจจุบัน: $${data.price}\n📊 EMA 50: $${ema50}\n📈 EMA 200: $${ema200}\n🕌 หหนี้สินฮาลาล: ${data.debtRatio}%`);
                        }
                    }

                    // 🔹 3. อัปเดตสถานะล่าสุดลง Database เสมอเมื่อค่าเปลี่ยน (หรือสร้างใหม่ถ้ารันครั้งแรก)
                    if (currentState !== previousTrend) {
                        await Stock.updateOne(
                            { symbol: symbol }, 
                            { $set: { trend: currentState } }, 
                            { upsert: true }
                        );
                    }
                }
            }
            
            initProgress = i + 1;
            console.log(`✅ อัปเดต ${symbol} สำเร็จ (${initProgress}/${WATCHLIST.length})`);
        } catch (err) {
            console.log(`⚠️ ดึงข้อมูล ${symbol} พลาด: ${err.message}`);
        }
        await delay(2500); 
    }
    isReady = true;
    console.log('✅ สแกนเทรนด์เสร็จสิ้น 100%!');
}

app.get('/', (req, res) => res.send('🚀 Trend Following Bot พร้อมระบบ Database ตื่นอยู่เสมอ!'));
app.get('/api/stocks', (req, res) => { 
    res.json({ isReady: isReady, data: Object.values(cacheData) }); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 พร้อมที่พอร์ต ${PORT}`);
    sendTelegramMessage('🚀 <b>Trend Following Bot สตาร์ทเครื่องแล้ว!</b>\nระบบเชื่อมต่อ Database สำเร็จและกำลังสแกนกราฟ (รอสักครู่)...');
    updateAllStocks(); 
    setInterval(updateAllStocks, 15 * 60 * 1000); 
});