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

// 🛡️ ใส่ .trim() อุดช่องโหว่ช่องว่างล่องหน ป้องกันเซิร์ฟเวอร์พัง
const TELEGRAM_TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
const ALPHA_VANTAGE_API_KEY = (process.env.ALPHA_VANTAGE_API_KEY || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

// 🔹 เชื่อมต่อ MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
    .catch(err => console.error('❌ เชื่อมต่อ MongoDB ล้มเหลว:', err));

// 🔹 โครงสร้างสมุดจดถาวร (Schema) สำหรับจำสถานะหุ้น
const stockSchema = new mongoose.Schema({
    symbol: { type: String, unique: true },
    trend: String,
    aiSummary: String // 🌟 ช่องเก็บข้อความ AI สำหรับส่งไปหน้าเว็บ
});
const Stock = mongoose.model('Stock', stockSchema);

// 🌎 ตะกร้าหุ้นสายรันเทรนด์ (Trend Following - BDS-Free Edition): หุ้นสหรัฐฯ/เมกะเทรนด์โลก (25 ตัว) + หุ้นไทย (11 ตัว)
const WATCHLIST = [
    // 🇺🇸 หุ้นอเมริกา เมกะเทรนด์โลก และ ETF ฮาลาล (ตัด AAPL, MSFT, GOOGL, NVDA, CSCO, CAT ออกแล้ว)
    'HLAL', 'SPUS', 'SPSK', 'UMMA',
    'TSM', 'ASML', 'ANET', 'LRCX', 'AVGO', 'TSLA', 'AMD', 'PWR',
    'ADBE', 'CRM', 'ISRG', 'PCOR', 'CRWD', 'NOW', 'SNPS', 'MELI',
    'FSLR', 'JNJ', 'TXN', 'LLY', 'NVO',
    // 🇹🇭 หุ้นไทยสายวิ่งตามเทรนด์และพื้นฐานแกร่ง
    'DELTA.BK', 'HANA.BK', 'KCE.BK', 'ADVANC.BK',
    'BH.BK', 'BDMS.BK', 'MEGA.BK',
    'PTTEP.BK', 'AOT.BK', 'HMPRO.BK', 'GULF.BK'
];

// 🛡️ ฐานข้อมูลงบการเงินและปัจจัยพื้นฐานสำรองครบทั้ง 36 บริษัท (ป้องกันหนี้ 0.0% เมื่อ Yahoo บล็อก IP)
const FINANCIAL_FALLBACK = {
    'HLAL':      { name: 'Wahed FTSE USA Shariah ETF', debtM: 0, assetsM: 580, ratio: '0.0', focus: 'กระแสเงินทุนไหลเข้าหุ้นเทคโนโลยีและสุขภาพขนาดใหญ่ในสหรัฐฯ ที่ผ่านเกณฑ์ฮาลาล' },
    'SPUS':      { name: 'SP Funds S&P 500 Shariah ETF', debtM: 0, assetsM: 920, ratio: '0.0', focus: 'ทิศทางดัชนี S&P 500 กลุ่มหุ้นเติบโตและเทคโนโลยีที่ปลอดหนี้ดอกเบี้ยสูง' },
    'SPSK':      { name: 'SP Funds Dow Jones Global Sukuk ETF', debtM: 0, assetsM: 240, ratio: '0.0', focus: 'ทิศทางอัตราผลตอบแทนพันธบัตรอิสลาม (Sukuk) และนโยบายดอกเบี้ยของธนาคารกลางสหรัฐฯ' },
    'UMMA':      { name: 'Wahed Dow Jones Islamic World ETF', debtM: 0, assetsM: 110, ratio: '0.0', focus: 'แนวโน้มตลาดหุ้นฮาลาลทั่วโลกนอกสหรัฐฯ ทั้งในยุโรปและเอเชียแปซิฟิก' },
    'TSM':       { name: 'Taiwan Semiconductor (TSMC)', debtM: 58000, assetsM: 910000, ratio: '6.4', focus: 'ยอดคำสั่งซื้อชิป AI ขั้นสูงระดับ 3nm/2nm และกำลังการผลิตแพ็กเกจจิ้ง CoWoS สำหรับ Data Center ทั่วโลก' },
    'ASML':      { name: 'ASML Holding N.V.', debtM: 4900, assetsM: 355000, ratio: '1.4', focus: 'ยอดคำสั่งซื้อเครื่องฉายแสงชิป EUV และ High-NA EUV จากโรงงานผลิตเซมิคอนดักเตอร์ชั้นนำทั่วโลก' },
    'ANET':      { name: 'Arista Networks Inc.', debtM: 0, assetsM: 118000, ratio: '0.0', focus: 'การขยายตัวของระบบเครือข่าย Cloud Switching ความเร็วสูงสำหรับคลัสเตอร์ AI Data Center' },
    'LRCX':      { name: 'Lam Research Corporation', debtM: 5000, assetsM: 105000, ratio: '4.8', focus: 'ความต้องการเครื่องจักรผลิตแผ่นเวเฟอร์เซมิคอนดักเตอร์และหน่วยความจำความเร็วสูง HBM สำหรับ AI' },
    'AVGO':      { name: 'Broadcom Inc.', debtM: 67500, assetsM: 810000, ratio: '8.3', focus: 'ความต้องการชิปเครือข่าย AI ขั้นสูง (Custom AI Accelerators) และรายได้ซอฟต์แวร์องค์กร' },
    'TSLA':      { name: 'Tesla Inc.', debtM: 12700, assetsM: 1020000, ratio: '1.2', focus: 'ยอดส่งมอบรถยนต์ไฟฟ้ารายไตรมาส ระบบกักเก็บพลังงาน Megapack และความคืบหน้าของระบบขับเคลื่อนอัตโนมัติ FSD' },
    'AMD':       { name: 'Advanced Micro Devices', debtM: 2470, assetsM: 248000, ratio: '1.0', focus: 'การชิงส่วนแบ่งตลาดชิป AI ตระกูล Instinct MI และความต้องการซีพียูเซิร์ฟเวอร์ EPYC' },
    'PWR':       { name: 'Quanta Services Inc.', debtM: 4200, assetsM: 45500, ratio: '9.2', focus: 'เม็ดเงินลงทุนโครงข่ายสายส่งไฟฟ้าอัจฉริยะ (Power Grid) และโรงไฟฟ้าพลังงานสะอาดเพื่อรองรับ Data Center' },
    'ADBE':      { name: 'Adobe Inc.', debtM: 5600, assetsM: 215000, ratio: '2.6', focus: 'การสร้างรายได้จากฟีเจอร์ Generative AI (Firefly) บนแพลตฟอร์ม Creative Cloud' },
    'CRM':       { name: 'Salesforce Inc.', debtM: 11800, assetsM: 285000, ratio: '4.1', focus: 'การเติบโตของแพลตฟอร์ม Agentforce AI และการควบคุมต้นทุนเพิ่มอัตรากำไรจากการดำเนินงาน' },
    'ISRG':      { name: 'Intuitive Surgical Inc.', debtM: 0, assetsM: 185000, ratio: '0.0', focus: 'ยอดติดตั้งหุ่นยนต์ช่วยผ่าตัดอัจฉริยะ Da Vinci 5 และจำนวนเคสการผ่าตัดทั่วโลกที่เติบโตต่อเนื่อง' },
    'PCOR':      { name: 'Procore Technologies', debtM: 92, assetsM: 10800, ratio: '0.9', focus: 'การขยายฐานลูกค้าบริษัทรับเหมาก่อสร้างรายใหญ่และอัตราการต่ออายุสมาชิกซอฟต์แวร์' },
    'CRWD':      { name: 'CrowdStrike Holdings', debtM: 790, assetsM: 88000, ratio: '0.9', focus: 'การเติบโตของรายได้ประจำรายปี (ARR) ด้านความปลอดภัยไซเบอร์บนระบบคลาวด์ Falcon' },
    'NOW':       { name: 'ServiceNow Inc.', debtM: 2300, assetsM: 205000, ratio: '1.1', focus: 'ยอดสัญญาระบบจัดการเวิร์กโฟลว์อัตโนมัติระดับองค์กรและแพ็กเกจ Now Assist AI' },
    'SNPS':      { name: 'Synopsys Inc.', debtM: 710, assetsM: 82000, ratio: '0.9', focus: 'ความต้องการซอฟต์แวร์ออกแบบชิป (EDA) ที่เพิ่มขึ้นตามความซับซ้อนของชิป AI' },
    'MELI':      { name: 'MercadoLibre Inc.', debtM: 6800, assetsM: 102000, ratio: '6.7', focus: 'ยอดขายอีคอมเมิร์ซและการเติบโตของธุรกรรมการเงินดิจิทัลในภูมิภาคละตินอเมริกา' },
    'FSLR':      { name: 'First Solar Inc.', debtM: 620, assetsM: 24000, ratio: '2.6', focus: 'ยอดคำสั่งซื้อแผงโซลาร์เซลล์ระดับอุตสาหกรรม (Utility-scale) สำหรับโรงไฟฟ้าพลังงานสะอาดและเทคโนโลยี' },
    'JNJ':       { name: 'Johnson & Johnson', debtM: 36500, assetsM: 378000, ratio: '9.7', focus: 'ยอดขายกลุ่มยารักษาโรคมะเร็ง/ภูมิคุ้มกัน และการเติบโตของอุปกรณ์การแพทย์ MedTech' },
    'TXN':       { name: 'Texas Instruments', debtM: 14100, assetsM: 178000, ratio: '7.9', focus: 'วัฏจักรการฟื้นตัวของคำสั่งซื้อชิปอนาล็อกในกลุ่มอุตสาหกรรมและยานยนต์' },
    'LLY':       { name: 'Eli Lilly and Company', debtM: 31200, assetsM: 760000, ratio: '4.1', focus: 'กำลังการผลิตและยอดขายกลุ่มยารักษาโรคเบาหวานและลดน้ำหนัก Mounjaro และ Zepbound' },
    'NVO':       { name: 'Novo Nordisk A/S', debtM: 15200, assetsM: 480000, ratio: '3.2', focus: 'การขยายตลาดยาลดน้ำหนักและเบาหวานตระกูล GLP-1 (Ozempic / Wegovy) ทั่วโลก' },
    'DELTA.BK':  { name: 'Delta Electronics (Thailand)', debtM: 4200, assetsM: 1620000, ratio: '0.3', focus: 'คำสั่งซื้อระบบจัดการพลังงานสำหรับ Data Center (AI Server) และชิ้นส่วนอิเล็กทรอนิกส์ยานยนต์ไฟฟ้า' },
    'HANA.BK':   { name: 'Hana Microelectronics PCL', debtM: 1800, assetsM: 32000, ratio: '5.6', focus: 'วัฏจักรคำสั่งซื้อชิ้นส่วนเซมิคอนดักเตอร์ สมาร์ทโฟน และทิศทางค่าเงินบาทต่อการส่งออก' },
    'KCE.BK':    { name: 'KCE Electronics PCL', debtM: 3900, assetsM: 48000, ratio: '8.1', focus: 'ยอดส่งออกแผ่นพิมพ์วงจรอิเล็กทรอนิกส์ (PCB) สำหรับกลุ่มยานยนต์และต้นทุนราคาทองแดง' },
    'ADVANC.BK': { name: 'Advanced Info Service PCL (AIS)', debtM: 124000, assetsM: 815000, ratio: '15.2', focus: 'การเติบโตของรายได้เฉลี่ยต่อเลขหมาย (ARPU) อินเทอร์เน็ตบ้าน และธุรกิจ Data Center' },
    'BH.BK':     { name: 'Bumrungrad Hospital PCL', debtM: 320, assetsM: 158000, ratio: '0.2', focus: 'จำนวนผู้ป่วยต่างชาติและตะวันออกกลางที่เข้ามารักษาโรคซับซ้อนซึ่งให้อัตรากำไรสูง' },
    'BDMS.BK':   { name: 'Bangkok Dusit Medical Services', debtM: 18500, assetsM: 429000, ratio: '4.3', focus: 'การเติบโตของจำนวนผู้ป่วยทั้งชาวไทยและต่างชาติ รวมถึงการขยายศูนย์การแพทย์เฉพาะทาง' },
    'MEGA.BK':   { name: 'Mega Lifesciences PCL', debtM: 650, assetsM: 34000, ratio: '1.9', focus: 'ยอดขายผลิตภัณฑ์อาหารเสริมและเวชภัณฑ์ในภูมิภาคเอเชียตะวันออกเฉียงใต้และแอฟริกา' },
    'PTTEP.BK':  { name: 'PTT Exploration & Production', debtM: 108000, assetsM: 575000, ratio: '18.8', focus: 'ทิศทางราคาน้ำมันดิบตลาดโลกและปริมาณการผลิตก๊าซธรรมชาติในอ่าวไทย' },
    'AOT.BK':    { name: 'Airports of Thailand PCL', debtM: 58200, assetsM: 857000, ratio: '6.8', focus: 'จำนวนเที่ยวบินและนักท่องเที่ยวต่างชาติที่เดินทางเข้าประเทศไทยในช่วงไฮซีซั่น' },
    'HMPRO.BK':  { name: 'Home Product Center PCL', debtM: 19800, assetsM: 132000, ratio: '15.0', focus: 'ยอดขายสาขาเดิม (SSSG) กำลังซื้อภาคครัวเรือน และการขยายสาขา Hybrid' },
    'GULF.BK':   { name: 'Gulf Energy Development PCL', debtM: 285000, assetsM: 690000, ratio: '41.3', focus: 'การเปิดดำเนินการเชิงพาณิชย์ของโรงไฟฟ้าใหม่ และการลงทุนโครงสร้างพื้นฐานดิจิทัล (หนี้เกิน 33%)' }
};

let cacheData = {}; 
let isReady = false; 
let initProgress = 0; 
let yahooCookie = '';
let yahooCrumb = '';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isThaiStock(symbol) {
    return Boolean(symbol && symbol.toUpperCase().endsWith('.BK'));
}

async function sendTelegramMessage(text) {
    if (!TELEGRAM_TOKEN) return; 
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
        });
    } catch (error) { 
        console.error('❌ ส่งข้อความพลาด:', error.message); 
    }
}

// 🧠 สร้างบทวิเคราะห์เทคนิค + ปัจจัยพื้นฐานอัตโนมัติ (ใช้เป็นฐานข้อมูลตั้งต้นเมื่อ AI ติดโควตา)
function buildSmartFallbackSummary(symbol, currentState, price, ema50, ema200) {
    const info = FINANCIAL_FALLBACK[symbol];
    const curr = isThaiStock(symbol) ? '฿' : '$';
    const gap = ema200 > 0 ? (((ema50 - ema200) / ema200) * 100).toFixed(1) : '0.0';
    const focusText = info ? info.focus : 'ผลประกอบการรายไตรมาสและกระแสเงินทุนของนักลงทุนสถาบัน';

    if (currentState === 'UPTREND') {
        const stage = Number(gap) <= 3.0 ? 'เพิ่งตัดขึ้นต้นรอบ (Golden Cross)' : `เป็นขาขึ้นแข็งแกร่ง (EMA 50 สูงกว่า EMA 200 อยู่ +${gap}%)`;
        return `โครงสร้างกราฟ${stage} โดยมีแนวรับสำคัญตามเส้น EMA 50 ที่ ${curr}${ema50}\nปัจจัยสำคัญที่ควรจับตา: ${focusText}`;
    } else {
        const stage = Number(gap) >= -3.0 ? 'เริ่มส่งสัญญาณเตือนภัยตัดลง (Death Cross)' : `อยู่ในแนวโน้มขาลง (EMA 50 ต่ำกว่า EMA 200 อยู่ ${gap}%)`;
        return `โครงสร้างกราฟ${stage} ควรระมัดระวังแรงขายจนกว่าราคาจะกลับมายืนเหนือ ${curr}${ema50}\nปัจจัยสำคัญที่ควรจับตา: ${focusText}`;
    }
}

// 🧠 ฟังก์ชันดึงข่าว + AI วิเคราะห์เหตุผล (อัปเกรดเป็น gemini-2.5-flash + ระบบสำรองอัตโนมัติ)
async function getAIAnalysisAndNews(symbol, name, currentState, price, ema50, ema200) {
    let aiSummary = buildSmartFallbackSummary(symbol, currentState, price, ema50, ema200);
    let newsText = "";
    const isTH = isThaiStock(symbol);
    const curr = isTH ? '฿' : '$';
    const marketName = isTH ? 'ตลาดหลักทรัพย์แห่งประเทศไทย (SET)' : 'ตลาดหุ้นสหรัฐอเมริกา (US)';

    // 1. ดึงข่าวสารล่าสุดจาก Alpha Vantage (สำหรับหุ้นสหรัฐฯ)
    if (ALPHA_VANTAGE_API_KEY && !isTH) {
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

    // 2. ให้ Gemini อ่านข่าว/ข้อมูลเทรนด์และสรุปสั้นๆ
    if (GEMINI_API_KEY) {
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const prompt = `
คุณคือนักวิเคราะห์การเงินสาย Trend Following โปรดวิเคราะห์สถานการณ์หุ้น ${symbol} (${name}) ใน${marketName}:
- ราคาปัจจุบัน: ${curr}${price}
- สัญญาณเทรนด์: ${currentState === 'UPTREND' ? 'Golden Cross (ขาขึ้นรอบใหญ่)' : 'Death Cross (ขาลงรอบใหญ่)'} (EMA 50: ${curr}${ema50}, EMA 200: ${curr}${ema200})
- หัวข้อข่าวล่าสุด:
${newsText || "วิเคราะห์จากปัจจัยพื้นฐานของธุรกิจและแนวโน้มกราฟเทคนิค EMA 50/200"}

คำสั่ง: โปรดสรุปเหตุผลกระชับภาษาไทย 2-3 บรรทัด ว่าทำไมหุ้นถึงอยู่ในเทรนด์นี้ และนักลงทุนควรจับตาปัจจัยอะไรของบริษัทเป็นพิเศษ (ไม่ต้องมีคำเกริ่น นำเสนอให้อ่านง่าย เหมาะสำหรับอ่านบน Telegram และหน้าเว็บ)`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            if (responseText && responseText.length > 20) {
                aiSummary = responseText;
            }
        } catch (e) {
            console.log(`ℹ️ ใช้บทวิเคราะห์เทคนิคมาตรฐานสำหรับ ${symbol} (${e.message})`);
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

// ⏰ เวลาตลาดแยกตามสัญชาติหุ้น (ไทย SET vs อเมริกา US)
function isMarketOpen(symbol) {
    const now = new Date();
    const day = now.getUTCDay(); 
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const time = hour + (minute / 60);
    
    if (day === 0 || day === 6) return false;

    if (isThaiStock(symbol)) {
        const isMorningOpen = (time >= 3.0 && time <= 5.5);
        const isAfternoonOpen = (time >= 7.0 && time <= 9.5);
        return isMorningOpen || isAfternoonOpen;
    } else {
        return (time >= 14.5 && time < 20.0);
    }
}

// 🎯 จับเทรนด์รอบใหญ่ด้วย EMA 50 และ EMA 200
function determineTrendState(ema50, ema200) {
    if (ema50 === 0 || ema200 === 0) return 'UNKNOWN';
    if (ema50 > ema200) return 'UPTREND';    // ขาขึ้น (Golden Cross)
    if (ema50 < ema200) return 'DOWNTREND';  // ขาลง (Death Cross)
    return 'UNKNOWN';
}

// 🔑 ปรับปรุงการดึง Cookie & Crumb ของ Yahoo ให้คัดกรองข้อความ Error ออกอย่างแม่นยำ
async function getYahooAuth() {
    if (yahooCookie && yahooCrumb) return { cookie: yahooCookie, crumb: yahooCrumb };
    try {
        const headers = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        };

        const resCookie = await fetch('https://fc.yahoo.com', { headers });
        const rawCookies = typeof resCookie.headers.getSetCookie === 'function'
            ? resCookie.headers.getSetCookie()
            : [resCookie.headers.get('set-cookie') || ''];
        const cleanCookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
        if (!cleanCookie) throw new Error('ไม่ได้รับ Cookie');
        
        const resCrumb = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: { ...headers, 'Cookie': cleanCookie }
        });
        if (!resCrumb.ok) throw new Error('Crumb HTTP ' + resCrumb.status);
        const crumbStr = (await resCrumb.text()).trim();
        
        if (!crumbStr || crumbStr.length > 25 || crumbStr.includes('<html>') || crumbStr.includes('Too Many') || crumbStr.includes('{')) {
            throw new Error('Crumb ถูกจำกัดการเข้าถึง');
        }
        
        yahooCookie = cleanCookie;
        yahooCrumb = crumbStr;
        return { cookie: yahooCookie, crumb: yahooCrumb };
    } catch (e) {
        yahooCookie = ''; 
        yahooCrumb = '';
        return { cookie: '', crumb: '' };
    }
}

async function fetchStockDataNative(symbol) {
    const fallback = FINANCIAL_FALLBACK[symbol] || { name: symbol, debtM: 0, assetsM: 1000, ratio: '0.0' };
    let currentPrice = 0, changePercent = 0, prices = [];
    let name = fallback.name;

    try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2y`;
        const chartRes = await fetch(chartUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const chartData = await chartRes.json();
        const result = chartData.chart.result[0];
        
        if (result.meta?.shortName || result.meta?.longName) {
            name = result.meta.shortName || result.meta.longName;
        }

        currentPrice = Math.round((result.meta.regularMarketPrice || 0) * 100) / 100;
        const closes = result.indicators.quote[0].close || [];
        for (let i = 0; i < closes.length; i++) {
            if (closes[i] !== null && closes[i] !== undefined) {
                prices.push(Math.round(closes[i] * 100) / 100);
            }
        }

        // ✅ คำนวณ % การเปลี่ยนแปลงรายวันเทียบกับราคาปิดของวันก่อนหน้า (แก้ปัญหาตัวเลขสะสม 2 ปี)
        const prevDayClose = prices.length >= 2 ? prices[prices.length - 2] : (result.meta.regularMarketPreviousClose || currentPrice);
        changePercent = prevDayClose > 0 ? Math.round(((currentPrice - prevDayClose) / prevDayClose) * 10000) / 100 : 0;
    } catch (e) {
        console.log(`⚠️ ข้ามกราฟของ ${symbol}: ${e.message}`);
    }

    // ใช้ค่างบการเงินตั้งต้นจากคลังสำรอง (ป้องกันหนี้ 0.0% เมื่อ Yahoo บล็อก IP)
    let debtM = fallback.debtM;
    let assetsM = fallback.assetsM;
    let debtRatioStr = fallback.ratio;
    let isPass = Number(debtRatioStr) <= 33;

    // พยายามดึงงบการเงินสดจาก Yahoo หากไม่ถูกบล็อก
    try {
        const auth = await getYahooAuth();
        if (auth.crumb) {
            const finUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,price&crumb=${encodeURIComponent(auth.crumb)}`;
            const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Cookie': auth.cookie };

            const finRes = await fetch(finUrl, { headers });
            if (finRes.ok) {
                const finData = await finRes.json();
                const finResult = finData?.quoteSummary?.result?.[0];
                if (finResult) {
                    name = finResult.price?.shortName || finResult.price?.longName || name;
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
            } else {
                yahooCookie = '';
                yahooCrumb = '';
            }
        }
    } catch (e) {
        // หาก Yahoo บล็อก IP จะใช้ค่าจาก FINANCIAL_FALLBACK โดยอัตโนมัติ
    }

    const isTH = isThaiStock(symbol);

    return {
        symbol,
        name,
        market: isTH ? 'TH' : 'US',
        currency: isTH ? '฿' : '$',
        price: currentPrice,
        change: changePercent,
        historicalPrices: prices,
        debtRatio: debtRatioStr,
        totalDebt: debtM,
        totalAssets: assetsM,
        isHalal: isPass
    };
}

async function updateAllStocks() {
    console.log('🔄 เริ่มสแกนหาเทรนด์รอบใหญ่ (EMA 50 & 200) ทั้งตลาด US และ TH...');
    for (let i = 0; i < WATCHLIST.length; i++) {
        const symbol = WATCHLIST[i];
        try {
            const data = await fetchStockDataNative(symbol);
            
            if (data.historicalPrices.length >= 200) {
                const ema50 = calculateEMA(data.historicalPrices, 50);
                const ema200 = calculateEMA(data.historicalPrices, 200);
                const currentState = determineTrendState(ema50, ema200);
                
                data.ema50 = ema50;
                data.ema200 = ema200;
                data.trend = currentState;

                // 🔹 ดึงสถานะเทรนด์ล่าสุดจาก Database
                const savedStock = await Stock.findOne({ symbol: symbol });
                const previousTrend = savedStock ? savedStock.trend : null;
                let currentAiSummary = savedStock && savedStock.aiSummary ? savedStock.aiSummary : "";

                // ตรวจสอบว่าข้อความเดิมใน Database เป็นข้อความว่างหรือข้อความ Error เก่าหรือไม่
                const isPlaceholderSummary = !currentAiSummary || 
                    currentAiSummary.includes("ไม่มีข้อมูลวิเคราะห์") || 
                    currentAiSummary.includes("รอยืนยันสัญญาณ");

                if (currentState !== 'UNKNOWN') {
                    // กรณีที่ 1: หุ้นเกิดการเปลี่ยนเทรนด์ (ตัดขึ้น Golden Cross หรือ ตัดลง Death Cross)
                    if (previousTrend && currentState !== previousTrend) {
                        let alertTitle = '';
                        if (currentState === 'UPTREND') {
                            alertTitle = '🚀 <b>สัญญาณซื้อต้นรอบ (Golden Cross)</b>\n<i>เส้น EMA 50 ตัดขึ้นเหนือ EMA 200</i>';
                        } else if (currentState === 'DOWNTREND') {
                            alertTitle = '⚠️ <b>สัญญาณขายจบรอบ (Death Cross)</b>\n<i>เส้น EMA 50 ตัดลงใต้ EMA 200</i>';
                        }

                        if (isMarketOpen(symbol) && data.isHalal) {
                            console.log(`🤖 เทรนด์เปลี่ยน! กำลังให้ AI อ่านข่าวและวิเคราะห์หุ้น ${symbol}...`);
                            currentAiSummary = await getAIAnalysisAndNews(symbol, data.name, currentState, data.price, ema50, ema200);

                            const flag = data.market === 'TH' ? '🇹🇭' : '🇺🇸';
                            const curr = data.currency;

                            const fullMessage = `${alertTitle}\n\n` +
                                `${flag} หุ้น: <b>${symbol}</b> (${data.name})\n` +
                                `💰 ราคาปัจจุบัน: ${curr}${data.price}\n` +
                                `📊 EMA 50: ${curr}${ema50}\n` +
                                `📈 EMA 200: ${curr}${ema200}\n` +
                                `🕌 หนี้สิน: ${data.debtRatio}%\n\n` +
                                `🧠 <b>บทวิเคราะห์โดย AI:</b>\n<i>${currentAiSummary}</i>`;

                            await sendTelegramMessage(fullMessage);
                        }
                    }
                    // กรณีที่ 2: ยังไม่มีบทวิเคราะห์ หรือเป็นข้อความ "ไม่มีข้อมูลวิเคราะห์..." จากรอบเก่า ให้เขียนทับใหม่ทันที
                    else if (isPlaceholderSummary) {
                        console.log(`🤖 อัปเดตบทวิเคราะห์สำหรับหุ้น ${symbol} ลง Database...`);
                        currentAiSummary = await getAIAnalysisAndNews(symbol, data.name, currentState, data.price, ema50, ema200);
                    }

                    // 🌟 บันทึกสถานะล่าสุดและบทวิเคราะห์ลง MongoDB
                    if (currentState !== previousTrend || currentAiSummary !== (savedStock ? savedStock.aiSummary : "")) {
                        await Stock.updateOne(
                            { symbol: symbol }, 
                            { $set: { trend: currentState, aiSummary: currentAiSummary } }, 
                            { upsert: true }
                        );
                    }
                }
                
                data.aiSummary = currentAiSummary;
            }
            
            cacheData[symbol] = data;
            initProgress = i + 1;
            console.log(`✅ อัปเดต ${symbol} สำเร็จ (${initProgress}/${WATCHLIST.length}) - หนี้สิน: ${data.debtRatio}%`);
        } catch (err) {
            console.log(`⚠️ ดึงข้อมูล ${symbol} พลาด: ${err.message}`);
        }
        await delay(1500); 
    }
    isReady = true;
    console.log('✅ สแกนเทรนด์และงบการเงินหุ้น US & TH เสร็จสิ้น 100%!');
}

// 🚑 1. ระบบ Health Check รอบตลาดหุ้นไทย (10:00 น. จันทร์-ศุกร์)
cron.schedule('0 10 * * 1-5', () => {
    const message = "✅ <b>[Health Check - ตลาดหุ้นไทย]</b> บอท Trend Following + AI โค้ช ตื่นอยู่ครับ!\nเริ่มสแกนสัญญาณ EMA 50/200 ตลาด SET 🇹🇭 📈";
    sendTelegramMessage(message);
    console.log("Sent TH Market Health Check at 10:00");
}, {
    scheduled: true,
    timezone: "Asia/Bangkok"
});

// 🚑 2. ระบบ Health Check รอบตลาดหุ้นอเมริกา (21:30 น. ทุกวัน)
cron.schedule('30 21 * * *', () => {
    const message = "✅ <b>[Health Check - ตลาดหุ้นอเมริกา]</b> บอท Trend Following + AI โค้ช ตื่นอยู่ครับ!\nเตรียมพร้อมสแกนตลาดอเมริกา 🇺🇸 📈";
    sendTelegramMessage(message);
    console.log("Sent US Market Health Check at 21:30");
}, {
    scheduled: true,
    timezone: "Asia/Bangkok"
});

app.get('/', (req, res) => res.send('🚀 Trend Following Bot (US & TH Market - BDS-Free Edition) + AI News Analyst ตื่นอยู่เสมอ!'));
app.get('/api/stocks', (req, res) => { 
    res.json({
        isReady: isReady,
        progress: initProgress,
        total: WATCHLIST.length,
        data: Object.values(cacheData)
    }); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 พร้อมที่พอร์ต ${PORT}`);
    sendTelegramMessage('🚀 <b>Trend Following Bot (US & TH + AI โค้ช) อัปเดตตะกร้าหุ้นใหม่ (BDS-Free & Global Megatrends) สำเร็จ!</b>\nกำลังซิงค์ข้อมูลและบทวิเคราะห์ใหม่...');
    updateAllStocks(); 
    setInterval(updateAllStocks, 15 * 60 * 1000); 
});