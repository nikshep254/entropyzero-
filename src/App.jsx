import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { TrendingUp, Activity, Plus, Trash2, Send, ChevronRight, ChevronLeft, Check, X, Download, Upload, BarChart2, BookOpen, Settings, Zap, Newspaper, Star, AlertTriangle, Brain, Target, Calendar, Award, Flame, Moon, Layers, Info } from "lucide-react";

// ── AI: OpenRouter (primary) + Anthropic direct fallback ────────────────────
const OR_KEY = import.meta.env.VITE_OPENROUTER_KEY || "";

async function callAI(systemPrompt, messages) {
  // Try OpenRouter first
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OR_KEY}`,
        "HTTP-Referer": "https://entropyzero.app",
        "X-Title": "entropyzero",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-haiku",
        max_tokens: 900,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    const d = await res.json();
    if (d.choices?.[0]?.message?.content) return d.choices[0].message.content;
  } catch (_) {}
  // Fallback: Anthropic direct (works in Claude artifact sandbox)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: systemPrompt,
      messages,
    }),
  });
  const d = await res.json();
  return d.content?.[0]?.text || "No response.";
}

// ── Persistent storage helpers ──────────────────────────────────────────────
const STORAGE_KEY = "entropyzero-v3";

async function loadAllData() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    return result ? JSON.parse(result.value) : null;
  } catch (_) { return null; }
}

async function saveAllData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── utils ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().split("T")[0];
const fmt = (n, d = 2) => parseFloat(n).toFixed(d);

const CURRENCIES = {
  "United States": { symbol: "$", code: "USD" }, "India": { symbol: "₹", code: "INR" },
  "United Kingdom": { symbol: "£", code: "GBP" }, "European Union": { symbol: "€", code: "EUR" },
  "Japan": { symbol: "¥", code: "JPY" }, "Australia": { symbol: "A$", code: "AUD" },
  "Canada": { symbol: "C$", code: "CAD" }, "Brazil": { symbol: "R$", code: "BRL" },
  "Singapore": { symbol: "S$", code: "SGD" }, "UAE": { symbol: "د.إ", code: "AED" },
  "Other": { symbol: "$", code: "USD" },
};

const SECTORS = [
  { id: "health",    label: "Health",    emoji: "💪", color: "#34d399" },
  { id: "academics", label: "Academics", emoji: "📚", color: "#60a5fa" },
  { id: "social",    label: "Social",    emoji: "👥", color: "#f59e0b" },
  { id: "mental",    label: "Mental",    emoji: "🧠", color: "#c084fc" },
  { id: "skills",    label: "Skills",    emoji: "⚡", color: "#fb923c" },
];

const TREND_OPTIONS = [
  { label: "Skyrocketing 🚀", value: 2.5 }, { label: "Growing 📈", value: 1.2 },
  { label: "Flat ➡️", value: 0 }, { label: "Declining 📉", value: -1.2 },
  { label: "Crashing 🔻", value: -2.5 },
];

const EMOJIS       = ["📅","🏫","🎓","💼","❤️","🌍","🏠","⚡","🌱","🔥","🏆","💔","🎯","🌙","⛈️"];
const COLORS       = ["#a3a3a3","#60a5fa","#34d399","#f59e0b","#f87171","#c084fc","#fb923c","#e2e8f0"];
const SKILL_LEVELS = ["Beginner","Developing","Proficient","Advanced","Expert"];
const DEBT_SEVERITY= ["Minor","Moderate","Significant","Critical"];
const MOOD_LABELS  = ["😞","😕","😐","🙂","😊","😄","🤩"];

const ACHIEVEMENTS = [
  { id: "first_log",  icon: "🌱", title: "First Step",      desc: "Log your first habit",    check: (o) => o.length >= 1 },
  { id: "streak_7",   icon: "🔥", title: "Week Warrior",    desc: "7-day streak",             check: (_, __, s) => s >= 7 },
  { id: "streak_30",  icon: "🏆", title: "Iron Discipline", desc: "30-day streak",            check: (_, __, s) => s >= 30 },
  { id: "index_1000", icon: "💎", title: "Four Figures",    desc: "Index crosses 1000",       check: (_, i) => i >= 1000 },
  { id: "index_500",  icon: "⭐", title: "Milestone 500",   desc: "Index crosses 500",        check: (_, i) => i >= 500 },
  { id: "press_5",    icon: "📰", title: "Journalist",      desc: "Publish 5 press releases", check: (_, __, ___, pr) => pr >= 5 },
  { id: "skills_5",   icon: "🧪", title: "Renaissance",     desc: "Add 5 skills",             check: (_, __, ___, ____, sk) => sk >= 5 },
  { id: "overcome",   icon: "💪", title: "Debt Free",       desc: "Overcome a weakness",      check: (_, __, ___, ____, _____, ow) => ow >= 1 },
];

const FEATURE_INFO = {
  lifeIndex:    { title: "Life Index",            body: "Your overall life score — like a stock price. It rises when you log positive habits and events, and falls with negative ones. IPO price is your starting baseline." },
  allTime:      { title: "All-Time Return",        body: "Total percentage gain/loss since your IPO (starting price). Reflects the full arc of your journey." },
  sevenDay:     { title: "7-Day Change",           body: "How much your index moved over the last 7 days. A quick pulse check on your recent momentum." },
  oneMonth:     { title: "1-Month Change",         body: "Performance over the last 30 days. More reliable than 7-day for spotting real trends vs noise." },
  streak:       { title: "Streak",                 body: "Consecutive days you've logged at least one habit or event. Every 7 days earns you a dividend bonus — your index gets a free bump." },
  chart:        { title: "Performance Chart",      body: "Your index plotted over time. Green fill = profitable range, red fill = losing range. Phase markers (emoji flags) show life chapters." },
  technicals:   { title: "Technicals",             body: "RSI measures momentum (>70 = hot, <30 = oversold), SMA 14/30 are moving averages, volatility shows consistency. HOLD/BUY/SELL is based on 30-day momentum." },
  sectors:      { title: "Sector Breakdown",       body: "Radar chart across 5 life areas: Health, Academics, Social, Mental, Skills. Each sector score is driven by the habits and skills you've logged in that category." },
  balanceSheet: { title: "Balance Sheet",          body: "Assets = points from skills (higher level = more pts). Debt = points from weaknesses (higher severity = more pts). Net Worth = Assets minus Debt." },
  habits:       { title: "Habits",                 body: "Your daily drivers. Positive habits increase your index by their set %, negative ones reduce it. Log them daily to build streaks and compound your index." },
  press:        { title: "Press Releases",         body: "Write entries about major life events. Each one moves your index and creates a permanent journal of your story." },
  skills:       { title: "Skills — Assets",        body: "Skills are your long-term assets. Each adds points to your balance sheet. Level them up as you improve. Higher level = higher asset value." },
  weaknesses:   { title: "Weaknesses — Debt",      body: "Honest tracking of your weak spots. Each subtracts from your net worth. Use 'Improve' to reduce severity or fully overcome it for a boost." },
  goals:        { title: "Goals — Pending IPOs",   body: "Set goals with a % reward for achieving them. When you mark complete, your index gets that reward. Unachieved goals are companies waiting to list." },
  phases:       { title: "Life Phases",            body: "Map your life into chapters. Each phase has a trend that shapes the historical curve on your chart. Phase markers appear as emoji flags." },
  heatmap:      { title: "Activity Heatmap",       body: "GitHub-style contribution graph. Green = positive net day, red = negative, dark = no activity. Great for spotting consistency patterns." },
  coach:        { title: "AI Life Coach",          body: "An AI with full context on your data — index, habits, skills, weaknesses, phases. Ask for pattern analysis, goal advice, or a life review." },
  capsule:      { title: "Time Capsule",           body: "Write a message that locks until a future date. On that date, a banner appears with your message. Perfect for letters to your future self." },
  mood:         { title: "Mood Tracker",           body: "Log how you feel today. Each mood choice makes a tiny index adjustment and gets tagged to that chart point. Hover chart points to see mood history." },
  pnl:          { title: "Monthly P&L",            body: "Profit & Loss per month. Green = net positive, red = net negative. Count shows how many times you logged. Consistency > intensity." },
};

// ── Info tooltip ─────────────────────────────────────────────────────────────
const InfoTooltip = ({ feature }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const info = FEATURE_INFO[feature];
  if (!info) return null;
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative inline-flex" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-4 h-4 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#444] hover:text-[#888] hover:border-[#444] flex items-center justify-center transition-all flex-shrink-0">
        <Info size={9} />
      </button>
      {open && (
        <div className="absolute z-50 left-6 top-0 w-64 bg-[#161616] border border-[#2a2a2a] rounded-xl p-3 shadow-2xl">
          <p className="text-xs font-semibold text-[#ccc] mb-1">{info.title}</p>
          <p className="text-[11px] text-[#555] leading-relaxed">{info.body}</p>
        </div>
      )}
    </div>
  );
};

const classifyHabit = (name) => {
  const n = name.toLowerCase();
  if (/(study|exam|homework|read|book|math|science|class|course|learn|revision|notes|school|college|tutor|academic|physics|chemistry|biology|history|english|assignment)/.test(n)) return "academics";
  if (/(exercise|gym|run|walk|yoga|sport|swim|cycle|skipping|workout|fitness|sleep|water|diet|eat|food|junk|meal|health|doctor|medicine|steps|cardio|stretch)/.test(n)) return "health";
  if (/(friend|social|talk|call|meet|family|party|event|hang|connect|network|people|relationship|date|chat|message|community)/.test(n)) return "social";
  if (/(meditat|journal|reflect|gratitude|mental|stress|anxiety|mood|therapy|breathe|mindful|emotion|relax|calm|focus|think|pray)/.test(n)) return "mental";
  if (/(code|program|design|build|project|skill|practice|draw|paint|music|instrument|write|blog|create|craft|develop|tool|language|chess|hobby)/.test(n)) return "skills";
  return "health";
};

const generateFromPhases = (phases, startPrice, dob) => {
  const data = [];
  const sorted = [...(phases || [])].filter(p => p.start).sort((a, b) => a.start.localeCompare(b.start));
  const birthDate = dob ? new Date(dob) : new Date("2008-01-01");
  const now = new Date();
  if (!sorted.length) {
    let v = startPrice, d = new Date(birthDate);
    while (d <= now) {
      const age = (d - birthDate) / (365.25 * 86400000);
      let trend = age < 5 ? 0.05 : age < 10 ? 0.08 : age < 13 ? 0.02 : age < 15 ? -0.05 : age < 17 ? 0.04 : 0.06;
      v = Math.max(10, v + trend + (Math.random() - 0.5) * 2);
      data.push({ date: d.toISOString().split("T")[0], value: parseFloat(v.toFixed(2)), timestamp: d.getTime() });
      d.setDate(d.getDate() + 1);
    }
    return data;
  }
  const firstPhaseStart = new Date(sorted[0].start);
  if (birthDate < firstPhaseStart) {
    let v = startPrice, d = new Date(birthDate);
    while (d < firstPhaseStart) {
      const age = (d - birthDate) / (365.25 * 86400000);
      let trend = age < 10 ? 0.06 : age < 13 ? 0.02 : -0.04;
      v = Math.max(10, v + trend + (Math.random() - 0.5) * 1.5);
      data.push({ date: d.toISOString().split("T")[0], value: parseFloat(v.toFixed(2)), timestamp: d.getTime() });
      d.setDate(d.getDate() + 1);
    }
  }
  sorted.forEach((ph, pi) => {
    const start = new Date(ph.start), end = ph.end ? new Date(ph.end) : (sorted[pi + 1] ? new Date(sorted[pi + 1].start) : now);
    let v = data.length ? data[data.length - 1].value : startPrice, d = new Date(start);
    while (d <= end) {
      v = Math.max(10, v + (ph.trend || 0) + (Math.random() - 0.5) * 3);
      data.push({ date: d.toISOString().split("T")[0], value: parseFloat(v.toFixed(2)), timestamp: d.getTime() });
      d.setDate(d.getDate() + 1);
    }
  });
  return data;
};

// ── Builder footer ────────────────────────────────────────────────────────────
const BuilderCard = () => (
  <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-2">
    <div className="relative rounded-2xl p-px overflow-hidden" style={{ background: "linear-gradient(135deg,#b8860b,#ffd700,#daa520,#f5c518,#b8860b)" }}>
      <div className="rounded-2xl bg-[#0d0c08] px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🥷</div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ background: "linear-gradient(90deg,#ffd700,#daa520,#f5c518)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Builder</p>
            <p className="text-sm font-semibold text-[#e8d9a0]">Nikshep Doggalli</p>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <a href="https://instagram.com/nikkk.exe" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] text-[#a0906a] hover:text-[#ffd700] transition-colors justify-end">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
            nikkk.exe
          </a>
          <a href="https://nikshep.vercel.app" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] text-[#a0906a] hover:text-[#ffd700] transition-colors justify-end">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            nikshep.vercel.app
          </a>
        </div>
      </div>
    </div>
  </div>
);

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = { bg: "bg-[#080808]", card: "bg-[#111111]", border: "border-[#1e1e1e]", input: "bg-[#0e0e0e] border-[#1e1e1e]" };
const Card = ({ children, className = "" }) => <div className={`${C.card} border ${C.border} rounded-2xl p-5 ${className}`}>{children}</div>;
const Input = ({ className = "", ...p }) => <input className={`${C.input} border rounded-xl px-4 py-2.5 text-[#e8e8e8] placeholder-[#333] focus:outline-none focus:border-[#333] text-sm transition-all ${className}`} {...p} />;
const Textarea = ({ className = "", ...p }) => <textarea className={`${C.input} border rounded-xl px-4 py-2.5 text-[#e8e8e8] placeholder-[#333] focus:outline-none focus:border-[#333] text-sm resize-none transition-all ${className}`} {...p} />;
const Btn = ({ children, variant = "primary", className = "", ...p }) => {
  const v = { primary: "bg-[#e8e8e8] text-[#080808] hover:bg-[#d0d0d0]", ghost: "bg-[#161616] border border-[#1e1e1e] text-[#888] hover:bg-[#1a1a1a] hover:text-[#e8e8e8]", danger: "bg-[#1a0808] border border-[#3a1010] text-[#f87171] hover:bg-[#200a0a]", success: "bg-[#0a1a12] border border-[#1a4d2e] text-[#34d399] hover:bg-[#0d2018]" };
  return <button className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${v[variant]} ${className}`} {...p}>{children}</button>;
};

const StatCard = ({ label, value, sub, colorClass, feature }) => (
  <div className={`${C.card} border ${C.border} rounded-2xl p-3 text-center`}>
    <div className="flex items-center justify-center gap-1 mb-1">
      <p className="text-[10px] text-[#333]">{label}</p>
      <InfoTooltip feature={feature} />
    </div>
    <p className={`text-sm font-semibold font-mono ${colorClass || "text-[#ccc]"}`}>{value}</p>
    {sub && <p className="text-[10px] text-[#2a2a2a] mt-0.5">{sub}</p>}
  </div>
);

// ── Welcome ───────────────────────────────────────────────────────────────────
const WelcomeScreen = ({ onContinue }) => (
  <div className={`min-h-screen ${C.bg} flex flex-col items-center justify-center p-6`}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-[#111] border border-[#1e1e1e] rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl">📈</div>
        <h1 className="text-3xl font-semibold text-[#e8e8e8] tracking-tight">entropyzero</h1>
        <p className="text-[#444] text-sm mt-2">Your life, quantified.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[["📊", "Life as a Stock", "Track habits, events, mood. Watch your index grow.", "col-span-2"], ["🧠", "AI Coach", "Personalised insights.", ""], ["💎", "Skills & Debt", "Assets vs weaknesses.", ""], ["🗂️", "Life Phases", "Map your chapters.", ""], ["📰", "Press Releases", "Log your thoughts.", ""]].map(([e, t, d, cs]) => (
          <div key={t} className={`bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl p-4 ${cs}`}>
            <p className="text-2xl mb-2">{e}</p>
            <p className="text-[#ccc] text-sm font-medium">{t}</p>
            <p className="text-[#444] text-xs mt-1 leading-relaxed">{d}</p>
          </div>
        ))}
        <div className="col-span-2 bg-[#0e0e0e] border border-[#222] rounded-2xl p-5 space-y-3">
          <p className="text-[#555] text-xs text-center leading-relaxed">Data stored in this artifact session. Export a backup anytime from Settings.</p>
          <button onClick={onContinue} className="w-full flex items-center justify-center gap-2 bg-[#e8e8e8] hover:bg-[#d0d0d0] text-[#080808] rounded-xl py-3.5 font-semibold text-sm transition-all">Get Started →</button>
        </div>
      </div>
    </div>
    <BuilderCard />
  </div>
);

// ── Onboarding ─────────────────────────────────────────────────────────────────
const STEPS = ["Welcome", "Profile", "Country", "Price", "Life Story", "Habits", "Review"];

const Shell = ({ step, children, onNext, onBack, nextLabel = "Continue", nextDisabled = false }) => (
  <div className={`min-h-screen ${C.bg} flex flex-col items-center justify-center p-6`}>
    <div className="w-full max-w-lg">
      <div className="flex items-center justify-center gap-1.5 mb-10">
        {STEPS.map((_, i) => (
          <div key={i} className="flex items-center">
            <div className={`rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${i < step ? "w-5 h-5 bg-[#e8e8e8] text-[#080808]" : i === step ? "w-6 h-6 border border-[#555] text-[#888]" : "w-4 h-4 border border-[#222] text-[#333]"}`}>
              {i < step ? <Check size={10} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`w-4 h-px mx-1 ${i < step ? "bg-[#555]" : "bg-[#1e1e1e]"}`} />}
          </div>
        ))}
      </div>
      <Card>
        {children}
        <div className="flex gap-3 mt-8">
          {step > 0 && <Btn variant="ghost" onClick={onBack} className="flex-1"><ChevronLeft size={15} />Back</Btn>}
          <Btn onClick={onNext} disabled={nextDisabled} className={`flex-1 ${nextDisabled ? "opacity-30 cursor-not-allowed" : ""}`}>{nextLabel}<ChevronRight size={15} /></Btn>
        </div>
      </Card>
      <BuilderCard />
    </div>
  </div>
);

const PhaseForm = ({ onAdd }) => {
  const [d, setD] = useState({ name: "", start: "", end: "", trend: 0, emoji: "📅", color: "#a3a3a3", desc: "" });
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 space-y-2.5">
      <div className="flex gap-2">
        <select value={d.emoji} onChange={e => setD(p => ({ ...p, emoji: e.target.value }))} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-lg px-2 py-2 text-base focus:outline-none">{EMOJIS.map(em => <option key={em}>{em}</option>)}</select>
        <Input value={d.name} onChange={e => setD(p => ({ ...p, name: e.target.value }))} placeholder="Phase name" className="flex-1" />
      </div>
      <Textarea value={d.desc} onChange={e => setD(p => ({ ...p, desc: e.target.value }))} placeholder="Describe this phase…" className="w-full h-14" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={d.start} onChange={e => setD(p => ({ ...p, start: e.target.value }))} className="w-full" />
        <Input type="date" value={d.end} onChange={e => setD(p => ({ ...p, end: e.target.value }))} className="w-full" />
      </div>
      <div className="grid gap-1">
        {TREND_OPTIONS.map(t => (
          <button key={t.value} onClick={() => setD(p => ({ ...p, trend: t.value }))} className={`px-3 py-2 rounded-lg text-xs border text-left transition-all ${d.trend === t.value ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0a0a0a] text-[#555] border-[#1a1a1a] hover:border-[#333]"}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex gap-2">{COLORS.map(c => <button key={c} onClick={() => setD(p => ({ ...p, color: c }))} className={`w-5 h-5 rounded-full border-2 transition-all ${d.color === c ? "border-[#e8e8e8] scale-110" : "border-transparent opacity-50"}`} style={{ backgroundColor: c }} />)}</div>
      <Btn onClick={() => { if (!d.name.trim() || !d.start) return; onAdd({ ...d, id: uid() }); setD({ name: "", start: "", end: "", trend: 0, emoji: "📅", color: "#a3a3a3", desc: "" }); }} disabled={!d.name.trim() || !d.start} className={`w-full ${!d.name.trim() || !d.start ? "opacity-30" : ""}`}><Plus size={15} />Add Phase</Btn>
    </div>
  );
};

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [prof, setProf] = useState({ name: "", ticker: "", dob: "" });
  const [loc, setLoc] = useState({ country: "" });
  const [price, setPrice] = useState({ startPrice: 500 });
  const [story, setStory] = useState({ phases: [] });
  const [hab, setHab] = useState({ habits: [] });
  const n = () => setStep(s => s + 1), b = () => setStep(s => s - 1);
  const finish = () => onComplete({ ...prof, ticker: prof.ticker || prof.name.slice(0, 4).toUpperCase(), ...loc, ...price, ...story, ...hab });
  const DEFS = [{ name: "Morning Exercise", impact: 2, type: "positive", emoji: "🏃", sector: "health" }, { name: "Study Session", impact: 3, type: "positive", emoji: "📚", sector: "academics" }, { name: "Meditation", impact: 1.5, type: "positive", emoji: "🧘", sector: "mental" }, { name: "Junk Food", impact: -2.5, type: "negative", emoji: "🍔", sector: "health" }, { name: "Good Sleep", impact: 1, type: "positive", emoji: "😴", sector: "health" }];

  if (step === 0) return (<Shell step={0} onNext={n} nextLabel="Begin"><div className="text-center"><div className="w-12 h-12 bg-[#111] border border-[#1e1e1e] rounded-xl flex items-center justify-center mx-auto mb-4 text-2xl">📈</div><h2 className="text-xl font-semibold text-[#e8e8e8] mb-1">Set Up Your Index</h2><p className="text-[#444] text-sm mb-6">Takes about 2 minutes.</p><div className="grid grid-cols-3 gap-3">{[["📊", "Chart"], ["🧠", "Coach"], ["💎", "Assets"]].map(([e, l]) => <div key={l} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl p-4"><div className="text-2xl mb-2">{e}</div><div className="text-xs text-[#444]">{l}</div></div>)}</div></div></Shell>);
  if (step === 1) return (<Shell step={1} onNext={n} onBack={b} nextDisabled={!prof.name.trim() || !prof.dob}><h2 className="text-xl font-semibold text-[#e8e8e8] mb-5">Your Profile</h2><div className="space-y-4">{[["Full Name", "text", "e.g. Alex Johnson", "name"], ["Ticker (optional)", "text", "AUTO", "ticker"]].map(([l, t, p, k]) => <div key={k}><label className="text-xs text-[#444] uppercase tracking-wider block mb-2">{l}</label><Input type={t} placeholder={p} value={prof[k]} onChange={e => setProf(x => ({ ...x, [k]: k === "ticker" ? e.target.value.toUpperCase() : e.target.value }))} className="w-full" /></div>)}<div><label className="text-xs text-[#444] uppercase tracking-wider block mb-2">Date of Birth</label><Input type="date" max={today()} min="1950-01-01" value={prof.dob} onChange={e => setProf(x => ({ ...x, dob: e.target.value }))} className="w-full" /></div></div></Shell>);
  if (step === 2) return (<Shell step={2} onNext={n} onBack={b} nextDisabled={!loc.country}><h2 className="text-xl font-semibold text-[#e8e8e8] mb-5">Country & Currency</h2><div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">{Object.keys(CURRENCIES).map(c => <button key={c} onClick={() => setLoc({ country: c })} className={`py-3 px-4 rounded-xl text-sm text-left border transition-all ${loc.country === c ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0e0e0e] text-[#666] border-[#1e1e1e] hover:border-[#333] hover:text-[#aaa]"}`}><span className="block font-medium">{c}</span><span className={`text-xs font-mono ${loc.country === c ? "text-[#080808]/50" : "text-[#333]"}`}>{CURRENCIES[c]?.code}</span></button>)}</div></Shell>);
  if (step === 3) return (<Shell step={3} onNext={n} onBack={b} nextDisabled={!price.startPrice || price.startPrice <= 0}><h2 className="text-xl font-semibold text-[#e8e8e8] mb-5">IPO Price</h2><div className="grid grid-cols-4 gap-2 mb-4">{[100, 250, 500, 1000].map(p => <button key={p} onClick={() => setPrice({ startPrice: p })} className={`py-3 rounded-xl text-sm font-semibold border transition-all ${price.startPrice === p ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0e0e0e] text-[#666] border-[#1e1e1e] hover:border-[#333]"}`}>{p}</button>)}</div><Input type="number" min={1} placeholder="Custom value" value={price.startPrice || ""} onChange={e => setPrice({ startPrice: parseFloat(e.target.value) })} className="w-full" /></Shell>);
  if (step === 4) return (<Shell step={4} onNext={n} onBack={b}><h2 className="text-xl font-semibold text-[#e8e8e8] mb-1">Life Story</h2><p className="text-[#444] text-xs mb-4">Each phase shapes your chart curve.</p><div className="space-y-2 max-h-40 overflow-y-auto mb-4">{story.phases.map(ph => <div key={ph.id} className="flex items-center gap-3 bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-4 py-2.5"><span>{ph.emoji}</span><div className="flex-1"><p className="text-sm text-[#ccc]">{ph.name}</p><p className="text-xs text-[#444]">{ph.start}→{ph.end || "now"}</p></div><button onClick={() => setStory(s => ({ ...s, phases: s.phases.filter(p => p.id !== ph.id) }))} className="text-[#333] hover:text-red-400"><X size={13} /></button></div>)}</div><PhaseForm onAdd={ph => setStory(s => ({ ...s, phases: [...s.phases, ph] }))} /></Shell>);
  if (step === 5) return (<Shell step={5} onNext={n} onBack={b}><h2 className="text-xl font-semibold text-[#e8e8e8] mb-1">Habits</h2><p className="text-[#444] text-xs mb-4">These move your index daily.</p><div className="flex flex-wrap gap-2 mb-4">{DEFS.map(h => <button key={h.name} onClick={() => { if (!hab.habits.find(x => x.name === h.name)) setHab(d => ({ ...d, habits: [...d.habits, { ...h, id: uid() }] })); }} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${hab.habits.find(x => x.name === h.name) ? "border-[#555] text-[#ccc] bg-[#1a1a1a]" : "border-[#1e1e1e] text-[#444] hover:border-[#333] hover:text-[#888]"}`}>{h.emoji}{h.name}</button>)}</div><div className="space-y-1.5 max-h-32 overflow-y-auto mb-4">{hab.habits.map(h => <div key={h.id} className="flex items-center justify-between bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-4 py-2"><span className="text-sm text-[#ccc]">{h.emoji}{h.name}</span><div className="flex items-center gap-2"><span className={`text-xs font-mono ${h.impact >= 0 ? "text-green-400" : "text-red-400"}`}>{h.impact > 0 ? "+" : ""}{h.impact}%</span><button onClick={() => setHab(d => ({ ...d, habits: d.habits.filter(x => x.id !== h.id) }))} className="text-[#333] hover:text-red-400"><X size={12} /></button></div></div>)}</div></Shell>);
  return (<Shell step={6} onNext={finish} onBack={b} nextLabel="🚀 Launch"><h2 className="text-xl font-semibold text-[#e8e8e8] mb-4">Ready to Launch</h2>{[["👤 Name", prof.name], ["📈 Ticker", `$${prof.ticker || prof.name.slice(0, 4).toUpperCase()}`], ["🌍 Country", `${loc.country} · ${CURRENCIES[loc.country]?.code}`], ["💰 IPO", `${CURRENCIES[loc.country]?.symbol}${price.startPrice}`], ["🗂️ Phases", `${story.phases.length} phases`], ["✅ Habits", `${hab.habits.length} habits`]].map(([k, v]) => <div key={k} className="flex justify-between items-center bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-4 py-3 mb-2"><span className="text-sm text-[#555]">{k}</span><span className="text-sm text-[#ccc]">{v}</span></div>)}</Shell>);
};

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, phases, curr }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const ph = phases?.find(p => d.date >= p.start && (!p.end || d.date <= p.end));
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-3 shadow-2xl">
      <p className="text-xs text-[#444] mb-1">{d.date}</p>
      {ph && <p className="text-xs mb-1.5" style={{ color: ph.color }}>{ph.emoji}{ph.name}</p>}
      <p className="text-base font-semibold text-[#e8e8e8] font-mono">{curr}{parseFloat(d.value).toFixed(2)}</p>
      {d.mood !== undefined && <p className="text-xs text-[#555] mt-1">Mood: {MOOD_LABELS[d.mood]}</p>}
    </div>
  );
};

// ── Profit/Loss area chart ────────────────────────────────────────────────────
const ProfitLossChart = ({ data, phases, curr, timeRange }) => {
  const isProfit = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].value >= data[0].value;
  }, [data]);
  const gId = `cg_${timeRange}`;
  const stroke = isProfit ? "#22c55e" : "#ef4444";
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isProfit ? "#22c55e" : "#ef4444"} stopOpacity={0.18} />
            <stop offset="95%" stopColor={isProfit ? "#22c55e" : "#ef4444"} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
        <XAxis dataKey="date" stroke="#111" tick={{ fill: "#2a2a2a", fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} />
        <YAxis stroke="#111" tick={{ fill: "#2a2a2a", fontSize: 10 }} domain={["dataMin - 20", "dataMax + 20"]} />
        <Tooltip content={<CustomTooltip phases={phases} curr={curr} />} />
        {phases.map(ph => ph.start && <ReferenceLine key={ph.id} x={ph.start} stroke={ph.color} strokeDasharray="4 3" strokeOpacity={0.4} label={{ value: ph.emoji, fill: ph.color, fontSize: 12, position: "insideTopLeft" }} />)}
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.8} fill={`url(#${gId})`} dot={false} activeDot={{ r: 4, fill: stroke, stroke: "#080808", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── Heatmap ───────────────────────────────────────────────────────────────────
const Heatmap = ({ orderBook }) => {
  const year = new Date().getFullYear();
  const days = useMemo(() => { const m = {}; orderBook.forEach(o => { if (!m[o.date]) m[o.date] = 0; m[o.date] += o.change; }); return m; }, [orderBook]);
  const months = useMemo(() => {
    const ms = [];
    for (let m = 0; m < 12; m++) {
      const weeks = []; let week = [];
      const first = new Date(year, m, 1);
      for (let d = 0; d < first.getDay(); d++) week.push(null);
      const dim = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const ds = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        week.push({ date: ds, val: days[ds] || 0, logged: !!days[ds] });
        if (week.length === 7) { weeks.push(week); week = []; }
      }
      if (week.length) weeks.push(week);
      ms.push({ month: new Date(year, m).toLocaleDateString("en-US", { month: "short" }), weeks });
    }
    return ms;
  }, [days, year]);
  const getColor = c => { if (!c) return "transparent"; if (!c.logged) return "#111"; if (c.val > 5) return "#166534"; if (c.val > 2) return "#15803d"; if (c.val > 0) return "#16a34a"; if (c.val > -2) return "#7f1d1d"; return "#991b1b"; };
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max">
        {months.map(({ month, weeks }) => (
          <div key={month}><p className="text-[10px] text-[#444] mb-1">{month}</p>
            <div className="flex gap-0.5">{weeks.map((week, wi) => <div key={wi} className="flex flex-col gap-0.5">{week.map((cell, di) => <div key={di} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getColor(cell) }} title={cell?.date} />)}</div>)}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2"><span className="text-[10px] text-[#333]">Less</span>{["#111", "#7f1d1d", "#16a34a", "#166534"].map(c => <div key={c} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />)}<span className="text-[10px] text-[#333]">More</span></div>
    </div>
  );
};

// ── Sector Radar ──────────────────────────────────────────────────────────────
const SectorRadar = ({ sectorScores }) => {
  const data = SECTORS.map(s => ({ subject: s.label, value: Math.min(100, Math.max(0, sectorScores[s.id] || 50)), fullMark: 100 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="#1e1e1e" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "#444", fontSize: 11 }} />
        <Radar dataKey="value" stroke="#a3a3a3" fill="#a3a3a3" fillOpacity={0.1} strokeWidth={1.5} dot={{ r: 3, fill: "#a3a3a3" }} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// ── AI Coach ──────────────────────────────────────────────────────────────────
const AICoach = ({ config, lifeIndex, orderBook, skills, weaknesses, phases, habits }) => {
  const [messages, setMessages] = useState([{ role: "assistant", content: `Hey ${config.name}! I'm your AI Life Coach. I have full context on your index (${fmt(lifeIndex)}), ${phases.length} phases, ${skills.length} skills, ${weaknesses.length} weaknesses and ${orderBook.length} logged events. Ask me anything.` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(p => [...p, userMsg]); setInput(""); setLoading(true);
    try {
      const ctx = `Elite life coach AI. User: Name=${config.name}, Country=${config.country}, Index=${fmt(lifeIndex)}, AllTime=${fmt(((lifeIndex - config.startPrice) / config.startPrice) * 100)}%, Phases=${phases.map(p => `${p.name}(${p.start}–${p.end || "now"})`).join(",") || "none"}, Skills=${skills.map(s => `${s.name}(${SKILL_LEVELS[s.level]})`).join(",") || "none"}, Weaknesses=${weaknesses.map(w => `${w.name}(${DEBT_SEVERITY[w.severity]})`).join(",") || "none"}, Habits=${habits.map(h => `${h.name}(${h.impact > 0 ? "+" : ""}${h.impact}%)`).join(",") || "none"}, Recent=${orderBook.slice(0, 10).map(o => `${o.desc}:${o.change > 0 ? "+" : ""}${fmt(o.change)}%`).join(",") || "none"}. Reply max 180 words, be direct and data-driven.`;
      const reply = await callAI(ctx, [...messages, userMsg].filter(m => m.role !== "system"));
      setMessages(p => [...p, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "Error: " + (e?.message || JSON.stringify(e)) }]);
    }
    setLoading(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Brain size={16} className="text-[#333]" />AI Life Coach</h2>
        <InfoTooltip feature="coach" />
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-[#1a1a1a] border border-[#222] text-[#ccc]" : "bg-[#0e0e0e] border border-[#1a1a1a] text-[#aaa]"}`}>
              {m.role === "assistant" && <p className="text-[10px] text-[#333] mb-1 font-mono">COACH</p>}
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="flex"><div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-2xl px-4 py-3 text-sm text-[#333]">Analysing…</div></div>}
      </div>
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about your patterns, goals…" className="flex-1" />
        <Btn onClick={send} disabled={loading || !input.trim()}><Send size={15} /></Btn>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {["What are my patterns?", "Where am I weakest?", "Focus for next 30 days?", "Honest life review"].map(q => (
          <button key={q} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-lg bg-[#0e0e0e] border border-[#1a1a1a] text-[#444] hover:text-[#888] hover:border-[#333] transition-all">{q}</button>
        ))}
      </div>
    </Card>
  );
};

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "chart",    icon: <BarChart2 size={16} />, label: "Index" },
  { id: "coach",    icon: <Brain size={16} />,     label: "Coach" },
  { id: "press",    icon: <Newspaper size={16} />, label: "Press" },
  { id: "habits",   icon: <Flame size={16} />,     label: "Habits" },
  { id: "assets",   icon: <Star size={16} />,      label: "Assets" },
  { id: "phases",   icon: <BookOpen size={16} />,  label: "Phases" },
  { id: "more",     icon: <Layers size={16} />,    label: "More" },
  { id: "settings", icon: <Settings size={16} />,  label: "Settings" },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ config, onReset, initialData }) => {
  const curr = CURRENCIES[config.country]?.symbol || "$";
  const ticker = config.ticker || config.name.slice(0, 4).toUpperCase();

  const [chartData, setChartData]         = useState(() => initialData?.chartData || generateFromPhases(config.phases, config.startPrice, config.dob));
  const [orderBook, setOrderBook]         = useState(() => initialData?.orderBook || []);
  const [habits, setHabits]               = useState(() => initialData?.habits || config.habits || []);
  const [phases, setPhases]               = useState(() => initialData?.phases || config.phases || []);
  const [skills, setSkills]               = useState(() => initialData?.skills || []);
  const [weaknesses, setWeaknesses]       = useState(() => initialData?.weaknesses || []);
  const [pressReleases, setPressReleases] = useState(() => initialData?.pressReleases || []);
  const [moodLog, setMoodLog]             = useState(() => initialData?.moodLog || {});
  const [goals, setGoals]                 = useState(() => initialData?.goals || []);
  const [unlockedAch, setUnlockedAch]     = useState(() => initialData?.unlockedAch || []);
  const [timeCapsules, setTimeCapsules]   = useState(() => initialData?.timeCapsules || []);
  const [view, setView]                   = useState("chart");
  const [timeRange, setTimeRange]         = useState("ALL");
  const [scenario, setScenario]           = useState("");
  const [scenarioImpact, setScenarioImpact] = useState("");
  const [prTitle, setPrTitle]             = useState("");
  const [prBody, setPrBody]               = useState("");
  const [prImpact, setPrImpact]           = useState("");
  const [prType, setPrType]               = useState("neutral");
  const [newSkill, setNewSkill]           = useState({ name: "", level: 0, category: "Technical", sector: "skills", developingHabit: "" });
  const [newDebt, setNewDebt]             = useState({ name: "", severity: 0, category: "Mental", plan: "" });
  const [newGoal, setNewGoal]             = useState({ title: "", sector: "academics", reward: 0 });
  const [capsule, setCapsule]             = useState({ message: "", unlockDate: "" });
  const [moreTab, setMoreTab]             = useState("heatmap");

  // Save all state to persistent storage whenever anything changes
  useEffect(() => {
    saveAllData({ config, chartData, orderBook, habits, phases, skills, weaknesses, pressReleases, moodLog, goals, unlockedAch, timeCapsules });
  }, [chartData, orderBook, habits, phases, skills, weaknesses, pressReleases, moodLog, goals, unlockedAch, timeCapsules]);

  const lifeIndex   = chartData[chartData.length - 1]?.value || config.startPrice;
  const todayOrders = orderBook.filter(o => o.date === today());
  const todayChange = todayOrders.reduce((s, o) => s + o.change, 0);
  const allTime     = ((lifeIndex - config.startPrice) / config.startPrice) * 100;

  const last7d = useMemo(() => {
    const c = chartData.filter(d => d.timestamp >= Date.now() - 7 * 86400000);
    return c.length > 1 ? ((lifeIndex - c[0].value) / c[0].value) * 100 : 0;
  }, [chartData, lifeIndex]);

  const last30d = useMemo(() => {
    const c = chartData.filter(d => d.timestamp >= Date.now() - 30 * 86400000);
    return c.length > 1 ? ((lifeIndex - c[0].value) / c[0].value) * 100 : 0;
  }, [chartData, lifeIndex]);

  const streak = useMemo(() => {
    let s = 0, d = new Date();
    while (true) {
      const ds = d.toISOString().split("T")[0];
      if (orderBook.find(o => o.date === ds)) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  }, [orderBook]);

  const sectorScores = useMemo(() => {
    const scores = Object.fromEntries(SECTORS.map(s => [s.id, 50]));
    orderBook.slice(0, 50).forEach(o => { const h = habits.find(h => h.name === o.desc || (o.desc && o.desc.includes(h.name))); if (h?.sector) { scores[h.sector] = Math.min(100, Math.max(0, (scores[h.sector] || 50) + (o.change > 0 ? 5 : -5))); } });
    skills.forEach(sk => { if (scores[sk.sector] !== undefined) scores[sk.sector] = Math.min(100, scores[sk.sector] + (sk.level + 1) * 4); });
    return scores;
  }, [orderBook, habits, skills]);

  useEffect(() => {
    const ow = orderBook.filter(o => o.tag === "debt" && o.change > 0).length;
    ACHIEVEMENTS.forEach(a => { if (!unlockedAch.includes(a.id) && a.check(orderBook, lifeIndex, streak, pressReleases.length, skills.length, ow)) setUnlockedAch(p => [...p, a.id]); });
  }, [orderBook, lifeIndex, streak, pressReleases, skills, weaknesses]);

  const openCapsules = timeCapsules.filter(c => c.unlockDate <= today() && !c.opened);

  const execute = (desc, pct, tag = "") => {
    const prev = parseFloat(chartData[chartData.length - 1]?.value) || config.startPrice;
    const safePct = parseFloat(pct);
    if (isNaN(prev) || isNaN(safePct)) return;
    const next = Math.max(1, prev * (1 + safePct / 100));
    if (isNaN(next)) return;
    const now = new Date(), dateStr = now.toISOString().split("T")[0];
    setChartData(p => [...p, { date: dateStr, value: parseFloat(next.toFixed(2)), timestamp: now.getTime(), mood: moodLog[dateStr] || undefined }]);
    setOrderBook(p => [{ id: uid(), time: now.toLocaleTimeString(), date: dateStr, desc, change: safePct, newIndex: next.toFixed(2), tag }, ...p.slice(0, 99)]);
  };

  const filteredData = useMemo(() => {
    const ranges = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "ALL": 99999 };
    const c = Date.now() - ranges[timeRange] * 86400000;
    return chartData.filter(d => d.timestamp >= c);
  }, [chartData, timeRange]);

  const analyzeScenario = () => {
    if (!scenario.trim()) return;
    const t = scenario.toLowerCase(); let impact = 0;
    if (/(exam|test|score|result)/.test(t)) impact = /(great|high|90|95|100|excellent|pass)/.test(t) ? 5 : /(fail|bad|poor|low)/.test(t) ? -5 : 1;
    if (/(fight|lost.*friend|breakup)/.test(t)) impact = -4;
    if (/(made up|new friend|reconcile)/.test(t)) impact = 3;
    if (/(sick|fever|hospital)/.test(t)) impact = -2.5;
    if (/(award|won|prize|achieve)/.test(t)) impact = 4;
    if (/(vacation|trip|travel)/.test(t)) impact = 2.5;
    if (scenarioImpact.trim() && !isNaN(parseFloat(scenarioImpact))) impact = parseFloat(scenarioImpact);
    if (!impact) { alert("Add a % override to log this event."); return; }
    execute(`📌 ${scenario.slice(0, 70)}`, impact, "event");
    setScenario(""); setScenarioImpact("");
  };

  const technicals = useMemo(() => {
    const recent = chartData.slice(-30).map(d => d.value);
    if (recent.length < 5) return null;
    const sma14 = recent.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const sma30 = recent.reduce((a, b) => a + b, 0) / recent.length;
    const last52 = chartData.filter(d => d.timestamp >= Date.now() - 365 * 86400000);
    const high52 = Math.max(...last52.map(d => d.value)), low52 = Math.min(...last52.map(d => d.value));
    const mean = recent.reduce((a, b) => a + b) / recent.length;
    const vol = Math.sqrt(recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length);
    let g = 0, l = 0;
    for (let i = 1; i < recent.length; i++) { const d = recent[i] - recent[i - 1]; d > 0 ? g += d : l -= d; }
    const rsi = 100 - 100 / (1 + g / (l || 1));
    const mom = recent[recent.length - 1] - recent[0];
    const assetScore = skills.reduce((s, sk) => s + (sk.level + 1) * 5, 0);
    const debtScore = weaknesses.reduce((s, w) => s + (w.severity + 1) * 8, 0);
    const netWorth = assetScore - debtScore;
    const signals = [];
    if (rsi > 70) signals.push({ label: "Overbought", color: "text-yellow-400", icon: "⚠️" });
    if (rsi < 30) signals.push({ label: "Oversold", color: "text-blue-400", icon: "💎" });
    if (lifeIndex > sma14 && lifeIndex > sma30) signals.push({ label: "Above All MAs", color: "text-green-400", icon: "📈" });
    if (lifeIndex < sma14 && lifeIndex < sma30) signals.push({ label: "Below MAs", color: "text-red-400", icon: "📉" });
    if (streak >= 7) signals.push({ label: `${streak}d Streak`, color: "text-orange-400", icon: "🔥" });
    if (netWorth > 20) signals.push({ label: "Asset Rich", color: "text-purple-400", icon: "💡" });
    const rating = mom > 10 ? "STRONG BUY" : mom > 3 ? "BUY" : mom < -10 ? "SELL" : mom < -3 ? "WEAK HOLD" : "HOLD";
    return { sma14, sma30, high52, low52, vol, rsi, mom, assetScore, debtScore, netWorth, signals, rating };
  }, [chartData, skills, weaknesses, lifeIndex, streak]);

  useEffect(() => { if (streak > 0 && streak % 7 === 0) execute(`🏅 Dividend: ${streak}-day streak`, streak * 0.5, "dividend"); }, [streak]);

  const pnl = useMemo(() => {
    const bm = {};
    orderBook.forEach(o => { const m = o.date.slice(0, 7); if (!bm[m]) bm[m] = { month: m, gain: 0, loss: 0, count: 0 }; if (o.change > 0) bm[m].gain += o.change; else bm[m].loss += o.change; bm[m].count++; });
    return Object.values(bm).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
  }, [orderBook]);

  const rangeProfit = useMemo(() => {
    if (filteredData.length < 2) return true;
    return filteredData[filteredData.length - 1].value >= filteredData[0].value;
  }, [filteredData]);

  const exportData = () => {
    const data = JSON.stringify({ config, chartData, orderBook, habits, phases, skills, weaknesses, pressReleases, moodLog, goals, timeCapsules, exportDate: new Date().toISOString(), version: "3.0" }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `entropyzero-${today()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${C.bg} text-[#e8e8e8]`}>
      {openCapsules.map(c => (
        <div key={c.id} className="fixed top-4 left-4 right-4 z-50 bg-[#111] border border-[#333] rounded-2xl p-4 shadow-2xl">
          <p className="text-xs text-[#555] mb-1">⏰ Time Capsule Unlocked</p>
          <p className="text-sm text-[#ccc] font-medium mb-2">{c.message}</p>
          <p className="text-xs text-[#333]">Written on {c.createdDate}</p>
          <Btn variant="ghost" onClick={() => setTimeCapsules(p => p.map(x => x.id === c.id ? { ...x, opened: true } : x))} className="mt-2 w-full text-xs py-2">Dismiss</Btn>
        </div>
      ))}

      {/* Topbar */}
      <div className={`border-b border-[#141414] px-5 py-4 flex items-center justify-between sticky top-0 ${C.bg}/95 backdrop-blur z-20`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#111] border border-[#1e1e1e] rounded-xl flex items-center justify-center text-base">📈</div>
          <div><p className="font-semibold text-[#e8e8e8] text-sm leading-none">{config.name}</p><p className="text-xs text-[#333] font-mono">${ticker}·{CURRENCIES[config.country]?.code}</p></div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <p className="text-xl font-semibold text-[#e8e8e8] font-mono">{curr}{fmt(lifeIndex)}</p>
            <InfoTooltip feature="lifeIndex" />
          </div>
          <p className={`text-xs font-mono ${todayChange >= 0 ? "text-green-500" : "text-red-500"}`}>{todayChange >= 0 ? "+" : ""}{fmt(todayChange)}% today</p>
        </div>
      </div>

      {streak >= 3 && <div className="bg-[#0d0d0d] border-b border-[#141414] px-5 py-2 flex items-center gap-2"><Flame size={13} className="text-orange-500" /><span className="text-xs text-[#555]">{streak}-day streak · Keep going</span><span className="ml-auto text-xs text-[#333]">Next dividend at {Math.ceil(streak / 7) * 7}d</span></div>}

      {/* Tabs */}
      <div className="border-b border-[#141414] flex bg-[#080808] sticky top-[57px] z-10 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 text-[10px] font-medium transition-all border-b-2 ${view === t.id ? "border-[#555] text-[#ccc]" : "border-transparent text-[#333] hover:text-[#555]"}`}>
            {t.icon}<span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto p-4 pb-6 space-y-4">

        {/* INDEX */}
        {view === "chart" && (<>
          <div className="grid grid-cols-5 gap-2">
            <StatCard label="IPO"      value={`${curr}${fmt(config.startPrice)}`} sub="Listing" feature="lifeIndex" />
            <StatCard label="All-Time" value={`${allTime >= 0 ? "+" : ""}${fmt(allTime)}%`}  colorClass={allTime >= 0 ? "text-green-500" : "text-red-500"} feature="allTime" />
            <StatCard label="1 Month"  value={`${last30d >= 0 ? "+" : ""}${fmt(last30d)}%`}  colorClass={last30d >= 0 ? "text-green-500" : "text-red-500"} feature="oneMonth" />
            <StatCard label="7 Day"    value={`${last7d >= 0 ? "+" : ""}${fmt(last7d)}%`}    colorClass={last7d >= 0 ? "text-green-500" : "text-red-500"} feature="sevenDay" />
            <StatCard label="Streak"   value={`${streak}d 🔥`} sub="days" feature="streak" />
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#444]">Today's Mood</p>
                <InfoTooltip feature="mood" />
              </div>
              <div className="flex gap-2">
                {MOOD_LABELS.map((m, i) => (
                  <button key={i} onClick={() => { setMoodLog(p => ({ ...p, [today()]: i })); execute(`Mood:${m}`, i * 0.3 - 0.9, "mood"); }} className={`text-lg transition-all ${moodLog[today()] === i ? "scale-125" : "opacity-40 hover:opacity-70"}`}>{m}</button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-[#e8e8e8] flex items-center gap-2 text-sm"><Activity size={16} className="text-[#333]" />Performance</h2>
                <InfoTooltip feature="chart" />
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className={`text-[10px] px-2 py-1 rounded-lg font-medium ${rangeProfit ? "bg-green-950/30 text-green-600" : "bg-red-950/30 text-red-600"}`}>
                  {rangeProfit ? "▲ Profit" : "▼ Loss"} ({timeRange})
                </span>
                <div className="flex gap-1">
                  {["1M", "3M", "6M", "1Y", "ALL"].map(r => (
                    <button key={r} onClick={() => setTimeRange(r)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${timeRange === r ? "bg-[#e8e8e8] text-[#080808]" : "text-[#444] hover:text-[#888]"}`}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <ProfitLossChart data={filteredData} phases={phases} curr={curr} timeRange={timeRange} />
          </Card>

          {technicals && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Zap size={16} className="text-[#333]" />Technicals</h2>
                <InfoTooltip feature="technicals" />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${technicals.rating.includes("BUY") ? "border-green-900 text-green-500 bg-green-950/30" : technicals.rating.includes("SELL") ? "border-red-900 text-red-500 bg-red-950/30" : "border-[#1e1e1e] text-[#555]"}`}>{technicals.rating}</span>
                {technicals.signals.map(s => <span key={s.label} className={`px-3 py-1.5 rounded-lg text-xs bg-[#0e0e0e] border border-[#1a1a1a] ${s.color}`}>{s.icon}{s.label}</span>)}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[["RSI (14)", fmt(technicals.rsi), technicals.rsi > 70 ? "text-yellow-500" : technicals.rsi < 30 ? "text-blue-500" : "text-[#888]"], ["SMA 14", `${curr}${fmt(technicals.sma14)}`, "text-[#888]"], ["SMA 30", `${curr}${fmt(technicals.sma30)}`, "text-[#888]"], ["Momentum", `${technicals.mom >= 0 ? "+" : ""}${fmt(technicals.mom)}`, technicals.mom >= 0 ? "text-green-500" : "text-red-500"], ["52W High", `${curr}${fmt(technicals.high52)}`, "text-[#888]"], ["52W Low", `${curr}${fmt(technicals.low52)}`, "text-[#888]"], ["Volatility", `${fmt(technicals.vol)}σ`, technicals.vol > 15 ? "text-red-500" : technicals.vol > 7 ? "text-yellow-500" : "text-green-500"], ["Net Worth", `${technicals.netWorth >= 0 ? "+" : ""}${technicals.netWorth}pts`, technicals.netWorth >= 0 ? "text-green-500" : "text-red-500"]].map(([l, v, c]) => (
                  <div key={l} className="bg-[#0a0a0a] border border-[#141414] rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-xs text-[#333]">{l}</span><span className={`text-sm font-semibold font-mono ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#141414] pt-4 mb-4">
                <div className="flex items-center gap-2 mb-3"><p className="text-xs text-[#333]">Sector Breakdown</p><InfoTooltip feature="sectors" /></div>
                <SectorRadar sectorScores={sectorScores} />
                <div className="grid grid-cols-5 gap-1 mt-2">{SECTORS.map(s => <div key={s.id} className="text-center"><p className="text-base">{s.emoji}</p><p className="text-[10px] text-[#333]">{Math.round(sectorScores[s.id] || 50)}</p></div>)}</div>
              </div>
              <div className="bg-[#0a0a0a] border border-[#141414] rounded-xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-3"><p className="text-xs text-[#333]">Balance Sheet</p><InfoTooltip feature="balanceSheet" /></div>
                <div className="flex items-center gap-4">
                  <div className="flex-1"><p className="text-xs text-green-600 mb-1">Assets</p><div className="h-1.5 bg-[#0d0d0d] rounded-full"><div className="h-full bg-green-800 rounded-full" style={{ width: `${Math.min(100, technicals.assetScore)}%` }} /></div><p className="text-[10px] text-[#333] mt-1">+{technicals.assetScore}pts</p></div>
                  <div className="flex-1"><p className="text-xs text-red-600 mb-1">Debt</p><div className="h-1.5 bg-[#0d0d0d] rounded-full"><div className="h-full bg-red-900 rounded-full" style={{ width: `${Math.min(100, technicals.debtScore)}%` }} /></div><p className="text-[10px] text-[#333] mt-1">−{technicals.debtScore}pts</p></div>
                  <div className="text-center"><p className="text-xs text-[#333]">Net</p><p className={`text-base font-bold font-mono ${technicals.netWorth >= 0 ? "text-green-600" : "text-red-600"}`}>{technicals.netWorth >= 0 ? "+" : ""}{technicals.netWorth}</p></div>
                </div>
              </div>
              <div className="bg-[#0a0a0a] border border-[#141414] rounded-xl p-4">
                <p className="text-[10px] text-[#333] mb-2 uppercase tracking-wider">AI Signal</p>
                <p className="text-xs text-[#555] leading-relaxed">
                  {technicals.rsi > 70 ? "Running hot — gains may be overdone." : technicals.rsi < 30 ? "Deeply oversold. Strong recovery potential." : technicals.mom > 5 ? "Positive momentum building." : technicals.mom < -5 ? "Negative momentum — focus on high-yield habits." : "Range-bound. Small consistent wins will break resistance."}
                  {technicals.netWorth < -10 ? " ⚠️ Debt exceeding assets." : technicals.netWorth > 20 ? " 🌟 Strong asset base." : ""}
                  {streak >= 7 ? ` 🔥 ${streak}-day streak compounding.` : ""}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2 mb-4"><Send size={16} className="text-[#333]" />Log an Event</h2>
            <Textarea value={scenario} onChange={e => setScenario(e.target.value)} placeholder="What happened?" className="w-full h-20 mb-2" />
            <div className="flex gap-2">
              <Input value={scenarioImpact} onChange={e => setScenarioImpact(e.target.value)} placeholder="% override" className="flex-1 font-mono" />
              <Btn onClick={analyzeScenario}><Send size={15} />Log</Btn>
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-[#e8e8e8] text-sm mb-4">Transaction Log</h2>
            {orderBook.length === 0 ? <p className="text-[#2a2a2a] text-sm text-center py-8">No transactions yet.</p> : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {orderBook.slice(0, 30).map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-[#0a0a0a] border border-[#141414] rounded-xl px-4 py-3">
                    <div><p className="text-sm text-[#999] truncate max-w-52 sm:max-w-64">{o.desc}</p><p className="text-[10px] text-[#2a2a2a]">{o.date}·{o.time}{o.tag ? `·${o.tag}` : ""}</p></div>
                    <div className="text-right"><p className={`text-sm font-bold font-mono ${o.change >= 0 ? "text-green-600" : "text-red-600"}`}>{o.change > 0 ? "+" : ""}{fmt(o.change)}%</p><p className="text-[10px] text-[#2a2a2a] font-mono">{curr}{o.newIndex}</p></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>)}

        {/* COACH */}
        {view === "coach" && <AICoach config={config} lifeIndex={lifeIndex} orderBook={orderBook} skills={skills} weaknesses={weaknesses} phases={phases} habits={habits} />}

        {/* PRESS */}
        {view === "press" && (<>
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Newspaper size={16} className="text-[#333]" />Publish Press Release</h2>
              <InfoTooltip feature="press" />
            </div>
            <div className="space-y-3">
              <Input value={prTitle} onChange={e => setPrTitle(e.target.value)} placeholder="Headline" className="w-full" />
              <Textarea value={prBody} onChange={e => setPrBody(e.target.value)} placeholder="Write your full press release…" className="w-full h-28" />
              <div className="flex gap-2 flex-wrap">
                <div className="flex gap-1">{[["positive", "🟢"], ["neutral", "⚪"], ["negative", "🔴"]].map(([v, l]) => <button key={v} onClick={() => setPrType(v)} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${prType === v ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0e0e0e] text-[#444] border-[#1e1e1e] hover:border-[#333]"}`}>{l}{v}</button>)}</div>
                <Input value={prImpact} onChange={e => setPrImpact(e.target.value)} placeholder="% impact" className="w-24 font-mono" />
                <Btn onClick={() => { if (!prTitle.trim() || !prBody.trim()) return; const impact = prImpact ? parseFloat(prImpact) : prType === "positive" ? 3 : prType === "negative" ? -3 : 0; const now = new Date(); setPressReleases(p => [{ id: uid(), title: prTitle, body: prBody, type: prType, impact, date: now.toISOString().split("T")[0], time: now.toLocaleTimeString() }, ...p]); if (impact !== 0) execute(`📰 ${prTitle}`, impact, "press"); setPrTitle(""); setPrBody(""); setPrImpact(""); setPrType("neutral"); }} disabled={!prTitle.trim() || !prBody.trim()}><Newspaper size={15} />Publish</Btn>
              </div>
            </div>
          </Card>
          {pressReleases.map(pr => (
            <div key={pr.id} className={`border rounded-2xl p-5 ${pr.type === "positive" ? "bg-green-950/10 border-green-900/20" : pr.type === "negative" ? "bg-red-950/10 border-red-900/20" : "bg-[#0e0e0e] border-[#1a1a1a]"}`}>
              <div className="flex items-start justify-between mb-3">
                <div><p className="font-semibold text-[#ccc] text-sm">{pr.title}</p><p className="text-[10px] text-[#2a2a2a] mt-1">{pr.date}·{pr.time}</p></div>
                <div className="flex gap-2">
                  {pr.impact !== 0 && <span className={`text-xs font-bold font-mono px-2 py-1 rounded-lg ${pr.type === "positive" ? "bg-green-950/40 text-green-600" : pr.type === "negative" ? "bg-red-950/40 text-red-600" : "bg-[#111] text-[#555]"}`}>{pr.impact > 0 ? "+" : ""}{pr.impact}%</span>}
                  <button onClick={() => setPressReleases(p => p.filter(x => x.id !== pr.id))} className="text-[#222] hover:text-red-600"><X size={14} /></button>
                </div>
              </div>
              <p className="text-sm text-[#444] leading-relaxed">{pr.body}</p>
            </div>
          ))}
        </>)}

        {/* HABITS */}
        {view === "habits" && (<>
          <div className="grid sm:grid-cols-2 gap-3">
            {habits.map(h => (
              <div key={h.id} className={`${C.card} border ${C.border} rounded-2xl p-4 flex items-center justify-between`}>
                <div>
                  <p className="font-medium text-[#ccc] text-sm">{h.emoji}{h.name}</p>
                  <p className={`text-xs mt-0.5 font-mono ${h.impact >= 0 ? "text-green-600" : "text-red-600"}`}>{h.impact > 0 ? "+" : ""}{h.impact}%</p>
                  <p className="text-[10px] text-[#333] mt-0.5">{SECTORS.find(s => s.id === h.sector)?.emoji}{SECTORS.find(s => s.id === h.sector)?.label}</p>
                </div>
                <div className="flex gap-2">
                  <Btn variant={h.impact >= 0 ? "success" : "danger"} onClick={() => execute(h.name, h.impact, "habit")} className="text-xs py-2 px-3">Log</Btn>
                  <button onClick={() => setHabits(p => p.filter(x => x.id !== h.id))} className="text-[#222] hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h3 className="font-semibold text-[#ccc] text-sm">Add Habit</h3><InfoTooltip feature="habits" /></div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Name" className="flex-1 min-w-32" id="hn" />
              <Input type="number" step="0.5" placeholder="%" className="w-16 font-mono" id="hi" />
              <select className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-xs text-[#888] focus:outline-none" id="ht"><option value="positive">+ Positive</option><option value="negative">− Negative</option></select>
              <select className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-xs text-[#888] focus:outline-none" id="hs"><option value="auto">🤖 Auto</option>{SECTORS.map(s => <option key={s.id} value={s.id}>{s.emoji}{s.label}</option>)}</select>
              <Btn onClick={() => { const name = document.getElementById("hn").value, imp = document.getElementById("hi").value, type = document.getElementById("ht").value, sEl = document.getElementById("hs"); if (!name || !imp) return; const impact = parseFloat(imp) * (type === "negative" ? -1 : 1); const sector = sEl.value === "auto" ? classifyHabit(name) : sEl.value; setHabits(p => [...p, { id: uid(), name, impact, type, emoji: type === "positive" ? "✅" : "❌", sector }]); document.getElementById("hn").value = ""; document.getElementById("hi").value = ""; }}><Plus size={16} /></Btn>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h3 className="font-semibold text-[#ccc] text-sm flex items-center gap-2"><TrendingUp size={15} className="text-[#333]" />Monthly P&L</h3><InfoTooltip feature="pnl" /></div>
            {pnl.length === 0 ? <p className="text-[#2a2a2a] text-sm text-center py-4">No data yet.</p> : (
              <div className="space-y-2">
                {pnl.map(m => (
                  <div key={m.month} className="flex items-center justify-between bg-[#0a0a0a] border border-[#141414] rounded-xl px-4 py-3">
                    <span className="text-xs text-[#555] font-mono">{m.month}</span>
                    <div className="flex gap-4"><span className="text-xs text-green-600 font-mono">+{fmt(m.gain)}%</span><span className="text-xs text-red-600 font-mono">{fmt(m.loss)}%</span><span className={`text-xs font-bold font-mono ${m.gain + m.loss >= 0 ? "text-green-500" : "text-red-500"}`}>{m.gain + m.loss >= 0 ? "+" : ""}{fmt(m.gain + m.loss)}%</span></div>
                    <span className="text-[10px] text-[#2a2a2a]">{m.count} logs</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>)}

        {/* ASSETS */}
        {view === "assets" && (<>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Star size={16} className="text-[#333]" />Skills<span className="text-[#333] font-normal">— Assets</span></h2><InfoTooltip feature="skills" /></div>
            <div className="space-y-3 mb-5">
              {skills.length === 0 && <p className="text-[#2a2a2a] text-sm text-center py-4">No skills yet.</p>}
              {skills.map(sk => (
                <div key={sk.id} className="bg-[#0a0a0a] border border-[#141414] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-medium text-[#ccc] text-sm">{sk.name}</p><p className="text-xs text-[#333]">{sk.category}·{SKILL_LEVELS[sk.level]}</p></div>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold text-green-700 bg-green-950/30 px-2 py-1 rounded-lg">+{(sk.level + 1) * 5}pts</span>
                      <button onClick={() => { setSkills(p => p.map(x => x.id === sk.id ? { ...x, level: Math.min(4, x.level + 1) } : x)); execute(`📈 Levelled up:${sk.name}`, (sk.level + 1) * 0.8, "skill"); }} className="text-[10px] bg-[#111] border border-[#1e1e1e] hover:border-[#333] px-2 py-1 rounded-lg text-[#555] hover:text-[#999] transition-all">Level Up</button>
                      <button onClick={() => setSkills(p => p.filter(x => x.id !== sk.id))} className="text-[#222] hover:text-red-600"><X size={13} /></button>
                    </div>
                  </div>
                  <div className="flex gap-1">{SKILL_LEVELS.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= sk.level ? "bg-green-800" : "bg-[#141414]"}`} />)}</div>
                  {sk.developingHabit && <p className="text-[10px] text-[#2a2a2a] mt-2">🔁 Via:{sk.developingHabit}</p>}
                </div>
              ))}
            </div>
            <div className="border-t border-[#141414] pt-4 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))} placeholder="Skill name" className="flex-1 min-w-32" />
                <select value={newSkill.category} onChange={e => setNewSkill(p => ({ ...p, category: e.target.value }))} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-xs text-[#888] focus:outline-none">{["Technical", "Creative", "Social", "Physical", "Mental", "Academic", "Leadership"].map(c => <option key={c}>{c}</option>)}</select>
                <select value={newSkill.sector} onChange={e => setNewSkill(p => ({ ...p, sector: e.target.value }))} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-xs text-[#888] focus:outline-none"><option value="auto">🤖 Auto</option>{SECTORS.map(s => <option key={s.id} value={s.id}>{s.emoji}{s.label}</option>)}</select>
              </div>
              <div className="flex gap-2">
                <select value={newSkill.level} onChange={e => setNewSkill(p => ({ ...p, level: parseInt(e.target.value) }))} className="flex-1 bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-[#888] focus:outline-none">{SKILL_LEVELS.map((l, i) => <option key={l} value={i}>{l}</option>)}</select>
                <Input value={newSkill.developingHabit} onChange={e => setNewSkill(p => ({ ...p, developingHabit: e.target.value }))} placeholder="Developing via habit" className="flex-1" />
              </div>
              <Btn onClick={() => { if (!newSkill.name.trim()) return; const sector = newSkill.sector === "auto" ? classifyHabit(newSkill.name) : newSkill.sector; setSkills(p => [...p, { ...newSkill, id: uid(), sector }]); execute(`💡 Asset:${newSkill.name}`, 2, "skill"); setNewSkill({ name: "", level: 0, category: "Technical", sector: "skills", developingHabit: "" }); }} className="w-full"><Plus size={15} />Add Skill</Btn>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><AlertTriangle size={16} className="text-[#333]" />Weaknesses<span className="text-[#333] font-normal">— Debt</span></h2><InfoTooltip feature="weaknesses" /></div>
            <div className="space-y-3 mb-5">
              {weaknesses.length === 0 && <p className="text-[#2a2a2a] text-sm text-center py-4">No weaknesses logged.</p>}
              {weaknesses.map(w => (
                <div key={w.id} className="bg-red-950/5 border border-red-950/20 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-medium text-[#ccc] text-sm">{w.name}</p><p className="text-xs text-[#333]">{w.category}·{DEBT_SEVERITY[w.severity]}</p></div>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold text-red-800 bg-red-950/30 px-2 py-1 rounded-lg">−{(w.severity + 1) * 8}pts</span>
                      <button onClick={() => { if (w.severity > 0) { setWeaknesses(p => p.map(x => x.id === w.id ? { ...x, severity: x.severity - 1 } : x)); execute(`Improved:${w.name}`, 1.5, "debt"); } else { setWeaknesses(p => p.filter(x => x.id !== w.id)); execute(`✅ Overcame:${w.name}`, 3, "debt"); } }} className="text-[10px] bg-green-950/20 border border-green-900/30 px-2 py-1 rounded-lg text-green-700 hover:text-green-500 transition-all">Improve</button>
                      <button onClick={() => setWeaknesses(p => p.filter(x => x.id !== w.id))} className="text-[#222] hover:text-red-600"><X size={13} /></button>
                    </div>
                  </div>
                  <div className="flex gap-1">{DEBT_SEVERITY.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= w.severity ? "bg-red-900" : "bg-[#141414]"}`} />)}</div>
                  {w.plan && <p className="text-[10px] text-[#2a2a2a] mt-2">📋{w.plan}</p>}
                </div>
              ))}
            </div>
            <div className="border-t border-[#141414] pt-4 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input value={newDebt.name} onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))} placeholder="Weakness name" className="flex-1 min-w-32" />
                <select value={newDebt.category} onChange={e => setNewDebt(p => ({ ...p, category: e.target.value }))} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-xs text-[#888] focus:outline-none">{["Mental", "Social", "Physical", "Academic", "Financial", "Emotional"].map(c => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="flex gap-2">
                <select value={newDebt.severity} onChange={e => setNewDebt(p => ({ ...p, severity: parseInt(e.target.value) }))} className="flex-1 bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-[#888] focus:outline-none">{DEBT_SEVERITY.map((l, i) => <option key={l} value={i}>{l}</option>)}</select>
                <Input value={newDebt.plan} onChange={e => setNewDebt(p => ({ ...p, plan: e.target.value }))} placeholder="Improvement plan" className="flex-1" />
              </div>
              <Btn variant="ghost" onClick={() => { if (!newDebt.name.trim()) return; setWeaknesses(p => [...p, { ...newDebt, id: uid() }]); execute(`⚠️ Debt:${newDebt.name}`, -(newDebt.severity + 1) * 1.5, "debt"); setNewDebt({ name: "", severity: 0, category: "Mental", plan: "" }); }} className="w-full"><Plus size={15} />Log Weakness</Btn>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Target size={16} className="text-[#333]" />Goals<span className="text-[#333] font-normal">— Pending IPOs</span></h2><InfoTooltip feature="goals" /></div>
            <div className="space-y-2 mb-4">
              {goals.map(g => (
                <div key={g.id} className={`border rounded-xl px-4 py-3 flex items-center justify-between ${g.achieved ? "border-green-900/20 bg-green-950/5" : "border-[#141414] bg-[#0a0a0a]"}`}>
                  <div><p className="text-sm text-[#ccc]">{g.title}</p><p className="text-xs text-[#333]">{g.sector}·+{g.reward}% on achieve</p></div>
                  <div className="flex gap-2">
                    {!g.achieved && <button onClick={() => { setGoals(p => p.map(x => x.id === g.id ? { ...x, achieved: true } : x)); execute(`🏆 IPO:${g.title}`, g.reward, "goal"); }} className="text-[10px] bg-[#111] border border-[#1e1e1e] px-3 py-1.5 rounded-lg text-[#555] hover:text-green-500 hover:border-green-900 transition-all">Achieve 🚀</button>}
                    {g.achieved && <span className="text-xs text-green-700">✓ Listed</span>}
                    <button onClick={() => setGoals(p => p.filter(x => x.id !== g.id))} className="text-[#222] hover:text-red-600"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap border-t border-[#141414] pt-4">
              <Input value={newGoal.title} onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))} placeholder="Goal title" className="flex-1 min-w-32" />
              <Input type="number" value={newGoal.reward} onChange={e => setNewGoal(p => ({ ...p, reward: parseFloat(e.target.value) || 0 }))} placeholder="% reward" className="w-20 font-mono" />
              <Btn onClick={() => { if (!newGoal.title.trim()) return; setGoals(p => [...p, { ...newGoal, id: uid(), achieved: false }]); setNewGoal({ title: "", sector: "academics", reward: 0 }); }}><Plus size={15} /></Btn>
            </div>
          </Card>
        </>)}

        {/* PHASES */}
        {view === "phases" && (<>
          <div className="flex items-center gap-2 mb-1"><p className="text-xs text-[#444]">Life phases shape your historical chart curve.</p><InfoTooltip feature="phases" /></div>
          {phases.map(ph => (
            <div key={ph.id} className={`${C.card} border rounded-2xl p-5`} style={{ borderColor: ph.color + "20" }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ph.emoji}</span>
                  <div><p className="font-semibold text-[#ccc]">{ph.name}</p><p className="text-xs text-[#333]">{ph.start}→{ph.end || "Ongoing"}</p></div>
                  <span className="text-xs px-2 py-0.5 rounded-lg" style={{ backgroundColor: ph.color + "15", color: ph.color }}>{TREND_OPTIONS.find(t => t.value === ph.trend)?.label?.split(" ").slice(1).join(" ") || "Flat"}</span>
                </div>
                <button onClick={() => setPhases(p => p.filter(x => x.id !== ph.id))} className="text-[#222] hover:text-red-600"><Trash2 size={14} /></button>
              </div>
              {ph.desc && <p className="text-sm text-[#444] leading-relaxed mt-3 border-t border-[#141414] pt-3">{ph.desc}</p>}
            </div>
          ))}
          {phases.length === 0 && <p className="text-[#2a2a2a] text-sm text-center py-10">No phases yet.</p>}
          <Card><p className="font-semibold text-[#ccc] text-sm mb-4">Add Phase</p><PhaseForm onAdd={ph => setPhases(p => [...p, ph])} /></Card>
        </>)}

        {/* MORE */}
        {view === "more" && (<>
          <div className="flex gap-2 flex-wrap mb-2">
            {[["heatmap", "📅 Heatmap"], ["achievements", "🏆 Achievements"], ["capsule", "⏰ Capsule"]].map(([id, l]) => (
              <button key={id} onClick={() => setMoreTab(id)} className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${moreTab === id ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0e0e0e] text-[#444] border-[#1e1e1e] hover:border-[#333]"}`}>{l}</button>
            ))}
          </div>
          {moreTab === "heatmap" && (
            <Card>
              <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Calendar size={16} className="text-[#333]" />Activity Heatmap {new Date().getFullYear()}</h2><InfoTooltip feature="heatmap" /></div>
              <Heatmap orderBook={orderBook} />
            </Card>
          )}
          {moreTab === "achievements" && (
            <Card>
              <h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2 mb-4"><Award size={16} className="text-[#333]" />Achievements</h2>
              <div className="grid grid-cols-2 gap-3">
                {ACHIEVEMENTS.map(a => { const unlocked = unlockedAch.includes(a.id); return (
                  <div key={a.id} className={`border rounded-xl p-4 transition-all ${unlocked ? "border-[#2a2a2a] bg-[#0e0e0e]" : "border-[#141414] bg-[#0a0a0a] opacity-40"}`}>
                    <div className="text-2xl mb-2">{unlocked ? a.icon : "🔒"}</div>
                    <p className="text-xs font-semibold text-[#ccc]">{a.title}</p>
                    <p className="text-[10px] text-[#333] mt-1">{a.desc}</p>
                    {unlocked && <p className="text-[10px] text-green-700 mt-2">✓ Unlocked</p>}
                  </div>
                ); })}
              </div>
            </Card>
          )}
          {moreTab === "capsule" && (<>
            <Card>
              <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-[#e8e8e8] text-sm flex items-center gap-2"><Moon size={16} className="text-[#333]" />Time Capsule</h2><InfoTooltip feature="capsule" /></div>
              <p className="text-xs text-[#333] mb-4">Write a message to your future self. Unlocks on the date you choose.</p>
              <div className="space-y-3">
                <Textarea value={capsule.message} onChange={e => setCapsule(p => ({ ...p, message: e.target.value }))} placeholder="Dear future me…" className="w-full h-28" />
                <Input type="date" min={today()} value={capsule.unlockDate} onChange={e => setCapsule(p => ({ ...p, unlockDate: e.target.value }))} className="w-full" />
                <Btn onClick={() => { if (!capsule.message.trim() || !capsule.unlockDate) return; setTimeCapsules(p => [...p, { ...capsule, id: uid(), createdDate: today(), opened: false }]); setCapsule({ message: "", unlockDate: "" }); }} disabled={!capsule.message.trim() || !capsule.unlockDate} className={`w-full ${!capsule.message.trim() || !capsule.unlockDate ? "opacity-30" : ""}`}><Moon size={15} />Seal Capsule</Btn>
              </div>
            </Card>
            {timeCapsules.map(c => (
              <div key={c.id} className={`border rounded-2xl p-4 ${c.opened ? "border-[#141414] opacity-40" : "border-[#1e1e1e]"} bg-[#0a0a0a]`}>
                <div className="flex justify-between items-start">
                  <div><p className="text-xs text-[#444]">Unlocks: {c.unlockDate}</p><p className="text-xs text-[#2a2a2a]">Written: {c.createdDate}</p></div>
                  <button onClick={() => setTimeCapsules(p => p.filter(x => x.id !== c.id))} className="text-[#222] hover:text-red-600"><X size={13} /></button>
                </div>
                {(c.opened || c.unlockDate <= today()) ? <p className="text-sm text-[#666] mt-3 leading-relaxed">{c.message}</p> : <p className="text-xs text-[#222] mt-3">🔒 Sealed until {c.unlockDate}</p>}
              </div>
            ))}
          </>)}
        </>)}

        {/* SETTINGS */}
        {view === "settings" && (
          <div className="space-y-4">
            <Card>
              <h2 className="font-semibold text-[#e8e8e8] text-sm mb-4 flex items-center gap-2"><Settings size={15} className="text-[#333]" />Profile</h2>
              {[["Name", config.name], ["Ticker", `$${ticker}`], ["Country", config.country], ["Currency", `${curr}·${CURRENCIES[config.country]?.code}`], ["IPO Price", `${curr}${fmt(config.startPrice)}`], ["Date of Birth", config.dob || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-3 border-b border-[#111] last:border-0">
                  <span className="text-sm text-[#333]">{k}</span><span className="text-sm text-[#777]">{v}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold text-[#e8e8e8] text-sm mb-1 flex items-center gap-2"><Download size={15} className="text-[#333]" />Export Data</h2>
              <p className="text-xs text-[#333] mb-1">Full backup as JSON.</p>
              <p className="text-[10px] text-[#2a2a2a] mb-4">For Vercel: set <code className="text-[#444]">VITE_OPENROUTER_KEY</code> in env vars to override the hardcoded key.</p>
              <Btn variant="ghost" className="w-full" onClick={exportData}><Download size={15} />Export All Data</Btn>
            </Card>
            <Card>
              <h2 className="font-semibold text-[#e8e8e8] text-sm mb-1 flex items-center gap-2"><AlertTriangle size={15} className="text-red-900" />Danger Zone</h2>
              <p className="text-xs text-[#333] mb-4">Permanently delete all data and restart.</p>
              <Btn variant="danger" className="w-full" onClick={() => { if (window.confirm("Reset ALL data? Cannot be undone.")) { saveAllData(null).then(() => onReset()); } }}><Trash2 size={15} />Reset Everything</Btn>
            </Card>
          </div>
        )}
      </div>
      <BuilderCard />
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading"); // loading | welcome | onboarding | dashboard
  const [config, setConfig]     = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [key, setKey]           = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadAllData().then(data => {
      if (data && data.config) {
        setConfig(data.config);
        setInitialData(data);
        setAppState("dashboard");
      } else {
        setAppState("welcome");
      }
    });
  }, []);

  const handleComplete = async (profile) => {
    setConfig(profile);
    await saveAllData({ config: profile });
    setAppState("dashboard");
  };

  const handleReset = async () => {
    await saveAllData(null);
    setConfig(null);
    setInitialData(null);
    setKey(k => k + 1);
    setAppState("welcome");
  };

  if (appState === "loading") {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📈</div>
          <p className="text-[#333] text-sm">Loading your index…</p>
        </div>
      </div>
    );
  }

  const handleDirectImport = (e) => {
    const f = e.target.files[0]; if (!f) return;
    setImporting(true);
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        let cfg = d.config || null;
        if (!cfg && d.lifeIndex !== undefined) cfg = { name: "Imported User", ticker: "USER", country: "Other", startPrice: d.chartData?.[0]?.value || 500, dob: "", phases: [], habits: [] };
        if (!cfg) { alert("❌ No profile found in backup."); setImporting(false); return; }
        const importPayload = {
          config: cfg,
          chartData: Array.isArray(d.chartData) ? d.chartData.map(p => ({ ...p, value: isNaN(parseFloat(p.value)) ? 500 : parseFloat(p.value), timestamp: p.timestamp || new Date(p.date).getTime() })) : null,
          orderBook: Array.isArray(d.orderBook) ? d.orderBook.map(o => ({ ...o, desc: o.desc || o.description || "Imported", change: isNaN(parseFloat(o.change)) ? 0 : parseFloat(o.change), newIndex: isNaN(parseFloat(o.newIndex)) ? "" : parseFloat(o.newIndex).toFixed(2) })) : null,
          habits: d.habits || null, phases: d.phases || null, skills: d.skills || null,
          weaknesses: d.weaknesses || null, pressReleases: d.pressReleases || null,
          moodLog: d.moodLog || null, goals: d.goals || null, timeCapsules: d.timeCapsules || null,
        };
        await saveAllData(importPayload);
        setConfig(cfg);
        setInitialData(importPayload);
        setKey(k => k + 1);
        setAppState("dashboard");
      } catch (err) { alert("❌ Could not read file."); console.error(err); }
      setImporting(false);
    };
    r.readAsText(f); e.target.value = "";
  };

  if (appState === "welcome") return <WelcomeScreen onContinue={() => setAppState("onboarding")} />;

  if (appState === "onboarding") return (
    <>
      <Onboarding key={key} onComplete={handleComplete} />
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 px-6">
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col items-center gap-3 shadow-2xl w-full max-w-sm">
          <p className="text-xs text-[#444] text-center">Already have a backup? Skip onboarding.</p>
          <label className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#2a2a2a] bg-[#161616] text-[#888] hover:text-[#ccc] hover:border-[#333] text-sm font-medium transition-all cursor-pointer ${importing ? "opacity-50 cursor-wait" : ""}`}>
            <Upload size={16} />{importing ? "Importing…" : "Import & Restore Backup"}
            <input type="file" accept=".json" className="hidden" onChange={handleDirectImport} disabled={importing} />
          </label>
        </div>
      </div>
    </>
  );

  return <Dashboard key={config.name + key} config={config} onReset={handleReset} initialData={initialData} />;
}
