import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  LayoutGrid, ShieldCheck, Activity, TrendingUp, TrendingDown, Minus, Search, ChevronRight,
  ChevronLeft, Moon, BarChart3, Wallet, ArrowUpRight, ArrowDownRight, CircleDot, Filter,
  ShieldAlert, Target, Gauge, Info, AlertTriangle, RefreshCw,
} from "lucide-react";

// ===========================================================================
// DATA LAYER 
// ===========================================================================

const RAW_CHART_SERIES = [
  { t: "Mon", price: 182.1 }, { t: "Tue", price: 184.6 }, { t: "Wed", price: 183.2 },
  { t: "Thu", price: 188.4 }, { t: "Fri", price: 191.0 }, { t: "Mon", price: 189.3 },
  { t: "Tue", price: 194.8 }, { t: "Wed", price: 198.2 }, { t: "Thu", price: 196.5 },
  { t: "Fri", price: 201.7 },
];

const RAW_INDICES = [
  { name: "Dow Jones Islamic Market", value: "5,412.30", change: 0.84 },
  { name: "S&P Shariah Global", value: "3,208.11", change: -0.32 },
  { name: "FTSE Shariah All-World", value: "8,904.55", change: 1.12 },
];

const RAW_STOCKS = [
  { ticker: "HLAL", companyName: "Wahed FTSE USA Shariah ETF", sector: "ETF", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "PCOR", companyName: "Procore Technologies", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "SPUS", companyName: "SP Funds S&P 500 Shariah", sector: "ETF", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "AAPL", companyName: "Apple Inc.", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "MSFT", companyName: "Microsoft Corp.", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "GOOGL", companyName: "Alphabet Inc.", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "ADBE", companyName: "Adobe Inc.", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "CRM", companyName: "Salesforce Inc.", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "AMD", companyName: "Advanced Micro Devices", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "CSCO", companyName: "Cisco Systems", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "TSLA", companyName: "Tesla Inc.", sector: "Consumer", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "CAT", companyName: "Caterpillar Inc.", sector: "Industrials", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "LLY", companyName: "Eli Lilly and Company", sector: "Healthcare", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "JNJ", companyName: "Johnson & Johnson", sector: "Healthcare", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 },
  { ticker: "TXN", companyName: "Texas Instruments", sector: "Technology", currentPrice: 0, change: 0, totalAssets: 0, totalDebt: 0, debtRatio: 0, rsi: 50, supportLevel: 0, resistanceLevel: 0 }
];

async function fetchMarketData() {
  try {
    const res = await fetch(`https://halal-stock-bot-ya6r.onrender.com/api/stocks`);
    if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    const responseData = await res.json();
    
    // ⚡ ระบบดักจับการโหลดแบบใหม่ แม่นยำ 100%
    if (!responseData.isReady) {
       throw new Error(`กำลังสแกนงบการเงินและกราฟเข้าคลัง (${responseData.progress}/${responseData.total}) กรุณารอสักครู่...`);
    }

    const realDataArray = responseData.data;
    const updatedStocks = RAW_STOCKS.map((mockStock) => {
      const realData = realDataArray.find(d => d.symbol === mockStock.ticker);
      if (realData && realData.price > 0) {
        return {
          ...mockStock,
          companyName: realData.name || mockStock.companyName,
          currentPrice: realData.price,
          change: realData.change ? Number((realData.change).toFixed(2)) : 0,
          chartSeries: realData.chartSeries || [],
          supportLevel: realData.supportLevel || 0,
          resistanceLevel: realData.resistanceLevel || 0,
          rsi: realData.rsi || 50,
          debtRatio: realData.debtRatio || 0,
          totalDebt: realData.totalDebt || 0,
          totalAssets: realData.totalAssets || 0,
        };
      }
      return mockStock;
    });

    return { stocks: updatedStocks, indices: RAW_INDICES, chartSeries: RAW_CHART_SERIES };
  } catch (error) {
    throw new Error(error.message || "กำลังเชื่อมต่อ...");
  }
}

// ===========================================================================
// BUSINESS LOGIC
// ===========================================================================

const HALAL_DEBT_THRESHOLD = 33;

function getHalalStatus(debtRatio) {
  return debtRatio <= HALAL_DEBT_THRESHOLD
    ? { halal: true, label: "🟢 Halal Pass" }
    : { halal: false, label: "🔴 Non-Halal" };
}

function getSignal(rsi) {
  if (rsi <= 30) return { status: "Strong Buy", tone: "strongbuy" };
  if (rsi <= 45) return { status: "Buy", tone: "buy" };
  if (rsi < 70) return { status: "Hold", tone: "hold" };
  return { status: "Sell", tone: "sell" };
}

function getRiskLevels(stock) {
  const pctStop = stock.currentPrice * 0.98;
  const supportStop = stock.supportLevel * 0.995;
  const stopLoss = Math.max(pctStop, supportStop);
  const targetPrice = stock.resistanceLevel * 0.99;
  return {
    stopLoss: Math.round(stopLoss * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
  };
}

function analyzeStock(stock) {
  const debtRatio = Number(stock.debtRatio);
  const halalStatus = getHalalStatus(debtRatio);
  const signal = getSignal(stock.rsi);
  const risk = getRiskLevels(stock);
  return { ...stock, debtRatio, ...halalStatus, ...signal, ...risk };
}

function buildQuickStats(analyzedStocks) {
  const halalCount = analyzedStocks.filter((s) => s.halal).length;
  const buyCount = analyzedStocks.filter(
    (s) => s.status === "Buy" || s.status === "Strong Buy"
  ).length;
  const avgDebtRatio =
    analyzedStocks.reduce((sum, s) => sum + s.debtRatio, 0) / analyzedStocks.length;

  return [
    { label: "Halal Universe", value: `${halalCount}/${analyzedStocks.length}`, sub: "tickers screened", icon: ShieldCheck },
    { label: "Active Signals", value: `${buyCount}`, sub: "buy setups live", icon: Activity },
    { label: "Avg. Debt Ratio", value: `${avgDebtRatio.toFixed(1)}%`, sub: "across universe", icon: Wallet },
    { label: "Compliance Rate", value: `${Math.round((halalCount / analyzedStocks.length) * 100)}%`, sub: "of coverage universe", icon: BarChart3 },
  ];
}

function buildRationale(stock) {
  const rsiState = stock.rsi <= 30 ? "oversold" : stock.rsi >= 70 ? "overbought" : "neutral";
  const nearSupport = (stock.currentPrice - stock.supportLevel) / stock.currentPrice < 0.06;
  const nearResistance = (stock.resistanceLevel - stock.currentPrice) / stock.currentPrice < 0.06;

  const sentence1 = `RSI is currently at ${stock.rsi}, indicating ${rsiState} conditions.`;
  let sentence2;
  if (nearSupport) {
    sentence2 = `Price is nearing support at $${stock.supportLevel.toFixed(2)}, which favors a defensive stop just below it.`;
  } else if (nearResistance) {
    sentence2 = `Price is approaching resistance at $${stock.resistanceLevel.toFixed(2)}, where upside may stall.`;
  } else {
    sentence2 = `Price is trading between support at $${stock.supportLevel.toFixed(2)} and resistance at $${stock.resistanceLevel.toFixed(2)}.`;
  }
  const sentence3 = `The ${stock.status.toLowerCase()} signal pairs a stop-loss of $${stock.stopLoss.toFixed(2)} with a take-profit target of $${stock.targetPrice.toFixed(2)}.`;
  const sentence4 = stock.halal
    ? `Debt-to-Market Cap sits at ${stock.debtRatio.toFixed(1)}%, comfortably under the 33% Shariah threshold.`
    : `Debt-to-Market Cap sits at ${stock.debtRatio.toFixed(1)}%, above the 33% Shariah threshold, so this stock screens as non-compliant.`;

  return [sentence1, sentence2, sentence3, sentence4];
}

// ===========================================================================
// DESIGN TOKENS + PRESENTATIONAL ATOMS
// ===========================================================================

const EMERALD = "#10B981";
const CRIMSON = "#EF4444";
const CARD = "#161B26";
const BG = "#0B0F19";

function Pill({ children, tone = "neutral" }) {
  const styles = {
    halal: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30",
    nonhalal: "text-red-400 bg-red-500/10 border border-red-500/30",
    neutral: "text-slate-300 bg-white/5 border border-white/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  if (status === "Strong Buy") return <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-400"><TrendingUp size={13} /> STRONG BUY</span>;
  if (status === "Buy") return <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400"><TrendingUp size={13} /> BUY</span>;
  if (status === "Sell") return <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 border border-red-500/30 px-3 py-1 text-xs font-semibold text-red-400"><TrendingDown size={13} /> SELL</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-400"><Minus size={13} /> HOLD</span>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#1B2130] px-3 py-2 shadow-xl">
      <p className="text-slate-400 text-[11px]">{label}</p>
      <p className="text-white font-semibold text-sm mt-0.5">${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

function RsiGauge({ rsi }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>RSI</span><span className="text-slate-300 font-medium">{rsi}</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden bg-white/5 relative">
        <div className="absolute inset-0 flex">
          <div className="bg-emerald-500/20" style={{ width: "30%" }} />
          <div className="bg-emerald-500/10" style={{ width: "16%" }} />
          <div className="bg-amber-500/10" style={{ width: "24%" }} />
          <div className="bg-red-500/20" style={{ width: "30%" }} />
        </div>
        <div className="absolute top-0 h-full w-1 bg-white rounded-full" style={{ left: `${Math.min(Math.max(rsi, 0), 100)}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
        <span>0</span><span>30</span><span>46</span><span>70</span><span>100</span>
      </div>
    </div>
  );
}

function InteractiveChart({ data, xKey, yKey, height = 256, gradientId, referenceLines = [], domain }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EMERALD} stopOpacity={0.32} />
              <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1F2635" vertical={false} />
          <XAxis dataKey={xKey} stroke="#4B5563" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} interval={data && data.length > 15 ? 4 : 0} />
          <YAxis domain={domain || ["dataMin - 5", "dataMax + 5"]} stroke="#4B5563" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} />
          {referenceLines.map((rl) => (
            <ReferenceLine key={rl.label} y={rl.y} stroke={rl.color} strokeDasharray="5 5" strokeWidth={1.5} label={{ value: rl.label, position: rl.position || "insideTopRight", fill: rl.color, fontSize: 11 }} />
          ))}
          <Area type="monotone" dataKey={yKey} stroke={EMERALD} strokeWidth={2} fill={`url(#${gradientId})`} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterBar({ query, onQueryChange, onlyHalal, onToggleHalal }) {
  return (
    <div className="rounded-xl border border-white/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" style={{ backgroundColor: CARD }}>
      <div className="relative w-full sm:max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search ticker or company..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-all duration-200" />
      </div>
      <button onClick={onToggleHalal} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-all duration-200 ${onlyHalal ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-slate-300 hover:border-white/20"}`}>
        <Filter size={14} /> Show Only Halal Stocks
        <span className={`ml-1 w-9 h-5 rounded-full relative transition-colors duration-200 ${onlyHalal ? "bg-emerald-500" : "bg-slate-600"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${onlyHalal ? "left-4.5 translate-x-0.5" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}

function StockCard({ stock, onSelect }) {
  return (
    <div onClick={() => onSelect(stock.ticker)} className="rounded-xl border border-white/5 p-5 transition-all duration-200 hover:border-emerald-500/30 hover:-translate-y-0.5 cursor-pointer" style={{ backgroundColor: CARD }}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-white font-semibold">{stock.ticker}</h4>
          <p className="text-slate-500 text-xs">{stock.companyName}</p>
        </div>
        <StatusBadge status={stock.status} />
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Activity size={13} /> Price: <span className="text-white font-medium">${stock.currentPrice.toFixed(2)}</span></span>
        <span className="flex items-center gap-1">{stock.halal ? <ShieldCheck size={13} className="text-emerald-400" /> : <CircleDot size={13} className="text-red-400" />} <span className={stock.halal ? "text-emerald-400" : "text-red-400"}>{stock.halal ? "Halal" : "Non-Halal"}</span></span>
      </div>
      <RsiGauge rsi={stock.rsi} />
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><ShieldAlert size={11} /> Stop-Loss</p>
          <p className="text-red-400 font-semibold text-sm mt-0.5">${stock.stopLoss.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><Target size={11} /> Target Price</p>
          <p className="text-emerald-400 font-semibold text-sm mt-0.5">${stock.targetPrice.toFixed(2)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="rounded-lg bg-white/5 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide">Support</p><p className="text-slate-300 font-medium text-xs mt-0.5">${stock.supportLevel.toFixed(2)}</p></div>
        <div className="rounded-lg bg-white/5 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide">Resistance</p><p className="text-slate-300 font-medium text-xs mt-0.5">${stock.resistanceLevel.toFixed(2)}</p></div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1"><Info size={11} /> Click for the detailed chart & analysis</p>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 border border-white/5 ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-24" />)}</div>
      <SkeletonBlock className="h-80" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-20" />)}</div>
      <p className="text-center text-slate-500 text-xs pt-2">กำลังรอเชื่อมต่อกับเซิร์ฟเวอร์หลัก...</p>
    </div>
  );
}

function LoadingState({ message }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 p-10 flex flex-col items-center text-center gap-3" style={{ backgroundColor: CARD }}>
      <div className="rounded-full bg-emerald-500/10 p-3">
        <RefreshCw size={22} className="text-emerald-400 animate-spin" />
      </div>
      <h3 className="text-white font-semibold text-base">ระบบกำลังซิงค์ข้อมูล...</h3>
      <p className="text-emerald-400/80 text-sm max-w-sm">{message || "กำลังโหลดข้อมูลอัตโนมัติ"}</p>
      <p className="text-slate-500 text-xs mt-2">หน้านี้จะรีเฟรชเองอัตโนมัติ ไม่ต้องกดอะไรครับ</p>
    </div>
  );
}

// ===========================================================================
// VIEWS
// ===========================================================================

function DashboardView({ stocks, indices, chartSeries, quickStats }) {
  const hero = stocks.find((s) => s.ticker === "AAPL") || stocks[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {quickStats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl p-4 border border-white/5 transition-all duration-200 hover:border-emerald-500/30 hover:-translate-y-0.5" style={{ backgroundColor: CARD }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-medium tracking-wide uppercase">{s.label}</p>
                  <p className="text-2xl font-semibold text-white mt-1.5">{s.value}</p>
                  <p className="text-slate-500 text-xs mt-1">{s.sub}</p>
                </div>
                <div className="rounded-lg p-2 bg-emerald-500/10"><Icon size={18} className="text-emerald-400" /></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/5 p-5" style={{ backgroundColor: CARD }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-base">
              {hero.companyName} <span className="text-slate-500 font-normal text-sm">({hero.ticker})</span>
            </h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">${hero.currentPrice.toFixed(2)}</span>
              <span className={`text-sm font-medium flex items-center gap-0.5 ${hero.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {hero.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(hero.change)}%
              </span>
            </div>
          </div>
          <Pill tone={hero.halal ? "halal" : "nonhalal"}><ShieldCheck size={13} /> {hero.label}</Pill>
        </div>
        
        <InteractiveChart
          data={hero.chartSeries && hero.chartSeries.length > 0 ? hero.chartSeries : chartSeries}
          xKey="t"
          yKey="price"
          height={256}
          gradientId="priceFill"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {indices.map((idx) => (
          <div key={idx.name} className="rounded-xl border border-white/5 p-4 transition-all duration-200 hover:border-white/20" style={{ backgroundColor: CARD }}>
            <p className="text-slate-400 text-xs font-medium">{idx.name}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-lg font-semibold text-white">{idx.value}</span>
              <span className={`text-sm font-medium flex items-center gap-0.5 ${idx.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {idx.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(idx.change)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenerView({ stocks, onSelectStock }) {
  const [onlyHalal, setOnlyHalal] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return stocks.filter((s) => {
      if (onlyHalal && !s.halal) return false;
      if (query && !s.ticker.toLowerCase().includes(query.toLowerCase()) && !s.companyName.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [stocks, onlyHalal, query]);

  return (
    <div className="space-y-5">
      <FilterBar query={query} onQueryChange={setQuery} onlyHalal={onlyHalal} onToggleHalal={() => setOnlyHalal((v) => !v)} />
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ backgroundColor: CARD }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Ticker</th><th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">Total Debt / M.Cap</th>
                <th className="px-4 py-3 font-medium">Debt Ratio</th><th className="px-4 py-3 font-medium">Compliance</th><th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.ticker} onClick={() => onSelectStock(s.ticker)} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
                  <td className="px-4 py-3"><div className="font-semibold text-white">{s.ticker}</div><div className="text-slate-500 text-xs">{s.companyName}</div></td>
                  <td className="px-4 py-3 text-slate-300">{s.sector}</td>
                  <td className="px-4 py-3"><span className="text-white font-medium">${s.currentPrice.toFixed(2)}</span><span className={`ml-2 text-xs font-medium ${s.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{s.change >= 0 ? "+" : ""}{s.change}%</span></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{s.totalAssets > 0 ? `$${s.totalDebt}M / $${s.totalAssets}M` : 'N/A'}</td>
                  <td className="px-4 py-3"><span className={s.halal ? "text-emerald-400" : "text-red-400"}>{s.debtRatio.toFixed(1)}% <span className="text-slate-600">/ &lt;33%</span></span></td>
                  <td className="px-4 py-3">{s.halal ? <Pill tone="halal">{s.label}</Pill> : <Pill tone="nonhalal">{s.label}</Pill>}</td>
                  <td className="px-4 py-3 text-slate-600"><ChevronRight size={16} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">No stocks match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SignalsView({ stocks, onSelectStock }) {
  const [filter, setFilter] = useState("All");
  const filtered = stocks.filter((s) => filter === "All" || s.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {["All", "Strong Buy", "Buy", "Hold", "Sell"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-all duration-200 ${filter === f ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"}`}>{f}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((sig) => <StockCard key={sig.ticker} stock={sig} onSelect={onSelectStock} />)}
        {filtered.length === 0 && <p className="text-slate-500 text-sm px-1">No signals match this filter.</p>}
      </div>
    </div>
  );
}

function StockDetailView({ stock, onBack }) {
  const series = stock.chartSeries || [];
  const rationale = useMemo(() => buildRationale(stock), [stock]);

  const yMin = series.length > 0 ? Math.min(stock.stopLoss, ...series.map((p) => p.price)) * 0.985 : 0;
  const yMax = series.length > 0 ? Math.max(stock.targetPrice, ...series.map((p) => p.price)) * 1.015 : 100;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 transition-all duration-200"><ChevronLeft size={16} /> Back</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-white text-lg font-semibold">{stock.companyName} <span className="text-slate-500 font-normal text-sm">({stock.ticker})</span></h2>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">${stock.currentPrice.toFixed(2)}</span>
            <span className={`text-sm font-medium flex items-center gap-0.5 ${stock.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{stock.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(stock.change)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={stock.halal ? "halal" : "nonhalal"}><ShieldCheck size={13} /> {stock.label}</Pill>
          <StatusBadge status={stock.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-white/5 p-5" style={{ backgroundColor: CARD }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-semibold">30-Day Price Trend</h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Target ${stock.targetPrice.toFixed(2)}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Stop-Loss ${stock.stopLoss.toFixed(2)}</span>
            </div>
          </div>
          <InteractiveChart
            data={series}
            xKey="dateLabel"
            yKey="price"
            height={320}
            gradientId="detailFill"
            domain={[yMin, yMax]}
            referenceLines={[
              { y: stock.targetPrice, color: EMERALD, label: "Target", position: "insideTopRight" },
              { y: stock.stopLoss, color: CRIMSON, label: "Stop-Loss", position: "insideBottomRight" },
            ]}
          />
        </div>

        <div className="rounded-xl border border-white/5 p-5 flex flex-col" style={{ backgroundColor: CARD }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-lg p-1.5 bg-emerald-500/10"><Gauge size={15} className="text-emerald-400" /></div>
            <h3 className="text-white text-sm font-semibold">Technical Analysis Summary</h3>
          </div>
          <RsiGauge rsi={stock.rsi} />
          <div className="mt-4 space-y-2.5">
            {rationale.map((line, i) => <p key={i} className="text-xs text-slate-400 leading-relaxed">{line}</p>)}
          </div>
          <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/5 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide">Support</p><p className="text-slate-300 font-medium text-xs mt-0.5">${stock.supportLevel.toFixed(2)}</p></div>
            <div className="rounded-lg bg-white/5 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide">Resistance</p><p className="text-slate-300 font-medium text-xs mt-0.5">${stock.resistanceLevel.toFixed(2)}</p></div>
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><ShieldAlert size={10} /> Stop-Loss</p><p className="text-red-400 font-semibold text-xs mt-0.5">${stock.stopLoss.toFixed(2)}</p></div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2"><p className="text-slate-500 text-[10px] uppercase tracking-wide flex items-center gap-1"><Target size={10} /> Target</p><p className="text-emerald-400 font-semibold text-xs mt-0.5">${stock.targetPrice.toFixed(2)}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// CONTAINER 
// ===========================================================================

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "screener", label: "Halal Screener", icon: ShieldCheck },
  { key: "signals", label: "Trading Signals", icon: Activity },
];

export default function HalalDashboard() {
  const [view, setView] = useState("dashboard");
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent && !marketData) setIsLoading(true);
    try {
      const data = await fetchMarketData();
      setMarketData(data);
      setError(null);
    } catch (err) {
      setError(err.message || "กำลังเชื่อมต่อ...");
    } finally {
      setIsLoading(false);
    }
  }, [marketData]);

  useEffect(() => { 
    loadData(); 
    const interval = setInterval(() => {
      loadData(true);
    }, 4000); // เช็คหลังบ้านทุก 4 วิ จนกว่าจะโหลดเสร็จ
    return () => clearInterval(interval);
  }, [loadData]);

  const analyzedStocks = useMemo(() => {
    if (!marketData) return [];
    return marketData.stocks.map(analyzeStock);
  }, [marketData]);

  const quickStats = useMemo(() => {
    if (!analyzedStocks.length) return [];
    return buildQuickStats(analyzedStocks);
  }, [analyzedStocks]);

  const titleMap = { dashboard: "Market Overview", screener: "Halal Compliance Screener", signals: "Active Trading Signals" };
  const selectedStock = selectedTicker ? analyzedStocks.find((s) => s.ticker === selectedTicker) : null;
  const handleSelectStock = (ticker) => setSelectedTicker(ticker);
  const handleNavClick = (key) => { setSelectedTicker(null); setView(key); };

  return (
    <div className="w-full min-h-[700px] h-screen flex text-slate-200" style={{ backgroundColor: BG, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside className="w-60 shrink-0 border-r border-white/5 flex flex-col p-4" style={{ backgroundColor: "#0D111C" }}>
        <div className="flex items-center gap-2 px-2 py-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center"><Moon size={16} className="text-emerald-400" /></div>
          <div><p className="text-white font-semibold text-sm leading-tight">Halal Markets</p><p className="text-slate-500 text-[11px] leading-tight">Trading Desk</p></div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key && !selectedStock;
            return (
              <button key={item.key} onClick={() => handleNavClick(item.key)} className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${active ? "bg-emerald-500/15 text-emerald-400" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                <span className="flex items-center gap-2.5"><Icon size={16} />{item.label}</span>
                <ChevronRight size={14} className={`transition-all duration-200 ${active ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1 group-hover:opacity-40 group-hover:translate-x-0"}`} />
              </button>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-white/5 p-3 bg-white/5">
          <p className="text-xs text-slate-400 leading-relaxed">Connected to real-time market data API with historical 30-day charts.</p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 overflow-y-auto">
        {!selectedStock && !isLoading && !error && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-white text-xl font-semibold">{titleMap[view]}</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {view === "dashboard" && "Live snapshot of Shariah-compliant market performance"}
                {view === "screener" && "Financial ratio and business activity compliance checks"}
                {view === "signals" && "Technical setups and risk levels across the compliant universe"}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 bg-white/5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Market Open (Real-time)</span>
            </div>
          </div>
        )}

        {isLoading && !marketData && <DashboardSkeleton />}
        {!isLoading && error && !marketData && <LoadingState message={error} />}
        {marketData && (
          <>
            {selectedStock ? (
              <StockDetailView stock={selectedStock} onBack={() => setSelectedTicker(null)} />
            ) : (
              <>
                {view === "dashboard" && <DashboardView stocks={analyzedStocks} indices={marketData.indices} chartSeries={marketData.chartSeries} quickStats={quickStats} />}
                {view === "screener" && <ScreenerView stocks={analyzedStocks} onSelectStock={handleSelectStock} />}
                {view === "signals" && <SignalsView stocks={analyzedStocks} onSelectStock={handleSelectStock} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
