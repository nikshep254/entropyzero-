import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc, deleteDoc, updateDoc, deleteField, collection, addDoc, query, orderBy, getDocs } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { TrendingUp, Activity, Plus, Trash2, Send, ChevronRight, ChevronLeft, Check, X, Download, Upload, BarChart2, BookOpen, Settings, Zap, Newspaper, Star, AlertTriangle, Brain, Target, Calendar, Award, Flame, Moon, Layers, Info, GitMerge, Sparkles } from "lucide-react";

// ── AI ──────────────────────────────────────────────────────────────────────
const OR_KEY = import.meta.env.VITE_OPENROUTER_KEY || "";

async function callAI(systemPrompt, messages) {
  if (!OR_KEY) throw new Error("entropyzero AI unavailable. Check your environment configuration.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OR_KEY}`,
      "HTTP-Referer": "https://entropyzero.vercel.app",
      "X-Title": "entropyzero",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3.5-haiku",
      max_tokens: 600,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`AI error: ${res.status}`);
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI.");
  return text;
}

// ── Firestore storage helpers ───────────────────────────────────────────────
async function loadAllData(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid, "appdata", "main"));
    return snap.exists() ? snap.data().payload : null;
  } catch (e) { console.error("Load error:", e); return null; }
}

function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
}
async function saveAllData(uid, data) {
  if (!uid) return;
  await setDoc(doc(db, "users", uid, "appdata", "main"), { payload: stripUndefined(data) });
}

async function loadCoachHistory(uid) {
  try {
    const q = query(collection(db, "users", uid, "coachHistory"), orderBy("ts", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data().msg);
  } catch (_) { return []; }
}

async function saveCoachMessage(uid, msg) {
  try {
    await addDoc(collection(db, "users", uid, "coachHistory"), { msg, ts: Date.now() });
  } catch (_) {}
}

async function clearCoachHistory(uid) {
  if (!uid) return;
  try {
    const q = query(collection(db, "users", uid, "coachHistory"));
    const snap = await getDocs(q);
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
  } catch (_) {}
}

async function getLastWeeklyReport(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid, "meta", "weeklyReport"));
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

async function saveLastWeeklyReport(uid, data) {
  if (!uid) return;
  try {
    await setDoc(doc(db, "users", uid, "meta", "weeklyReport"), data);
  } catch (_) {}
}

async function publishPublicWidget(uid, data) {
  if (!uid) return;
  await setDoc(doc(db, "public", uid), stripUndefined({ ...data, lastUpdated: Date.now() }));
}

async function unpublishPublicWidget(uid) {
  if (!uid) return;
  try { await deleteDoc(doc(db, "public", uid)); } catch (_) {}
}

async function getWidgetEnabled(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "public", uid));
    return snap.exists();
  } catch (_) { return false; }
}

// ── utils ────────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 9);
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
  sectors:      { title: "Sector Breakdown",       body: "A radar chart showing how balanced your life is across 5 areas: 💪 Health (exercise, sleep, diet), 📚 Academics (study, reading, learning), 🤝 Social (relationships, events, connections), 🧠 Mental (mindfulness, therapy, journalling), and ⚡ Skills (practice, projects, certifications). A score of 50 is baseline — habits you log push each sector up or down. A lopsided chart means you're neglecting an area. Aim for a full pentagon." },
  balanceSheet: { title: "Balance Sheet",          body: "Assets = points from skills (higher level = more pts). Debt = points from weaknesses (higher severity = more pts). Net Worth = Assets minus Debt." },
  habits:       { title: "Habits",                 body: "Your daily drivers. Positive habits increase your index by their set %, negative ones reduce it. Log them daily to build streaks and compound your index." },
  press:        { title: "Press Releases",         body: "Write entries about major life events. Each one moves your index and creates a permanent journal of your story." },
  skills:       { title: "Skills — Assets",        body: "Skills are your long-term assets. Each adds points to your balance sheet. Level them up as you improve. Higher level = higher asset value." },
  weaknesses:   { title: "Weaknesses — Debt",      body: "Honest tracking of your weak spots. Each subtracts from your net worth. Use 'Improve' to reduce severity or fully overcome it for a boost." },
  goals:        { title: "Goals — Pending IPOs",   body: "Set goals with a % reward for achieving them. When you mark complete, your index gets that reward. Unachieved goals are companies waiting to list." },
  phases:       { title: "Life Phases",            body: "Map your life into chapters. Each phase has a trend that shapes the historical curve on your chart. Phase markers appear as emoji flags." },
  heatmap:      { title: "Activity Heatmap",       body: "A full-year contribution grid, one square per day. 🟢 Bright green = strong positive day (multiple high-impact habits). 🟩 Light green = small positive net. 🟥 Red = negative day (bad habits outweighed good). ⬛ Dark = no activity logged. The goal is to make the grid dense and green — like a GitHub commit graph but for your life. Hover any square to see that day's net %. Weeks with no activity are red flags. Months that are mostly green = compounding growth." },
  coach:        { title: "AI Life Coach",          body: "An AI with full context on your data — index, habits, skills, weaknesses, phases. Ask for pattern analysis, goal advice, or a life review." },
  capsule:      { title: "Time Capsule",           body: "Write a message that locks until a future date. On that date, a banner appears with your message. Perfect for letters to your future self." },
  mood:         { title: "Mood Tracker",           body: "Log how you feel today. Each mood choice makes a tiny index adjustment and gets tagged to that chart point. Hover chart points to see mood history." },
  pnl:          { title: "Monthly P&L",            body: "Profit & Loss — how your life index moved each calendar month. Green bar = you ended the month higher than you started (net positive habits/events). Red bar = net negative month. The number shows how many points you gained or lost. The count shows how many times you logged. A green month with low count means a few big wins. A red month with high count means lots of small losses — fix the habits, not the frequency." },
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
        className="w-4 h-4 rounded-full bg-[#111] border border-[#2a2a2a] text-[#888] hover:text-[#bbb] hover:border-[#444] flex items-center justify-center transition-all flex-shrink-0">
        <Info size={9} />
      </button>
      {open && (
        <div className="absolute z-50 left-6 top-0 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 shadow-2xl">
          <p className="text-xs font-semibold text-[#f0f0f0] mb-1">{info.title}</p>
          <p className="text-[11px] text-[#999] leading-relaxed">{info.body}</p>
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
          <a href="https://entropyzero.vercel.app" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] text-[#a0906a] hover:text-[#ffd700] transition-colors justify-end">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            entropyzero.vercel.app
          </a>
        </div>
      </div>
    </div>
  </div>
);

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = { bg: "bg-[#080808]", card: "bg-[#111]", border: "border-[#2a2a2a]", input: "bg-[#080808] border-[#2a2a2a]" };
const Card = ({ children, className = "" }) => <div className={`${C.card} border ${C.border} rounded-2xl p-5 ${className}`}>{children}</div>;
const Input = ({ className = "", ...p }) => <input className={`${C.input} border rounded-xl px-4 py-2.5 text-white placeholder-[#555] focus:outline-none focus:border-[#333] text-sm transition-all ${className}`} {...p} />;
const Textarea = ({ className = "", ...p }) => <textarea className={`${C.input} border rounded-xl px-4 py-2.5 text-white placeholder-[#555] focus:outline-none focus:border-[#333] text-sm resize-none transition-all ${className}`} {...p} />;
const Btn = ({ children, variant = "primary", className = "", ...p }) => {
  const v = { primary: "bg-[#e8e8e8] text-[#080808] hover:bg-[#d0d0d0]", ghost: "bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:bg-[#111] hover:text-white", danger: "bg-[#1a0808] border border-[#3a1010] text-[#f87171] hover:bg-[#200a0a]", success: "bg-[#0a1a12] border border-[#1a4d2e] text-[#34d399] hover:bg-[#0d2018]" };
  return <button className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${v[variant]} ${className}`} {...p}>{children}</button>;
};

const StatCard = ({ label, value, sub, colorClass, feature }) => (
  <div className={`${C.card} border ${C.border} rounded-2xl p-3 text-center`}>
    <div className="flex items-center justify-center gap-1 mb-1">
      <p className="text-[10px] text-[#999]">{label}</p>
      <InfoTooltip feature={feature} />
    </div>
    <p className={`text-sm font-semibold font-mono ${colorClass || "text-[#f0f0f0]"}`}>{value}</p>
    {sub && <p className="text-[10px] text-[#4a4a4a] mt-0.5">{sub}</p>}
  </div>
);

// ── Welcome ───────────────────────────────────────────────────────────────────
const WelcomeScreen = ({ onContinue, onGoogleLogin, loginLoading }) => (
  <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-6">
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-[#161616] border border-[#333] rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl">📈</div>
        <h1 className="text-3xl font-semibold text-white tracking-tight">entropyzero</h1>
        <p className="text-[#888] text-sm mt-2">Your life, quantified.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[["📊","Life as a Stock","Track habits, events, mood. Watch your index grow.","col-span-2"],["🧠","AI Coach","Personalised daily insights.",""],["💎","Skills & Debt","Assets vs weaknesses.",""],["🗂️","Life Phases","Map your chapters.",""],["📰","Daily Reports","AI press releases.",""]].map(([e,t,d,cs])=>(
          <div key={t} className={`bg-[#141414] border border-[#333] rounded-2xl p-4 ${cs}`}>
            <p className="text-2xl mb-2">{e}</p>
            <p className="text-[#e0e0e0] text-sm font-medium">{t}</p>
            <p className="text-[#999] text-xs mt-1 leading-relaxed">{d}</p>
          </div>
        ))}
        {/* Google Login Bento */}
        <div className="col-span-2 bg-[#141414] border border-[#333] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#1e1e1e] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div>
              <p className="text-[#e0e0e0] text-sm font-semibold">Sign in with Google</p>
              <p className="text-[#999] text-xs mt-0.5">Syncs your data across every device, forever.</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {[
              ["🔒","Why it's safe","Only your name and email are used. Google handles all auth — we never see your password. Ever."],
              ["☁️","Why it's needed","Without login, your data lives only in this tab and vanishes when you close it. Google login saves everything — habits, index, coach history — to encrypted cloud storage."],
              ["📱","Any device","Log on your phone, check on your laptop. Always in sync."],
            ].map(([icon,title,desc])=>(
              <div key={title} className="flex gap-3 bg-[#0a0a0a] rounded-xl px-3 py-2.5 border border-[#2a2a2a]">
                <span className="text-base mt-0.5 flex-shrink-0">{icon}</span>
                <div><p className="text-xs font-semibold text-[#ccc]">{title}</p><p className="text-[10px] text-[#999] mt-0.5 leading-relaxed">{desc}</p></div>
              </div>
            ))}
          </div>
          <button onClick={onGoogleLogin} disabled={loginLoading} className="w-full flex items-center justify-center gap-3 bg-[#e8e8e8] hover:bg-[#d8d8d8] text-[#0d0d0d] rounded-xl py-3.5 font-semibold text-sm transition-all disabled:opacity-50 mb-3">
            {loginLoading ? "Signing in…" : <><svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continue with Google</>}
          </button>
          <button onClick={onContinue} className="w-full text-xs text-[#888] hover:text-[#aaa] py-1.5 transition-all">Skip for now (data won't be saved) →</button>
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
            <div className={`rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${i < step ? "w-5 h-5 bg-[#e8e8e8] text-[#080808]" : i === step ? "w-6 h-6 border border-[#555] text-[#bbb]" : "w-4 h-4 border border-[#333] text-[#999]"}`}>
              {i < step ? <Check size={10} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`w-4 h-px mx-1 ${i < step ? "bg-[#555]" : "bg-[#161616]"}`} />}
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
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 space-y-2.5">
      <div className="flex gap-2">
        <select value={d.emoji} onChange={e => setD(p => ({ ...p, emoji: e.target.value }))} className="bg-[#141414] border border-[#333] rounded-lg px-2 py-2 text-base focus:outline-none">{EMOJIS.map(em => <option key={em}>{em}</option>)}</select>
        <Input value={d.name} onChange={e => setD(p => ({ ...p, name: e.target.value }))} placeholder="Phase name" className="flex-1" />
      </div>
      <Textarea value={d.desc} onChange={e => setD(p => ({ ...p, desc: e.target.value }))} placeholder="Describe this phase…" className="w-full h-14" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={d.start} onChange={e => setD(p => ({ ...p, start: e.target.value }))} className="w-full" />
        <Input type="date" value={d.end} onChange={e => setD(p => ({ ...p, end: e.target.value }))} className="w-full" />
      </div>
      <div className="grid gap-1">
        {TREND_OPTIONS.map(t => (
          <button key={t.value} onClick={() => setD(p => ({ ...p, trend: t.value }))} className={`px-3 py-2 rounded-lg text-xs border text-left transition-all ${d.trend === t.value ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#0a0a0a] text-[#999] border-[#2a2a2a] hover:border-[#333]"}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex gap-2">{COLORS.map(c => <button key={c} onClick={() => setD(p => ({ ...p, color: c }))} className={`w-5 h-5 rounded-full border-2 transition-all ${d.color === c ? "border-[#e8e8e8] scale-110" : "border-transparent opacity-50"}`} style={{ backgroundColor: c }} />)}</div>
      <Btn onClick={() => { if (!d.name.trim() || !d.start) return; onAdd({ ...d, id: genId() }); setD({ name: "", start: "", end: "", trend: 0, emoji: "📅", color: "#a3a3a3", desc: "" }); }} disabled={!d.name.trim() || !d.start} className={`w-full ${!d.name.trim() || !d.start ? "opacity-30" : ""}`}><Plus size={15} />Add Phase</Btn>
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

  if (step === 0) return (<Shell step={0} onNext={n} nextLabel="Begin"><div className="text-center"><div className="w-12 h-12 bg-[#161616] border border-[#333] rounded-xl flex items-center justify-center mx-auto mb-4 text-2xl">📈</div><h2 className="text-xl font-semibold text-white mb-1">Set Up Your Index</h2><p className="text-[#888] text-sm mb-6">Takes about 2 minutes.</p><div className="grid grid-cols-3 gap-3">{[["📊", "Chart"], ["🧠", "Coach"], ["💎", "Assets"]].map(([e, l]) => <div key={l} className="bg-[#141414] border border-[#333] rounded-xl p-4"><div className="text-2xl mb-2">{e}</div><div className="text-xs text-[#888]">{l}</div></div>)}</div></div></Shell>);
  if (step === 1) return (<Shell step={1} onNext={n} onBack={b} nextDisabled={!prof.name.trim() || !prof.dob}><h2 className="text-xl font-semibold text-white mb-5">Your Profile</h2><div className="space-y-4">{[["Full Name", "text", "e.g. Alex Johnson", "name"], ["Ticker (optional)", "text", "AUTO", "ticker"]].map(([l, t, p, k]) => <div key={k}><label className="text-xs text-[#888] uppercase tracking-wider block mb-2">{l}</label><Input type={t} placeholder={p} value={prof[k]} onChange={e => setProf(x => ({ ...x, [k]: k === "ticker" ? e.target.value.toUpperCase() : e.target.value }))} className="w-full" /></div>)}<div><label className="text-xs text-[#888] uppercase tracking-wider block mb-2">Date of Birth</label><Input type="date" max={today()} min="1950-01-01" value={prof.dob} onChange={e => setProf(x => ({ ...x, dob: e.target.value }))} className="w-full" /></div></div></Shell>);
  if (step === 2) return (<Shell step={2} onNext={n} onBack={b} nextDisabled={!loc.country}><h2 className="text-xl font-semibold text-white mb-5">Country & Currency</h2><div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">{Object.keys(CURRENCIES).map(c => <button key={c} onClick={() => setLoc({ country: c })} className={`py-3 px-4 rounded-xl text-sm text-left border transition-all ${loc.country === c ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#141414] text-[#888] border-[#333] hover:border-[#333] hover:text-[#bbb]"}`}><span className="block font-medium">{c}</span><span className={`text-xs font-mono ${loc.country === c ? "text-[#080808]/50" : "text-[#999]"}`}>{CURRENCIES[c]?.code}</span></button>)}</div></Shell>);
  if (step === 3) return (<Shell step={3} onNext={n} onBack={b} nextDisabled={!price.startPrice || price.startPrice <= 0}><h2 className="text-xl font-semibold text-white mb-5">IPO Price</h2><div className="grid grid-cols-4 gap-2 mb-4">{[100, 250, 500, 1000].map(p => <button key={p} onClick={() => setPrice({ startPrice: p })} className={`py-3 rounded-xl text-sm font-semibold border transition-all ${price.startPrice === p ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#141414] text-[#888] border-[#333] hover:border-[#333]"}`}>{p}</button>)}</div><Input type="number" min={1} placeholder="Custom value" value={price.startPrice || ""} onChange={e => setPrice({ startPrice: parseFloat(e.target.value) })} className="w-full" /></Shell>);
  if (step === 4) return (<Shell step={4} onNext={n} onBack={b}><h2 className="text-xl font-semibold text-white mb-1">Life Story</h2><p className="text-[#888] text-xs mb-4">Each phase shapes your chart curve.</p><div className="space-y-2 max-h-40 overflow-y-auto mb-4">{story.phases.map(ph => <div key={ph.id} className="flex items-center gap-3 bg-[#141414] border border-[#333] rounded-xl px-4 py-2.5"><span>{ph.emoji}</span><div className="flex-1"><p className="text-sm text-[#f0f0f0]">{ph.name}</p><p className="text-xs text-[#888]">{ph.start}→{ph.end || "now"}</p></div><button onClick={() => setStory(s => ({ ...s, phases: s.phases.filter(p => p.id !== ph.id) }))} className="text-[#999] hover:text-red-400"><X size={13} /></button></div>)}</div><PhaseForm onAdd={ph => setStory(s => ({ ...s, phases: [...s.phases, ph] }))} /></Shell>);
  if (step === 5) return (<Shell step={5} onNext={n} onBack={b}><h2 className="text-xl font-semibold text-white mb-1">Habits</h2><p className="text-[#888] text-xs mb-4">These move your index daily.</p><div className="flex flex-wrap gap-2 mb-4">{DEFS.map(h => <button key={h.name} onClick={() => { if (!hab.habits.find(x => x.name === h.name)) setHab(d => ({ ...d, habits: [...d.habits, { ...h, id: genId() }] })); }} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${hab.habits.find(x => x.name === h.name) ? "border-[#555] text-[#f0f0f0] bg-[#111]" : "border-[#333] text-[#888] hover:border-[#333] hover:text-[#bbb]"}`}>{h.emoji}{h.name}</button>)}</div><div className="space-y-1.5 max-h-32 overflow-y-auto mb-4">{hab.habits.map(h => <div key={h.id} className="flex items-center justify-between bg-[#141414] border border-[#333] rounded-xl px-4 py-2"><span className="text-sm text-[#f0f0f0]">{h.emoji}{h.name}</span><div className="flex items-center gap-2"><span className={`text-xs font-mono ${h.impact >= 0 ? "text-green-400" : "text-red-400"}`}>{h.impact > 0 ? "+" : ""}{h.impact}%</span><button onClick={() => setHab(d => ({ ...d, habits: d.habits.filter(x => x.id !== h.id) }))} className="text-[#999] hover:text-red-400"><X size={12} /></button></div></div>)}</div></Shell>);
  if (step === 6) return (<Shell step={6} onNext={n} onBack={b} nextLabel="Next →"><h2 className="text-xl font-semibold text-white mb-4">Ready to Launch</h2>{[["👤 Name", prof.name], ["📈 Ticker", `$${prof.ticker || prof.name.slice(0, 4).toUpperCase()}`], ["🌍 Country", `${loc.country} · ${CURRENCIES[loc.country]?.code}`], ["💰 IPO", `${CURRENCIES[loc.country]?.symbol}${price.startPrice}`], ["🗂️ Phases", `${story.phases.length} phases`], ["✅ Habits", `${hab.habits.length} habits`]].map(([k, v]) => <div key={k} className="flex justify-between items-center bg-[#141414] border border-[#333] rounded-xl px-4 py-3 mb-2"><span className="text-sm text-[#999]">{k}</span><span className="text-sm text-[#f0f0f0]">{v}</span></div>)}</Shell>);

  // Step 7: Login bento card
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-3">
        <div className="text-center mb-6">
          <p className="text-xs text-[#999] uppercase tracking-widest mb-1">Step 7 of 7</p>
          <h2 className="text-xl font-semibold text-white">Almost there</h2>
          <p className="text-[#888] text-xs mt-1">Sign in to sync your data across all devices.</p>
        </div>
        {/* Summary bento */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#141414] border border-[#333] rounded-2xl p-4 col-span-2 flex items-center gap-4">
            <div className="w-12 h-12 bg-[#161616] border border-[#333] rounded-xl flex items-center justify-center text-2xl">📈</div>
            <div>
              <p className="font-semibold text-white">{prof.ticker || prof.name.slice(0,4).toUpperCase()}</p>
              <p className="text-xs text-[#888]">{prof.name} · {loc.country}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-mono text-[#f0f0f0]">{CURRENCIES[loc.country]?.symbol}{price.startPrice}</p>
              <p className="text-[10px] text-[#999]">IPO Price</p>
            </div>
          </div>
          <div className="bg-[#141414] border border-[#333] rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{story.phases.length}</p>
            <p className="text-[10px] text-[#888] mt-1">Life Phases</p>
          </div>
          <div className="bg-[#141414] border border-[#333] rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{hab.habits.length}</p>
            <p className="text-[10px] text-[#888] mt-1">Habits</p>
          </div>
        </div>
        {/* Google login bento */}
        <button
          onClick={() => onComplete({ ...prof, ticker: prof.ticker || prof.name.slice(0, 4).toUpperCase(), ...loc, ...price, ...story, ...hab })}
          className="w-full flex items-center justify-center gap-3 bg-[#161616] border border-[#333] hover:border-[#333] text-[#f0f0f0] hover:text-white rounded-2xl px-6 py-4 text-sm font-medium transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Launch with Google
        </button>
        <button onClick={b} className="w-full text-xs text-[#999] hover:text-[#999] py-2 transition-all">← Back</button>
      </div>
    </div>
  );
};

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, phases, curr }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const ph = phases?.find(p => d.date >= p.start && (!p.end || d.date <= p.end));
  return (
    <div className="bg-[#161616] border border-[#333] rounded-xl p-3 shadow-2xl">
      <p className="text-xs text-[#888] mb-1">{d.date}</p>
      {ph && <p className="text-xs mb-1.5" style={{ color: ph.color }}>{ph.emoji}{ph.name}</p>}
      <p className="text-base font-semibold text-white font-mono">{curr}{parseFloat(d.value).toFixed(2)}</p>
      {d.mood !== undefined && <p className="text-xs text-[#999] mt-1">Mood: {MOOD_LABELS[d.mood]}</p>}
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
          <div key={month}><p className="text-[10px] text-[#888] mb-1">{month}</p>
            <div className="flex gap-0.5">{weeks.map((week, wi) => <div key={wi} className="flex flex-col gap-0.5">{week.map((cell, di) => <div key={di} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getColor(cell) }} title={cell?.date} />)}</div>)}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2"><span className="text-[10px] text-[#999]">Less</span>{["#111", "#7f1d1d", "#16a34a", "#166534"].map(c => <div key={c} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />)}<span className="text-[10px] text-[#999]">More</span></div>
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
const AICoach = ({ config, lifeIndex, orderBook, skills, weaknesses, phases, habits, uid, interests }) => {
  const WELCOME = { role: "assistant", content: `Hey ${config.name}! I'm your entropyzero AI. I have full context on your index (${fmt(lifeIndex)}), ${phases.length} phases, ${skills.length} skills, ${weaknesses.length} weaknesses and ${orderBook.length} logged events. Ask me anything.` };
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const [loadingHist, setLoadingHist] = useState(true);

  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Load history from Firestore on mount
  useEffect(() => {
    if (!uid || histLoaded) return;
    setLoadingHist(true);
    loadCoachHistory(uid).then(hist => {
      if (hist.length > 0) setMessages([WELCOME, ...hist]);
      setHistLoaded(true);
      setLoadingHist(false);
    }).catch(() => { setHistLoaded(true); setLoadingHist(false); });
  }, [uid]);

  const clearHistory = async () => {
    if (!window.confirm("Clear all chat history? Cannot be undone.")) return;
    await clearCoachHistory(uid);
    setMessages([WELCOME]);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(p => [...p, userMsg]); setInput(""); setLoading(true);
    if (uid) saveCoachMessage(uid, userMsg);
    try {
      const interestTopics = [...new Set((interests||[]).flatMap(i => i.topics))].slice(0,8).join(",") || "none";
      const ctx = `Elite life coach AI for entropyzero. User: Name=${config.name}, Country=${config.country}, Index=${fmt(lifeIndex)}, AllTime=${fmt(((lifeIndex - config.startPrice) / config.startPrice) * 100)}%, Phases=${phases.map(p => `${p.name}(${p.start}–${p.end || "now"})`).join(",") || "none"}, Skills=${skills.map(s => `${s.name}(${SKILL_LEVELS[s.level]})`).join(",") || "none"}, Weaknesses=${weaknesses.map(w => `${w.name}(${DEBT_SEVERITY[w.severity]})`).join(",") || "none"}, Habits=${habits.map(h => `${h.name}(${h.impact > 0 ? "+" : ""}${h.impact}%)`).join(",") || "none"}, Interests=${interestTopics}, Recent=${orderBook.slice(0, 10).map(o => `${o.desc}:${o.change > 0 ? "+" : ""}${fmt(o.change)}%`).join(",") || "none"}. Reply max 180 words, be direct and data-driven. Reference their interests when relevant.`;
      const reply = await callAI(ctx, [...messages, userMsg].filter(m => m.role !== "system"));
      const assistantMsg = { role: "assistant", content: reply };
      setMessages(p => [...p, assistantMsg]);
      if (uid) saveCoachMessage(uid, assistantMsg);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "Error: " + (e?.message || JSON.stringify(e)) }]);
    }
    setLoading(false);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2"><Brain size={16} className="text-[#999]" />AI Life Coach</h2>
          <InfoTooltip feature="coach" />
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <button onClick={clearHistory} className="text-[10px] text-[#777] hover:text-red-400 transition-all px-2 py-1 rounded-lg border border-[#2a2a2a] hover:border-red-900/30">
              Clear history
            </button>
          )}
          <span className="text-[10px] text-[#777] font-mono">{messages.length - 1} msgs</span>
        </div>
      </div>

      {loadingHist && !histLoaded ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-xs text-[#777] animate-pulse">Loading chat history…</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto mb-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-[#111] border border-[#333] text-[#f0f0f0]" : "bg-[#141414] border border-[#2a2a2a] text-[#bbb]"}`}>
                {m.role === "assistant" && <p className="text-[10px] text-[#777] mb-1 font-mono">COACH · {i === 0 ? "intro" : `msg ${i}`}</p>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="flex"><div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl px-4 py-3 text-sm text-[#888]">Analysing…</div></div>}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about your patterns, goals…" className="flex-1" />
        <Btn onClick={send} disabled={loading || !input.trim() || loadingHist}><Send size={15} /></Btn>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {["What are my patterns?", "Where am I weakest?", "Focus for next 30 days?", "Honest life review"].map(q => (
          <button key={q} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-lg bg-[#141414] border border-[#2a2a2a] text-[#888] hover:text-[#bbb] hover:border-[#333] transition-all">{q}</button>
        ))}
      </div>
    </Card>
  );
};



// ── Animated Force Canvas — interest spider web ──────────────────────────────
const CANVAS_COLORS = ['#60a5fa','#f97316','#a78bfa','#34d399','#f472b6','#facc15','#38bdf8','#fb923c','#4ade80','#e879f9','#fbbf24','#22d3ee','#f87171','#86efac','#c084fc'];

const ForceCanvas = ({ topics, edges, freq, height = 320 }) => {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const simRef    = useRef({
    nodes: [], frame: 0,
    drag: null,          // { node, offX, offY }
    clicked: null,       // { node, at }  — bright glow flash
    dpr: 1, W: 0, H: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || topics.length === 0) return;
    cancelAnimationFrame(animRef.current);

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || 480;
    const H   = canvas.offsetHeight || height;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    Object.assign(simRef.current, { dpr, W, H });

    // Seed nodes spread across canvas with light random velocity
    simRef.current.nodes = topics.map((t, i) => {
      const a = i * 2.399;
      const r = 50 + (i % 4) * 36 + Math.floor(i / 4) * 18;
      return {
        id: t,
        x:  W/2 + r * Math.cos(a) + (Math.random()-0.5)*14,
        y:  H/2 + r * Math.sin(a) + (Math.random()-0.5)*14,
        vx: (Math.random()-0.5)*0.9,
        vy: (Math.random()-0.5)*0.9,
        r:  5 + (freq[t]||1) * 2.6,
        color: CANVAS_COLORS[i % CANVAS_COLORS.length],
        pinned: false,
      };
    });
    simRef.current.frame = 0;

    const MARGIN = 18;
    const restLen = Math.min(W, H) * 0.30;

    const tick = () => {
      simRef.current.frame++;
      const f = simRef.current.frame;
      const { nodes, drag } = simRef.current;
      const nm = {};
      nodes.forEach(n => { nm[n.id] = n; });

      nodes.forEach(n => {
        if (n.pinned || drag?.node === n) return;

        // Soft center gravity — keeps graph from drifting off edge
        n.vx += (W/2 - n.x) * 0.0010;
        n.vy += (H/2 - n.y) * 0.0010;

        // Tiny perpetual wander — nodes never fully stop
        n.vx += (Math.random()-0.5) * 0.04;
        n.vy += (Math.random()-0.5) * 0.04;
      });

      // Pairwise repulsion
      for (let i=0; i<nodes.length; i++) {
        for (let j=i+1; j<nodes.length; j++) {
          const a=nodes[i], b=nodes[j];
          if ((drag?.node===a) || (drag?.node===b)) continue;
          const dx=a.x-b.x, dy=a.y-b.y;
          const d2=dx*dx+dy*dy||0.01, d=Math.sqrt(d2);
          const force=Math.min(1200, 2200/d2);
          const fx=dx/d*force, fy=dy/d*force;
          a.vx+=fx; a.vy+=fy;
          b.vx-=fx; b.vy-=fy;
        }
      }

      // Spring edges
      edges.forEach(([ta, tb]) => {
        const a=nm[ta], b=nm[tb];
        if (!a||!b||drag?.node===a||drag?.node===b) return;
        const dx=b.x-a.x, dy=b.y-a.y;
        const d=Math.sqrt(dx*dx+dy*dy)||1;
        const f=(d-restLen)*0.025;
        const fx=dx/d*f, fy=dy/d*f;
        a.vx+=fx; a.vy+=fy;
        b.vx-=fx; b.vy-=fy;
      });

      // Integrate — damping is gentle so motion persists
      nodes.forEach(n => {
        if (drag?.node===n) return;
        n.vx *= 0.88; n.vy *= 0.88;
        // cap max speed
        const spd = Math.sqrt(n.vx*n.vx+n.vy*n.vy);
        if (spd > 3.5) { n.vx=n.vx/spd*3.5; n.vy=n.vy/spd*3.5; }
        n.x = Math.max(n.r+MARGIN, Math.min(W-n.r-MARGIN, n.x+n.vx));
        n.y = Math.max(n.r+MARGIN, Math.min(H-n.r-MARGIN, n.y+n.vy));
        // bounce off walls
        if (n.x<=n.r+MARGIN||n.x>=W-n.r-MARGIN) n.vx*=-0.6;
        if (n.y<=n.r+MARGIN||n.y>=H-n.r-MARGIN) n.vy*=-0.6;
      });

      // ── DRAW ──
      ctx.clearRect(0, 0, W, H);

      // Edge glow pulse
      const pulse = 0.10 + 0.07 * Math.sin(f * 0.035);

      edges.forEach(([ta, tb]) => {
        const a=nm[ta], b=nm[tb];
        if (!a||!b) return;
        const grad = ctx.createLinearGradient(a.x,a.y,b.x,b.y);
        grad.addColorStop(0, a.color+'2e');
        grad.addColorStop(1, b.color+'2e');
        ctx.beginPath();
        ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=grad;
        ctx.lineWidth=0.7+pulse;
        ctx.stroke();
      });

      const now = Date.now();
      nodes.forEach(n => {
        const isDragged  = drag?.node===n;
        const clickedAge = simRef.current.clicked?.node===n ? now - simRef.current.clicked.at : Infinity;
        const glowFactor = isDragged ? 2.2
          : clickedAge < 800 ? 1.5 + 2.0 * Math.max(0, 1 - clickedAge/800)
          : 1.0;

        // big glow halo
        const glowR = n.r * (2.6 + glowFactor * 1.4);
        const grd = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,glowR);
        const alpha = isDragged ? '55' : clickedAge<800 ? 'aa' : '2a';
        grd.addColorStop(0, n.color+alpha);
        grd.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(n.x,n.y,glowR,0,Math.PI*2);
        ctx.fillStyle=grd; ctx.fill();

        // node dot
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r*(isDragged?1.25:1),0,Math.PI*2);
        ctx.fillStyle=n.color; ctx.fill();

        // label
        ctx.font='500 9.5px -apple-system,BlinkMacSystemFont,sans-serif';
        const label=n.id, tw=ctx.measureText(label).width;
        const lx=(n.x+n.r+5+tw>W-4) ? n.x-n.r-6-tw : n.x+n.r+5;
        const ly=n.y+3.5;
        ctx.fillStyle='rgba(0,0,0,0.7)';
        ctx.fillText(label,lx+0.6,ly+0.6);
        ctx.fillStyle=isDragged||clickedAge<600 ? '#fff' : '#cccccc';
        ctx.fillText(label,lx,ly);
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    // ── Pointer events (mouse + touch) ─────────────────────────────
    const hitTest = (cx, cy) => {
      const { nodes, dpr } = simRef.current;
      const px=cx/dpr, py=cy/dpr;
      // find closest node within 2.5× radius
      let best=null, bestD=Infinity;
      nodes.forEach(n => {
        const d=Math.hypot(n.x-px, n.y-py);
        if (d < Math.max(n.r*2.5, 18) && d<bestD) { best=n; bestD=d; }
      });
      return best;
    };

    const getXY = e => {
      const rect=canvas.getBoundingClientRect();
      const src=e.touches?.[0]||e;
      return [(src.clientX-rect.left)*dpr, (src.clientY-rect.top)*dpr];
    };

    const onDown = e => {
      e.preventDefault();
      const [cx,cy]=getXY(e);
      const node=hitTest(cx,cy);
      if (!node) return;
      simRef.current.drag = { node, offX:node.x-cx/dpr, offY:node.y-cy/dpr };
      simRef.current.clicked = { node, at: Date.now() };
      node.vx=0; node.vy=0;
    };
    const onMove = e => {
      e.preventDefault();
      const { drag } = simRef.current;
      if (!drag) return;
      const [cx,cy]=getXY(e);
      const { W, H } = simRef.current;
      drag.node.x = Math.max(drag.node.r+MARGIN, Math.min(W-drag.node.r-MARGIN, cx/dpr+drag.offX));
      drag.node.y = Math.max(drag.node.r+MARGIN, Math.min(H-drag.node.r-MARGIN, cy/dpr+drag.offY));
      drag.node.vx=0; drag.node.vy=0;
    };
    const onUp = () => {
      if (simRef.current.drag) {
        // give released node a gentle kick
        simRef.current.drag.node.vx=(Math.random()-0.5)*1.2;
        simRef.current.drag.node.vy=(Math.random()-0.5)*1.2;
        simRef.current.drag=null;
      }
    };

    canvas.addEventListener('mousedown',  onDown, {passive:false});
    canvas.addEventListener('mousemove',  onMove, {passive:false});
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, {passive:false});
    canvas.addEventListener('touchmove',  onMove, {passive:false});
    canvas.addEventListener('touchend',   onUp);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousedown',  onDown);
      canvas.removeEventListener('mousemove',  onMove);
      canvas.removeEventListener('mouseup',    onUp);
      canvas.removeEventListener('mouseleave', onUp);
      canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('touchmove',  onMove);
      canvas.removeEventListener('touchend',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.join('|'), edges.length, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width:'100%', height:`${height}px`, display:'block', background:'#050505', cursor:'grab', touchAction:'none' }}
    />
  );
};

// ── Changelog entries ─────────────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: "v4.0",
    date: "Mar 2025",
    tag: "major",
    title: "Widget & Interest Intelligence",
    changes: [
      { type: "fix",      text: "Widget now reads back from Firestore after write to confirm real data landed — shows exact data-point count" },
      { type: "fix",      text: "widgetEnabled added to save-effect dependency array, eliminating silent stale-closure bug" },
      { type: "feature",  text: "Firestore security rule displayed inline in Settings — permission errors shown as red banners with exact fix" },
      { type: "feature",  text: "Force Resync button pushes fresh chart data to widget on demand" },
      { type: "feature",  text: "Interest Canvas redesigned — colored nodes (15-color palette), thin white edges, golden-angle spiral layout matching network-graph aesthetic" },
      { type: "feature",  text: "Interest spider map added under Sector Breakdown in Index tab — visible inline without switching tabs" },
      { type: "fix",      text: "interests prop now correctly passed to AICoach — AI was referencing undefined variable" },
    ],
  },
  {
    version: "v3.5",
    date: "Mar 2025",
    tag: "feature",
    title: "AI Prediction & Quality-of-Life",
    changes: [
      { type: "fix",      text: "analyzeScenario was missing async keyword — await callAI() was returning a Promise object instead of text, so prediction always failed" },
      { type: "feature",  text: "AI-predicted impact % is now an editable number input — override the AI before confirming the log" },
      { type: "feature",  text: "Monthly P&L rows now label each value: gains / losses / net in small text below" },
      { type: "feature",  text: "Per-habit streak counter — each habit card computes its own consecutive-day streak and shows 🔥Nd badge" },
      { type: "feature",  text: "Activity Heatmap tooltip rewritten — explains color meanings, density goals, what red weeks indicate" },
      { type: "feature",  text: "Sector Breakdown tooltip explains each of the 5 sectors with emoji, what score 50 means, what lopsided chart indicates" },
      { type: "feature",  text: "Monthly P&L tooltip explains green/red bar meaning, count vs intensity distinction" },
    ],
  },
  {
    version: "v3.4",
    date: "Mar 2025",
    tag: "feature",
    title: "Interests Tab",
    changes: [
      { type: "feature",  text: "New Interests tab (main nav, next to Assets) — paste any YouTube URL to scrape video info and AI-extract topic tags" },
      { type: "feature",  text: "YouTube oEmbed API used for title/channel/thumbnail — no API key required" },
      { type: "feature",  text: "entropyzero AI extracts 2–4 topic tags per video using OpenRouter" },
      { type: "feature",  text: "Interest Canvas — force-graph with colored nodes, white edges connecting co-occurring topics" },
      { type: "feature",  text: "AI Coach, Daily Report, and Weekly Summary all receive interest topics in their context" },
      { type: "fix",      text: "All OpenRouter mentions removed from visible UI — branding is entropyzero AI throughout" },
    ],
  },
  {
    version: "v3.3",
    date: "Feb 2025",
    tag: "feature",
    title: "Embeddable Widget",
    changes: [
      { type: "feature",  text: "Portfolio Widget in Settings — toggle to publish chart data to Firestore public collection" },
      { type: "feature",  text: "Standalone widget.html — pure SVG chart with monotone cubic bezier curves, no React/Recharts dependency" },
      { type: "feature",  text: "Time range selector: 1W / 1M / 3M / ALL with live % recalculation" },
      { type: "feature",  text: "Hover tooltip on widget chart showing date + value" },
      { type: "feature",  text: "Live iframe preview in Settings, iframe embed code + direct URL copy" },
      { type: "fix",      text: "Widget shows exact Firestore rule to copy when permission denied — no more silent failures" },
    ],
  },
  {
    version: "v3.2",
    date: "Feb 2025",
    tag: "feature",
    title: "AI Event Prediction",
    changes: [
      { type: "feature",  text: "Log an Event replaced manual % input with AI prediction flow — describe situation, AI returns impact %, you confirm" },
      { type: "feature",  text: "AI uses your current index, skills, weaknesses and recent trend as context for accurate prediction" },
      { type: "feature",  text: "Confirm / Dismiss flow — nothing logs until you approve" },
      { type: "feature",  text: "Cmd+Enter keyboard shortcut to trigger analysis" },
      { type: "feature",  text: "AI badge on Log an Event card" },
    ],
  },
  {
    version: "v3.1",
    date: "Feb 2025",
    tag: "fix",
    title: "Stability & Auth",
    changes: [
      { type: "fix",      text: "Safari / iPad login fixed — switched from popup to redirect auth flow" },
      { type: "fix",      text: "genId / uid() naming collision causing blank screen on first load" },
      { type: "fix",      text: "Add Habit controlled-state bug — inputs not clearing after submit" },
      { type: "fix",      text: "callAI throwing on missing key instead of falling back gracefully" },
      { type: "feature",  text: "Settings tab — Google account card, live save status, import/export JSON" },
      { type: "feature",  text: "AI chat history persists across sessions via Firestore" },
      { type: "feature",  text: "Weekly AI summary auto-generates on Monday if activity logged" },
      { type: "feature",  text: "AI loading overlay with animated dots" },
    ],
  },
  {
    version: "v1.0",
    date: "Jan 2025",
    tag: "major",
    title: "Initial Launch",
    changes: [
      { type: "feature",  text: "Life Index — stock-market metaphor for your life, IPO price, all-time return" },
      { type: "feature",  text: "Firebase Google Auth + Firestore persistence" },
      { type: "feature",  text: "Habit tracking across 5 sectors (Health, Academics, Social, Mental, Skills)" },
      { type: "feature",  text: "Skills / Weaknesses as Assets / Debt on balance sheet" },
      { type: "feature",  text: "Life Phases shaping historical chart curve" },
      { type: "feature",  text: "Press Releases — journal entries that move your index" },
      { type: "feature",  text: "AI Life Coach with full data context" },
      { type: "feature",  text: "Achievements, Time Capsules, Activity Heatmap, Mood Tracker" },
      { type: "feature",  text: "Technical analysis card — RSI, SMA 14/30, volatility, buy/hold/sell signal" },
    ],
  },
];

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "chart",     icon: <BarChart2 size={16} />, label: "Index" },
  { id: "coach",     icon: <Brain size={16} />,     label: "Coach" },
  { id: "press",     icon: <Newspaper size={16} />, label: "Press" },
  { id: "habits",    icon: <Flame size={16} />,     label: "Habits" },
  { id: "assets",    icon: <Star size={16} />,      label: "Assets" },
  { id: "interests", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>, label: "Interests" },
  { id: "goals",     icon: <Target size={16} />,    label: "Goals" },
  { id: "phases",    icon: <BookOpen size={16} />,  label: "Phases" },
  { id: "more",      icon: <Layers size={16} />,    label: "More" },
  { id: "changelog", icon: <GitMerge size={16} />,  label: "Updates" },
  { id: "settings",  icon: <Settings size={16} />,  label: "Settings" },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = ({ config, onReset, initialData, uid, user }) => {
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
  const [interests, setInterests]         = useState(() => initialData?.interests || []);
  const [view, setView]                   = useState("chart");
  const [timeRange, setTimeRange]         = useState("ALL");
  const [scenario, setScenario]           = useState("");
  const [predicting, setPredicting]       = useState(false);
  const [aiPrediction, setAiPrediction]   = useState(null); // { impact, reason }
  const [editedImpact, setEditedImpact]   = useState("");
  const [ytUrl, setYtUrl]                 = useState("");
  const [ytLoading, setYtLoading]         = useState(false);
  const [scenarioImpact, setScenarioImpact] = useState("");
  const [prTitle, setPrTitle]             = useState("");
  const [prBody, setPrBody]               = useState("");
  const [prImpact, setPrImpact]           = useState("");
  const [prType, setPrType]               = useState("neutral");
  const [newSkill, setNewSkill]           = useState({ name: "", level: 0, category: "Technical", sector: "skills", developingHabit: "" });
  const [newDebt, setNewDebt]             = useState({ name: "", severity: 0, category: "Mental", plan: "" });
  const [newHabit, setNewHabit]           = useState({ name: "", impact: "", type: "positive", sector: "auto" });
  const [newGoal, setNewGoal]             = useState({ title: "", sector: "academics", reward: 0 });
  const [capsule, setCapsule]             = useState({ message: "", unlockDate: "" });
  const [moreTab, setMoreTab]             = useState("heatmap");
  const [widgetEnabled, setWidgetEnabled] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetCopied, setWidgetCopied]   = useState("");
  const [widgetSyncStatus, setWidgetSyncStatus] = useState(null);
  const [widgetSyncMsg, setWidgetSyncMsg]       = useState("");
  const [interestEnabled, setInterestEnabled]   = useState(false);
  const [interestCopied, setInterestCopied]     = useState("");
  const [saving, setSaving]               = useState(false);
  const [lastSaved, setLastSaved]         = useState(null);

  // ── Save helpers ─────────────────────────────────────────────────────────────
  // Edges: Firestore cannot store nested arrays. Use {a,b} map objects.
  const buildEdgeMaps = (interestArr) => {
    const es = new Set(), arr = [];
    (interestArr||[]).forEach(it => {
      const topics = it?.topics || [];
      for (let a = 0; a < topics.length; a++) {
        for (let b = a+1; b < topics.length; b++) {
          const k = [topics[a],topics[b]].sort().join("|||");
          if (!es.has(k)) { es.add(k); arr.push({ a: topics[a], b: topics[b] }); }
        }
      }
    });
    return arr;
  };

  const saveTimerRef = useRef(null);
  const [saveError, setSaveError] = useState(null);

  // ── Derived values needed by doSave ──────────────────────────────────────────
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

  const doSave = useCallback(async () => {
    if (!uid) return;
    setSaving(true); setSaveError(null);
    try {
      const allTimeVal = chartData.length > 1 ? ((chartData[chartData.length-1].value - config.startPrice) / config.startPrice) * 100 : 0;
      const topicsForWidget = [...new Set((interests||[]).flatMap(i => i?.topics || []))];
      const edgeMaps = buildEdgeMaps(interests);
      const widgetBase = {
        name: config.name,
        ticker: config.ticker || config.name.slice(0,4).toUpperCase(),
        currency: CURRENCIES[config.country]?.code || "USD",
        startPrice: config.startPrice,
        currentPrice: chartData[chartData.length-1]?.value || config.startPrice,
        allTime: allTimeVal,
        streak,
        chartData: chartData.map(d => ({ date: d.date, value: parseFloat(d.value) })),
      };
      const interestPayload = interestEnabled
        ? { interestTopics: topicsForWidget, interestEdges: edgeMaps, interestName: config.name }
        : {};
      const saves = [saveAllData(uid, { config, chartData, orderBook, habits, phases, skills, weaknesses, pressReleases, moodLog, goals, unlockedAch, timeCapsules, interests })];
      if (widgetEnabled) saves.push(publishPublicWidget(uid, { ...widgetBase, ...interestPayload }));
      else if (interestEnabled) saves.push(publishPublicWidget(uid, { name: config.name, ...interestPayload }));
      await Promise.all(saves);
      setLastSaved(new Date());
      if (widgetEnabled) setWidgetSyncStatus('ok');
    } catch(e) {
      console.error("Save error:", e);
      setSaveError(e?.message || "Save failed");
      if (widgetEnabled) { setWidgetSyncStatus('error'); setWidgetSyncMsg(e?.message || "Unknown error"); }
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, config, chartData, orderBook, habits, phases, skills, weaknesses, pressReleases, moodLog, goals, unlockedAch, timeCapsules, interests, widgetEnabled, interestEnabled, streak]);

  useEffect(() => {
    if (!uid) return;
    clearTimeout(saveTimerRef.current);
    setSaving(true);
    saveTimerRef.current = setTimeout(doSave, 1200);
    return () => clearTimeout(saveTimerRef.current);
  }, [doSave]);

  // Manual save — fires immediately, bypasses debounce
  const manualSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    return doSave();
  }, [doSave]);

  // (lifeIndex, streak, allTime moved before doSave — see above)

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
    setOrderBook(p => [{ id: genId(), time: now.toLocaleTimeString(), date: dateStr, desc, change: safePct, newIndex: next.toFixed(2), tag }, ...p.slice(0, 99)]);
  };

  const filteredData = useMemo(() => {
    const ranges = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "ALL": 99999 };
    const c = Date.now() - ranges[timeRange] * 86400000;
    return chartData.filter(d => d.timestamp >= c);
  }, [chartData, timeRange]);

  const analyzeScenario = async () => {
    if (!scenario.trim()) return;
    setAiPrediction(null);
    setPredicting(true);
    try {
      const ctx = `You are a life index analyst for entropyzero app. A user just described something that happened in their life. Predict its % impact on their life index (-10 to +10 range, decimals ok).

User context: Index=${fmt(lifeIndex)}, AllTime=${fmt(allTime)}%, Skills=${skills.slice(0,3).map(s=>s.name).join(",")||"none"}, Weaknesses=${weaknesses.slice(0,3).map(w=>w.name).join(",")||"none"}, RecentTrend=${orderBook.slice(0,5).map(o=>o.change>0?"+":""+ o.change+"%").join(",")||"none"}.

Event described: "${scenario}"

Reply ONLY with valid JSON, no markdown, no explanation outside JSON:
{"impact": 3.5, "reason": "one short sentence why", "emoji": "🎯"}

Rules: positive = good for life/growth, negative = setback. Scale: minor=0.5-1.5, moderate=2-4, major=5-8, life-changing=8-10. Be precise, not round numbers.`;
      const raw = await callAI(ctx, [{ role: "user", content: scenario }]);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (typeof parsed.impact !== "number") throw new Error("bad response");
      setAiPrediction(parsed); setEditedImpact(String(parsed.impact));
    } catch(e) {
      console.error("AI predict error:", e);
      setAiPrediction({ impact: null, reason: "Couldn't predict — check your API key.", emoji: "⚠️" });
    }
    setPredicting(false);
  };

  const confirmLog = () => {
    if (!aiPrediction || aiPrediction.impact === null) return;
    const finalImpact = editedImpact !== "" && !isNaN(parseFloat(editedImpact)) ? parseFloat(editedImpact) : aiPrediction.impact;
    execute(`${aiPrediction.emoji || "📌"} ${scenario.slice(0, 65)}`, finalImpact, "event");
    setScenario(""); setAiPrediction(null); setScenarioImpact(""); setEditedImpact("");
  };

  const addYoutubeInterest = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    try {
      // Extract video ID from any YouTube URL format
      const match = ytUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      const videoId = match?.[1];
      if (!videoId) throw new Error("Invalid YouTube URL");

      // Use YouTube oEmbed API (no key needed) to get title
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
      if (!oembedRes.ok) throw new Error("Could not fetch video info");
      const oembedData = await oembedRes.json();
      const videoTitle = oembedData.title;
      const channelName = oembedData.author_name;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

      // Use AI to extract topics from the title
      const ctx = `Extract 2-4 interest/topic tags from this YouTube video title. Return ONLY a JSON array of short topic strings (2-3 words max each). No markdown, no explanation.
Example: ["Machine Learning", "Python", "Data Science"]
Video: "${videoTitle}" by ${channelName}`;
      const raw = await callAI(ctx, [{ role: "user", content: videoTitle }]);
      const clean = raw.replace(/```json|```/g, "").trim();
      let topics = [];
      try { topics = JSON.parse(clean); } catch(_) { topics = [channelName]; }
      if (!Array.isArray(topics)) topics = [channelName];

      const newInterest = {
        id: genId(),
        videoId,
        title: videoTitle,
        channel: channelName,
        thumbnail,
        url: `https://youtube.com/watch?v=${videoId}`,
        topics: topics.slice(0, 4),
        addedDate: today(),
      };
      setInterests(p => [newInterest, ...p]);
      setYtUrl("");
    } catch(e) {
      alert("Could not load video: " + e.message);
    }
    setYtLoading(false);
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

  // ── Daily AI Report ─────────────────────────────────────────────────────────
  const [generatingReport, setGeneratingReport] = useState(false);
  const generateDailyReport = async () => {
    setGeneratingReport(true);
    try {
      const todayStr = today();
      const alreadyGenerated = pressReleases.some(pr => pr.tag === "daily-report" && pr.date === todayStr);
      if (alreadyGenerated) { alert("Today's report already generated. Check the Press tab."); setGeneratingReport(false); return; }
      const dailyInterests = [...new Set((interests||[]).flatMap(i => i.topics))].slice(0,6).join(", ") || "none";
      const ctx = `You are entropyzero's AI analyst. Generate a concise daily report for ${config.name}'s life index.
Data: Index=${fmt(lifeIndex)}, AllTime=${fmt(allTime)}%, Today=${fmt(todayChange)}%, Streak=${streak}d,
Phases=${phases.map(p => p.name).join(", ") || "none"},
Skills=${skills.map(s => s.name).join(", ") || "none"},
Weaknesses=${weaknesses.map(w => w.name).join(", ") || "none"},
Interest areas=${dailyInterests},
Today's habits logged=${todayOrders.map(o => o.desc).join(", ") || "none"},
Recent 5=${orderBook.slice(0,5).map(o => o.desc + ":" + o.change + "%").join(", ") || "none"}.
Write a 3-paragraph press release style daily report with: headline analysis, key observations, and tomorrow's focus. Weave in their interest areas when relevant. Max 120 words. Start with the date.`;
      const report = await callAI(ctx, [{ role: "user", content: "Generate today's daily life index report." }]);
      const now = new Date();
      const titleDate = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      setPressReleases(p => [{
        id: genId(),
        title: `📊 Daily Report — ${titleDate}`,
        body: report,
        type: todayChange >= 0 ? "positive" : "negative",
        impact: parseFloat(fmt(todayChange)),
        date: todayStr,
        time: now.toLocaleTimeString(),
        tag: "daily-report",
      }, ...p]);
      setView("press");
    } catch (e) { alert("Could not generate report: " + e.message); }
    setGeneratingReport(false);
  };

  // Daily report is manual only - use the button in Press tab

  // ── Weekly AI Summary ───────────────────────────────────────────────────────
  const generateWeeklySummary = async (manual = false) => {
    if (!uid) return;
    setGeneratingReport(true);
    try {
      const meta = await getLastWeeklyReport(uid);
      const lastDate = meta?.date || null;
      const now = new Date();
      const dayOfWeek = now.getDay();
      const thisWeekMonday = new Date(now);
      thisWeekMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const thisWeekStr = thisWeekMonday.toISOString().split("T")[0];

      if (!manual && lastDate >= thisWeekStr) { setGeneratingReport(false); return; }

      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const weekOrders = orderBook.filter(o => new Date(o.date) >= weekAgo);
      if (weekOrders.length === 0 && !manual) { setGeneratingReport(false); return; }

      const weeklyInterests = [...new Set((interests||[]).flatMap(i => i.topics))].slice(0,6).join(", ") || "none";
      const ctx = `You are entropyzero's AI analyst. Write a weekly life index performance summary.
User: ${config.name}, Index: ${fmt(lifeIndex)}, AllTime: ${fmt(allTime)}%, Streak: ${streak}d
This week: ${weekOrders.slice(0, 15).map(o => o.desc + ":" + (o.change > 0 ? "+" : "") + o.change + "%").join(", ") || "none"}
Skills: ${skills.slice(0, 3).map(s => s.name).join(", ") || "none"}
Weaknesses: ${weaknesses.slice(0, 3).map(w => w.name).join(", ") || "none"}
Interest areas: ${weeklyInterests}
Write 4 paragraphs: performance summary, what drove gains/losses, patterns, focus for next week. Incorporate their interest areas into the next-week focus. Max 200 words.`;

      const report = await callAI(ctx, [{ role: "user", content: "Generate this week's summary." }]);
      const weekEnd = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const weekStart = weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const pr = {
        id: genId(),
        title: `📅 Weekly Summary — ${weekStart} to ${weekEnd}`,
        body: report,
        type: allTime >= 0 ? "positive" : "negative",
        impact: 0,
        date: today(),
        time: now.toLocaleTimeString(),
        tag: "weekly-summary",
      };
      setPressReleases(p => [pr, ...p.filter(x => x.tag !== "weekly-summary" || x.date !== today())]);
      await saveLastWeeklyReport(uid, { date: thisWeekStr });
      setView("press");
    } catch (e) {
      console.error("Weekly report error:", e);
      alert("Could not generate weekly summary: " + e.message);
    }
    setGeneratingReport(false);
  };

  // Load widget enabled state
  useEffect(() => {
    if (!uid) return;
    getWidgetEnabled(uid).then(setWidgetEnabled);
    getDoc(doc(db, "public", uid)).then(snap => { if (snap.exists() && snap.data().interestTopics) setInterestEnabled(true); }).catch(()=>{});
  }, [uid]);

  // Auto-generate weekly summary on mount if due (once only)
  const weeklyTriggered = useRef(false);
  useEffect(() => {
    if (!uid || orderBook.length === 0 || weeklyTriggered.current) return;
    weeklyTriggered.current = true;
    const timer = setTimeout(() => generateWeeklySummary(false), 8000);
    return () => clearTimeout(timer);
  }, [uid, orderBook.length]);

  return (
    <div className={`min-h-screen ${C.bg} text-white`}>

      {/* AI Generating Overlay */}
      {generatingReport && (
        <div className="fixed inset-0 z-50 bg-[#080808]/90 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="bg-[#111] border border-[#333] rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
            <div className="flex justify-center gap-1.5 mb-5">
              {[0,1,2,3].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#e8e8e8] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="text-white font-semibold text-sm mb-1">AI is writing your report</p>
            <p className="text-[#888] text-xs">Analysing your life index data…</p>
          </div>
        </div>
      )}

      {openCapsules.map(c => (
        <div key={c.id} className="fixed top-4 left-4 right-4 z-50 bg-[#161616] border border-[#333] rounded-2xl p-4 shadow-2xl">
          <p className="text-xs text-[#999] mb-1">⏰ Time Capsule Unlocked</p>
          <p className="text-sm text-[#f0f0f0] font-medium mb-2">{c.message}</p>
          <p className="text-xs text-[#999]">Written on {c.createdDate}</p>
          <Btn variant="ghost" onClick={() => setTimeCapsules(p => p.map(x => x.id === c.id ? { ...x, opened: true } : x))} className="mt-2 w-full text-xs py-2">Dismiss</Btn>
        </div>
      ))}

      {/* Topbar */}
      <div className={`border-b border-[#2a2a2a] px-5 py-4 flex items-center justify-between sticky top-0 ${C.bg}/95 backdrop-blur z-20`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#161616] border border-[#333] rounded-xl flex items-center justify-center text-base">📈</div>
          <div><p className="font-semibold text-white text-sm leading-none">{config.name}</p><p className="text-xs text-[#999] font-mono">${ticker}·{CURRENCIES[config.country]?.code}</p></div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <p className="text-xl font-semibold text-white font-mono">{curr}{fmt(lifeIndex)}</p>
            <InfoTooltip feature="lifeIndex" />
          </div>
          <p className={`text-xs font-mono ${todayChange >= 0 ? "text-green-500" : "text-red-500"}`}>{todayChange >= 0 ? "+" : ""}{fmt(todayChange)}% today</p>
          <div className="flex items-center gap-2 justify-end mt-1">
            {saveError
              ? <><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[9px] text-red-500 font-mono cursor-help" title={saveError}>⚠ {saveError?.includes("permission") ? "permission denied" : saveError?.includes("offline") || saveError?.includes("network") ? "offline" : "save failed"}</span></>
              : saving
              ? <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /><span className="text-[9px] text-yellow-600 font-mono">saving…</span></>
              : lastSaved
              ? <><span className="w-1.5 h-1.5 rounded-full bg-green-600" /><span className="text-[9px] text-green-700 font-mono">saved {lastSaved.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></>
              : <span className="text-[9px] text-[#555] font-mono">not saved yet</span>
            }
            <button
              onClick={manualSave}
              disabled={saving}
              title="Save now"
              className={`text-[9px] font-mono px-2.5 py-1 rounded-lg border font-semibold transition-all ${saving ? "border-[#1a1a1a] text-[#333] cursor-not-allowed" : saveError ? "border-red-900/50 text-red-500 hover:border-red-700 hover:text-red-400" : "border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#555] active:scale-95"}`}
            >{saving ? "…" : "↑ Save"}</button>
          </div>
        </div>
      </div>

      {streak >= 3 && <div className="bg-[#080808] border-b border-[#2a2a2a] px-5 py-2 flex items-center gap-2"><Flame size={13} className="text-orange-500" /><span className="text-xs text-[#999]">{streak}-day streak · Keep going</span><span className="ml-auto text-xs text-[#999]">Next dividend at {Math.ceil(streak / 7) * 7}d</span></div>}

      {/* Tabs */}
      <div className="border-b border-[#2a2a2a] flex bg-[#080808] sticky top-[57px] z-10 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 text-[10px] font-medium transition-all border-b-2 ${view === t.id ? "border-[#555] text-[#f0f0f0]" : "border-transparent text-[#999] hover:text-[#999]"}`}>
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
                <p className="text-xs text-[#888]">Today's Mood</p>
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
                <h2 className="font-semibold text-white flex items-center gap-2 text-sm"><Activity size={16} className="text-[#999]" />Performance</h2>
                <InfoTooltip feature="chart" />
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className={`text-[10px] px-2 py-1 rounded-lg font-medium ${rangeProfit ? "bg-green-950/30 text-green-600" : "bg-red-950/30 text-red-600"}`}>
                  {rangeProfit ? "▲ Profit" : "▼ Loss"} ({timeRange})
                </span>
                <div className="flex gap-1">
                  {["1M", "3M", "6M", "1Y", "ALL"].map(r => (
                    <button key={r} onClick={() => setTimeRange(r)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${timeRange === r ? "bg-[#e8e8e8] text-[#080808]" : "text-[#888] hover:text-[#bbb]"}`}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <ProfitLossChart data={filteredData} phases={phases} curr={curr} timeRange={timeRange} />
          </Card>

          {technicals && (
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-white text-sm flex items-center gap-2"><Zap size={16} className="text-[#999]" />Technicals</h2>
                <InfoTooltip feature="technicals" />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${technicals.rating.includes("BUY") ? "border-green-900 text-green-500 bg-green-950/30" : technicals.rating.includes("SELL") ? "border-red-900 text-red-500 bg-red-950/30" : "border-[#333] text-[#999]"}`}>{technicals.rating}</span>
                {technicals.signals.map(s => <span key={s.label} className={`px-3 py-1.5 rounded-lg text-xs bg-[#141414] border border-[#2a2a2a] ${s.color}`}>{s.icon}{s.label}</span>)}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[["RSI (14)", fmt(technicals.rsi), technicals.rsi > 70 ? "text-yellow-500" : technicals.rsi < 30 ? "text-blue-500" : "text-[#bbb]"], ["SMA 14", `${curr}${fmt(technicals.sma14)}`, "text-[#bbb]"], ["SMA 30", `${curr}${fmt(technicals.sma30)}`, "text-[#bbb]"], ["Momentum", `${technicals.mom >= 0 ? "+" : ""}${fmt(technicals.mom)}`, technicals.mom >= 0 ? "text-green-500" : "text-red-500"], ["52W High", `${curr}${fmt(technicals.high52)}`, "text-[#bbb]"], ["52W Low", `${curr}${fmt(technicals.low52)}`, "text-[#bbb]"], ["Volatility", `${fmt(technicals.vol)}σ`, technicals.vol > 15 ? "text-red-500" : technicals.vol > 7 ? "text-yellow-500" : "text-green-500"], ["Net Worth", `${technicals.netWorth >= 0 ? "+" : ""}${technicals.netWorth}pts`, technicals.netWorth >= 0 ? "text-green-500" : "text-red-500"]].map(([l, v, c]) => (
                  <div key={l} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-xs text-[#999]">{l}</span><span className={`text-sm font-semibold font-mono ${c}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#2a2a2a] pt-4 mb-4">
                <div className="flex items-center gap-2 mb-3"><p className="text-xs text-[#999]">Sector Breakdown</p><InfoTooltip feature="sectors" /></div>
                <SectorRadar sectorScores={sectorScores} />
                <div className="grid grid-cols-5 gap-1 mt-2">{SECTORS.map(s => <div key={s.id} className="text-center"><p className="text-base">{s.emoji}</p><p className="text-[10px] text-[#999]">{Math.round(sectorScores[s.id] || 50)}</p></div>)}</div>
              </div>

              {/* Interest Network Map — animated */}
              {interests && interests.length > 0 && (() => {
                const allTopics = [...new Set(interests.flatMap(i => i.topics))];
                if (allTopics.length < 2) return null;
                const freq = {};
                interests.forEach(it => it.topics.forEach(t => { freq[t] = (freq[t]||0)+1; }));
                const edgeSet = new Set(); const edges = [];
                interests.forEach(it => {
                  for (let a = 0; a < it.topics.length; a++) for (let b = a+1; b < it.topics.length; b++) {
                    const key = [it.topics[a], it.topics[b]].sort().join("|||");
                    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([it.topics[a], it.topics[b]]); }
                  }
                });
                return (
                  <div className="mt-4 border-t border-[#2a2a2a] pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-xs text-[#bbb] font-medium">Interest Web</p>
                      <span className="text-[9px] text-[#777] font-mono">{allTopics.length} topics · {interests.length} videos</span>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-[#222]" style={{height:"220px"}}>
                      <ForceCanvas topics={allTopics} edges={edges} freq={freq} />
                    </div>
                  </div>
                );
              })()}
              <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-3"><p className="text-xs text-[#999]">Balance Sheet</p><InfoTooltip feature="balanceSheet" /></div>
                <div className="flex items-center gap-4">
                  <div className="flex-1"><p className="text-xs text-green-600 mb-1">Assets</p><div className="h-1.5 bg-[#080808] rounded-full"><div className="h-full bg-green-800 rounded-full" style={{ width: `${Math.min(100, technicals.assetScore)}%` }} /></div><p className="text-[10px] text-[#999] mt-1">+{technicals.assetScore}pts</p></div>
                  <div className="flex-1"><p className="text-xs text-red-600 mb-1">Debt</p><div className="h-1.5 bg-[#080808] rounded-full"><div className="h-full bg-red-900 rounded-full" style={{ width: `${Math.min(100, technicals.debtScore)}%` }} /></div><p className="text-[10px] text-[#999] mt-1">−{technicals.debtScore}pts</p></div>
                  <div className="text-center"><p className="text-xs text-[#999]">Net</p><p className={`text-base font-bold font-mono ${technicals.netWorth >= 0 ? "text-green-600" : "text-red-600"}`}>{technicals.netWorth >= 0 ? "+" : ""}{technicals.netWorth}</p></div>
                </div>
              </div>
              <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
                <p className="text-[10px] text-[#999] mb-2 uppercase tracking-wider">AI Signal</p>
                <p className="text-xs text-[#999] leading-relaxed">
                  {technicals.rsi > 70 ? "Running hot — gains may be overdone." : technicals.rsi < 30 ? "Deeply oversold. Strong recovery potential." : technicals.mom > 5 ? "Positive momentum building." : technicals.mom < -5 ? "Negative momentum — focus on high-yield habits." : "Range-bound. Small consistent wins will break resistance."}
                  {technicals.netWorth < -10 ? " ⚠️ Debt exceeding assets." : technicals.netWorth > 20 ? " 🌟 Strong asset base." : ""}
                  {streak >= 7 ? ` 🔥 ${streak}-day streak compounding.` : ""}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
              <Brain size={16} className="text-[#999]" />Log an Event
              <span className="ml-auto text-[9px] text-[#777] font-normal font-mono px-2 py-0.5 border border-[#2a2a2a] rounded-lg">AI powered</span>
            </h2>
            <Textarea
              value={scenario}
              onChange={e => { setScenario(e.target.value); setAiPrediction(null); }}
              placeholder="Describe what happened… e.g. 'Got rejected from my dream job but learned a lot from the process'"
              className="w-full h-24 mb-3"
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey && !predicting) analyzeScenario(); }}
            />

            {/* AI Prediction result */}
            {predicting && (
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 mb-3 flex items-center gap-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                </div>
                <span className="text-xs text-[#888]">AI is analysing your situation…</span>
              </div>
            )}

            {!predicting && aiPrediction && (
              <div className={`border rounded-xl p-4 mb-3 ${aiPrediction.impact === null ? "border-[#2a2a2a] bg-[#141414]" : aiPrediction.impact >= 0 ? "border-green-900/30 bg-green-950/10" : "border-red-900/30 bg-red-950/10"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[#888] font-mono uppercase tracking-wider">AI Prediction</span>
                  {aiPrediction.impact !== null && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={editedImpact}
                        onChange={e => setEditedImpact(e.target.value)}
                        className={`w-20 text-right text-lg font-bold font-mono bg-transparent border-b ${parseFloat(editedImpact||0) >= 0 ? "text-green-400 border-green-900" : "text-red-400 border-red-900"} outline-none`}
                      />
                      <span className={`text-lg font-bold font-mono ${parseFloat(editedImpact||0) >= 0 ? "text-green-400" : "text-red-400"}`}>%</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#bbb] leading-relaxed mb-3">{aiPrediction.emoji} {aiPrediction.reason}</p>
                {aiPrediction.impact !== null && (
                  <div className="flex gap-2">
                    <Btn onClick={confirmLog} className="flex-1 text-xs">
                      ✓ Log {parseFloat(editedImpact||aiPrediction.impact) >= 0 ? "+" : ""}{editedImpact || aiPrediction.impact}% to index
                    </Btn>
                    <button
                      onClick={() => setAiPrediction(null)}
                      className="px-3 py-2 rounded-xl text-xs text-[#888] border border-[#2a2a2a] hover:text-[#bbb] hover:border-[#333] transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}

            <Btn
              onClick={analyzeScenario}
              disabled={predicting || !scenario.trim()}
              className="w-full"
            >
              {predicting
                ? <><span className="w-3 h-3 border border-[#555] border-t-[#aaa] rounded-full animate-spin" />Analysing…</>
                : <><Brain size={15} />Predict Impact</>
              }
            </Btn>
            <p className="text-[10px] text-[#666] mt-2 text-center">AI predicts the % impact — you confirm before it logs</p>
          </Card>

          <Card>
            <h2 className="font-semibold text-white text-sm mb-4">Transaction Log</h2>
            {orderBook.length === 0 ? <p className="text-[#4a4a4a] text-sm text-center py-8">No transactions yet.</p> : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {orderBook.slice(0, 30).map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3">
                    <div><p className="text-sm text-[#aaa] truncate max-w-52 sm:max-w-64">{o.desc}</p><p className="text-[10px] text-[#4a4a4a]">{o.date}·{o.time}{o.tag ? `·${o.tag}` : ""}</p></div>
                    <div className="text-right"><p className={`text-sm font-bold font-mono ${o.change >= 0 ? "text-green-600" : "text-red-600"}`}>{o.change > 0 ? "+" : ""}{fmt(o.change)}%</p><p className="text-[10px] text-[#4a4a4a] font-mono">{curr}{o.newIndex}</p></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>)}

        {/* COACH */}
        {view === "coach" && <AICoach config={config} lifeIndex={lifeIndex} orderBook={orderBook} skills={skills} weaknesses={weaknesses} phases={phases} habits={habits} uid={uid} interests={interests} />}

        {/* PRESS */}
        {view === "press" && (<>
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={generateDailyReport} disabled={generatingReport}>
              {generatingReport ? "Generating…" : "🤖 Daily Report"}
            </Btn>
            <Btn variant="ghost" className="flex-1" onClick={() => generateWeeklySummary(true)}>
              📅 Weekly Summary
            </Btn>
          </div>
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2"><Newspaper size={16} className="text-[#999]" />Publish Press Release</h2>
              <InfoTooltip feature="press" />
            </div>
            <div className="space-y-3">
              <Input value={prTitle} onChange={e => setPrTitle(e.target.value)} placeholder="Headline" className="w-full" />
              <Textarea value={prBody} onChange={e => setPrBody(e.target.value)} placeholder="Write your full press release…" className="w-full h-28" />
              <div className="flex gap-2 flex-wrap">
                <div className="flex gap-1">{[["positive", "🟢"], ["neutral", "⚪"], ["negative", "🔴"]].map(([v, l]) => <button key={v} onClick={() => setPrType(v)} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${prType === v ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#141414] text-[#888] border-[#333] hover:border-[#333]"}`}>{l}{v}</button>)}</div>
                <Input value={prImpact} onChange={e => setPrImpact(e.target.value)} placeholder="% impact" className="w-24 font-mono" />
                <Btn onClick={() => { if (!prTitle.trim() || !prBody.trim()) return; const impact = prImpact ? parseFloat(prImpact) : prType === "positive" ? 3 : prType === "negative" ? -3 : 0; const now = new Date(); setPressReleases(p => [{ id: genId(), title: prTitle, body: prBody, type: prType, impact, date: now.toISOString().split("T")[0], time: now.toLocaleTimeString() }, ...p]); if (impact !== 0) execute(`📰 ${prTitle}`, impact, "press"); setPrTitle(""); setPrBody(""); setPrImpact(""); setPrType("neutral"); }} disabled={!prTitle.trim() || !prBody.trim()}><Newspaper size={15} />Publish</Btn>
              </div>
            </div>
          </Card>
          {pressReleases.map(pr => (
            <div key={pr.id} className={`border rounded-2xl p-5 ${pr.tag === "weekly-summary" ? "bg-purple-950/10 border-purple-900/20" : pr.tag === "daily-report" ? "bg-blue-950/10 border-blue-900/20" : pr.type === "positive" ? "bg-green-950/10 border-green-900/20" : pr.type === "negative" ? "bg-red-950/10 border-red-900/20" : "bg-[#141414] border-[#2a2a2a]"}`}>
              <div className="flex items-start justify-between mb-3">
                <div><p className="font-semibold text-[#f0f0f0] text-sm">{pr.title}</p><p className="text-[10px] text-[#4a4a4a] mt-1">{pr.date}·{pr.time}</p></div>
                <div className="flex gap-2">
                  {pr.impact !== 0 && <span className={`text-xs font-bold font-mono px-2 py-1 rounded-lg ${pr.type === "positive" ? "bg-green-950/40 text-green-600" : pr.type === "negative" ? "bg-red-950/40 text-red-600" : "bg-[#161616] text-[#999]"}`}>{pr.impact > 0 ? "+" : ""}{pr.impact}%</span>}
                  <button onClick={() => setPressReleases(p => p.filter(x => x.id !== pr.id))} className="text-[#666] hover:text-red-600"><X size={14} /></button>
                </div>
              </div>
              <p className="text-sm text-[#888] leading-relaxed">{pr.body}</p>
            </div>
          ))}
        </>)}

        {/* HABITS */}
        {view === "habits" && (<>
          <div className="grid sm:grid-cols-2 gap-3">
            {habits.map(h => {
              // compute this habit's consecutive-day streak
              // Streak: filter ALL logs for this habit (by name or tag)
              const habitLogs = orderBook.filter(o =>
                o.desc === h.name ||
                o.desc === `${h.emoji}${h.name}` ||
                (o.tag === "habit" && (o.desc === h.name || o.desc.includes(h.name)))
              );
              const loggedDates = new Set(habitLogs.map(o => o.date));
              let hStreak = 0;
              const d = new Date(); d.setHours(0,0,0,0);
              const todayStr = d.toISOString().split("T")[0];
              // If today not logged yet, start counting from yesterday so streak doesn't reset at midnight
              if (!loggedDates.has(todayStr)) d.setDate(d.getDate() - 1);
              while (true) {
                const ds = d.toISOString().split("T")[0];
                if (!loggedDates.has(ds)) break;
                hStreak++; d.setDate(d.getDate() - 1);
              }
              const loggedToday = loggedDates.has(todayStr);
              return (
              <div key={h.id} className={`${C.card} border ${C.border} rounded-2xl p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-white text-sm">{h.emoji} {h.name}</p>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${h.impact >= 0 ? "text-green-400 bg-green-950/30 border-green-900/30" : "text-red-400 bg-red-950/30 border-red-900/30"}`}>{h.impact > 0 ? "+" : ""}{h.impact}%</span>
                    </div>
                    <p className="text-[11px] text-[#999] mb-2">{SECTORS.find(s => s.id === h.sector)?.emoji} {SECTORS.find(s => s.id === h.sector)?.label}</p>
                    {/* Streak display */}
                    <div className="flex items-center gap-3">
                      {hStreak > 0 ? (
                        <div className="flex items-center gap-1.5 bg-orange-950/30 border border-orange-900/30 rounded-xl px-2.5 py-1.5">
                          <span className="text-base leading-none">🔥</span>
                          <div>
                            <p className="text-sm font-bold font-mono text-orange-400 leading-none">{hStreak}</p>
                            <p className="text-[9px] text-orange-700 leading-none mt-0.5">day streak</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-[#111] border border-[#222] rounded-xl px-2.5 py-1.5">
                          <span className="text-base leading-none opacity-30">🔥</span>
                          <div>
                            <p className="text-sm font-bold font-mono text-[#444] leading-none">0</p>
                            <p className="text-[9px] text-[#333] leading-none mt-0.5">day streak</p>
                          </div>
                        </div>
                      )}
                      <div className="text-[10px] text-[#666]">{habitLogs.length} total logs</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Btn variant={h.impact >= 0 ? "success" : "danger"} onClick={() => execute(h.name, h.impact, "habit")} className={`text-xs py-2 px-3 ${loggedToday ? "opacity-60" : ""}`}>
                      {loggedToday ? "✓ Done" : "Log"}
                    </Btn>
                    <button onClick={() => setHabits(p => p.filter(x => x.id !== h.id))} className="text-[#444] hover:text-red-500 p-1"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h3 className="font-semibold text-[#f0f0f0] text-sm">Add Habit</h3><InfoTooltip feature="habits" /></div>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Habit name"
                className="flex-1 min-w-32"
                value={newHabit.name}
                onChange={e => setNewHabit(p => ({ ...p, name: e.target.value }))}
              />
              <Input
                type="number"
                step="0.5"
                placeholder="%"
                className="w-16 font-mono"
                value={newHabit.impact}
                onChange={e => setNewHabit(p => ({ ...p, impact: e.target.value }))}
              />
              <select
                className="bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-xs text-[#bbb] focus:outline-none"
                value={newHabit.type}
                onChange={e => setNewHabit(p => ({ ...p, type: e.target.value }))}
              >
                <option value="positive">+ Positive</option>
                <option value="negative">− Negative</option>
              </select>
              <select
                className="bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-xs text-[#bbb] focus:outline-none"
                value={newHabit.sector}
                onChange={e => setNewHabit(p => ({ ...p, sector: e.target.value }))}
              >
                <option value="auto">🤖 Auto</option>
                {SECTORS.map(s => <option key={s.id} value={s.id}>{s.emoji}{s.label}</option>)}
              </select>
              <Btn onClick={() => {
                if (!newHabit.name.trim() || !newHabit.impact) return;
                const impact = parseFloat(newHabit.impact) * (newHabit.type === "negative" ? -1 : 1);
                if (isNaN(impact)) return;
                const sector = newHabit.sector === "auto" ? classifyHabit(newHabit.name) : newHabit.sector;
                const toAdd = [{ id: genId(), name: newHabit.name, impact, type: newHabit.type, emoji: newHabit.type === "positive" ? "✅" : "❌", sector }];
                if (newHabit.type === "positive") {
                  toAdd.push({ id: genId(), name: `Skip ${newHabit.name}`, impact: -Math.abs(impact), type: "negative", emoji: "❌", sector });
                } else {
                  toAdd.push({ id: genId(), name: `Avoid ${newHabit.name}`, impact: Math.abs(impact), type: "positive", emoji: "✅", sector });
                }
                setHabits(p => [...p, ...toAdd]);
                setNewHabit({ name: "", impact: "", type: "positive", sector: "auto" });
              }}><Plus size={16} /></Btn>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h3 className="font-semibold text-[#f0f0f0] text-sm flex items-center gap-2"><TrendingUp size={15} className="text-[#999]" />Monthly P&L</h3><InfoTooltip feature="pnl" /></div>
            {pnl.length === 0 ? <p className="text-[#4a4a4a] text-sm text-center py-4">No data yet.</p> : (
              <div className="space-y-2">
                {pnl.map(m => (
                  <div key={m.month} className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-3">
                    <span className="text-xs text-[#999] font-mono w-10">{m.month}</span>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-xs text-green-600 font-mono">+{fmt(m.gain)}%</p>
                        <p className="text-[9px] text-[#666] mt-0.5">gains</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-red-600 font-mono">{fmt(m.loss)}%</p>
                        <p className="text-[9px] text-[#666] mt-0.5">losses</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-xs font-bold font-mono ${m.gain + m.loss >= 0 ? "text-green-500" : "text-red-500"}`}>{m.gain + m.loss >= 0 ? "+" : ""}{fmt(m.gain + m.loss)}%</p>
                        <p className="text-[9px] text-[#666] mt-0.5">net</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#4a4a4a]">{m.count}</p>
                      <p className="text-[9px] text-[#555]">logs</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>)}

        {/* ASSETS */}
        {view === "assets" && (<>
          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-white text-sm flex items-center gap-2"><Star size={16} className="text-[#999]" />Skills<span className="text-[#999] font-normal">— Assets</span></h2><InfoTooltip feature="skills" /></div>
            <div className="space-y-3 mb-5">
              {skills.length === 0 && <p className="text-[#4a4a4a] text-sm text-center py-4">No skills yet.</p>}
              {skills.map(sk => (
                <div key={sk.id} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-medium text-[#f0f0f0] text-sm">{sk.name}</p><p className="text-xs text-[#999]">{sk.category}·{SKILL_LEVELS[sk.level]}</p></div>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold text-green-700 bg-green-950/30 px-2 py-1 rounded-lg">+{(sk.level + 1) * 5}pts</span>
                      <button onClick={() => { setSkills(p => p.map(x => x.id === sk.id ? { ...x, level: Math.min(4, x.level + 1) } : x)); execute(`📈 Levelled up:${sk.name}`, (sk.level + 1) * 0.8, "skill"); }} className="text-[10px] bg-[#161616] border border-[#333] hover:border-[#333] px-2 py-1 rounded-lg text-[#999] hover:text-[#aaa] transition-all">Level Up</button>
                      <button onClick={() => setSkills(p => p.filter(x => x.id !== sk.id))} className="text-[#666] hover:text-red-600"><X size={13} /></button>
                    </div>
                  </div>
                  <div className="flex gap-1">{SKILL_LEVELS.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= sk.level ? "bg-green-800" : "bg-[#0a0a0a]"}`} />)}</div>
                  {sk.developingHabit && <p className="text-[10px] text-[#4a4a4a] mt-2">🔁 Via:{sk.developingHabit}</p>}
                </div>
              ))}
            </div>
            <div className="border-t border-[#2a2a2a] pt-4 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))} placeholder="Skill name" className="flex-1 min-w-32" />
                <select value={newSkill.category} onChange={e => setNewSkill(p => ({ ...p, category: e.target.value }))} className="bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-xs text-[#bbb] focus:outline-none">{["Technical", "Creative", "Social", "Physical", "Mental", "Academic", "Leadership"].map(c => <option key={c}>{c}</option>)}</select>
                <select value={newSkill.sector} onChange={e => setNewSkill(p => ({ ...p, sector: e.target.value }))} className="bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-xs text-[#bbb] focus:outline-none"><option value="auto">🤖 Auto</option>{SECTORS.map(s => <option key={s.id} value={s.id}>{s.emoji}{s.label}</option>)}</select>
              </div>
              <div className="flex gap-2">
                <select value={newSkill.level} onChange={e => setNewSkill(p => ({ ...p, level: parseInt(e.target.value) }))} className="flex-1 bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-[#bbb] focus:outline-none">{SKILL_LEVELS.map((l, i) => <option key={l} value={i}>{l}</option>)}</select>
                <Input value={newSkill.developingHabit} onChange={e => setNewSkill(p => ({ ...p, developingHabit: e.target.value }))} placeholder="Developing via habit" className="flex-1" />
              </div>
              <Btn onClick={() => { if (!newSkill.name.trim()) return; const sector = newSkill.sector === "auto" ? classifyHabit(newSkill.name) : newSkill.sector; setSkills(p => [...p, { ...newSkill, id: genId(), sector }]); execute(`💡 Asset:${newSkill.name}`, 2, "skill"); setNewSkill({ name: "", level: 0, category: "Technical", sector: "skills", developingHabit: "" }); }} className="w-full"><Plus size={15} />Add Skill</Btn>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-white text-sm flex items-center gap-2"><AlertTriangle size={16} className="text-[#999]" />Weaknesses<span className="text-[#999] font-normal">— Debt</span></h2><InfoTooltip feature="weaknesses" /></div>
            <div className="space-y-3 mb-5">
              {weaknesses.length === 0 && <p className="text-[#4a4a4a] text-sm text-center py-4">No weaknesses logged.</p>}
              {weaknesses.map(w => (
                <div key={w.id} className="bg-red-950/5 border border-red-950/20 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-medium text-[#f0f0f0] text-sm">{w.name}</p><p className="text-xs text-[#999]">{w.category}·{DEBT_SEVERITY[w.severity]}</p></div>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold text-red-800 bg-red-950/30 px-2 py-1 rounded-lg">−{(w.severity + 1) * 8}pts</span>
                      <button onClick={() => { if (w.severity > 0) { setWeaknesses(p => p.map(x => x.id === w.id ? { ...x, severity: x.severity - 1 } : x)); execute(`Improved:${w.name}`, 1.5, "debt"); } else { setWeaknesses(p => p.filter(x => x.id !== w.id)); execute(`✅ Overcame:${w.name}`, 3, "debt"); } }} className="text-[10px] bg-green-950/20 border border-green-900/30 px-2 py-1 rounded-lg text-green-700 hover:text-green-500 transition-all">Improve</button>
                      <button onClick={() => setWeaknesses(p => p.filter(x => x.id !== w.id))} className="text-[#666] hover:text-red-600"><X size={13} /></button>
                    </div>
                  </div>
                  <div className="flex gap-1">{DEBT_SEVERITY.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= w.severity ? "bg-red-900" : "bg-[#0a0a0a]"}`} />)}</div>
                  {w.plan && <p className="text-[10px] text-[#4a4a4a] mt-2">📋{w.plan}</p>}
                </div>
              ))}
            </div>
            <div className="border-t border-[#2a2a2a] pt-4 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input value={newDebt.name} onChange={e => setNewDebt(p => ({ ...p, name: e.target.value }))} placeholder="Weakness name" className="flex-1 min-w-32" />
                <select value={newDebt.category} onChange={e => setNewDebt(p => ({ ...p, category: e.target.value }))} className="bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-xs text-[#bbb] focus:outline-none">{["Mental", "Social", "Physical", "Academic", "Financial", "Emotional"].map(c => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="flex gap-2">
                <select value={newDebt.severity} onChange={e => setNewDebt(p => ({ ...p, severity: parseInt(e.target.value) }))} className="flex-1 bg-[#141414] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-[#bbb] focus:outline-none">{DEBT_SEVERITY.map((l, i) => <option key={l} value={i}>{l}</option>)}</select>
                <Input value={newDebt.plan} onChange={e => setNewDebt(p => ({ ...p, plan: e.target.value }))} placeholder="Improvement plan" className="flex-1" />
              </div>
              <Btn variant="ghost" onClick={() => { if (!newDebt.name.trim()) return; setWeaknesses(p => [...p, { ...newDebt, id: genId() }]); execute(`⚠️ Debt:${newDebt.name}`, -(newDebt.severity + 1) * 1.5, "debt"); setNewDebt({ name: "", severity: 0, category: "Mental", plan: "" }); }} className="w-full"><Plus size={15} />Log Weakness</Btn>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-white text-sm flex items-center gap-2"><Target size={16} className="text-[#999]" />Goals<span className="text-[#999] font-normal">— Pending IPOs</span></h2><InfoTooltip feature="goals" /></div>
            <div className="space-y-2 mb-4">
              {goals.map(g => (
                <div key={g.id} className={`border rounded-xl px-4 py-3 flex items-center justify-between ${g.achieved ? "border-green-900/20 bg-green-950/5" : "border-[#2a2a2a] bg-[#0a0a0a]"}`}>
                  <div><p className="text-sm text-[#f0f0f0]">{g.title}</p><p className="text-xs text-[#999]">{g.sector}·+{g.reward}% on achieve</p></div>
                  <div className="flex gap-2">
                    {!g.achieved && <button onClick={() => { setGoals(p => p.map(x => x.id === g.id ? { ...x, achieved: true } : x)); execute(`🏆 IPO:${g.title}`, g.reward, "goal"); }} className="text-[10px] bg-[#161616] border border-[#333] px-3 py-1.5 rounded-lg text-[#999] hover:text-green-500 hover:border-green-900 transition-all">Achieve 🚀</button>}
                    {g.achieved && <span className="text-xs text-green-700">✓ Listed</span>}
                    <button onClick={() => setGoals(p => p.filter(x => x.id !== g.id))} className="text-[#666] hover:text-red-600"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap border-t border-[#2a2a2a] pt-4">
              <Input value={newGoal.title} onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))} placeholder="Goal title" className="flex-1 min-w-32" />
              <Input type="number" value={newGoal.reward} onChange={e => setNewGoal(p => ({ ...p, reward: parseFloat(e.target.value) || 0 }))} placeholder="% reward" className="w-20 font-mono" />
              <Btn onClick={() => { if (!newGoal.title.trim()) return; setGoals(p => [...p, { ...newGoal, id: genId(), achieved: false }]); setNewGoal({ title: "", sector: "academics", reward: 0 }); }}><Plus size={15} /></Btn>
            </div>
          </Card>
        </>)}

        {/* PHASES */}
        {view === "interests" && (<>

          {/* Add YouTube */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>
                Interests
              </h2>
              <span className="text-[9px] text-[#777] font-mono px-2 py-0.5 border border-[#2a2a2a] rounded-lg">AI tagged</span>
            </div>
            <p className="text-xs text-[#777] mb-3">Paste any YouTube link — AI extracts your interest topics and maps connections.</p>
            <div className="flex gap-2">
              <Input
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !ytLoading && addYoutubeInterest()}
                placeholder="youtube.com/watch?v=… or youtu.be/…"
                className="flex-1"
              />
              <Btn onClick={addYoutubeInterest} disabled={ytLoading || !ytUrl.trim()}>
                {ytLoading
                  ? <span className="w-3 h-3 border-2 border-[#444] border-t-[#aaa] rounded-full animate-spin inline-block" />
                  : <Plus size={15} />}
              </Btn>
            </div>
            {ytLoading && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#444] animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}
                </div>
                <p className="text-[10px] text-[#777]">Fetching video · extracting topics with AI…</p>
              </div>
            )}
          </Card>

          {/* Interest cards */}
          {interests.length === 0 && !ytLoading && (
            <div className="text-center py-12 text-[#666]">
              <div className="text-4xl mb-3 opacity-30">🎯</div>
              <p className="text-sm">Add YouTube videos to map your interests.</p>
              <p className="text-xs text-[#555] mt-1">Topics are auto-extracted and connected.</p>
            </div>
          )}

          {interests.map(item => (
            <div key={item.id} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              <div className="flex gap-3 p-4">
                <img
                  src={item.thumbnail}
                  className="w-24 h-16 object-cover rounded-xl flex-shrink-0 bg-[#161616]"
                  alt=""
                  onError={e => { e.target.style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  <a href={item.url} target="_blank" rel="noreferrer"
                    className="text-sm font-semibold text-[#f0f0f0] hover:text-white leading-snug block mb-1 line-clamp-2">
                    {item.title}
                  </a>
                  <p className="text-[10px] text-[#777] mb-2 font-mono">{item.channel} · {item.addedDate}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.topics.map(t => (
                      <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-[#161616] border border-[#2a2a2a] text-[#999] font-mono">{t}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setInterests(p => p.filter(x => x.id !== item.id))} className="text-[#555] hover:text-red-500 self-start flex-shrink-0"><X size={13} /></button>
              </div>
            </div>
          ))}

          {/* Interest Web — animated force canvas */}
          {interests.length > 1 && (() => {
            const allTopics = [...new Set(interests.flatMap(i => i.topics))];
            const freq = {};
            interests.forEach(i => i.topics.forEach(t => { freq[t] = (freq[t]||0)+1; }));
            const edgeSet = new Set(); const edges = [];
            interests.forEach(item => {
              for (let a = 0; a < item.topics.length; a++) for (let b = a+1; b < item.topics.length; b++) {
                const key = [item.topics[a], item.topics[b]].sort().join("|||");
                if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([item.topics[a], item.topics[b]]); }
              }
            });
            return (
              <Card>
                <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                  <Layers size={14} className="text-[#999]" />Interest Web
                  <span className="ml-auto text-[10px] text-[#777] font-mono font-normal">{allTopics.length} topics · {interests.length} videos</span>
                </h2>
                <p className="text-[10px] text-[#777] mb-3">Live physics — topics repel, shared videos pull them together.</p>
                <div className="rounded-2xl overflow-hidden border border-[#222]">
                  <ForceCanvas topics={allTopics} edges={edges} freq={freq} />
                </div>
              </Card>
            );
          })()}

          {/* ── Interest Bento Embed ── */}
          {interests.length > 1 && (
            <Card>
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                <span className="text-base">🌐</span> Share Interest Web
              </h2>
              <p className="text-xs text-[#888] mb-4 leading-relaxed">
                Make your interest network publicly embeddable — share it as a live bento card on any website.
              </p>

              {/* Toggle */}
              <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                <div>
                  <p className="text-sm text-[#f0f0f0] font-medium">Enable public interest web</p>
                  <p className="text-xs text-[#888] mt-0.5">{interestEnabled ? "Your interest map is publicly viewable" : "Private"}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const topicsNow = [...new Set(interests.flatMap(i => i?.topics||[]))];
                      const edgesNow = buildEdgeMaps(interests);
                      const ref = doc(db, "public", uid);
                      if (!interestEnabled) {
                        await setDoc(ref, { interestTopics: topicsNow, interestEdges: edgesNow, interestName: config.name, name: config.name, lastUpdated: Date.now() }, { merge: true });
                        const snap = await getDoc(ref);
                        if (!snap.exists() || !snap.data().interestTopics?.length)
                          throw new Error("Firestore write failed — check your Firestore rules allow write to /public/{userId}");
                        setInterestEnabled(true);
                      } else {
                        await updateDoc(ref, {
                          interestTopics: deleteField(),
                          interestEdges:  deleteField(),
                          interestName:   deleteField(),
                        });
                        setInterestEnabled(false);
                      }
                    } catch(e) {
                      const isPerm = e.code === "permission-denied" || (e.message||"").includes("permission") || (e.message||"").includes("Firestore");
                      alert(isPerm
                        ? "Permission denied — add this Firestore rule:\n\nmatch /public/{userId} {\n  allow read: if true;\n  allow write: if request.auth.uid == userId;\n}"
                        : "Error: " + e.message);
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${interestEnabled ? "bg-violet-600" : "bg-[#222]"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${interestEnabled ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>

              {interestEnabled && (
                <div className="space-y-3">
                  {[
                    {
                      label: "iframe embed",
                      desc: "Paste into any website, Notion, GitHub profile",
                      code: `<iframe src="https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}" width="480" height="360" frameborder="0" style="border-radius:20px;border:1px solid #2a2a2a;background:#050505"></iframe>`,
                    },
                    {
                      label: "Canvas URL",
                      desc: "Direct link to share or open",
                      code: `https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}`,
                    },
                  ].map(({ label, desc, code }) => (
                    <div key={label} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-[#bbb]">{label}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(code); setInterestCopied(label); setTimeout(()=>setInterestCopied(""),2000); }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#999] hover:text-white hover:border-[#444] transition-all"
                        >{interestCopied === label ? "✓ Copied!" : "Copy"}</button>
                      </div>
                      <p className="text-[10px] text-[#777] mb-2">{desc}</p>
                      <code className="text-[9px] text-[#777] break-all leading-relaxed block font-mono">{code}</code>
                    </div>
                  ))}
                  <a
                    href={`https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full text-xs text-[#888] border border-[#2a2a2a] rounded-xl py-2 hover:text-white hover:border-[#444] transition-all"
                  >↗ Open live preview</a>
                </div>
              )}
            </Card>
          )}

        </>)}

        {/* GOALS — Pending IPOs */}
        {view === "goals" && (() => {
          const pending  = goals.filter(g => !g.achieved);
          const listed   = goals.filter(g =>  g.achieved);
          const SECTOR_COLORS = { health:"#22c55e", academics:"#60a5fa", social:"#f472b6", mental:"#a78bfa", skills:"#facc15" };
          return (
            <>
              {/* Hero banner */}
              <div className="relative overflow-hidden rounded-2xl mb-4" style={{background:"linear-gradient(135deg,#0a0015 0%,#0f0020 50%,#000d20 100%)"}}>
                <div className="absolute inset-0 opacity-40" style={{backgroundImage:"radial-gradient(circle at 15% 50%, #7c3aed44 0%, transparent 55%), radial-gradient(circle at 85% 30%, #0ea5e940 0%, transparent 55%)"}} />
                <div className="relative px-5 py-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={13} className="text-violet-400" />
                    <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Pending IPOs</span>
                  </div>
                  <h1 className="text-xl font-bold text-white leading-tight mb-1">Goals & Milestones</h1>
                  <p className="text-xs text-[#555]">{pending.length} pending · {listed.length} listed · {goals.reduce((s,g)=>s+(g.achieved?g.reward:0),0).toFixed(1)}% earned</p>
                </div>
              </div>

              {/* Pending goals — pre-IPO companies */}
              {pending.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-[#777] font-mono uppercase tracking-widest mb-3 px-1">🔒 Pre-IPO · Pending</p>
                  <div className="space-y-2">
                    {pending.map(g => {
                      const sc = SECTORS.find(s => s.id === g.sector);
                      const col = SECTOR_COLORS[g.sector] || "#888";
                      const tk = g.title.replace(/[^a-zA-Z]/g,"").slice(0,4).toUpperCase() || "GOAL";
                      return (
                        <div key={g.id} className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-4 flex items-center gap-4">
                          {/* ticker block */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border" style={{borderColor:col+"33", background:col+"11"}}>
                            <span className="text-[9px] font-bold font-mono" style={{color:col}}>${tk}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{g.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[#888]">{sc?.emoji} {sc?.label}</span>
                              <span className="text-[10px] font-mono text-green-500">+{g.reward}% on IPO</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 items-end">
                            <button
                              onClick={() => { setGoals(p => p.map(x => x.id === g.id ? { ...x, achieved: true } : x)); execute(`🏆 IPO:${g.title}`, g.reward, "goal"); }}
                              className="text-[10px] bg-violet-950/30 border border-violet-800/40 text-violet-400 hover:bg-violet-900/30 hover:text-violet-300 px-3 py-1.5 rounded-lg font-semibold transition-all"
                            >🚀 List</button>
                            <button onClick={() => setGoals(p => p.filter(x => x.id !== g.id))} className="text-[#444] hover:text-red-500"><X size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {pending.length === 0 && (
                <div className="text-center py-8 text-[#444] text-sm">No pending goals — add one below 🚀</div>
              )}

              {/* Listed / achieved */}
              {listed.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-[#777] font-mono uppercase tracking-widest mb-3 px-1">✅ Listed · Achieved</p>
                  <div className="grid grid-cols-2 gap-2">
                    {listed.map(g => {
                      const col = SECTOR_COLORS[g.sector] || "#888";
                      const tk = g.title.replace(/[^a-zA-Z]/g,"").slice(0,4).toUpperCase() || "GOAL";
                      return (
                        <div key={g.id} className="bg-green-950/10 border border-green-900/20 rounded-2xl p-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold font-mono text-green-600">${tk}</span>
                            <button onClick={() => setGoals(p => p.filter(x => x.id !== g.id))} className="text-[#333] hover:text-red-500"><X size={10} /></button>
                          </div>
                          <p className="text-xs font-medium text-[#f0f0f0] leading-snug">{g.title}</p>
                          <p className="text-[9px] text-green-700 font-mono">+{g.reward}% earned ✓</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add new goal */}
              <Card>
                <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2"><Plus size={14} />File for IPO</h3>
                <div className="space-y-3">
                  <Input value={newGoal.title} onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))} placeholder="Goal title (company name)" className="w-full" />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newGoal.sector}
                      onChange={e => setNewGoal(p => ({ ...p, sector: e.target.value }))}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0f0f0] focus:outline-none focus:border-[#444]"
                    >
                      {SECTORS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                    </select>
                    <div className="relative">
                      <Input type="number" value={newGoal.reward} onChange={e => setNewGoal(p => ({ ...p, reward: parseFloat(e.target.value) || 0 }))} placeholder="% reward" className="w-full font-mono" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#555]">%</span>
                    </div>
                  </div>
                  <Btn onClick={() => { if (!newGoal.title.trim()) return; setGoals(p => [...p, { ...newGoal, id: genId(), achieved: false }]); setNewGoal({ title: "", sector: "academics", reward: 0 }); }} className="w-full">
                    <Target size={14} />File for IPO
                  </Btn>
                </div>
              </Card>
            </>
          );
        })()}

        {view === "phases" && (<>
          <div className="flex items-center gap-2 mb-1"><p className="text-xs text-[#888]">Life phases shape your historical chart curve.</p><InfoTooltip feature="phases" /></div>
          {phases.map(ph => (
            <div key={ph.id} className={`${C.card} border rounded-2xl p-5`} style={{ borderColor: ph.color + "20" }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ph.emoji}</span>
                  <div><p className="font-semibold text-[#f0f0f0]">{ph.name}</p><p className="text-xs text-[#999]">{ph.start}→{ph.end || "Ongoing"}</p></div>
                  <span className="text-xs px-2 py-0.5 rounded-lg" style={{ backgroundColor: ph.color + "15", color: ph.color }}>{TREND_OPTIONS.find(t => t.value === ph.trend)?.label?.split(" ").slice(1).join(" ") || "Flat"}</span>
                </div>
                <button onClick={() => setPhases(p => p.filter(x => x.id !== ph.id))} className="text-[#666] hover:text-red-600"><Trash2 size={14} /></button>
              </div>
              {ph.desc && <p className="text-sm text-[#888] leading-relaxed mt-3 border-t border-[#2a2a2a] pt-3">{ph.desc}</p>}
            </div>
          ))}
          {phases.length === 0 && <p className="text-[#4a4a4a] text-sm text-center py-10">No phases yet.</p>}
          <Card><p className="font-semibold text-[#f0f0f0] text-sm mb-4">Add Phase</p><PhaseForm onAdd={ph => setPhases(p => [...p, ph])} /></Card>
        </>)}

        {/* MORE */}
        {view === "more" && (<>
          <div className="flex gap-2 flex-wrap mb-2">
            {[["heatmap", "📅 Heatmap"], ["achievements", "🏆 Achievements"], ["capsule", "⏰ Capsule"]].map(([id, l]) => (
              <button key={id} onClick={() => setMoreTab(id)} className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${moreTab === id ? "bg-[#e8e8e8] text-[#080808] border-[#e8e8e8]" : "bg-[#141414] text-[#888] border-[#333] hover:border-[#333]"}`}>{l}</button>
            ))}
          </div>
          {moreTab === "heatmap" && (
            <Card>
              <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-white text-sm flex items-center gap-2"><Calendar size={16} className="text-[#999]" />Activity Heatmap {new Date().getFullYear()}</h2><InfoTooltip feature="heatmap" /></div>
              <Heatmap orderBook={orderBook} />
            </Card>
          )}
          {moreTab === "achievements" && (
            <Card>
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4"><Award size={16} className="text-[#999]" />Achievements</h2>
              <div className="grid grid-cols-2 gap-3">
                {ACHIEVEMENTS.map(a => { const unlocked = unlockedAch.includes(a.id); return (
                  <div key={a.id} className={`border rounded-xl p-4 transition-all ${unlocked ? "border-[#2a2a2a] bg-[#141414]" : "border-[#2a2a2a] bg-[#0a0a0a] opacity-40"}`}>
                    <div className="text-2xl mb-2">{unlocked ? a.icon : "🔒"}</div>
                    <p className="text-xs font-semibold text-[#f0f0f0]">{a.title}</p>
                    <p className="text-[10px] text-[#999] mt-1">{a.desc}</p>
                    {unlocked && <p className="text-[10px] text-green-700 mt-2">✓ Unlocked</p>}
                  </div>
                ); })}
              </div>
            </Card>
          )}
          {moreTab === "capsule" && (<>
            <Card>
              <div className="flex items-center gap-2 mb-4"><h2 className="font-semibold text-white text-sm flex items-center gap-2"><Moon size={16} className="text-[#999]" />Time Capsule</h2><InfoTooltip feature="capsule" /></div>
              <p className="text-xs text-[#999] mb-4">Write a message to your future self. Unlocks on the date you choose.</p>
              <div className="space-y-3">
                <Textarea value={capsule.message} onChange={e => setCapsule(p => ({ ...p, message: e.target.value }))} placeholder="Dear future me…" className="w-full h-28" />
                <Input type="date" min={today()} value={capsule.unlockDate} onChange={e => setCapsule(p => ({ ...p, unlockDate: e.target.value }))} className="w-full" />
                <Btn onClick={() => { if (!capsule.message.trim() || !capsule.unlockDate) return; setTimeCapsules(p => [...p, { ...capsule, id: genId(), createdDate: today(), opened: false }]); setCapsule({ message: "", unlockDate: "" }); }} disabled={!capsule.message.trim() || !capsule.unlockDate} className={`w-full ${!capsule.message.trim() || !capsule.unlockDate ? "opacity-30" : ""}`}><Moon size={15} />Seal Capsule</Btn>
              </div>
            </Card>
            {timeCapsules.map(c => (
              <div key={c.id} className={`border rounded-2xl p-4 ${c.opened ? "border-[#2a2a2a] opacity-40" : "border-[#333]"} bg-[#0a0a0a]`}>
                <div className="flex justify-between items-start">
                  <div><p className="text-xs text-[#888]">Unlocks: {c.unlockDate}</p><p className="text-xs text-[#4a4a4a]">Written: {c.createdDate}</p></div>
                  <button onClick={() => setTimeCapsules(p => p.filter(x => x.id !== c.id))} className="text-[#666] hover:text-red-600"><X size={13} /></button>
                </div>
                {(c.opened || c.unlockDate <= today()) ? <p className="text-sm text-[#888] mt-3 leading-relaxed">{c.message}</p> : <p className="text-xs text-[#666] mt-3">🔒 Sealed until {c.unlockDate}</p>}
              </div>
            ))}
          </>)}

        </>)}

        {/* SETTINGS */}
        {/* CHANGELOG */}
        {view === "changelog" && (
          <div className="-mx-4 -mt-2">
            <style>{`
              @keyframes dither-pan {
                0%   { background-position: 0 0; }
                100% { background-position: 72px 72px; }
              }
              @keyframes dither-pan2 {
                0%   { background-position: 0 0; }
                100% { background-position: -48px 48px; }
              }
            `}</style>
            {/* ── Hero header — animated dithered dot gradient ── */}
            <div className="relative overflow-hidden" style={{height:"200px"}}>
              {/* base gradient: deep blue → cyan */}
              <div className="absolute inset-0" style={{background:"linear-gradient(135deg,#0a0a1a 0%,#001a3a 30%,#003a6a 60%,#0077aa 100%)"}} />
              {/* animated dither — two offset dot layers moving in opposite directions */}
              <div className="absolute inset-0 opacity-55" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Ccircle cx='3' cy='3' r='1.1' fill='%2300bbff' opacity='0.6'/%3E%3C/svg%3E")`, backgroundSize:"6px 6px", animation:"dither-pan 4s linear infinite"}} />
              <div className="absolute inset-0 opacity-30" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Ccircle cx='5' cy='5' r='1.4' fill='%2300eeff' opacity='0.5'/%3E%3C/svg%3E")`, backgroundSize:"10px 10px", animation:"dither-pan2 7s linear infinite"}} />
              {/* fade bottom to black */}
              <div className="absolute inset-0" style={{background:"linear-gradient(to bottom, transparent 30%, #0d0d0d 100%)"}} />
              <div className="relative px-5 pt-8 pb-0">
                <div className="flex items-center gap-2 mb-3">
                  <GitMerge size={13} className="text-white opacity-70" />
                  <span className="text-[11px] font-medium text-white opacity-70 tracking-wide">Changelog</span>
                </div>
                <h1 className="text-2xl font-bold text-white leading-snug">
                  Latest Enhancements<br />&amp; Platform News
                </h1>
              </div>
            </div>

            {/* ── Release list ── */}
            <div className="px-4 space-y-0">
              {CHANGELOG.map((release, ri) => {
                // gradient colours per release so each card looks distinct
                const cardGrads = [
                  "linear-gradient(135deg,#0f0f1a 0%,#141414 100%)",
                  "linear-gradient(135deg,#0a0f0a 0%,#141414 100%)",
                  "linear-gradient(135deg,#1a0f00 0%,#141414 100%)",
                  "linear-gradient(135deg,#0a0a1a 0%,#141414 100%)",
                  "linear-gradient(135deg,#1a001a 0%,#141414 100%)",
                  "linear-gradient(135deg,#001a0f 0%,#141414 100%)",
                ];
                const grad = cardGrads[ri % cardGrads.length];
                return (
                  <div key={release.version} className="py-10 border-b border-[#1a1a1a] last:border-0">
                    {/* date + meta */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-medium text-[#888]">{release.date}</span>
                      <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                        release.tag === "major" ? "border-violet-800/40 text-violet-400 bg-violet-950/30" :
                        release.tag === "fix"   ? "border-orange-800/40 text-orange-400 bg-orange-950/30" :
                                                  "border-blue-800/40 text-blue-400 bg-blue-950/30"
                      }`}>{release.version}</span>
                    </div>

                    {/* big title */}
                    <h2 className="text-2xl font-semibold text-white mb-4 leading-snug">{release.title}</h2>

                    {/* dark image card */}
                    <div className="relative rounded-2xl overflow-hidden mb-5 border border-[#222]" style={{height:"160px", background: grad}}>
                      {/* dot dither layer */}
                      <div className="absolute inset-0 opacity-20" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Ccircle cx='2.5' cy='2.5' r='0.8' fill='%23ffffff'/%3E%3C/svg%3E")`, backgroundSize:"5px 5px"}} />
                      {/* centered version label */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[#555] text-lg font-bold font-mono tracking-widest">{release.version}: {release.title}</span>
                      </div>
                      {/* bottom fade */}
                      <div className="absolute bottom-0 left-0 right-0 h-12" style={{background:"linear-gradient(to top, rgba(13,13,13,0.7), transparent)"}} />
                    </div>

                    {/* changes list */}
                    <div className="space-y-2.5">
                      {release.changes.map((c, ci) => (
                        <div key={ci} className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex-shrink-0 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                            c.type === "fix"     ? "bg-orange-950/40 text-orange-400 border-orange-900/30" :
                            c.type === "feature" ? "bg-green-950/40 text-green-400 border-green-900/30" :
                                                   "bg-blue-950/40 text-blue-400 border-blue-900/30"
                          }`}>{c.type === "fix" ? "FIX" : "NEW"}</span>
                          <p className="text-sm text-[#bbb] leading-relaxed">{c.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="py-6 text-center">
                <p className="text-[10px] text-[#555] font-mono">entropyzero · {new Date().getFullYear()}</p>
              </div>
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="space-y-4">
            {/* Google Account Card */}
            {user && (
              <Card>
                <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google Account
                </h2>
                <div className="flex items-center gap-3 mb-4">
                  {user.photoURL
                    ? <img src={user.photoURL} className="w-10 h-10 rounded-full border border-[#333]" alt="avatar" />
                    : <div className="w-10 h-10 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-base">{user.displayName?.[0] || "?"}</div>
                  }
                  <div>
                    <p className="text-sm font-semibold text-white">{user.displayName || "—"}</p>
                    <p className="text-xs text-[#999]">{user.email}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-[#2a2a2a]">
                  <span className="text-xs text-[#888]">Cloud sync</span>
                  <span className={`text-xs flex items-center gap-1.5 font-mono ${saving ? "text-yellow-500" : "text-green-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${saving ? "bg-yellow-500 animate-pulse" : "bg-green-500"}`} />
                    {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}` : "Live"}
                  </span>
                </div>
              </Card>
            )}
            <Card>
              <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2"><Settings size={15} className="text-[#999]" />Profile</h2>
              {[["Name", config.name], ["Ticker", `$${ticker}`], ["Country", config.country], ["Currency", `${curr}·${CURRENCIES[config.country]?.code}`], ["IPO Price", `${curr}${fmt(config.startPrice)}`], ["Date of Birth", config.dob || "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-3 border-b border-[#2a2a2a] last:border-0">
                  <span className="text-sm text-[#999]">{k}</span><span className="text-sm text-[#f0f0f0]">{v}</span>
                </div>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold text-white text-sm mb-1 flex items-center gap-2"><Download size={15} className="text-[#999]" />Backup & Restore</h2>
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a] mb-3">
                <span className="text-xs text-[#888]">Last cloud save</span>
                <span className="text-xs font-mono text-[#888]">
                  {lastSaved ? lastSaved.toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : saving ? "Saving…" : "Not yet saved"}
                </span>
              </div>
              <div className="flex gap-2">
                <Btn variant="ghost" className="flex-1" onClick={exportData}><Download size={15} />Export JSON</Btn>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:bg-[#111] hover:text-white`}>
                  <Upload size={15} />Import JSON
                  <input type="file" accept=".json" className="hidden" onChange={e => {
                    const f = e.target.files[0]; if (!f) return;
                    const r = new FileReader();
                    r.onload = async ev => {
                      try {
                        const d = JSON.parse(ev.target.result);
                        if (!d.config) { alert("❌ Invalid backup file."); return; }
                        const payload = {
                          config: d.config,
                          chartData: d.chartData || null,
                          orderBook: d.orderBook || null,
                          habits: d.habits || null,
                          phases: d.phases || null,
                          skills: d.skills || null,
                          weaknesses: d.weaknesses || null,
                          pressReleases: d.pressReleases || null,
                          moodLog: d.moodLog || null,
                          goals: d.goals || null,
                          timeCapsules: d.timeCapsules || null,
                        };
                        await saveAllData(uid, payload);
                        alert("✅ Data imported! Reloading…");
                        window.location.reload();
                      } catch(err) { alert("❌ Could not read file: " + err.message); }
                      e.target.value = "";
                    };
                    r.readAsText(f);
                  }} />
                </label>
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <span className="text-base">🔌</span> Portfolio Widget
              </h2>
              <p className="text-xs text-[#888] mb-4 leading-relaxed">
                Embed your live life index chart on any website — your portfolio, Notion, GitHub profile, anywhere.
                Your name, ticker, chart and stats are made publicly readable when enabled.
              </p>

              {/* Toggle */}
              <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                <div>
                  <p className="text-sm text-[#f0f0f0] font-medium">Enable public widget</p>
                  <p className="text-xs text-[#888] mt-0.5">{widgetEnabled ? "Syncing real chart data publicly" : "Widget is private"}</p>
                </div>
                <button
                  onClick={async () => {
                    setWidgetLoading(true);
                    setWidgetSyncStatus(null);
                    try {
                      if (widgetEnabled) {
                        await unpublishPublicWidget(uid);
                        setWidgetEnabled(false);
                        setWidgetSyncStatus(null);
                      } else {
                        const wdata = {
                          name: config.name,
                          ticker,
                          currency: CURRENCIES[config.country]?.code || "USD",
                          startPrice: config.startPrice,
                          currentPrice: chartData[chartData.length-1]?.value || config.startPrice,
                          allTime,
                          streak,
                          chartData: chartData.map(d => ({ date: d.date, value: parseFloat(d.value) })),
                          lastUpdated: Date.now(),
                        };
                        await publishPublicWidget(uid, wdata);
                        // Verify the write actually landed by reading it back
                        const snap = await getDoc(doc(db, "public", uid));
                        if (!snap.exists()) throw new Error("Write succeeded but doc not found — check Firestore rules.");
                        const saved = snap.data();
                        if (!saved.chartData || saved.chartData.length === 0) throw new Error("Chart data missing in Firestore doc.");
                        setWidgetEnabled(true);
                        setWidgetSyncStatus('ok');
                        setWidgetSyncMsg(`✓ ${saved.chartData.length} data points synced`);
                      }
                    } catch(e) {
                      setWidgetSyncStatus('error');
                      setWidgetSyncMsg(e?.message || "Unknown error");
                      if (e?.message?.includes('permission') || e?.code === 'permission-denied') {
                        setWidgetSyncMsg("Permission denied — Firestore rule not set. See instructions above.");
                      }
                    }
                    setWidgetLoading(false);
                  }}
                  disabled={widgetLoading}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${widgetEnabled ? "bg-green-600" : "bg-[#222]"} disabled:opacity-50`}
                >
                  {widgetLoading
                    ? <span className="absolute inset-0 flex items-center justify-center"><span className="w-3 h-3 border border-[#555] border-t-white rounded-full animate-spin" /></span>
                    : <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${widgetEnabled ? "translate-x-6" : "translate-x-0"}`} />
                  }
                </button>
              </div>

              {/* Sync status */}
              {widgetSyncStatus === 'ok' && (
                <div className="flex items-center gap-2 bg-green-950/20 border border-green-900/30 rounded-xl px-3 py-2 mb-3">
                  <span className="text-green-500 text-xs">✓</span>
                  <p className="text-xs text-green-600">{widgetSyncMsg || "Widget synced successfully"}</p>
                </div>
              )}
              {widgetSyncStatus === 'error' && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-xl px-3 py-2 mb-3">
                  <p className="text-xs text-red-500 font-medium mb-0.5">Sync failed</p>
                  <p className="text-[10px] text-red-900">{widgetSyncMsg}</p>
                </div>
              )}

              {/* Force resync button when enabled */}
              {widgetEnabled && (
                <button
                  onClick={async () => {
                    setWidgetLoading(true);
                    setWidgetSyncStatus(null);
                    try {
                      const wdata = {
                        name: config.name, ticker,
                        currency: CURRENCIES[config.country]?.code || "USD",
                        startPrice: config.startPrice,
                        currentPrice: chartData[chartData.length-1]?.value || config.startPrice,
                        allTime, streak,
                        chartData: chartData.map(d => ({ date: d.date, value: parseFloat(d.value) })),
                        lastUpdated: Date.now(),
                      };
                      await publishPublicWidget(uid, wdata);
                      const snap = await getDoc(doc(db, "public", uid));
                      if (!snap.exists()) throw new Error("Doc not found after write");
                      const pts = snap.data().chartData?.length || 0;
                      setWidgetSyncStatus('ok');
                      setWidgetSyncMsg(`✓ ${pts} data points synced to widget`);
                    } catch(e) {
                      setWidgetSyncStatus('error');
                      setWidgetSyncMsg(e?.message?.includes('permission') ? "Permission denied — widget cannot read data. Contact support." : (e?.message || "Sync failed"));
                    }
                    setWidgetLoading(false);
                  }}
                  disabled={widgetLoading}
                  className="w-full text-xs text-[#888] border border-[#2a2a2a] rounded-xl py-2 hover:text-[#bbb] hover:border-[#333] transition-all mb-3 disabled:opacity-40"
                >
                  {widgetLoading ? "Syncing…" : "↻ Force resync chart data"}
                </button>
              )}

              {widgetEnabled && (
                <div className="space-y-3">
                  {/* Embed codes */}
                  {[
                    {
                      label: "iframe embed",
                      desc: "Paste into any HTML file or website builder",
                      code: `<iframe src="https://entropyzero.vercel.app/widget.html?uid=${uid}" width="480" height="280" frameborder="0" style="border-radius:20px;border:1px solid #2a2a2a;background:#0d0d0d"></iframe>`,
                    },
                    {
                      label: "Widget URL",
                      desc: "Direct link to share or open in browser",
                      code: `https://entropyzero.vercel.app/widget.html?uid=${uid}`,
                    },
                  ].map(({ label, desc, code }) => (
                    <div key={label} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-[#bbb]">{label}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(code);
                            setWidgetCopied(label);
                            setTimeout(() => setWidgetCopied(""), 2000);
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#999] hover:text-white hover:border-[#444] transition-all"
                        >
                          {widgetCopied === label ? "✓ Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[10px] text-[#777] mb-2">{desc}</p>
                      <code className="text-[9px] text-[#777] break-all leading-relaxed block font-mono">{code}</code>
                    </div>
                  ))}

                  <a
                    href={`https://entropyzero.vercel.app/widget.html?uid=${uid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full text-xs text-[#888] border border-[#2a2a2a] rounded-xl py-2.5 hover:text-white hover:border-[#444] transition-all"
                  >↗ Open live widget preview</a>

                  <p className="text-[10px] text-[#777] leading-relaxed">
                    ⚠️ Widget data updates every time you save. Toggle off to remove public access instantly.
                  </p>
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                <span className="text-base">🕸️</span> Interest Web Embed
              </h2>
              <p className="text-xs text-[#888] mb-4 leading-relaxed">
                Share your live interest network as an embeddable bento card. Updates automatically as you add videos.
              </p>

              <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                <div>
                  <p className="text-sm text-[#f0f0f0] font-medium">Enable public interest web</p>
                  <p className="text-xs text-[#888] mt-0.5">{interestEnabled ? "Publicly embeddable" : "Private"}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const ref = doc(db, "public", uid);
                      const topicsNow = [...new Set(interests.flatMap(i => i.topics))];
                      const edgesNow = (() => {
                        const es = new Set(), arr = [];
                        interests.forEach(it => {
                          for (let a = 0; a < it.topics.length; a++) for (let b = a+1; b < it.topics.length; b++) {
                            const k = [it.topics[a],it.topics[b]].sort().join("|||");
                            if (!es.has(k)) { es.add(k); arr.push([it.topics[a],it.topics[b]]); }
                          }
                        });
                        return arr;
                      })();
                      if (!interestEnabled) {
                        await setDoc(ref, { interestTopics: topicsNow, interestEdges: edgesNow, interestName: config.name, name: config.name, lastUpdated: Date.now() }, { merge: true });
                        const snap = await getDoc(ref);
                        if (!snap.exists() || !snap.data().interestTopics?.length) throw new Error("Write failed — check Firestore rules");
                        setInterestEnabled(true);
                      } else {
                        await updateDoc(ref, { interestTopics: deleteField(), interestEdges: deleteField(), interestName: deleteField() });
                        setInterestEnabled(false);
                      }
                    } catch(e) {
                      const isPerm = e.code==="permission-denied"||(e.message||"").includes("permission")||(e.message||"").includes("failed");
                      alert(isPerm ? "Permission denied — add Firestore rule:\n\nmatch /public/{userId} {\n  allow read: if true;\n  allow write: if request.auth.uid == userId;\n}" : "Error: "+e.message);
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-all ${interestEnabled ? "bg-violet-600" : "bg-[#222]"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${interestEnabled ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>

              {interestEnabled && interests.length > 1 && (
                <div className="space-y-3">
                  {[
                    { label: "iframe embed", desc: "Paste anywhere — Notion, GitHub, websites", code: `<iframe src="https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}" width="480" height="360" frameborder="0" style="border-radius:20px;border:1px solid #2a2a2a;background:#050505"></iframe>` },
                    { label: "Canvas URL",   desc: "Direct shareable link",                    code: `https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}` },
                  ].map(({ label, desc, code }) => (
                    <div key={label} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-[#bbb]">{label}</p>
                        <button onClick={() => { navigator.clipboard.writeText(code); setInterestCopied(label+"s"); setTimeout(()=>setInterestCopied(""),2000); }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#999] hover:text-white hover:border-[#444] transition-all">
                          {interestCopied===label+"s" ? "✓ Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[10px] text-[#777] mb-2">{desc}</p>
                      <code className="text-[9px] text-[#777] break-all leading-relaxed block font-mono">{code}</code>
                    </div>
                  ))}
                  <a href={`https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full text-xs text-[#888] border border-[#2a2a2a] rounded-xl py-2.5 hover:text-white hover:border-[#444] transition-all">
                    ↗ Open live preview
                  </a>
                </div>
              )}
              {interestEnabled && interests.length <= 1 && (
                <p className="text-xs text-[#666] text-center py-2">Add at least 2 videos in Interests tab first</p>
              )}
            </Card>

            {/* ── Interest Bento (Settings copy) ── */}
            <Card>
              <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-1">
                <span className="text-base">🕸️</span> Interest Web Card
              </h2>
              <p className="text-xs text-[#888] mb-4 leading-relaxed">Share your live interest graph as an embeddable bento card — separate from the chart widget.</p>
              <div className="flex items-center justify-between bg-[#141414] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3">
                <div>
                  <p className="text-sm text-[#f0f0f0] font-medium">Enable public interest web</p>
                  <p className="text-xs text-[#888] mt-0.5">{interestEnabled ? "Publicly viewable" : "Private"}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const topicsNow = [...new Set(interests.flatMap(i => i?.topics||[]))];
                      const edgesNow  = buildEdgeMaps(interests);
                      if (!interestEnabled) {
                        await setDoc(doc(db,"public",uid),{ interestTopics:topicsNow, interestEdges:edgesNow, interestName:config.name, lastUpdated:Date.now() },{ merge:true });
                        setInterestEnabled(true);
                      } else {
                        const snap = await getDoc(doc(db,"public",uid));
                        if (snap.exists()) {
                          const d={...snap.data()}; delete d.interestTopics; delete d.interestEdges; delete d.interestName;
                          await setDoc(doc(db,"public",uid), d);
                        }
                        setInterestEnabled(false);
                      }
                    } catch(e){ alert("Error: "+e.message); }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${interestEnabled ? "bg-violet-600" : "bg-[#222]"}`}
                ><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${interestEnabled ? "translate-x-6" : "translate-x-0"}`} /></button>
              </div>
              {interestEnabled && interests.length > 1 && (
                <div className="space-y-3">
                  {[
                    { label:"iframe embed", desc:"Paste into any website", code:`<iframe src="https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}" width="480" height="360" frameborder="0" style="border-radius:20px;border:1px solid #2a2a2a;background:#050505"></iframe>` },
                    { label:"Canvas URL", desc:"Direct shareable link", code:`https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}` },
                  ].map(({ label, desc, code }) => (
                    <div key={label} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-[#bbb]">{label}</p>
                        <button onClick={() => { navigator.clipboard.writeText(code); setInterestCopied(label+"s"); setTimeout(()=>setInterestCopied(""),2000); }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#999] hover:text-white hover:border-[#444] transition-all">
                          {interestCopied === label+"s" ? "✓ Copied!" : "Copy"}</button>
                      </div>
                      <p className="text-[10px] text-[#777] mb-2">{desc}</p>
                      <code className="text-[9px] text-[#777] break-all leading-relaxed block font-mono">{code}</code>
                    </div>
                  ))}
                  <a href={`https://entropyzero.vercel.app/interest-canvas.html?uid=${uid}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full text-xs text-[#888] border border-[#2a2a2a] rounded-xl py-2 hover:text-white hover:border-[#444] transition-all">
                    ↗ Open live preview
                  </a>
                </div>
              )}
              {interests.length <= 1 && <p className="text-xs text-[#555] text-center py-1">Add at least 2 videos in Interests tab first</p>}
            </Card>

            <Card>
              <h2 className="font-semibold text-white text-sm mb-1 flex items-center gap-2"><AlertTriangle size={15} className="text-red-900" />Danger Zone</h2>
              <p className="text-xs text-[#999] mb-4">Permanently delete all data and restart.</p>
              <Btn variant="ghost" className="w-full mb-2" onClick={() => {
                if (window.confirm("Sign out of Google? You'll need to sign in again to access your data.")) {
                  signOut(auth);
                }
              }}>Sign Out of Google</Btn>
              <Btn variant="danger" className="w-full" onClick={() => {
                if (window.confirm("Reset ALL data? This cannot be undone.")) { onReset(); }
              }}><Trash2 size={15} />Reset Everything</Btn>
            </Card>
          </div>
        )}
      </div>
      <BuilderCard />
    </div>
  );
};

// ── Welcome Splash ───────────────────────────────────────────────────────────
const WelcomeSplash = ({ name }) => {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "It's the dead of night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "It's midnight";
  const emoji = hour < 5 ? "🌑" : hour < 12 ? "🌅" : hour < 17 ? "☀️" : hour < 21 ? "🌆" : "🌙";
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-5xl mb-6 animate-pulse">{emoji}</div>
        <p className="text-[#888] text-sm mb-2 tracking-widest uppercase">{greeting}</p>
        <h1 className="text-4xl font-semibold text-white tracking-tight">{name}</h1>
        <div className="mt-8 flex justify-center gap-1">
          {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#333] animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
        </div>
      </div>
    </div>
  );
};

// ── Login Screen ─────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin, loading }) => (
  <div className="min-h-screen bg-[#080808] flex items-center justify-center px-6">
    <div className="w-full max-w-sm text-center">
      <div className="w-14 h-14 bg-[#161616] border border-[#333] rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl">📈</div>
      <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">entropyzero</h1>
      <p className="text-[#888] text-sm mb-10">Your life, quantified.</p>
      <button
        onClick={onLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-[#161616] border border-[#333] hover:border-[#333] text-[#f0f0f0] hover:text-white rounded-2xl px-6 py-4 text-sm font-medium transition-all disabled:opacity-50"
      >
        {loading ? (
          <span className="animate-pulse">Signing in…</span>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </>
        )}
      </button>
      <p className="text-[#4a4a4a] text-xs mt-6">Your data is saved to your Google account across all devices.</p>
    </div>
  </div>
);

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading");
  const [config, setConfig]     = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [key, setKey]           = useState(0);
  const [importing, setImporting] = useState(false);
  const [user, setUser]         = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [splashName, setSplashName] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          setLoginLoading(false);
          const data = await loadAllData(firebaseUser.uid);
          if (data && data.config) {
            setConfig(data.config);
            setInitialData(data);
            setSplashName(data.config.name);
            setShowSplash(true);
            setTimeout(() => { setShowSplash(false); setAppState("dashboard"); }, 1500);
          } else {
            setAppState("welcome");
          }
        } else {
          setUser(null);
          setLoginLoading(false);
          setAppState("welcome");
        }
      } catch(e) {
        console.error("Auth error:", e);
        setLoginLoading(false);
        setAppState("welcome");
      }
    });

    return () => unsub();
  }, []);

  const handleGoogleLogin = () => {
    setLoginLoading(true);
    signInWithPopup(auth, googleProvider)
      .then(() => {
        // onAuthStateChanged will fire and handle navigation
      })
      .catch((e) => {
        console.error("Login error:", e.code, e.message);
        setLoginLoading(false);
      });
  };

  const handleComplete = async (profile) => {
    setConfig(profile);
    await saveAllData(user.uid, { config: profile });
    setSplashName(profile.name);
    setShowSplash(true);
    setTimeout(() => { setShowSplash(false); setAppState("dashboard"); }, 1500);
  };

  const handleReset = async () => {
    await saveAllData(user.uid, null);
    setConfig(null);
    setInitialData(null);
    setKey(k => k + 1);
    setAppState("welcome");
  };

  if (appState === "loading") {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">📈</div>
          <p className="text-[#999] text-sm mb-1">entropyzero</p>
          <p className="text-[#666] text-xs">{loginLoading ? "Signing in with Google…" : "Checking session…"}</p>
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
        await saveAllData(user?.uid, importPayload);
        setConfig(cfg);
        setInitialData(importPayload);
        setKey(k => k + 1);
        setAppState("dashboard");
      } catch (err) { alert("❌ Could not read file."); console.error(err); }
      setImporting(false);
    };
    r.readAsText(f); e.target.value = "";
  };

  if (showSplash) return <WelcomeSplash name={splashName} />;

  if (appState === "welcome") return <WelcomeScreen onContinue={() => setAppState("onboarding")} onGoogleLogin={handleGoogleLogin} loginLoading={loginLoading} />;

  if (appState === "onboarding") return (
    <>
      <Onboarding key={key} onComplete={handleComplete} />
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 px-6">
        <div className="bg-[#161616] border border-[#333] rounded-2xl px-5 py-4 flex flex-col items-center gap-3 shadow-2xl w-full max-w-sm">
          <p className="text-xs text-[#888] text-center">Already have a backup? Skip onboarding.</p>
          <label className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] text-[#bbb] hover:text-[#f0f0f0] hover:border-[#333] text-sm font-medium transition-all cursor-pointer ${importing ? "opacity-50 cursor-wait" : ""}`}>
            <Upload size={16} />{importing ? "Importing…" : "Import & Restore Backup"}
            <input type="file" accept=".json" className="hidden" onChange={handleDirectImport} disabled={importing} />
          </label>
        </div>
      </div>
    </>
  );

  return <Dashboard key={config.name + key} config={config} onReset={handleReset} initialData={initialData} uid={user?.uid} user={user} />;
}
