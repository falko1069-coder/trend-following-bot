import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cron from 'node-cron';
import axios from 'axios'; // 🔹 ดึงข่าวจาก Alpha Vantage
import { GoogleGenerativeAI } from '@google/generative-ai'; // 🔹 สมองกล Gemini AI

const app = express();

// 🔹 ล็อคความปลอดภัยด้วย CORS
app.use(cors({
    origin: 'https://trend-dashboard-liard.vercel.app'
}));
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🔹 เชื่อมต่อ MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
    .catch(err => console.error('❌ เชื่อมต่อ MongoDB ล้มเหลว:', err));

// 🔹 โครงสร้างสมุดจดถาวร (Schema) สำหรับจำสถานะหุ้น
const stockSchema = new mongoose.Schema({
    symbol: { type: String, unique: true },
    trend: String
});
const Stock = mongoose.model('Stock', stockSchema);

// ตะกร้าหุ้นสายเทคฯ และ ETF
const WATCHLIST = [
    'HLAL', 'SPUS', 'SPSK', 'UMMA',
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AVGO', 'TSLA', 'AMD', 'ASML',
    'ADBE', 'CRM', 'CSCO', 'PCOR', 'CRWD', 'NOW', 'SNPS', 'MELI',
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

// 🧠 ฟังก์ชันดึงข่าว + AI วิเคราะห์เหตุผล
async function getAIAnalysisAndNews(symbol, currentState, price, ema50, ema200) {
    let aiSummary = "ไม่มีข้อมูลวิเคราะห์ข่าวเพิ่มเติมในขณะนี้";
    let newsText = "";

    // 1. ดึงข่าวสารล่าสุดจาก Alpha Vantage
    if (ALPHA_VANTAGE_API_KEY) {
        try {
            const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=3&apikey=${ALPHA_VANTAGE_API_KEY}`;
            const res = await axios.get(newsUrl, { timeout: 5000 });
            if (res.data && res.data.feed && res.data.feed.length > 0) {
                const articles = res.data.feed.slice(0, 3);
                newsText = articles.map(a => `- ${a.title}: ${a.summary}`).join("\n");
            }
        } catch (e) {
            console.log(`⚠️ ไม่สามารถดึงข่าวของ ${symbol} ได้: ${e.message}`);
        }
    }

    // 2. ให้ Gemini อ่านข่าวและสรุปสั้นๆ
    if (GEMINI_API_KEY) {
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
คุณคือนักวิเคราะห์การเงินสาย Trend Following โปรดวิเคราะห์สถานการณ์หุ้น ${symbol}:
- ราคาปัจจุบัน: $${price}
- สัญญาณเทรนด์: ${currentState === 'UPTREND' ? 'Golden Cross (ขาขึ้น)' : 'Death Cross (ขาลง)'} (EMA 50: $${ema50}, EMA 200: $${ema200})
- หัวข้อข่าวล่าสุด:
${newsText || "ไม่มีข่าวสำคัญล่าสุด"}

คำสั่ง: โปรดสรุปเหตุผลกระชับภาษาไทย 2-3 บรรทัด ว่าทำไมหุ้นถึงเกิดสัญญาณนี้ และนักลงทุนควรจับตาอะไรเป็นพิเศษ (ไม่ต้องมีคำเกริ่น นำเสนอให้อ่านง่าย เหมาะสำหรับอ่านบน Telegram)`;

            const result = await model.generateContent(prompt);
            aiSummary = result.response.text().trim();
        } catch (e) {
            console.log(`⚠️ Gemini AI วิเคราะห์พลาด: ${e.message}`);
        }
    }

    return aiSummary;
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

// 🎯 จับเทรนด์รอบใหญ่ด้วย EMA 50 และ EMA 200
function determineTrendState(ema50, ema200) {
    if (ema50 === 0 || ema200 === 0) return 'UNKNOWN';
    if (ema50 > ema200) return 'UPTREND';    // ขาขึ้น (Golden Cross)
    if (ema50 < ema200) return 'DOWNTREND';  // ขาลง (Death Cross)
    return 'UNKNOWN';
}

// 🔑 ฟังก์ชันเจาะเกราะ Yahoo
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
                
                // 🔹 ดึงสถานะเทรนด์ล่าสุดจาก Database
                const savedStock = await Stock.findOne({ symbol: symbol });
                const previousTrend = savedStock ? savedStock.trend : null;

                if (currentState !== 'UNKNOWN') {
                    // 🔹 ตรวจสอบเงื่อนไขการแจ้งเตือนรอบ (เทรนด์เปลี่ยน)
                    if (previousTrend && currentState !== previousTrend) {
                        let alertTitle = '';
                        if (currentState === 'UPTREND') {
                            alertTitle = '🚀 <b>สัญญาณซื้อต้นรอบ (Golden Cross)</b>\n<i>เส้น EMA 50 ตัดขึ้นเหนือ EMA 200</i>';
                        } else if (currentState === 'DOWNTREND') {
                            alertTitle = '⚠️ <b>สัญญาณขายจบรอบ (Death Cross)</b>\n<i>เส้น EMA 50 ตัดลงใต้ EMA 200</i>';
                        }

                        if (isMarketOpen() && data.isHalal) {
                            // 🤖 เรียก AI วิเคราะห์ข่าวสารเบื้องหลัง
                            console.log(`🤖 กำลังให้ AI อ่านข่าวและวิเคราะห์หุ้น ${symbol}...`);
                            const aiAnalysis = await getAIAnalysisAndNews(symbol, currentState, data.price, ema50, ema200);

                            const fullMessage = `${alertTitle}\n\n` +
                                `📌 หุ้น: <b>${symbol}</b> (${data.name})\n` +
                                `💰 ราคาปัจจุบัน: $${data.price}\n` +
                                `📊 EMA 50: $${ema50}\n` +
                                `📈 EMA 200: $${ema200}\n` +
                                `🕌 หนี้สิน: ${data.debtRatio}%\n\n` +
                                `🧠 <b>บทวิเคราะห์ข่าวโดย AI:</b>\n<i>${aiAnalysis}</i>`;

                            await sendTelegramMessage(fullMessage);
                        }
                    }

                    // 🔹 อัปเดตสถานะล่าสุดลง Database เสมอเมื่อค่าเปลี่ยน
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

// 🚑 1. ระบบ Health Check รายงานตัวตอน 21:30 น.
cron.schedule('30 21 * * *', () => {
    const message = "✅ <b>[Health Check]</b> บอท Trend Following + AI โค้ช ตื่นอยู่ครับ!\nเตรียมพร้อมสแกนตลาดอเมริกา 🇺🇸 📈";
    sendTelegramMessage(message);
    console.log("Sent Health Check at 21:30");
}, {
    scheduled: true,
    timezone: "Asia/Bangkok"
});

app.get('/', (req, res) => res.send('🚀 Trend Following Bot + AI News Analyst ตื่นอยู่เสมอ!'));
app.get('/api/stocks', (req, res) => { 
    res.json({ isReady: isReady, data: Object.values(cacheData) }); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 พร้อมที่พอร์ต ${PORT}`);
    sendTelegramMessage('🚀 <b>Trend Following Bot (เวอร์ชัน AI โค้ช) สตาร์ทเครื่องแล้ว!</b>\nระบบเชื่อมต่อ Database + AI อ่านข่าวสำเร็จ กำลังสแกนกราฟ...');
    updateAllStocks(); 
    setInterval(updateAllStocks, 15 * 60 * 1000); 
});