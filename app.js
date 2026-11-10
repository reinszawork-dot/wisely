/* Wisely — a private, offline budgeting app. */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const KEY = 'wisely.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dstr(new Date());
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const curYM = () => today().slice(0, 7);
  const addMonths = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  /* Pay-cycle "months". A period is named by the month it ends in: with payday on the 25th,
     period "2026-11" runs 25 Oct – 24 Nov. Payday 1 means plain calendar months. */
  const payday = () => clamp(+(S && S.settings && S.settings.payday) || 1, 1, 28);
  const pStart = (ym) => { const pd = payday(); if (pd === 1) return `${ym}-01`; const pm = addMonths(ym, -1); return `${pm}-${pad(Math.min(pd, daysIn(pm)))}`; };
  const pEnd = (ym) => { const d = parseD(pStart(addMonths(ym, 1))); d.setDate(d.getDate() - 1); return dstr(d); };
  const dayIdx = (ym, date) => Math.round((parseD(date) - parseD(pStart(ym))) / 864e5);
  const pDays = (ym) => dayIdx(ym, pEnd(ym)) + 1;
  const periodOf = (date) => { const ym = date.slice(0, 7); const pd = payday(); return pd > 1 && +date.slice(8) >= Math.min(pd, daysIn(ym)) ? addMonths(ym, 1) : ym; };
  const curP = () => periodOf(today());
  const elapsed = (ym) => (ym === curP() ? dayIdx(ym, today()) + 1 : pDays(ym));
  const shortD = (d) => parseD(d).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short' });
  const pLabel = (ym) => (payday() === 1 ? monthLabel(ym) : `${shortD(pStart(ym))} – ${shortD(pEnd(ym))}`);
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const monthLabel = (ym, len = 'long', year = true) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString(document.documentElement.lang || undefined, { month: len, ...(year ? { year: 'numeric' } : {}) }); };
  const r2 = (n) => Math.round(n * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function addFreq(s, f) {
    const d = parseD(s);
    if (f === 'weekly') d.setDate(d.getDate() + 7);
    else if (f === 'biweekly') d.setDate(d.getDate() + 14);
    else if (f === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else {
      const day = d.getDate();
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
    return dstr(d);
  }
  const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' };
  const perMonth = (amt, f) => f === 'weekly' ? (amt * 52) / 12 : f === 'biweekly' ? (amt * 26) / 12 : f === 'yearly' ? amt / 12 : amt;

  const COLORS = ['#7c5cff', '#22c3a6', '#ff8a3d', '#3d8bff', '#ff5c8a', '#f5c542', '#a066ff', '#00b4d8', '#ef476f', '#2fd480', '#ffa62b', '#8d99ae', '#e76f51', '#4cc9f0'];
  const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CNY', 'INR', 'PHP', 'SGD', 'HKD', 'KRW', 'MXN', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK', 'AED', 'SAR', 'IDR', 'MYR', 'THB', 'VND', 'NGN', 'KES', 'PLN', 'TRY'];

  /* ---------- state ---------- */
  function defaults() {
    const c = (id, name, icon, color, kind) => ({ id, name, icon, color, kind });
    return {
      version: 1,
      settings: { name: '', currency: 'ZAR', currencySet: false, payday: 25, theme: 'auto', lock: null, transferCats: true },
      accounts: [
        { id: 'acc_checking', name: 'Cheque account', type: 'bank', color: COLORS[3], opening: 0 },
        { id: 'acc_cash', name: 'Cash', type: 'cash', color: COLORS[9], opening: 0 },
        { id: 'acc_savings', name: 'Savings', type: 'savings', color: COLORS[1], opening: 0 },
        { id: 'acc_card', name: 'Credit card', type: 'credit', color: COLORS[4], opening: 0 },
      ],
      categories: [
        c('groceries', 'Groceries', 'cart', COLORS[1], 'expense'),
        c('dining', 'Dining', 'utensils', COLORS[2], 'expense'),
        c('transport', 'Transport', 'car', COLORS[3], 'expense'),
        c('housing', 'Housing', 'home', COLORS[0], 'expense'),
        c('utilities', 'Utilities', 'zap', COLORS[5], 'expense'),
        c('shopping', 'Shopping', 'bag', COLORS[4], 'expense'),
        c('health', 'Health', 'heart', COLORS[9], 'expense'),
        c('fun', 'Entertainment', 'film', COLORS[6], 'expense'),
        c('subs', 'Subscriptions', 'tv', COLORS[7], 'expense'),
        c('travel', 'Travel', 'plane', COLORS[13], 'expense'),
        c('education', 'Education', 'grad', COLORS[10], 'expense'),
        c('gifts', 'Gifts', 'gift', COLORS[8], 'expense'),
        c('fees', 'Bank fees', 'landmark', COLORS[12], 'expense'),
        c('other', 'Other', 'box', COLORS[11], 'expense'),
        c('salary', 'Salary', 'briefcase', COLORS[9], 'income'),
        c('freelance', 'Freelance', 'laptop', COLORS[0], 'income'),
        c('invest', 'Investments', 'trendUp', COLORS[3], 'income'),
        c('other_in', 'Other income', 'coins', COLORS[5], 'income'),
        c('tr_savings', 'Savings', 'piggy', COLORS[1], 'transfer'),
        c('tr_card', 'Card payment', 'card', COLORS[4], 'transfer'),
        c('tr_cash', 'Cash withdrawal', 'banknote', COLORS[9], 'transfer'),
        c('tr_invest', 'Investing', 'trendUp', COLORS[3], 'transfer'),
        c('tr_between', 'Between accounts', 'arrows', COLORS[0], 'transfer'),
      ],
      txns: [], budgets: {}, recurring: [], goals: [], debts: [],
    };
  }

  let S;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        S = Object.assign(defaults(), JSON.parse(raw));
        // Default to rand unless the user picked a currency themselves.
        if (!S.settings.currencySet) S.settings.currency = 'ZAR';
        if (!S.settings.payday) S.settings.payday = 25;
        if (!S.categories.some((c) => c.id === 'fees')) {
          const at = S.categories.findIndex((c) => c.id === 'other');
          S.categories.splice(at < 0 ? S.categories.length : at, 0, { id: 'fees', name: 'Bank fees', icon: 'landmark', color: COLORS[12], kind: 'expense' });
        }
        migrate();
        save();
        return true;
      }
    } catch (e) { /* fall through */ }
    S = defaults();
    return false;
  }
  const TRANSFER_DEFAULTS = [
    { id: 'tr_savings', name: 'Savings', icon: 'piggy', color: COLORS[1], kind: 'transfer' },
    { id: 'tr_card', name: 'Card payment', icon: 'card', color: COLORS[4], kind: 'transfer' },
    { id: 'tr_cash', name: 'Cash withdrawal', icon: 'banknote', color: COLORS[9], kind: 'transfer' },
    { id: 'tr_invest', name: 'Investing', icon: 'trendUp', color: COLORS[3], kind: 'transfer' },
    { id: 'tr_between', name: 'Between accounts', icon: 'arrows', color: COLORS[0], kind: 'transfer' },
  ];
  /** Pick a sensible transfer category from where the money is going. */
  function transferCatFor(toId) {
    const type = (S.accounts.find((a) => a.id === toId) || {}).type;
    const id = { savings: 'tr_savings', credit: 'tr_card', cash: 'tr_cash', invest: 'tr_invest' }[type] || 'tr_between';
    const exists = (x) => S.categories.some((c) => c.id === x && c.kind === 'transfer');
    return exists(id) ? id : exists('tr_between') ? 'tr_between' : (S.categories.find((c) => c.kind === 'transfer') || {}).id || null;
  }
  /** Bring older saved data up to date. Only fills gaps — never removes transactions or history. */
  function migrate() {
    S.categories.forEach((c) => { if (!CI[c.icon]) c.icon = EMOJI_ICON[c.icon] || DEFAULT_ICON[c.id] || 'tag'; });
    if (!S.settings.transferCats) {
      TRANSFER_DEFAULTS.forEach((t) => { if (!S.categories.some((c) => c.id === t.id)) S.categories.push({ ...t }); });
      S.settings.transferCats = true;
    }
    const isTransferCat = (id) => S.categories.some((c) => c.id === id && c.kind === 'transfer');
    S.txns.forEach((t) => { if (t.type === 'transfer' && !isTransferCat(t.categoryId)) t.categoryId = transferCatFor(t.toAccountId); });
    S.recurring.forEach((r) => { if (r.type === 'transfer' && !isTransferCat(r.categoryId)) r.categoryId = transferCatFor(r.toAccountId); });
    S.goals.forEach((g) => { if (!CI[g.icon]) g.icon = EMOJI_ICON[g.icon] || 'target'; });
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save — browser storage may be full.'); }
  }

  const UI = { month: curYM(), reportMonth: curYM(), range: 6, trendCat: null, filter: { q: '', type: 'all', cat: '', month: '' }, limit: 120 };

  /* ---------- money ---------- */
  let nf, nfWhole, nfCompact;
  function setupFormatters() {
    const cur = S.settings.currency || 'ZAR';
    const loc = cur === 'ZAR' ? 'en-ZA' : undefined;
    document.documentElement.lang = loc || 'en';
    try {
      nf = new Intl.NumberFormat(loc, { style: 'currency', currency: cur });
      nfWhole = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 0 });
      nfCompact = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 });
    } catch (e) {
      S.settings.currency = 'ZAR'; return setupFormatters();
    }
  }
  const fmt = (n) => nf.format(n || 0);
  const fmtW = (n) => nfWhole.format(n || 0);
  const fmtC = (n) => Math.abs(n) < 1000 ? nfWhole.format(n) : nfCompact.format(n);
  const curSymbol = () => (nf.formatToParts(0).find((p) => p.type === 'currency') || {}).value || 'R';

  /* ---------- lookups & math ---------- */
  const cat = (id) => S.categories.find((c) => c.id === id);
  const acct = (id) => S.accounts.find((a) => a.id === id);
  const catsOf = (kind) => S.categories.filter((c) => c.kind === kind);
  const parts = (t) => (t.splits && t.splits.length ? t.splits : [{ categoryId: t.categoryId, amount: t.amount }]);
  const monthTx = (ym) => { const a = pStart(ym), b = pEnd(ym); return S.txns.filter((t) => t.date >= a && t.date <= b); };

  function totals(ym) {
    let inc = 0, exp = 0;
    for (const t of monthTx(ym)) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; }
    return { inc, exp, net: inc - exp };
  }
  function catTotals(ym, kind = 'expense') {
    const m = {};
    for (const t of monthTx(ym)) if (t.type === kind) for (const p of parts(t)) m[p.categoryId] = (m[p.categoryId] || 0) + p.amount;
    return m;
  }
  function dailySpend(ym) {
    const arr = new Array(pDays(ym)).fill(0);
    for (const t of monthTx(ym)) if (t.type === 'expense') arr[dayIdx(ym, t.date)] += t.amount;
    return arr;
  }
  function accountBalance(id, upto) {
    let b = acct(id)?.opening || 0;
    for (const t of S.txns) {
      if (upto && t.date > upto) continue;
      if (t.type === 'income' && t.accountId === id) b += t.amount;
      else if (t.type === 'expense' && t.accountId === id) b -= t.amount;
      else if (t.type === 'transfer') { if (t.accountId === id) b -= t.amount; if (t.toAccountId === id) b += t.amount; }
    }
    return b;
  }
  const netWorth = (upto) => sum(S.accounts.map((a) => accountBalance(a.id, upto)));
  const monthEnd = (ym) => (ym === curP() ? today() : pEnd(ym));
  const lastMonths = (n, end = curP()) => Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));

  function budgetRows(ym) {
    const spent = catTotals(ym);
    const fixed = {};
    for (const t of monthTx(ym)) if (t.type === 'expense' && t.recurringId) for (const p of parts(t)) fixed[p.categoryId] = (fixed[p.categoryId] || 0) + p.amount;
    const isCur = ym === curP();
    const day = elapsed(ym);
    return catsOf('expense').filter((c) => S.budgets[c.id] > 0).map((c) => {
      const limit = S.budgets[c.id], s = spent[c.id] || 0, f = fixed[c.id] || 0;
      // Recurring bills are fixed; only everyday spending is extrapolated (and only once a few days of data exist).
      const projected = isCur && day >= 4 ? f + ((s - f) / day) * pDays(ym) : s;
      return { cat: c, limit, spent: s, pct: s / limit, projected };
    });
  }

  /* ---------- recurring ---------- */
  function txFromRec(r, date) {
    return { id: uid(), date, type: r.type, amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId || null, categoryId: r.categoryId, note: r.name, recurringId: r.id };
  }
  function processRecurring() {
    const td = today(); let n = 0;
    for (const r of S.recurring) {
      let guard = 0;
      while (r.auto && r.next <= td && guard++ < 500) { S.txns.push(txFromRec(r, r.next)); r.next = addFreq(r.next, r.freq); n++; }
    }
    if (n) save();
    return n;
  }
  const pendingRec = () => S.recurring.filter((r) => !r.auto && r.next <= today());

  /* ---------- demo data ---------- */
  function seedDemo() {
    let seed = 42;
    const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const between = (a, b) => r2(a + rnd() * (b - a));
    const base = defaults();
    base.settings = { ...S.settings };
    base.accounts[0].opening = 18000; base.accounts[1].opening = 600; base.accounts[2].opening = 45000; base.accounts[3].opening = 0;
    const tx = [];
    const add = (date, type, amount, categoryId, note, accountId = 'acc_checking', extra = {}) => tx.push({ id: uid() + tx.length, date, type, amount: r2(amount), categoryId, note, accountId, ...extra });
    const td = today();
    const start = addMonths(curYM(), -6);
    for (let k = 0; k <= 6; k++) {
      const ym = addMonths(start, k), D = daysIn(ym);
      const d = (n) => `${ym}-${pad(Math.min(n, D))}`;
      const live = (n) => d(n) <= td;
      // Payday is the 25th, like most South African employers.
      if (live(25)) add(d(25), 'income', 34500, 'salary', 'Salary — Acme (Pty) Ltd', 'acc_checking', { recurringId: 'r_sal' });
      if (live(1)) add(d(1), 'expense', 9500, 'housing', 'Rent', 'acc_checking', { recurringId: 'r_rent' });
      if (live(1)) add(d(1), 'expense', 2450, 'health', 'Discovery Health medical aid', 'acc_checking', { recurringId: 'r_med' });
      if (live(6)) add(d(6), 'expense', between(1400, 2300), 'utilities', 'City of Johannesburg — rates, water & lights');
      if (live(9)) add(d(9), 'expense', 705, 'utilities', 'Afrihost fibre', 'acc_checking', { recurringId: 'r_net' });
      if (live(3)) add(d(3), 'expense', 199, 'subs', 'Netflix', 'acc_card', { recurringId: 'r_netflix' });
      if (live(11)) add(d(11), 'expense', 69.99, 'subs', 'Spotify', 'acc_card', { recurringId: 'r_spotify' });
      if (live(2)) add(d(2), 'expense', 689, 'health', 'Virgin Active', 'acc_card', { recurringId: 'r_gym' });
      if (live(26)) add(d(26), 'transfer', 3000, null, 'Monthly savings', 'acc_checking', { toAccountId: 'acc_savings' });
      if (live(2)) add(d(2), 'transfer', 800, null, 'ATM withdrawal', 'acc_checking', { toAccountId: 'acc_cash' });
      if (live(16)) add(d(16), 'transfer', 800, null, 'ATM withdrawal', 'acc_checking', { toAccountId: 'acc_cash' });
      if (rnd() > 0.45 && live(18)) add(d(18), 'income', between(2500, 8000), 'freelance', pick(['Logo design', 'Website fix', 'Consulting call']));
      for (let day = 1; day <= D; day++) {
        const date = d(day);
        if (date > td) break;
        const dow = new Date(+ym.slice(0, 4), +ym.slice(5) - 1, day).getDay();
        if (day % 4 === 2 || rnd() < 0.07) add(date, 'expense', between(180, 1100), 'groceries', pick(['Checkers', 'Pick n Pay', 'Woolworths Food', 'Spar']), pick(['acc_card', 'acc_checking']));
        if (dow === 5 || dow === 6 || rnd() < 0.22) add(date, 'expense', between(70, 420), 'dining', pick(['Nando\'s', 'Vida e Caffè', 'Kauai', 'Ocean Basket', 'Steers', 'Uber Eats', 'Wimpy']), pick(['acc_card', 'acc_cash']));
        if (rnd() < 0.22) add(date, 'expense', between(60, 850), 'transport', pick(['Uber', 'Bolt', 'Engen', 'Shell', 'Gautrain', 'Parking']), pick(['acc_card', 'acc_cash']));
        if (rnd() < 0.08) add(date, 'expense', between(250, 2200), 'shopping', pick(['Takealot', 'Mr Price', 'Woolworths', 'Makro', 'Cotton On']), 'acc_card');
        if (rnd() < 0.06) add(date, 'expense', between(120, 800), 'fun', pick(['Ster-Kinekor', 'Computicket', 'PlayStation Store', 'Bowling']), 'acc_card');
        if (rnd() < 0.025) add(date, 'expense', between(120, 700), 'health', pick(['Clicks', 'Dis-Chem']), 'acc_card');
        if (rnd() < 0.015) add(date, 'expense', between(250, 900), 'gifts', pick(['Birthday gift', 'Flowers']), 'acc_card');
        if (rnd() < 0.012) add(date, 'expense', between(250, 1200), 'education', pick(['Udemy course', 'Exclusive Books']), 'acc_card');
      }
      if (k === 3 && live(14)) add(d(14), 'expense', 8600, 'travel', 'Weekend in Cape Town', 'acc_card', { splits: [{ categoryId: 'travel', amount: 6200 }, { categoryId: 'dining', amount: 1650 }, { categoryId: 'transport', amount: 750 }] });
      if (live(D)) {
        const card = sum(tx.filter((t) => t.accountId === 'acc_card' && t.type === 'expense' && t.date.startsWith(ym)).map((t) => t.amount));
        if (card > 0) add(d(D), 'transfer', card, null, 'Credit card payment', 'acc_checking', { toAccountId: 'acc_card' });
      }
    }
    base.txns = tx;
    base.budgets = { groceries: 5500, dining: 3000, transport: 3000, housing: 9500, utilities: 3200, shopping: 2500, fun: 1000, subs: 450, health: 3500 };
    const nextOf = (day) => { const ym = curYM(); const dd = `${ym}-${pad(Math.min(day, daysIn(ym)))}`; return dd > td ? dd : `${addMonths(ym, 1)}-${pad(Math.min(day, daysIn(addMonths(ym, 1))))}`; };
    base.recurring = [
      { id: 'r_sal', name: 'Salary — Acme (Pty) Ltd', type: 'income', amount: 34500, categoryId: 'salary', accountId: 'acc_checking', freq: 'monthly', next: nextOf(25), auto: true },
      { id: 'r_rent', name: 'Rent', type: 'expense', amount: 9500, categoryId: 'housing', accountId: 'acc_checking', freq: 'monthly', next: nextOf(1), auto: true },
      { id: 'r_med', name: 'Discovery Health medical aid', type: 'expense', amount: 2450, categoryId: 'health', accountId: 'acc_checking', freq: 'monthly', next: nextOf(1), auto: true },
      { id: 'r_net', name: 'Afrihost fibre', type: 'expense', amount: 705, categoryId: 'utilities', accountId: 'acc_checking', freq: 'monthly', next: nextOf(9), auto: true },
      { id: 'r_netflix', name: 'Netflix', type: 'expense', amount: 199, categoryId: 'subs', accountId: 'acc_card', freq: 'monthly', next: nextOf(3), auto: true },
      { id: 'r_spotify', name: 'Spotify', type: 'expense', amount: 69.99, categoryId: 'subs', accountId: 'acc_card', freq: 'monthly', next: nextOf(11), auto: true },
      { id: 'r_gym', name: 'Virgin Active', type: 'expense', amount: 689, categoryId: 'health', accountId: 'acc_card', freq: 'monthly', next: nextOf(2), auto: true },
      { id: 'r_phone', name: 'Vodacom contract', type: 'expense', amount: 499, categoryId: 'utilities', accountId: 'acc_checking', freq: 'monthly', next: td, auto: false },
      { id: 'r_cloud', name: 'Google One storage', type: 'expense', amount: 549, categoryId: 'subs', accountId: 'acc_card', freq: 'yearly', next: `${addMonths(curYM(), 2)}-04`, auto: true },
    ];
    base.goals = [
      { id: 'g1', name: 'Emergency fund', icon: 'lifebuoy', target: 60000, saved: 24000, color: COLORS[1], deadline: `${addMonths(curYM(), 10)}-01` },
      { id: 'g2', name: 'Cape Town holiday', icon: 'umbrella', target: 18000, saved: 6500, color: COLORS[4], deadline: `${addMonths(curYM(), 6)}-15` },
      { id: 'g3', name: 'New laptop', icon: 'laptop', target: 22000, saved: 18700, color: COLORS[0], deadline: '' },
    ];
    base.debts = [
      { id: 'd1', name: 'Car finance', direction: 'owe', amount: 185000, paid: 62000, due: `${addMonths(curYM(), 1)}-01`, note: 'R4 850 debit order' },
      { id: 'd2', name: 'Student loan', direction: 'owe', amount: 60000, paid: 38000, due: '', note: '' },
      { id: 'd3', name: 'Thabo — braai money', direction: 'owed', amount: 450, paid: 150, due: '', note: '' },
    ];
    S = base;
    migrate();
    save();
  }

  /* ---------- icons ---------- */
  const IC = {
    home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
    activity: '<path d="M5 7h14M5 12h14M5 17h9"/>',
    budgets: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5.7 5.7"/>',
    reports: '<path d="M5 19V11M10 19V6M15 19v-5M20 19V9"/>',
    more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
    accounts: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17M7 14.5h4"/>',
    recurring: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
    goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
    debts: '<path d="M4 7h16v10H4zM8 12h.01M16 12h.01"/><circle cx="12" cy="12" r="2.2"/>',
    categories: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    chevL: '<path d="M14.5 6 8.5 12l6 6"/>', chevR: '<path d="M9.5 6l6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  };
  const icon = (n, s = 22) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${IC[n] || CI[n] || ''}</svg>`;

  /* ---------- category icon library (Lucide-style outline icons, 24px grid, 2px stroke) ---------- */
  const CI = {
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2l1.5-6.8H6.3"/>',
    basket: '<path d="M5 10h14l-1.5 8.3a2 2 0 0 1-2 1.7h-7a2 2 0 0 1-2-1.7z"/><path d="M8.5 10 11 4M15.5 10 13 4M3 10h18M10 14v3M14 14v3"/>',
    utensils: '<path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 3v18"/><path d="M18.5 15V3a3.5 3.5 0 0 0-3.5 3.5V14h3.5zM18.5 15v6"/>',
    coffee: '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 2.5v3M12 2.5v3"/>',
    wine: '<path d="M8 22h8M12 15v7M7 3h10l-.5 6a4.5 4.5 0 0 1-9 0z"/>',
    car: '<path d="M4 16v-3.5l2-5.2A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.3l2 5.2V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12.5h16"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
    bus: '<rect x="4" y="3.5" width="16" height="14" rx="3"/><path d="M4 11h16M8 17.5V20M16 17.5V20M8 14.5h.01M16 14.5h.01"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10"/><path d="M14 13h1.5a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0V8.5L17 5.5"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    droplet: '<path d="M12 2.7s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z"/>',
    wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
    tv: '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="m8 2.5 4 3.5 4-3.5"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.2A3 3 0 0 0 5 18c1 0 1.5-.5 2-1l1.4-1.4A2 2 0 0 1 9.8 15h4.4a2 2 0 0 1 1.4.6L17 17c.5.5 1 1 2 1a3 3 0 0 0 3-3.2l-.7-6.2a4 4 0 0 0-4-3.6z"/>',
    ticket: '<path d="M3 8.5V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a3.5 3.5 0 0 0 0 7V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a3.5 3.5 0 0 0 0-7z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2.5h6L16.5 6H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    bag: '<path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    shirt: '<path d="M20.4 6.6 16 3.5a3.5 3.5 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.4 1.2l1.3 3a1 1 0 0 0 1.2.6L7 11v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9l1.3.4a1 1 0 0 0 1.2-.6l1.3-3a1 1 0 0 0-.4-1.2z"/>',
    store: '<path d="M3 9 4.5 4h15L21 9M4 9v11h16V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-5h6v5"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8"/><path d="M12 8C10.5 4 7 3.5 7 6a2 2 0 0 0 2 2M12 8c1.5-4 5-4.5 5-2a2 2 0 0 1-2 2"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M6.5 12h11M3.5 9v6M20.5 9v6"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 10v6"/>',
    briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M2.5 13h19"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    trendUp: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
    piggy: '<path d="M19 9.5c.7 0 1.5.5 1.5 1.5v2.5l-1.6.6a6 6 0 0 1-2.4 2.8V19h-2.5v-1.5h-4V19H7.5v-2.6A6 6 0 0 1 10.5 5h3a6 6 0 0 1 5 2.6z"/><path d="M15.5 10.5h.01M3.5 9a2 2 0 0 0 2.6 1.9M10 8h3"/>',
    wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3"/>',
    banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    coins: '<circle cx="8" cy="8" r="5"/><path d="M18.1 10.4A5 5 0 1 1 10.4 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>',
    landmark: '<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2.5 10 12 3.5l9.5 6.5z"/>',
    receipt: '<path d="M5 2.5v19l2.5-1.5 2.5 1.5 2-1.5 2 1.5 2.5-1.5 2.5 1.5v-19L16.5 4 14 2.5 12 4 10 2.5 7.5 4z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    arrows: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
    withdraw: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    deposit: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    paw: '<circle cx="11" cy="4.5" r="2"/><circle cx="18" cy="8.5" r="2"/><circle cx="20" cy="15.5" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 2.6 2.6 0 0 0-1.5-1.6A3.5 3.5 0 0 1 9 10z"/>',
    baby: '<circle cx="12" cy="12" r="9"/><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M12 3a2 2 0 0 0 0 4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    umbrella: '<path d="M22 12a10 10 0 0 0-20 0z"/><path d="M12 12v7a2 2 0 0 0 4 0M12 2v1"/>',
    lifebuoy: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4"/><path d="m5.3 5.3 3.9 3.9M14.8 14.8l3.9 3.9M14.8 9.2l3.9-3.9M9.2 14.8l-3.9 3.9"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19"/>',
    cloud: '<path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    sparkles: '<path d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v4M17 17h4M5 3v3M3.5 4.5h3"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  };
  // Names shown in the icon picker (and read by screen readers).
  const CI_LABEL = {
    cart: 'Groceries', basket: 'Basket', utensils: 'Dining', coffee: 'Coffee', wine: 'Drinks', car: 'Car', bus: 'Bus', train: 'Train', fuel: 'Fuel', plane: 'Travel',
    home: 'Home', building: 'Building', zap: 'Electricity', droplet: 'Water', wifi: 'Internet', phone: 'Phone', tv: 'TV', film: 'Movies', music: 'Music', gamepad: 'Games',
    ticket: 'Tickets', camera: 'Camera', bag: 'Shopping', shirt: 'Clothing', store: 'Store', gift: 'Gifts', heart: 'Health', cross: 'Medical', pill: 'Pharmacy', dumbbell: 'Fitness',
    book: 'Books', grad: 'Education', briefcase: 'Work', laptop: 'Laptop', trendUp: 'Investments', piggy: 'Savings', wallet: 'Wallet', banknote: 'Cash', coins: 'Coins', card: 'Card',
    landmark: 'Bank', receipt: 'Bills', percent: 'Tax', arrows: 'Transfer', withdraw: 'Withdrawal', deposit: 'Deposit', tag: 'Tag', box: 'Other', paw: 'Pets', baby: 'Kids',
    users: 'Family', user: 'Personal', scissors: 'Beauty', wrench: 'Repairs', shield: 'Insurance', umbrella: 'Holiday', lifebuoy: 'Emergency', leaf: 'Garden', globe: 'Online', cloud: 'Cloud',
    target: 'Goal', star: 'Favourite', sparkles: 'Treats', calendar: 'Events',
  };
  const PICKABLE = Object.keys(CI_LABEL);
  // Old emoji → new icon, so saved categories and goals convert without losing anything.
  const EMOJI_ICON = {
    '🛒': 'cart', '🍜': 'utensils', '🚗': 'car', '🏠': 'home', '💡': 'zap', '🛍️': 'bag', '🛍': 'bag', '💊': 'heart', '🎬': 'film', '📺': 'tv', '✈️': 'plane', '✈': 'plane',
    '📚': 'grad', '🎁': 'gift', '🏦': 'landmark', '📦': 'box', '💼': 'briefcase', '💻': 'laptop', '📈': 'trendUp', '💰': 'coins', '🏷️': 'tag', '🏷': 'tag',
    '🛟': 'lifebuoy', '🏖️': 'umbrella', '🏖': 'umbrella', '🎯': 'target', '🗾': 'plane', '☕': 'coffee', '🍔': 'utensils', '🍕': 'utensils', '⛽': 'fuel', '🚌': 'bus',
    '📱': 'phone', '🎮': 'gamepad', '🎵': 'music', '👕': 'shirt', '🐶': 'paw', '🐱': 'paw', '👶': 'baby', '💇': 'scissors', '🔧': 'wrench', '🏥': 'cross', '🏋️': 'dumbbell',
    '🎓': 'grad', '💳': 'card', '💵': 'banknote', '🧾': 'receipt', '🌱': 'leaf', '⭐': 'star', '✨': 'sparkles', '🎉': 'sparkles', '🚆': 'train', '🍷': 'wine', '🍺': 'wine',
  };
  const DEFAULT_ICON = { groceries: 'cart', dining: 'utensils', transport: 'car', housing: 'home', utilities: 'zap', shopping: 'bag', health: 'heart', fun: 'film', subs: 'tv', travel: 'plane', education: 'grad', gifts: 'gift', fees: 'landmark', other: 'box', salary: 'briefcase', freelance: 'laptop', invest: 'trendUp', other_in: 'coins' };
  const iconKey = (v) => (CI[v] ? v : EMOJI_ICON[v] || 'tag');
  const ci = (key, s = 20) => `<svg class="ci" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${CI[iconKey(key)]}</svg>`;
  /** Small inline category mark for legends and labels. */
  const catMark = (c) => (c ? `<span class="cat-mark" style="--c:${c.color}">${ci(c.icon, 13)}</span>` : '');
  const KIND_LABEL = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

  const NAV = [
    { id: 'home', label: 'Home' }, { id: 'activity', label: 'Activity' }, { id: 'budgets', label: 'Budgets' }, { id: 'reports', label: 'Reports' },
    { id: 'accounts', label: 'Accounts' }, { id: 'goals', label: 'Goals' }, { id: 'recurring', label: 'Recurring' }, { id: 'debts', label: 'Debts' },
    { id: 'categories', label: 'Categories' }, { id: 'settings', label: 'Settings' },
  ];
  const BOTTOM = ['home', 'activity', 'budgets', 'reports', 'more'];

  function drawNav() {
    $('#sideNav').innerHTML = NAV.map((n, i) => `${i === 4 ? '<div class="nav-sep">Plan</div>' : i === 8 ? '<div class="nav-sep">Manage</div>' : ''}<a href="#/${n.id}" data-nav="${n.id}">${icon(n.id, 20)}<span>${n.label}</span></a>`).join('');
    $('#bottomNav').innerHTML = BOTTOM.map((id) => `<a href="#/${id}" data-nav="${id}">${icon(id, 22)}<span>${id === 'more' ? 'More' : NAV.find((n) => n.id === id).label}</span></a>`).join('');
  }
  function markNav(r) {
    const inMore = !BOTTOM.includes(r);
    $$('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === r || (a.closest('#bottomNav') && inMore && a.dataset.nav === 'more');
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------- shared UI bits ---------- */
  function monthSwitch(key = 'month') {
    const ym = UI[key];
    return `<div class="month-switch" role="group" aria-label="Choose month">
      <button class="icon-btn" data-act="month" data-key="${key}" data-d="-1" aria-label="Previous month">${icon('chevL', 18)}</button>
      <span class="ms-label">${pLabel(ym)}</span>
      <button class="icon-btn" data-act="month" data-key="${key}" data-d="1" aria-label="Next month" ${ym >= curP() ? 'disabled' : ''}>${icon('chevR', 18)}</button></div>`;
  }
  function delta(cur, prev, goodWhenUp = true) {
    if (!prev) return '';
    const p = ((cur - prev) / Math.abs(prev)) * 100;
    if (!isFinite(p) || Math.abs(p) < 0.5) return '<span class="delta flat">same as last month</span>';
    const up = p > 0, good = up === goodWhenUp;
    return `<span class="delta ${good ? 'good' : 'bad'}">${icon(up ? 'up' : 'down', 12)}${Math.abs(p).toFixed(0)}% vs last month</span>`;
  }
  function header(title, sub = '', right = '') {
    return `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="head-right">${right}</div></header>`;
  }
  function empty(emoji, title, text, btn = '') {
    return `<div class="empty"><div class="empty-e">${ci(emoji, 26)}</div><h3>${title}</h3><p>${text}</p>${btn}</div>`;
  }
  /* Shop badges: the shop's real logo (its website icon), with brand colour + initial as the fallback. */
  const BRANDS = [
    [/netflix/i, 'N', '#e50914', '', 'netflix.com'], [/spotify/i, '♫', '#1db954', '', 'spotify.com'], [/showmax/i, 'S', '#1e0a3c', '', 'showmax.com'], [/dstv|multichoice/i, 'D', '#0072ce', '', 'dstv.com'],
    [/youtube/i, '▶', '#ff0000', '', 'youtube.com'], [/apple|icloud|itunes/i, '', '#111111', '', 'apple.com'], [/google/i, 'G', '#4285f4', '', 'google.com'], [/microsoft/i, 'M', '#00a4ef', '', 'microsoft.com'],
    [/disney/i, 'D', '#113ccf', '', 'disneyplus.com'], [/openai|chatgpt/i, 'C', '#10a37f', '', 'openai.com'],
    [/checkers/i, 'C', '#00a19a', '', 'checkers.co.za'], [/pick ?n ?pay|\bpnp\b/i, 'P', '#e31837', '', 'pnp.co.za'], [/woolworths|\bww\b/i, 'W', '#111111', '', 'www.woolworths.co.za'],
    [/\bspar\b/i, 'S', '#e2001a', '', 'www.spar.co.za'], [/shoprite/i, 'S', '#d71920', '', 'shoprite.co.za'], [/food lover/i, 'F', '#e30613', '', 'foodloversmarket.co.za'],
    [/takealot/i, 't', '#0b79bf', '', 'takealot.com'], [/mr ?price/i, 'M', '#e4002b', '', 'mrpricegroup.com'], [/makro/i, 'M', '#003b7a', '', 'makro.co.za'],
    [/superbalist/i, 'S', '#111111', '', 'superbalist.com'], [/amazon/i, 'a', '#ff9900', '#111', 'amazon.co.za'], [/temu/i, 'T', '#fb7701', '', 'temu.com'], [/shein/i, 'S', '#111111', '', 'shein.com'],
    [/uber ?eats/i, 'U', '#06c167', '', 'ubereats.com'], [/\buber\b/i, 'U', '#000000', '', 'uber.com'], [/\bbolt\b/i, 'B', '#34d186', '', 'bolt.eu'],
    [/engen/i, 'E', '#d6001c', '', 'engen.co.za'], [/\bshell\b/i, 'S', '#fbce07', '#d52b1e', 'shell.co.za'], [/sasol/i, 'S', '#0057a8', '', ''], [/gautrain/i, 'G', '#f4b400', '#111', ''],
    [/vodacom/i, 'V', '#e60000', '', 'vodacom.com'], [/\bmtn\b/i, 'M', '#ffcb05', '#111', 'mtn.co.za'], [/telkom/i, 'T', '#0099d8', '', 'telkom.co.za'], [/afrihost/i, 'A', '#0064b0', '', 'afrihost.com'],
    [/discovery/i, 'D', '#2b3990', '', 'discovery.co.za'], [/virgin active/i, 'V', '#e10a0a', '', 'virginactive.co.za'], [/dis-?chem/i, 'D', '#00a651', '', ''], [/clicks/i, 'C', '#00539f', '', 'clicks.co.za'],
    [/nando/i, 'N', '#c8102e', '', 'nandos.co.za'], [/kauai/i, 'K', '#7ab929', '', 'kauai.co.za'], [/vida e/i, 'V', '#d4002a', '', 'vidaecaffe.com'], [/steers/i, 'S', '#d71920', '', 'steers.co.za'],
    [/wimpy/i, 'W', '#e31b23', '', 'wimpy.co.za'], [/ocean basket/i, 'O', '#0083c9', '', 'oceanbasket.com'], [/\bkfc\b/i, 'K', '#e4002b', '', 'kfc.co.za'], [/mcdonald/i, 'M', '#ffbc0d', '#da291c', 'mcdonalds.com'],
    [/debonairs/i, 'D', '#e31837', '', 'debonairspizza.co.za'], [/\bspur\b/i, 'S', '#c8102e', '', 'spur.co.za'], [/starbucks/i, 'S', '#00704a', '', 'starbucks.co.za'],
    [/ster-?kinekor/i, 'S', '#ed1c24', '', ''], [/computicket/i, 'C', '#ef7d00', '', 'computicket.com'], [/playstation/i, 'P', '#003791', '', 'playstation.com'], [/steam/i, 'S', '#171a21', '', 'steampowered.com'],
    [/airbnb/i, 'A', '#ff5a5f', '', 'airbnb.com'], [/flysafair/i, 'F', '#e30613', '', 'flysafair.co.za'], [/udemy/i, 'U', '#a435f0', '', 'udemy.com'],
  ];
  function brandOf(text) {
    for (const [re, label, bg, fg, domain] of BRANDS) if (re.test(text || '')) return { label, bg, fg: fg || '#fff', domain };
    return null;
  }
  // Logos come from the shop's own website icon (via Google's icon service). Only the shop's domain is sent — never amounts or notes.
  const logoUrl = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  window.wiselyLogo = (img, ok) => {
    const box = img.parentElement;
    // Google returns a tiny grey globe when a site has no icon — treat that as "no logo".
    if (ok && img.naturalWidth > 24) box.classList.add('has-logo'); else img.remove();
  };
  const brandIco = (b) => `<span class="tx-ico brand" style="--bg:${b.bg};--fg:${b.fg}">${b.domain ? `<img src="${logoUrl(b.domain)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="wiselyLogo(this,true)" onerror="wiselyLogo(this,false)">` : ''}<span class="bl">${b.label || '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.5 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8C6.9 7.3 5 8.6 5 11.5c0 1.8.7 3.7 1.5 4.9.7 1 1.4 2.1 2.4 2.1s1.3-.6 2.5-.6 1.5.6 2.5.6 1.7-1 2.3-2c.7-1.1 1-2.2 1-2.2s-1.7-.7-1.7-2.7zM14.6 5.9c.6-.7 1-1.6.9-2.6-.8 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.5.9.1 1.9-.5 2.5-1.2z"/></svg>'}</span></span>`;
  const catIco = (key, color) => `<span class="tx-ico" style="--c:${color}">${ci(key, 20)}</span>`;

  function txRow(t, i = 0) {
    const split = t.splits && t.splits.length > 1;
    const c = cat(t.categoryId);
    let ico = c?.icon || 'box', color = c?.color || COLORS[11], title = t.note || c?.name || 'Transaction', sub;
    if (t.type === 'transfer') { ico = c?.icon || 'arrows'; color = c?.color || COLORS[7]; title = t.note || c?.name || 'Transfer'; sub = `${c ? c.name + ' · ' : ''}${acct(t.accountId)?.name || '?'} → ${acct(t.toAccountId)?.name || '?'}`; }
    else if (split) { ico = 'scissors'; color = 'var(--accent)'; sub = `Split · ${t.splits.map((p) => cat(p.categoryId)?.name).filter(Boolean).join(', ')}`; }
    else sub = `${c?.name || 'Uncategorized'} · ${acct(t.accountId)?.name || ''}`;
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
    const b = t.type !== 'transfer' && !split ? brandOf(t.note) : null;
    return `<button class="tx" data-act="edit-tx" data-id="${t.id}" style="--i:${Math.min(i, 14)}">
      ${b ? brandIco(b) : catIco(ico, color)}
      <span class="tx-main"><span class="tx-title">${esc(title)}${t.recurringId ? ` <span class="rec-mark" title="Recurring">${ci('repeat', 12)}</span>` : ''}</span><span class="tx-sub">${esc(sub)}</span></span>
      <span class="tx-amt ${t.type}">${sign}${fmt(t.amount)}</span></button>`;
  }
  const bar = (pct, color, cls = '') => `<div class="bar ${cls}"><div class="bar-fill" style="background:${color}" data-w="${clamp(pct * 100, 0, 100).toFixed(1)}%"></div></div>`;
  const sortTx = (a) => [...a].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));

  /* ---------- views ---------- */
  let mount = null;

  function viewHome() {
    const ym = UI.month, T = totals(ym), P = totals(addMonths(ym, -1));
    const nw = netWorth();
    const pend = pendingRec();
    const ct = catTotals(ym);
    const items = Object.entries(ct).map(([id, v]) => ({ id, v, c: cat(id) })).filter((x) => x.c).sort((a, b) => b.v - a.v);
    const brs = budgetRows(ym).sort((a, b) => b.pct - a.pct);
    const budgetTotal = sum(brs.map((b) => b.limit)), budgetSpent = sum(brs.map((b) => Math.min(b.spent, b.limit * 10)));
    const isCur = ym === curP();
    const daysLeft = isCur ? pDays(ym) - elapsed(ym) + 1 : 0;
    const safe = isCur && budgetTotal ? Math.max(0, (budgetTotal - budgetSpent) / daysLeft) : null;
    const recent = sortTx(monthTx(ym)).slice(0, 6);
    const hour = new Date().getHours();
    const hi = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${S.settings.name ? ', ' + esc(S.settings.name) : ''}`;
    const savingsRate = T.inc > 0 ? (T.net / T.inc) * 100 : 0;

    mount = () => {
      const D = pDays(ym), prevYM = addMonths(ym, -1), PD = pDays(prevYM);
      const st0 = parseD(pStart(ym));
      const dateAt = (i) => { const d = new Date(st0); d.setDate(d.getDate() + i); return d; };
      const cur = dailySpend(ym), prev = dailySpend(prevYM);
      const upto = elapsed(ym);
      const maxD = Math.max(D, PD);
      let a = 0, b = 0;
      const cv = [], pv = [];
      for (let i = 0; i < maxD; i++) {
        a += cur[i] || 0; b += prev[i] || 0;
        cv.push(i < upto && i < D ? r2(a) : null);
        pv.push(i < PD ? r2(b) : null);
      }
      const el = $('#paceChart');
      if (el) Charts.area(el, {
        labels: cv.map((_, i) => String(dateAt(i).getDate())), tipLabels: cv.map((_, i) => `Day ${i + 1} · ${dateAt(i).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short' })}`),
        series: [{ name: 'This month', color: 'var(--accent)', values: cv }, { name: 'Last month', color: 'var(--muted-2)', values: pv, dashed: true }],
        fmt, fmtAxis: fmtC, height: 210, aria: 'Cumulative spending this month vs last month',
      });
      const dn = $('#homeDonut');
      if (dn) {
        const top = items.slice(0, 6), rest = sum(items.slice(6).map((x) => x.v));
        const list = top.map((x) => ({ label: x.c.name, value: x.v, color: x.c.color }));
        if (rest > 0) list.push({ label: 'Everything else', value: rest, color: 'var(--muted-2)' });
        Charts.donut(dn, { items: list, fmt: fmtW, size: 190, thickness: 20, centerLabel: 'Spent' });
        $$('#homeLegend [data-li]').forEach((li) => {
          li.addEventListener('pointerenter', () => dn._focus(+li.dataset.li));
          li.addEventListener('pointerleave', () => dn._reset());
        });
      }
    };

    const legend = (() => {
      const top = items.slice(0, 6), rest = sum(items.slice(6).map((x) => x.v));
      const rows = top.map((x, i) => `<li data-li="${i}"><span>${catMark(x.c)}${esc(x.c.name)}</span><b>${fmtW(x.v)}</b></li>`);
      if (rest > 0) rows.push(`<li data-li="${top.length}"><span><span class="cat-mark" style="--c:var(--muted)">${ci('box', 13)}</span>Everything else</span><b>${fmtW(rest)}</b></li>`);
      return rows.join('');
    })();

    const subline = payday() === 1 ? `Here's your money in ${monthLabel(ym)}.` : `Your pay month: ${pLabel(ym)}${isCur ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to payday` : ''}`;
    return `${header(hi, subline, monthSwitch())}
    <div class="grid">
      <section class="card hero span-12">
        <div class="hero-glow"></div>
        <div class="hero-row">
          <div><div class="eyebrow">Total balance</div><div class="hero-amt" data-count="${nw}">${fmt(nw)}</div>
            <div class="hero-sub">${S.accounts.length} accounts · <a href="#/accounts">view</a></div></div>
          <div class="hero-badge"><span>Saved this month</span><b data-count="${Math.max(0, savingsRate)}" data-fmt="pct">${Math.max(0, savingsRate).toFixed(0)}%</b><span>of income</span></div>
        </div>
        <div class="hero-stats">
          <div class="hs"><span class="hs-l"><i class="dot income"></i>Money in</span><b data-count="${T.inc}">${fmt(T.inc)}</b>${delta(T.inc, P.inc, true)}</div>
          <div class="hs"><span class="hs-l"><i class="dot expense"></i>Money out</span><b data-count="${T.exp}">${fmt(T.exp)}</b>${delta(T.exp, P.exp, false)}</div>
          <div class="hs"><span class="hs-l"><i class="dot net"></i>Left over</span><b data-count="${T.net}">${fmt(T.net)}</b>${delta(T.net, P.net, true)}</div>
        </div>
      </section>

      ${backupNudge()}
      ${pend.length ? `<section class="card span-12 pending"><div class="card-h"><h2>Waiting for you</h2><span class="pill warn">${pend.length} due</span></div>
        ${pend.map((r) => `<div class="pend-row">${brandOf(r.name) ? brandIco(brandOf(r.name)) : catIco(cat(r.categoryId)?.icon || 'repeat', cat(r.categoryId)?.color || COLORS[11])}
          <div class="tx-main"><span class="tx-title">${esc(r.name)}</span><span class="tx-sub">Due ${fmtDate(r.next)} · ${FREQ[r.freq]}</span></div>
          <b class="tx-amt ${r.type}">${fmt(r.amount)}</b>
          <div class="pend-btns"><button class="btn ghost sm" data-act="skip-rec" data-id="${r.id}">Skip</button><button class="btn primary sm" data-act="confirm-rec" data-id="${r.id}">Confirm</button></div></div>`).join('')}
      </section>` : ''}

      <section class="card span-7"><div class="card-h"><h2>Spending pace</h2><span class="legend-inline"><i style="background:var(--accent)"></i>This month <i class="dashed"></i>Last month</span></div>
        <div id="paceChart" class="chart-box"></div></section>

      <section class="card span-5"><div class="card-h"><h2>Where it went</h2><a href="#/reports" class="link">Reports</a></div>
        ${items.length ? `<div class="donut-row"><div id="homeDonut"></div><ul class="legend" id="homeLegend">${legend}</ul></div>` : empty('receipt', 'No spending yet', 'Add an expense and it shows up here.')}</section>

      <section class="card span-6"><div class="card-h"><h2>Budgets</h2><a href="#/budgets" class="link">All budgets</a></div>
        ${brs.length ? `${safe != null ? `<div class="safe"><span>Safe to spend today</span><b data-count="${safe}">${fmt(safe)}</b><small>${daysLeft} day${daysLeft === 1 ? '' : 's'} ${payday() === 1 ? `left in ${monthLabel(ym, 'long', false)}` : 'until payday'}</small></div>` : ''}
          ${brs.slice(0, 4).map((b) => budgetLine(b)).join('')}`
        : empty('target', 'No budgets yet', 'Set monthly limits so you know what is left before you buy.', '<button class="btn primary sm" data-act="edit-budgets">Set budgets</button>')}</section>

      <section class="card span-6"><div class="card-h"><h2>Recent</h2><a href="#/activity" class="link">See all</a></div>
        ${recent.length ? `<div class="tx-list">${recent.map(txRow).join('')}</div>` : empty('sparkles', 'Nothing here yet', 'Tap + to add your first transaction.')}</section>

      ${S.goals.length ? `<section class="card span-12"><div class="card-h"><h2>Goals</h2><a href="#/goals" class="link">All goals</a></div>
        <div class="goal-strip">${S.goals.slice(0, 4).map((g) => `<a class="goal-mini" href="#/goals">${Charts.ring(g.saved / g.target, g.color, 64, 7, `${Math.round(clamp(g.saved / g.target, 0, 1) * 100)}%`)}<div><b>${esc(g.name)}</b><span>${fmtW(g.saved)} of ${fmtW(g.target)}</span></div></a>`).join('')}</div></section>` : ''}
    </div>`;
  }

  function budgetLine(b) {
    const over = b.spent > b.limit, warn = !over && b.projected > b.limit;
    const color = over ? 'var(--expense)' : warn ? 'var(--warn)' : b.cat.color;
    const left = b.limit - b.spent;
    return `<div class="bl">
      <div class="bl-top"><span>${catMark(b.cat)}${esc(b.cat.name)}</span><span class="${over ? 'neg' : ''}">${over ? `${fmtW(-left)} over` : `${fmtW(left)} left`}</span></div>
      ${bar(b.pct, color, over ? 'over' : '')}
      <div class="bl-sub"><span>${fmtW(b.spent)} of ${fmtW(b.limit)}</span>${warn ? `<span class="warn-t">On pace for ${fmtW(b.projected)}</span>` : ''}</div></div>`;
  }

  function viewActivity() {
    const f = UI.filter;
    const months = [...new Set(S.txns.map((t) => periodOf(t.date)))].sort().reverse();
    const cats = S.categories;
    mount = () => {
      const q = $('#q');
      q.addEventListener('input', () => { f.q = q.value; UI.limit = 120; $('#txWrap').innerHTML = activityList(); Charts.animate($('#txWrap')); });
      $('#fMonth').addEventListener('change', (e) => { f.month = e.target.value; UI.limit = 120; render(false); });
      $('#fCat').addEventListener('change', (e) => { f.cat = e.target.value; UI.limit = 120; render(false); });
    };
    return `${header('Activity', 'Every cent in and out.', `<button class="btn ghost sm" data-act="import-bank">${ci('upload', 16)} Import statement</button><button class="btn primary sm desk-only" data-act="add-tx">${ci('plus', 16)} New</button>`)}
      <div class="filters card">
        <label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Search notes, categories, amounts" value="${esc(f.q)}" aria-label="Search transactions"></label>
        <div class="filter-row">
          <div class="chips" role="group" aria-label="Type">${['all', 'expense', 'income', 'transfer'].map((t) => `<button class="chip${f.type === t ? ' on' : ''}" data-act="ftype" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
          <select id="fMonth" aria-label="Month"><option value="">All time</option>${months.map((m) => `<option value="${m}" ${f.month === m ? 'selected' : ''}>${pLabel(m)}</option>`).join('')}</select>
          <select id="fCat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}${c.kind === 'transfer' ? ' (transfer)' : ''}</option>`).join('')}</select>
        </div>
      </div>
      <div id="txWrap">${activityList()}</div>`;
  }
  function filteredTx() {
    const f = UI.filter, q = f.q.trim().toLowerCase();
    return sortTx(S.txns.filter((t) => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.month && periodOf(t.date) !== f.month) return false;
      if (f.cat && !parts(t).some((p) => p.categoryId === f.cat)) return false;
      if (q) {
        const hay = [t.note, cat(t.categoryId)?.name, acct(t.accountId)?.name, t.amount.toFixed(2), ...(t.splits || []).map((p) => cat(p.categoryId)?.name)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }));
  }
  function activityList() {
    const list = filteredTx();
    if (!list.length) return `<div class="card">${S.txns.length ? empty('inbox', 'No matches', 'Try a different search or filter.') : empty('sparkles', 'No transactions yet', 'Add your first one to get started.', '<button class="btn primary sm" data-act="add-tx">Add transaction</button>')}</div>`;
    const inc = sum(list.filter((t) => t.type === 'income').map((t) => t.amount)), exp = sum(list.filter((t) => t.type === 'expense').map((t) => t.amount));
    const shown = list.slice(0, UI.limit);
    const groups = {};
    shown.forEach((t) => (groups[t.date] = groups[t.date] || []).push(t));
    let i = 0;
    return `<div class="act-sum"><span>${list.length} transaction${list.length === 1 ? '' : 's'}</span><span class="pos">+${fmt(inc)}</span><span class="neg">−${fmt(exp)}</span></div>
      ${Object.entries(groups).map(([d, ts]) => {
        const net = sum(ts.map((t) => (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0)));
        return `<section class="day card"><div class="day-h"><span>${fmtDate(d, true)}</span><span class="${net < 0 ? 'neg' : net > 0 ? 'pos' : ''}">${net ? (net > 0 ? '+' : '−') + fmt(Math.abs(net)) : ''}</span></div>
          <div class="tx-list">${ts.map((t) => txRow(t, i++)).join('')}</div></section>`;
      }).join('')}
      ${list.length > UI.limit ? `<button class="btn ghost block" data-act="more-tx">Show more (${list.length - UI.limit} left)</button>` : ''}`;
  }

  function viewBudgets() {
    const ym = UI.month;
    const rows = budgetRows(ym).sort((a, b) => b.pct - a.pct);
    const spent = catTotals(ym);
    const unbudgeted = catsOf('expense').filter((c) => !(S.budgets[c.id] > 0) && spent[c.id] > 0).map((c) => ({ c, v: spent[c.id] })).sort((a, b) => b.v - a.v);
    const total = sum(rows.map((r) => r.limit)), used = sum(rows.map((r) => r.spent));
    const isCur = ym === curP();
    const dLeft = isCur ? pDays(ym) - elapsed(ym) + 1 : 0;
    const projected = sum(rows.map((r) => r.projected));
    const pct = total ? used / total : 0;
    const ringColor = pct > 1 ? 'var(--expense)' : projected > total ? 'var(--warn)' : 'var(--accent)';
    const timePct = isCur ? (elapsed(ym) - 1) / pDays(ym) : 1;

    mount = () => {
      const el = $('#budgetBars');
      if (el && rows.length) Charts.bars(el, {
        labels: rows.map((r) => r.cat.name.split(' ')[0].slice(0, 9)), tipLabels: rows.map((r) => r.cat.name),
        series: [{ name: 'Budget', color: 'var(--track)', values: rows.map((r) => r.limit) }, { name: 'Spent', color: 'var(--accent)', values: rows.map((r) => r.spent) }],
        fmt, fmtAxis: fmtC, height: 200, aria: 'Budget versus spent by category',
      });
    };

    return `${header('Budgets', 'Know what is left before you buy, not after.', `${monthSwitch()}<button class="btn primary sm" data-act="edit-budgets">${icon('edit', 16)} Edit</button>`)}
    ${rows.length ? `<div class="grid">
      <section class="card span-5 budget-sum">
        <div class="big-ring">${Charts.ring(pct, ringColor, 168, 14)}<div class="br-c"><b data-count="${Math.max(0, total - used)}">${fmtW(Math.max(0, total - used))}</b><span>${used > total ? 'over budget' : 'left to spend'}</span></div></div>
        <div class="bs-stats">
          <div><span>Budgeted</span><b>${fmtW(total)}</b></div>
          <div><span>Spent</span><b>${fmtW(used)}</b></div>
          ${isCur ? `<div><span>Per day left</span><b>${fmtW(Math.max(0, (total - used) / dLeft))}</b></div><div><span>Projected</span><b class="${projected > total ? 'neg' : ''}">${fmtW(projected)}</b></div>` : ''}
        </div>
        ${isCur ? `<div class="time-track"><div class="tt-bar">${bar(pct, ringColor)}<span class="tt-marker" style="left:${(timePct * 100).toFixed(1)}%"></span></div><small>Marker shows how far through the ${payday() === 1 ? 'month' : 'pay month'} you are. Stay left of it and you are on track.</small></div>` : ''}
      </section>
      <section class="card span-7"><div class="card-h"><h2>Budget vs spent</h2></div><div id="budgetBars" class="chart-box"></div></section>
      <section class="card span-12"><div class="card-h"><h2>Categories</h2></div><div class="bl-grid">${rows.map(budgetLine).join('')}</div></section>
      ${unbudgeted.length ? `<section class="card span-12"><div class="card-h"><h2>Spending without a budget</h2><button class="btn ghost sm" data-act="edit-budgets">Add limits</button></div>
        <div class="tx-list">${unbudgeted.map((u) => `<div class="tx static">${catIco(u.c.icon, u.c.color)}<span class="tx-main"><span class="tx-title">${esc(u.c.name)}</span></span><span class="tx-amt expense">${fmt(u.v)}</span></div>`).join('')}</div></section>` : ''}
    </div>` : `<div class="card">${empty('target', 'Set your first budget', 'Pick monthly limits for the categories you care about. We can suggest them from your history.', '<button class="btn primary" data-act="edit-budgets">Set budgets</button>')}</div>`}`;
  }

  function viewReports() {
    const months = lastMonths(UI.range);
    const T = months.map(totals);
    const inc = T.map((t) => r2(t.inc)), exp = T.map((t) => r2(t.exp)), net = T.map((t) => r2(t.net));
    const withData = T.filter((t) => t.inc || t.exp);
    const avgInc = withData.length ? sum(withData.map((t) => t.inc)) / withData.length : 0;
    const avgExp = withData.length ? sum(withData.map((t) => t.exp)) / withData.length : 0;
    const totInc = sum(inc), totNet = sum(net);
    const rate = totInc > 0 ? (totNet / totInc) * 100 : 0;
    const best = withData.length ? months[net.indexOf(Math.max(...net))] : null;

    const rm = UI.reportMonth;
    const ct = catTotals(rm), pt = catTotals(addMonths(rm, -1));
    const catItems = Object.entries(ct).map(([id, v]) => ({ c: cat(id), v, p: pt[id] || 0 })).filter((x) => x.c).sort((a, b) => b.v - a.v);
    const rangeTotals = {};
    months.forEach((m) => Object.entries(catTotals(m)).forEach(([id, v]) => (rangeTotals[id] = (rangeTotals[id] || 0) + v)));
    const trendCats = Object.entries(rangeTotals).sort((a, b) => b[1] - a[1]).map(([id]) => cat(id)).filter(Boolean).slice(0, 8);
    if (!UI.trendCat || !trendCats.find((c) => c.id === UI.trendCat)) UI.trendCat = trendCats[0]?.id || null;
    const merch = {};
    S.txns.forEach((t) => { if (t.type === 'expense' && periodOf(t.date) >= months[0] && t.note) merch[t.note] = (merch[t.note] || 0) + t.amount; });
    const topM = Object.entries(merch).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const topMax = topM[0]?.[1] || 1;
    const incSources = catTotals(rm, 'income');

    mount = () => {
      const labels = months.map((m) => monthLabel(m, 'short', false));
      const tl = months.map((m) => pLabel(m));
      Charts.bars($('#rBars'), { labels, tipLabels: tl, series: [{ name: 'Income', color: 'var(--income)', values: inc }, { name: 'Expenses', color: 'var(--expense)', values: exp }], fmt, fmtAxis: fmtC, height: 230,
        tipExtra: (i) => `<div class="tip-row tip-sep">Net<b>${fmt(net[i])}</b></div>`, onClick: (i) => { UI.reportMonth = months[i]; render(false); }, active: months.indexOf(rm), aria: 'Income and expenses by month' });
      Charts.area($('#rNet'), { labels, tipLabels: tl, series: [{ name: 'Net worth', color: 'var(--accent)', values: months.map((m) => r2(netWorth(monthEnd(m)))) }], fmt, fmtAxis: fmtC, height: 200, aria: 'Net worth over time' });
      const dn = $('#rDonut');
      if (dn && catItems.length) Charts.donut(dn, { items: catItems.map((x) => ({ label: x.c.name, value: x.v, color: x.c.color })), fmt: fmtW, size: 200, thickness: 24, centerLabel: 'Spent' });
      $$('#catTable [data-li]').forEach((li) => { li.addEventListener('pointerenter', () => dn?._focus?.(+li.dataset.li)); li.addEventListener('pointerleave', () => dn?._reset?.()); });
      const tc = cat(UI.trendCat);
      if (tc && $('#rTrend')) Charts.bars($('#rTrend'), { labels, tipLabels: tl, series: [{ name: tc.name, color: tc.color, values: months.map((m) => r2(catTotals(m)[tc.id] || 0)) }], fmt, fmtAxis: fmtC, height: 190, aria: `${tc.name} by month` });
      Charts.heatmap($('#rHeat'), { start: pStart(rm), values: dailySpend(rm), fmt, today: rm === curP() ? dayIdx(rm, today()) : null });
      const isrc = $('#rIncome');
      const incItems = Object.entries(incSources).map(([id, v]) => ({ c: cat(id), v })).filter((x) => x.c).sort((a, b) => b.v - a.v);
      if (isrc && incItems.length) Charts.donut(isrc, { items: incItems.map((x) => ({ label: x.c.name, value: x.v, color: x.c.color })), fmt: fmtW, size: 150, thickness: 16, centerLabel: 'Income' });
    };

    const dailyAvg = sum(dailySpend(rm)) / elapsed(rm);
    return `${header('Reports', 'See the patterns behind your money.', `<div class="seg sm" role="group" aria-label="Range">${[3, 6, 12].map((n) => `<button class="${UI.range === n ? 'on' : ''}" data-act="range" data-n="${n}">${n}M</button>`).join('')}</div>`)}
    <div class="grid">
      <div class="tiles span-12">
        <div class="tile"><span>Avg monthly income</span><b data-count="${avgInc}">${fmtW(avgInc)}</b></div>
        <div class="tile"><span>Avg monthly spend</span><b data-count="${avgExp}">${fmtW(avgExp)}</b></div>
        <div class="tile"><span>Savings rate</span><b class="${rate < 0 ? 'neg' : 'pos'}" data-count="${rate}" data-fmt="pct">${rate.toFixed(0)}%</b></div>
        <div class="tile"><span>Best month</span><b>${best ? (payday() === 1 ? monthLabel(best, 'short') : pLabel(best)) : '—'}</b></div>
      </div>
      <section class="card span-7"><div class="card-h"><h2>Income vs expenses</h2><span class="legend-inline"><i style="background:var(--income)"></i>In <i style="background:var(--expense)"></i>Out</span></div><div id="rBars" class="chart-box"></div><p class="hint">Tap a month to drill in below.</p></section>
      <section class="card span-5"><div class="card-h"><h2>Net worth</h2></div><div id="rNet" class="chart-box"></div></section>

      <section class="card span-12 drill">
        <div class="card-h"><h2>Breakdown</h2>${monthSwitch('reportMonth')}</div>
        ${catItems.length ? `<div class="breakdown"><div id="rDonut"></div>
          <ul class="cat-table" id="catTable">${catItems.map((x, i) => {
            const ch = x.p ? ((x.v - x.p) / x.p) * 100 : null;
            return `<li data-li="${i}"><span class="ct-name">${catMark(x.c)}${esc(x.c.name)}</span>${bar(x.v / catItems[0].v, x.c.color, 'thin')}<b>${fmt(x.v)}</b>
              <span class="ct-ch ${ch == null ? '' : ch > 0 ? 'bad' : 'good'}">${ch == null ? 'new' : `${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(0)}%`}</span></li>`;
          }).join('')}</ul></div>` : empty('pie', 'No spending this month', 'Pick another month or add some expenses.')}
      </section>

      <section class="card span-7"><div class="card-h"><h2>Category trend</h2></div>
        <div class="chips scroll">${trendCats.map((c) => `<button class="chip${UI.trendCat === c.id ? ' on' : ''}" data-act="trend" data-id="${c.id}">${ci(c.icon, 14)}${esc(c.name)}</button>`).join('')}</div>
        ${trendCats.length ? '<div id="rTrend" class="chart-box"></div>' : empty('trendUp', 'Nothing to trend yet', 'Spending history shows up here.')}</section>

      <section class="card span-5"><div class="card-h"><h2>Daily spending</h2><span class="muted sm">avg ${fmt(dailyAvg)}/day</span></div><div id="rHeat"></div></section>

      <section class="card span-7"><div class="card-h"><h2>Top places</h2><span class="muted sm">last ${UI.range} months</span></div>
        ${topM.length ? `<ul class="merch">${topM.map(([n, v]) => `<li><span>${esc(n)}</span>${bar(v / topMax, 'var(--accent)', 'thin')}<b>${fmtW(v)}</b></li>`).join('')}</ul>` : empty('store', 'No places yet', 'Add notes to expenses to see where you spend most.')}</section>
      <section class="card span-5"><div class="card-h"><h2>Income sources</h2><span class="muted sm">${pLabel(rm)}</span></div>
        ${Object.keys(incSources).length ? `<div class="donut-row"><div id="rIncome"></div><ul class="legend">${Object.entries(incSources).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<li><span>${catMark(cat(id))}${esc(cat(id)?.name)}</span><b>${fmtW(v)}</b></li>`).join('')}</ul></div>` : empty('coins', 'No income this month', 'Income you record shows here.')}</section>
    </div>`;
  }

  function viewAccounts() {
    const months = lastMonths(12);
    const nw = netWorth();
    const assets = sum(S.accounts.map((a) => accountBalance(a.id)).filter((b) => b > 0));
    const debts = sum(S.accounts.map((a) => accountBalance(a.id)).filter((b) => b < 0));
    mount = () => {
      Charts.area($('#nwChart'), { labels: months.map((m) => monthLabel(m, 'short', false)), tipLabels: months.map((m) => `End of ${pLabel(m)}`), series: [{ name: 'Balance', color: 'var(--accent)', values: months.map((m) => r2(netWorth(monthEnd(m)))) }], fmt, fmtAxis: fmtC, height: 220, aria: 'Total balance over 12 months' });
    };
    const TYPE = { bank: 'Bank', cash: 'Cash', savings: 'Savings', credit: 'Credit card', invest: 'Investment', other: 'Other' };
    return `${header('Accounts', 'Every balance, month by month.', `<button class="btn ghost sm" data-act="transfer">${ci('arrows', 16)} Transfer</button><button class="btn primary sm" data-act="add-acct">${ci('plus', 16)} Account</button>`)}
    <div class="grid">
      <section class="card span-12"><div class="card-h"><div><div class="eyebrow">Total balance</div><div class="big-num" data-count="${nw}">${fmt(nw)}</div></div>
        <div class="split-stats"><div><span>Assets</span><b class="pos">${fmtW(assets)}</b></div><div><span>Owed on cards</span><b class="neg">${fmtW(Math.abs(debts))}</b></div></div></div>
        <div id="nwChart" class="chart-box"></div></section>
      ${S.accounts.map((a) => {
        const bal = accountBalance(a.id);
        const hist = lastMonths(6).map((m) => accountBalance(a.id, monthEnd(m)));
        const n = S.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
        return `<button class="card span-3 acct" data-act="edit-acct" data-id="${a.id}" style="--c:${a.color}">
          <div class="acct-top"><span class="acct-dot"></span><span class="pill">${TYPE[a.type] || a.type}</span></div>
          <div class="acct-name">${esc(a.name)}</div><div class="acct-bal ${bal < 0 ? 'neg' : ''}" data-count="${bal}">${fmt(bal)}</div>
          ${Charts.spark(hist, a.color, 160, 36)}<div class="acct-sub">${n} transaction${n === 1 ? '' : 's'}</div></button>`;
      }).join('')}
    </div>`;
  }

  function viewRecurring() {
    const list = [...S.recurring].sort((a, b) => (a.next < b.next ? -1 : 1));
    const mExp = sum(list.filter((r) => r.type === 'expense').map((r) => perMonth(r.amount, r.freq)));
    const mInc = sum(list.filter((r) => r.type === 'income').map((r) => perMonth(r.amount, r.freq)));
    const in30 = dstr(new Date(Date.now() + 30 * 864e5));
    const upcoming = list.filter((r) => r.next <= in30);
    mount = null;
    const row = (r) => `<button class="tx" data-act="edit-rec" data-id="${r.id}">${brandOf(r.name) ? brandIco(brandOf(r.name)) : catIco(cat(r.categoryId)?.icon || 'repeat', cat(r.categoryId)?.color || COLORS[7])}
      <span class="tx-main"><span class="tx-title">${esc(r.name)} ${r.auto ? '<span class="pill tiny">auto</span>' : '<span class="pill tiny warn">confirm</span>'}</span><span class="tx-sub">${FREQ[r.freq]} · next ${fmtDate(r.next)}</span></span>
      <span class="tx-amt ${r.type}">${r.type === 'income' ? '+' : '−'}${fmt(r.amount)}</span></button>`;
    return `${header('Recurring', 'Rent, subscriptions and paychecks on autopilot.', `<button class="btn primary sm" data-act="add-rec">${ci('plus', 16)} Recurring</button>`)}
    ${list.length ? `<div class="grid">
      <div class="tiles span-12"><div class="tile"><span>Fixed costs / month</span><b class="neg" data-count="${mExp}">${fmt(mExp)}</b></div><div class="tile"><span>Regular income / month</span><b class="pos" data-count="${mInc}">${fmt(mInc)}</b></div>
        <div class="tile"><span>Left after fixed costs</span><b data-count="${mInc - mExp}">${fmt(mInc - mExp)}</b></div><div class="tile"><span>Active</span><b>${list.length}</b></div></div>
      <section class="card span-5"><div class="card-h"><h2>Next 30 days</h2></div>
        ${upcoming.length ? `<ol class="timeline">${upcoming.map((r) => `<li><span class="tl-date"><b>${parseD(r.next).getDate()}</b>${parseD(r.next).toLocaleString(document.documentElement.lang || undefined, { month: 'short' })}</span><span class="tl-name">${catMark(cat(r.categoryId))}${esc(r.name)}</span><b class="tx-amt ${r.type}">${fmt(r.amount)}</b></li>`).join('')}</ol>` : empty('calendar', 'All clear', 'Nothing due in the next 30 days.')}</section>
      <section class="card span-7"><div class="card-h"><h2>All recurring</h2></div><div class="tx-list">${list.map(row).join('')}</div>
        <p class="hint"><b>Auto</b> items are added for you on their date. <b>Confirm</b> items wait on the Home screen for a tap.</p></section>
    </div>` : `<div class="card">${empty('repeat', 'Nothing recurring yet', 'Add rent, subscriptions or your paycheck and they will be logged automatically.', '<button class="btn primary" data-act="add-rec">Add recurring</button>')}</div>`}`;
  }

  function viewGoals() {
    const tSaved = sum(S.goals.map((g) => g.saved)), tTarget = sum(S.goals.map((g) => g.target));
    mount = null;
    return `${header('Goals', 'Save toward the things that matter.', `<button class="btn primary sm" data-act="add-goal">${ci('plus', 16)} Goal</button>`)}
    ${S.goals.length ? `<div class="grid">
      <section class="card span-12 goals-sum"><div><div class="eyebrow">Saved across goals</div><div class="big-num" data-count="${tSaved}">${fmt(tSaved)}</div><div class="muted">of ${fmt(tTarget)}</div></div>${bar(tTarget ? tSaved / tTarget : 0, 'linear-gradient(90deg,var(--accent),var(--income))', 'fat')}</section>
      ${S.goals.map((g) => {
        const p = g.target ? g.saved / g.target : 0, done = p >= 1;
        let plan = '';
        if (!done && g.deadline) {
          const now = new Date(), dl = parseD(g.deadline);
          const mLeft = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth());
          plan = dl < now ? '<span class="neg">Past the deadline</span>' : `Save <b>${fmtW((g.target - g.saved) / mLeft)}</b>/month to hit it by ${dl.toLocaleDateString(document.documentElement.lang || undefined, { month: 'short', year: 'numeric' })}`;
        } else if (!done) plan = `${fmtW(g.target - g.saved)} to go`;
        return `<section class="card span-4 goal${done ? ' done' : ''}" style="--c:${g.color}">
          <div class="goal-ring">${Charts.ring(p, g.color, 120, 11)}<div class="gr-c"><span class="gr-e" style="color:${g.color}">${ci(g.icon, 26)}</span><b>${Math.round(clamp(p, 0, 1) * 100)}%</b></div></div>
          <h3>${esc(g.name)}</h3><div class="goal-amt"><b>${fmt(g.saved)}</b> of ${fmt(g.target)}</div>
          <p class="goal-plan">${done ? `<span class="pos">${ci('check', 14)} Goal reached</span>` : plan}</p>
          <div class="goal-btns"><button class="btn ghost sm" data-act="edit-goal" data-id="${g.id}">Edit</button><button class="btn primary sm" data-act="fund-goal" data-id="${g.id}">${done ? 'Adjust' : 'Add money'}</button></div></section>`;
      }).join('')}
    </div>` : `<div class="card">${empty('target', 'Set a savings goal', 'An emergency fund, a trip, a new laptop — track progress with a ring that fills up.', '<button class="btn primary" data-act="add-goal">Create a goal</button>')}</div>`}`;
  }

  function viewDebts() {
    const owe = S.debts.filter((d) => d.direction === 'owe'), owed = S.debts.filter((d) => d.direction === 'owed');
    const left = (d) => Math.max(0, d.amount - d.paid);
    mount = null;
    const card = (d) => {
      const p = d.amount ? d.paid / d.amount : 0, done = p >= 1;
      return `<div class="debt${done ? ' done' : ''}"><div class="debt-top"><div><b>${esc(d.name)}</b><span>${d.due && !done ? `Next due ${fmtDate(d.due)}` : done ? 'Paid off' : esc(d.note || '')}</span></div>
        <div class="debt-amt"><b>${fmt(left(d))}</b><span>left of ${fmtW(d.amount)}</span></div></div>
        ${bar(p, d.direction === 'owe' ? 'var(--accent)' : 'var(--income)')}
        <div class="debt-btns"><button class="btn ghost sm" data-act="edit-debt" data-id="${d.id}">Edit</button>${done ? '' : `<button class="btn primary sm" data-act="pay-debt" data-id="${d.id}">${d.direction === 'owe' ? 'Record payment' : 'Record repayment'}</button>`}</div></div>`;
    };
    return `${header('Debts', 'Loans you are paying off and money people owe you.', `<button class="btn primary sm" data-act="add-debt">${ci('plus', 16)} Debt</button>`)}
    ${S.debts.length ? `<div class="grid">
      <div class="tiles span-12"><div class="tile"><span>You owe</span><b class="neg" data-count="${sum(owe.map(left))}">${fmt(sum(owe.map(left)))}</b></div><div class="tile"><span>Owed to you</span><b class="pos" data-count="${sum(owed.map(left))}">${fmt(sum(owed.map(left)))}</b></div>
        <div class="tile"><span>Paid off so far</span><b data-count="${sum(owe.map((d) => d.paid))}">${fmt(sum(owe.map((d) => d.paid)))}</b></div><div class="tile"><span>Open debts</span><b>${S.debts.filter((d) => left(d) > 0).length}</b></div></div>
      <section class="card span-6"><div class="card-h"><h2>I owe</h2></div>${owe.length ? owe.map(card).join('') : '<p class="muted">Nothing — nice.</p>'}</section>
      <section class="card span-6"><div class="card-h"><h2>Owed to me</h2></div>${owed.length ? owed.map(card).join('') : '<p class="muted">No one owes you money.</p>'}</section>
    </div>` : `<div class="card">${empty('users', 'No debts tracked', 'Track a loan you are paying down, or money a friend owes you.', '<button class="btn primary" data-act="add-debt">Add a debt</button>')}</div>`}`;
  }

  /** How many things use a category: transactions (incl. split parts), recurring items, and its budget. */
  function catUsage(id) {
    let txns = 0;
    S.txns.forEach((t) => { if (parts(t).some((p) => p.categoryId === id) || (t.type === 'transfer' && t.categoryId === id)) txns++; });
    const rec = S.recurring.filter((r) => r.categoryId === id).length;
    return { txns, rec, budget: S.budgets[id] || 0, total: txns + rec };
  }
  /** Category manager card — shown in Settings and on the Categories page. */
  function categoryManager() {
    const kind = UI.catTab || 'expense';
    const list = catsOf(kind);
    const blurb = { expense: 'Where your money goes. Used for budgets and spending reports.', income: 'Where your money comes from.', transfer: 'Money moved between your own accounts, like savings or paying off your card. Transfers never count as spending.' };
    return `<section class="card span-12 cat-manager"><div class="card-h"><div><h2>Categories</h2><p class="muted sm cm-blurb">${blurb[kind]}</p></div>
        <button class="btn primary sm" data-act="add-cat" data-kind="${kind}">${ci('plus', 16)} New ${KIND_LABEL[kind].toLowerCase()} category</button></div>
      <div class="seg cm-tabs" role="tablist">${['expense', 'income', 'transfer'].map((k) => `<button role="tab" aria-selected="${kind === k}" class="${kind === k ? 'on' : ''}" data-act="cat-tab" data-k="${k}">${KIND_LABEL[k]}<span class="cm-count">${catsOf(k).length}</span></button>`).join('')}</div>
      <div class="cm-list">${list.map((c, i) => {
        const u = catUsage(c.id);
        const bits = [`${u.txns} transaction${u.txns === 1 ? '' : 's'}`];
        if (u.rec) bits.push(`${u.rec} recurring`);
        if (u.budget) bits.push(`budget ${fmtW(u.budget)}`);
        return `<button class="cm-row" data-act="edit-cat" data-id="${c.id}" style="--i:${Math.min(i, 16)}">${catIco(c.icon, c.color)}
          <span class="tx-main"><span class="tx-title">${esc(c.name)}</span><span class="tx-sub">${bits.join(' · ')}</span></span>
          <span class="cm-edit">${icon('edit', 16)}</span></button>`;
      }).join('') || `<p class="muted">No ${KIND_LABEL[kind].toLowerCase()} categories yet.</p>`}</div></section>`;
  }
  function viewCategories() {
    mount = null;
    return `${header('Categories', 'Make the app fit how you spend.')}<div class="grid">${categoryManager()}</div>`;
  }

  function viewSettings() {
    mount = () => {
      $('#setName').addEventListener('change', (e) => { S.settings.name = e.target.value.trim().slice(0, 30); save(); toast('Name saved'); });
      $('#setCur').addEventListener('change', (e) => { S.settings.currency = e.target.value; S.settings.currencySet = true; save(); setupFormatters(); toast(`Currency set to ${e.target.value}`); render(false); });
      $('#importFile').addEventListener('change', importJSON);
      $('#setPay').addEventListener('change', (e) => {
        S.settings.payday = +e.target.value; save();
        UI.month = UI.reportMonth = curP(); UI.filter.month = '';
        toast(payday() === 1 ? 'Using calendar months' : `Pay month now starts on the ${ordinal(payday())}`);
        render(false);
      });
    };
    return `${header('Settings', 'Your data never leaves this device unless you export it.')}
    <div class="grid">
      <section class="card span-6"><div class="card-h"><h2>Profile</h2></div>
        <label class="field"><span>Your name</span><input id="setName" value="${esc(S.settings.name)}" placeholder="For the greeting on Home" maxlength="30"></label>
        <label class="field"><span>Currency</span><select id="setCur">${CURRENCIES.map((c) => `<option ${S.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>Payday</span><select id="setPay">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${payday() === d ? 'selected' : ''}>${d === 1 ? '1st — use calendar months' : `The ${ordinal(d)} of each month`}</option>`).join('')}</select>
          <small class="muted">Your budget month runs from payday to the day before the next one. Pick 1st for normal calendar months.</small></label>
        <div class="field"><span>Theme</span><div class="seg">${['auto', 'light', 'dark'].map((t) => `<button class="${S.settings.theme === t ? 'on' : ''}" data-act="theme" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
      </section>
      <section class="card span-6"><div class="card-h"><h2>Privacy</h2></div>
        <p class="muted">Lock the app with a passcode. It is asked for when you open Wisely or come back after a minute away.</p>
        ${S.settings.lock ? `<div class="btn-row"><span class="pill good">${ci('lock', 12)} Passcode on</span><button class="btn ghost sm" data-act="set-lock">Change</button><button class="btn danger sm" data-act="remove-lock">Turn off</button></div>` : `<button class="btn primary sm" data-act="set-lock" ${window.crypto?.subtle ? '' : 'disabled'}>Set a passcode</button>`}
      </section>
      <section class="card span-6"><div class="card-h"><h2>Backup & export</h2>${backupStatus()}</div>
        <p class="muted">Your data only lives on this device. Save a backup somewhere safe (Google Drive, or email it to yourself) so a lost phone or cleared browser doesn't wipe it.</p>
        <div class="btn-row"><button class="btn primary sm" data-act="backup-now">${ci('lifebuoy', 16)} Back up now</button>
          <label class="btn ghost sm file-btn">${ci('upload', 16)} Restore backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
          <button class="btn ghost sm" data-act="export-csv">${ci('download', 16)} Transactions (.csv)</button></div>
      </section>
      ${categoryManager()}
      <section class="card span-6"><div class="card-h"><h2>Bank statements</h2></div>
        <p class="muted">Import a CSV statement from FNB, Capitec, Standard Bank, Absa, Nedbank, Discovery, TymeBank and most other banks. Wisely sorts the transactions into categories and skips ones you already have.</p>
        <button class="btn ghost sm" data-act="import-bank">${ci('upload', 16)} Import bank statement</button>
      </section>
      <section class="card span-6"><div class="card-h"><h2>Data</h2></div>
        <p class="muted">${S.txns.length} transactions · ${S.accounts.length} accounts · ${S.goals.length} goals</p>
        <div class="btn-row"><button class="btn ghost sm" data-act="load-demo">Load demo data</button><button class="btn danger sm" data-act="reset">Erase everything</button></div>
      </section>
    </div>`;
  }

  function viewMore() {
    mount = null;
    const items = NAV.filter((n) => !BOTTOM.includes(n.id));
    const blurb = { accounts: 'Balances & net worth', goals: 'Savings targets', recurring: 'Bills & paychecks', debts: 'Loans & IOUs', categories: 'Customize', settings: 'Currency, lock, backup' };
    return `${header('More')}<div class="more-grid">${items.map((n, i) => `<a class="card more-tile" href="#/${n.id}" style="--i:${i}">${icon(n.id, 26)}<b>${n.label}</b><span>${blurb[n.id]}</span></a>`).join('')}</div>`;
  }

  const VIEWS = { home: viewHome, activity: viewActivity, budgets: viewBudgets, reports: viewReports, accounts: viewAccounts, recurring: viewRecurring, goals: viewGoals, debts: viewDebts, categories: viewCategories, settings: viewSettings, more: viewMore };
  const route = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return VIEWS[r] ? r : 'home'; };

  function render(anim = true) {
    Charts.hideTip();
    const r = route();
    const v = $('#view');
    mount = null;
    v.innerHTML = VIEWS[r]();
    markNav(r);
    document.title = r === 'home' ? 'Wisely — Budget' : `${NAV.find((n) => n.id === r)?.label || 'More'} — Wisely`;
    if (anim) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
    try { mount?.(); } catch (e) { console.error(e); }
    Charts.animate(v);
    countUps(v, anim);
  }

  function countUps(root, anim) {
    $$('[data-count]', root).forEach((el) => {
      const to = +el.dataset.count;
      const f = el.dataset.fmt === 'pct' ? (x) => `${Math.round(x)}%` : fmt;
      if (!anim || reduceMotion()) { el.textContent = f(to); return; }
      const dur = 900, t0 = performance.now();
      const step = (now) => { const p = Math.min(1, (now - t0) / dur); el.textContent = f(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  function fmtDate(s, long = false) {
    const td = today(), y = dstr(new Date(Date.now() - 864e5));
    if (s === td) return 'Today';
    if (s === y) return 'Yesterday';
    const d = parseD(s);
    return d.toLocaleDateString(document.documentElement.lang || undefined, long ? { weekday: 'long', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) } : { month: 'short', day: 'numeric' });
  }

  /* ---------- sheet / toast / confetti ---------- */
  let lastFocus = null;
  function openSheet(title, body, onMount) {
    lastFocus = document.activeElement;
    const root = $('#sheet');
    root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab" aria-hidden="true"></div><header class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="sheet-body">${body}</div></div>`;
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => root.classList.add('open'));
    document.body.classList.add('noscroll');
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeSheet));
    const panel = $('.sheet-panel', root);
    onMount?.(panel);
    setTimeout(() => ($('[autofocus]', panel) || $('input,select,button', panel))?.focus({ preventScroll: true }), 260);
  }
  function closeSheet() {
    const root = $('#sheet');
    if (!root.classList.contains('open')) return;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('noscroll');
    setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 320);
    lastFocus?.focus?.({ preventScroll: true });
  }
  function toast(msg, undo) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Undo</button>' : ''}`;
    $('#toasts').appendChild(t);
    if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4200);
  }
  function confetti() {
    if (reduceMotion()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = COLORS[i % COLORS.length];
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
      p.style.setProperty('--r', `${Math.random() * 900 - 450}deg`);
      p.style.animationDelay = `${Math.random() * 0.35}s`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }
  const commit = (msg, undo) => { save(); render(false); if (msg) toast(msg, undo); };
  const snapshot = () => JSON.stringify(S);
  const restore = (snap) => () => { S = JSON.parse(snap); save(); render(false); };
  const numVal = (el) => {
    // Accept SA-style "1 234,50" as well as "1234.50".
    let s = String(el.value).trim().replace(/[\s ]/g, '');
    if (/,\d{1,2}$/.test(s) && !s.includes('.')) s = s.replace(',', '.');
    const v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isFinite(v) ? r2(v) : NaN;
  };
  const swatches = (name, sel) => `<div class="swatches" role="radiogroup" aria-label="Color">${COLORS.map((c) => `<label><input type="radio" name="${name}" value="${c}" ${c === sel ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div>`;
  const opts = (arr, sel) => arr.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');

  /* ---------- transaction sheet ---------- */
  function txSheet(id, preset = {}) {
    const t = id ? S.txns.find((x) => x.id === id) : null;
    const st = t ? JSON.parse(JSON.stringify(t)) : { type: preset.type || 'expense', amount: '', date: UI.month === curP() || route() !== 'home' ? today() : pStart(UI.month), accountId: S.accounts[0]?.id, toAccountId: S.accounts[1]?.id || S.accounts[0]?.id, categoryId: null, note: '', splits: null };
    if (!S.accounts.length) { toast('Add an account first'); location.hash = '#/accounts'; return; }
    const notes = [...new Set(sortTx(S.txns).map((x) => x.note).filter(Boolean))].slice(0, 60);
    let catChosenByUser = !!t;
    let pickerOpen = !t;
    const body = `<form id="txf" class="form txform" novalidate>
      <div class="seg full tx-type" id="txType">${['expense', 'income', 'transfer'].map((k) => `<button type="button" data-t="${k}" class="${st.type === k ? 'on' : ''}">${KIND_LABEL[k]}</button>`).join('')}</div>
      <label class="amount-field"><span class="cur">${esc(curSymbol())}</span><input id="txAmt" inputmode="decimal" placeholder="0.00" value="${st.amount || ''}" autocomplete="off" aria-label="Amount" autofocus></label>

      <div class="tx-group">
        <div id="catWrap">
          <button type="button" class="tx-field tf-btn" id="catRow" aria-expanded="false"><span class="tf-l">Category</span><span class="tf-v" id="catVal"></span><span class="tf-chev">${icon('chevR', 16)}</span></button>
          <div class="cat-picker" id="catGrid" role="listbox" aria-label="Category"></div>
        </div>
        <label class="tx-field"><span class="tf-l" id="acctLbl">Account</span><select id="txAcct">${opts(S.accounts, st.accountId)}</select></label>
        <label class="tx-field" id="toWrap"><span class="tf-l">To account</span><select id="txTo">${opts(S.accounts, st.toAccountId)}</select></label>
        <label class="tx-field"><span class="tf-l">Date</span><input type="date" id="txDate" value="${st.date}"></label>
        <label class="tx-field"><span class="tf-l">Note</span><input id="txNote" placeholder="Where or what?" maxlength="80" value="${esc(st.note)}" list="noteList" autocomplete="off"></label>
      </div>
      <datalist id="noteList">${notes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>

      <details class="tx-more" ${st.splits?.length ? 'open' : ''}><summary>${icon('chevR', 14)} More options</summary>
        <div id="splitWrap"><label class="switch"><input type="checkbox" id="txSplit" ${st.splits?.length ? 'checked' : ''}><span class="sw"></span><span>Split across categories</span></label><div id="splitRows"></div></div>
        ${!t ? `<div class="repeat"><label class="switch"><input type="checkbox" id="txRepeat"><span class="sw"></span><span>Repeat this</span></label><select id="txFreq" aria-label="How often">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${k === 'monthly' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
      </details>
      <p class="form-err" id="txErr" role="alert"></p>
      <div class="form-actions">${t ? `<button type="button" class="btn danger" id="txDel">${ci('trash', 16)} Delete</button>` : ''}<button class="btn primary grow" type="submit">${t ? 'Save changes' : `Add ${KIND_LABEL[st.type].toLowerCase()}`}</button></div></form>`;

    openSheet(t ? 'Edit transaction' : 'New transaction', body, (p) => {
      const amt = $('#txAmt', p);
      const kindNow = () => (st.type === 'income' ? 'income' : st.type === 'transfer' ? 'transfer' : 'expense');
      const setPicker = (open) => {
        pickerOpen = open;
        $('#catGrid', p).classList.toggle('open', open);
        $('#catRow', p).setAttribute('aria-expanded', open);
      };
      const drawCats = () => {
        const kind = kindNow();
        if (!st.categoryId || cat(st.categoryId)?.kind !== kind) st.categoryId = null;
        if (kind === 'transfer' && !st.categoryId) st.categoryId = transferCatFor($('#txTo', p).value);
        const c = cat(st.categoryId);
        $('#catVal', p).innerHTML = c ? `${catIco(c.icon, c.color)}<span>${esc(c.name)}</span>` : '<span class="tf-ph">Choose a category</span>';
        $('#catGrid', p).innerHTML = catsOf(kind).map((x) => `<button type="button" class="cp-opt${st.categoryId === x.id ? ' on' : ''}" data-c="${x.id}" style="--c:${x.color}" role="option" aria-selected="${st.categoryId === x.id}">${catIco(x.icon, x.color)}<span>${esc(x.name)}</span></button>`).join('')
          + `<button type="button" class="cp-opt cp-new" data-new="${kind}">${ci('plus', 18)}<span>New</span></button>`;
      };
      const drawSplits = () => {
        const on = $('#txSplit', p).checked && st.type === 'expense';
        $('#splitRows', p).innerHTML = on ? `${(st.splits || []).map((s, i) => `<div class="split-row" data-i="${i}"><select class="sp-c">${opts(catsOf('expense'), s.categoryId)}</select><input class="sp-a" inputmode="decimal" value="${s.amount || ''}" placeholder="0.00" aria-label="Split amount"><button type="button" class="icon-btn sp-x" aria-label="Remove">✕</button></div>`).join('')}
          <div class="split-foot"><button type="button" class="btn ghost sm" id="spAdd">${ci('plus', 14)} Add split</button><span id="spLeft"></span></div>` : '';
        $('#catWrap', p).style.display = on ? 'none' : '';
        updateLeft();
      };
      const readSplits = () => { st.splits = $$('.split-row', p).map((r) => ({ categoryId: $('.sp-c', r).value, amount: numVal($('.sp-a', r)) || 0 })); };
      const updateLeft = () => {
        const el = $('#spLeft', p); if (!el) return;
        const left = r2((numVal(amt) || 0) - sum((st.splits || []).map((s) => s.amount || 0)));
        el.textContent = left === 0 ? '✓ Fully split' : `${fmt(Math.abs(left))} ${left > 0 ? 'left to assign' : 'too much'}`;
        el.className = left === 0 ? 'pos' : 'neg';
      };
      const sync = () => {
        $$('#txType button', p).forEach((b) => b.classList.toggle('on', b.dataset.t === st.type));
        $('#toWrap', p).style.display = st.type === 'transfer' ? '' : 'none';
        $('#acctLbl', p).textContent = st.type === 'transfer' ? 'From account' : 'Account';
        $('#splitWrap', p).style.display = st.type === 'expense' ? '' : 'none';
        p.classList.toggle('t-income', st.type === 'income');
        p.classList.toggle('t-transfer', st.type === 'transfer');
        const go = $('#txf button[type=submit]', p);
        if (!t) go.textContent = `Add ${KIND_LABEL[st.type].toLowerCase()}`;
        drawCats(); drawSplits();
      };
      $('#txType', p).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-t]'); if (!b) return;
        st.type = b.dataset.t; catChosenByUser = false; sync();
        setPicker(st.type !== 'transfer' && !st.categoryId);
      });
      $('#catRow', p).addEventListener('click', () => setPicker(!pickerOpen));
      $('#txTo', p).addEventListener('change', () => { if (st.type === 'transfer' && !catChosenByUser) { st.categoryId = null; drawCats(); } });
      $('#catGrid', p).addEventListener('click', (e) => {
        const nb = e.target.closest('[data-new]');
        if (nb) {
          // Quick-add a category without leaving the transaction (icon & colour can be refined in Settings).
          const kind = nb.dataset.new;
          nb.outerHTML = `<div class="cp-quick"><input id="cpName" maxlength="30" placeholder="New ${KIND_LABEL[kind].toLowerCase()} category" aria-label="New category name"><button type="button" class="btn primary sm" id="cpAdd">Add</button></div>`;
          const inp = $('#cpName', p);
          inp.focus();
          const add = () => {
            const name = inp.value.trim(); if (!name) return;
            const existing = catsOf(kind).find((x) => x.name.toLowerCase() === name.toLowerCase());
            const id = existing ? existing.id : uid();
            if (!existing) { S.categories.push({ id, kind, name, icon: 'tag', color: COLORS[S.categories.length % COLORS.length] }); save(); }
            st.categoryId = id; catChosenByUser = true; drawCats(); setPicker(false);
          };
          $('#cpAdd', p).onclick = add;
          inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
          return;
        }
        const b = e.target.closest('[data-c]'); if (!b) return;
        st.categoryId = b.dataset.c; catChosenByUser = true; drawCats(); setPicker(false);
      });
      $('#txSplit', p).addEventListener('change', (e) => {
        if (e.target.checked && !(st.splits && st.splits.length)) {
          const a = numVal(amt) || 0;
          st.splits = [{ categoryId: st.categoryId || catsOf('expense')[0].id, amount: a }, { categoryId: catsOf('expense')[1]?.id || catsOf('expense')[0].id, amount: 0 }];
        }
        drawSplits();
      });
      $('#splitRows', p).addEventListener('input', () => { readSplits(); updateLeft(); });
      $('#splitRows', p).addEventListener('change', readSplits);
      $('#splitRows', p).addEventListener('click', (e) => {
        if (e.target.closest('#spAdd')) { readSplits(); st.splits.push({ categoryId: catsOf('expense')[0].id, amount: 0 }); drawSplits(); }
        const x = e.target.closest('.sp-x');
        if (x) { readSplits(); st.splits.splice(+x.closest('.split-row').dataset.i, 1); drawSplits(); }
      });
      amt.addEventListener('input', updateLeft);
      $('#txNote', p).addEventListener('change', (e) => {
        if (st.categoryId) return;
        const prev = sortTx(S.txns).find((x) => x.note === e.target.value && x.type === st.type && x.categoryId);
        if (prev) { st.categoryId = prev.categoryId; drawCats(); setPicker(false); }
      });
      sync();
      setPicker(pickerOpen && st.type !== 'transfer' && !st.categoryId);

      $('#txDel', p)?.addEventListener('click', () => {
        const snap = snapshot();
        S.txns = S.txns.filter((x) => x.id !== t.id);
        closeSheet(); commit('Transaction deleted', restore(snap));
      });
      $('#txf', p).addEventListener('submit', (e) => {
        e.preventDefault();
        const err = (m) => { $('#txErr', p).textContent = m; p.querySelector('.form').classList.remove('shake'); void p.offsetWidth; p.querySelector('.form').classList.add('shake'); };
        const a = numVal(amt);
        if (!(a > 0)) return err('Enter an amount greater than zero.');
        const out = { id: t?.id || uid(), type: st.type, amount: a, date: $('#txDate', p).value || today(), accountId: $('#txAcct', p).value, note: $('#txNote', p).value.trim(), recurringId: t?.recurringId };
        if (st.type === 'transfer') {
          out.toAccountId = $('#txTo', p).value;
          if (out.toAccountId === out.accountId) return err('Pick two different accounts.');
          out.categoryId = st.categoryId || transferCatFor(out.toAccountId);
        } else if (st.type === 'expense' && $('#txSplit', p).checked) {
          readSplits();
          const sp = st.splits.filter((s) => s.amount > 0);
          if (sp.length < 2) return err('A split needs at least two parts with amounts.');
          if (Math.abs(sum(sp.map((s) => s.amount)) - a) > 0.009) return err(`Splits must add up to ${fmt(a)}.`);
          out.splits = sp; out.categoryId = sp[0].categoryId;
        } else {
          if (!st.categoryId) { setPicker(true); return err('Pick a category.'); }
          out.categoryId = st.categoryId;
        }
        if (t) Object.keys(t).forEach((k) => delete t[k]), Object.assign(t, out);
        else S.txns.push(out);
        if (!t && $('#txRepeat', p)?.checked) {
          const rid = uid();
          S.recurring.push({ id: rid, name: out.note || cat(out.categoryId)?.name || 'Transfer', type: out.type, amount: a, categoryId: out.categoryId, accountId: out.accountId, toAccountId: out.toAccountId || null, freq: $('#txFreq', p).value, next: addFreq(out.date, $('#txFreq', p).value), auto: true });
          out.recurringId = rid;
        }
        closeSheet();
        const over = out.type === 'expense' ? budgetRows(periodOf(out.date)).find((b) => parts(out).some((x) => x.categoryId === b.cat.id) && b.spent > b.limit) : null;
        commit(t ? 'Saved' : over ? `Added — heads up, ${over.cat.name} is over budget` : `${out.type === 'income' ? 'Income' : out.type === 'transfer' ? 'Transfer' : 'Expense'} added`);
      });
    });
  }

  /* ---------- other sheets ---------- */
  function budgetSheet() {
    const last3 = lastMonths(3, addMonths(curP(), -1));
    const avg = {};
    last3.forEach((m) => Object.entries(catTotals(m)).forEach(([id, v]) => (avg[id] = (avg[id] || 0) + v / 3)));
    openSheet('Monthly budgets', `<form class="form" id="bf"><p class="muted">Leave a field empty for no limit. Limits apply to every month.</p>
      <button type="button" class="btn ghost sm" id="suggest">${ci('sparkles', 16)} Suggest from last 3 months</button>
      <div class="budget-edit">${catsOf('expense').map((c) => `<label class="be-row"><span><span class="be-name">${catMark(c)}${esc(c.name)}</span><small>${avg[c.id] ? `avg ${fmtW(avg[c.id])}` : ''}</small></span><span class="money-in"><em>${esc(curSymbol())}</em><input inputmode="decimal" data-c="${c.id}" value="${S.budgets[c.id] || ''}" placeholder="No limit"></span></label>`).join('')}</div>
      <div class="form-actions"><button class="btn primary grow">Save budgets</button></div></form>`, (p) => {
      $('#suggest', p).onclick = () => $$('[data-c]', p).forEach((i) => { const v = avg[i.dataset.c]; if (v) i.value = Math.ceil((v * 1.05) / 10) * 10; });
      $('#bf', p).onsubmit = (e) => {
        e.preventDefault();
        const b = {};
        $$('[data-c]', p).forEach((i) => { const v = numVal(i); if (v > 0) b[i.dataset.c] = v; });
        S.budgets = b; closeSheet(); commit('Budgets saved');
      };
    });
  }

  function acctSheet(id) {
    const a = id ? acct(id) : null;
    const has = a && S.txns.some((t) => t.accountId === a.id || t.toAccountId === a.id);
    openSheet(a ? 'Edit account' : 'New account', `<form class="form" id="af">
      <label class="field"><span>Name</span><input id="aName" value="${esc(a?.name || '')}" required maxlength="40" placeholder="e.g. FNB cheque account" autofocus></label>
      <div class="row2"><label class="field"><span>Type</span><select id="aType">${[['bank', 'Bank'], ['cash', 'Cash'], ['savings', 'Savings'], ['credit', 'Credit card'], ['invest', 'Investment'], ['other', 'Other']].map(([v, l]) => `<option value="${v}" ${a?.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Starting balance</span><input id="aOpen" inputmode="decimal" value="${a?.opening ?? ''}" placeholder="0.00"></label></div>
      <div class="field"><span>Color</span>${swatches('aColor', a?.color || COLORS[S.accounts.length % COLORS.length])}</div>
      <p class="muted sm">For a credit card, enter what you owe as a negative number.</p>
      <p class="form-err" id="aErr"></p>
      <div class="form-actions">${a ? '<button type="button" class="btn danger" id="aDel">Delete</button>' : ''}<button class="btn primary grow">Save</button></div></form>`, (p) => {
      $('#aDel', p)?.addEventListener('click', () => {
        if (has) { $('#aErr', p).textContent = 'This account has transactions. Move or delete them first.'; return; }
        if (S.accounts.length <= 1) { $('#aErr', p).textContent = 'You need at least one account.'; return; }
        const snap = snapshot(); S.accounts = S.accounts.filter((x) => x.id !== a.id); closeSheet(); commit('Account deleted', restore(snap));
      });
      $('#af', p).onsubmit = (e) => {
        e.preventDefault();
        const name = $('#aName', p).value.trim();
        if (!name) { $('#aErr', p).textContent = 'Give the account a name.'; return; }
        const o = { name, type: $('#aType', p).value, opening: numVal($('#aOpen', p)) || 0, color: $('[name=aColor]:checked', p)?.value || COLORS[0] };
        if (a) Object.assign(a, o); else S.accounts.push({ id: uid(), ...o });
        closeSheet(); commit('Account saved');
      };
    });
  }

  function recSheet(id) {
    const r = id ? S.recurring.find((x) => x.id === id) : null;
    let type = r?.type || 'expense';
    openSheet(r ? 'Edit recurring' : 'New recurring', `<form class="form" id="rf">
      <div class="seg full" id="rType">${['expense', 'income'].map((k) => `<button type="button" data-t="${k}" class="${type === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="row2"><label class="field"><span>Name</span><input id="rName" value="${esc(r?.name || '')}" maxlength="50" placeholder="e.g. Netflix" autofocus></label>
      <label class="field"><span>Amount</span><input id="rAmt" inputmode="decimal" value="${r?.amount || ''}" placeholder="0.00"></label></div>
      <div class="row2"><label class="field"><span>Category</span><select id="rCat"></select></label><label class="field"><span>Account</span><select id="rAcct">${opts(S.accounts, r?.accountId)}</select></label></div>
      <div class="row2"><label class="field"><span>How often</span><select id="rFreq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${(r?.freq || 'monthly') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Next date</span><input type="date" id="rNext" value="${r?.next || today()}"></label></div>
      <label class="switch"><input type="checkbox" id="rAuto" ${r ? (r.auto ? 'checked' : '') : 'checked'}><span class="sw"></span><span>Add automatically <small class="muted">(off = ask me to confirm)</small></span></label>
      <p class="form-err" id="rErr"></p>
      <div class="form-actions">${r ? '<button type="button" class="btn danger" id="rDel">Delete</button>' : ''}<button class="btn primary grow">Save</button></div></form>`, (p) => {
      const drawCat = () => { $('#rCat', p).innerHTML = opts(catsOf(type), r?.categoryId); $$('#rType button', p).forEach((b) => b.classList.toggle('on', b.dataset.t === type)); };
      $('#rType', p).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; drawCat(); } };
      drawCat();
      $('#rDel', p)?.addEventListener('click', () => { const snap = snapshot(); S.recurring = S.recurring.filter((x) => x.id !== r.id); closeSheet(); commit('Recurring item deleted', restore(snap)); });
      $('#rf', p).onsubmit = (e) => {
        e.preventDefault();
        const o = { name: $('#rName', p).value.trim(), type, amount: numVal($('#rAmt', p)), categoryId: $('#rCat', p).value, accountId: $('#rAcct', p).value, freq: $('#rFreq', p).value, next: $('#rNext', p).value || today(), auto: $('#rAuto', p).checked };
        if (!o.name) return void ($('#rErr', p).textContent = 'Give it a name.');
        if (!(o.amount > 0)) return void ($('#rErr', p).textContent = 'Enter an amount greater than zero.');
        if (r) Object.assign(r, o); else S.recurring.push({ id: uid(), ...o });
        closeSheet();
        const n = processRecurring();
        commit(n ? `Saved — logged ${n} past occurrence${n === 1 ? '' : 's'}` : 'Recurring saved');
      };
    });
  }

  function goalSheet(id) {
    const g = id ? S.goals.find((x) => x.id === id) : null;
    let gIcon = g ? iconKey(g.icon) : 'target';
    openSheet(g ? 'Edit goal' : 'New goal', `<form class="form" id="gf">
      <label class="field"><span>Name</span><input id="gName" value="${esc(g?.name || '')}" maxlength="40" placeholder="e.g. Emergency fund" autofocus></label>
      <div class="field"><span>Icon</span>${iconPicker(gIcon, g?.color || 'var(--accent)')}</div>
      <div class="row2"><label class="field"><span>Target</span><input id="gTarget" inputmode="decimal" value="${g?.target || ''}" placeholder="0.00"></label><label class="field"><span>Already saved</span><input id="gSaved" inputmode="decimal" value="${g?.saved || ''}" placeholder="0.00"></label></div>
      <label class="field"><span>Target date (optional)</span><input type="date" id="gDate" value="${g?.deadline || ''}"></label>
      <div class="field"><span>Color</span>${swatches('gColor', g?.color || COLORS[S.goals.length % COLORS.length])}</div>
      <p class="form-err" id="gErr"></p>
      <div class="form-actions">${g ? '<button type="button" class="btn danger" id="gDel">Delete</button>' : ''}<button class="btn primary grow">Save</button></div></form>`, (p) => {
      bindIconPicker(p, (k) => { gIcon = k; });
      $$('[name=gColor]', p).forEach((r) => r.addEventListener('change', () => $('.icon-pick', p).style.setProperty('--c', r.value)));
      $('#gDel', p)?.addEventListener('click', () => { const snap = snapshot(); S.goals = S.goals.filter((x) => x.id !== g.id); closeSheet(); commit('Goal deleted', restore(snap)); });
      $('#gf', p).onsubmit = (e) => {
        e.preventDefault();
        const o = { icon: gIcon, name: $('#gName', p).value.trim(), target: numVal($('#gTarget', p)), saved: numVal($('#gSaved', p)) || 0, deadline: $('#gDate', p).value, color: $('[name=gColor]:checked', p)?.value || COLORS[0] };
        if (!o.name) return void ($('#gErr', p).textContent = 'Give your goal a name.');
        if (!(o.target > 0)) return void ($('#gErr', p).textContent = 'Set a target amount.');
        if (g) Object.assign(g, o); else S.goals.push({ id: uid(), ...o });
        closeSheet(); commit('Goal saved');
      };
    });
  }

  function amountSheet(title, label, hint, onOk, allowNeg = false) {
    openSheet(title, `<form class="form" id="mf"><p class="muted">${hint}</p>
      <label class="amount-field"><span class="cur">${esc(curSymbol())}</span><input id="mAmt" inputmode="decimal" placeholder="0.00" aria-label="${esc(label)}" autofocus></label>
      ${allowNeg ? '<label class="switch"><input type="checkbox" id="mNeg"><span class="sw"></span><span>Take money out instead</span></label>' : ''}
      <p class="form-err" id="mErr"></p><div class="form-actions"><button class="btn primary grow">${esc(label)}</button></div></form>`, (p) => {
      $('#mf', p).onsubmit = (e) => {
        e.preventDefault();
        const v = numVal($('#mAmt', p));
        if (!(v > 0)) return void ($('#mErr', p).textContent = 'Enter an amount greater than zero.');
        closeSheet(); onOk($('#mNeg', p)?.checked ? -v : v);
      };
    });
  }

  function debtSheet(id) {
    const d = id ? S.debts.find((x) => x.id === id) : null;
    let dir = d?.direction || 'owe';
    openSheet(d ? 'Edit debt' : 'New debt', `<form class="form" id="df">
      <div class="seg full" id="dDir"><button type="button" data-t="owe" class="${dir === 'owe' ? 'on' : ''}">I owe</button><button type="button" data-t="owed" class="${dir === 'owed' ? 'on' : ''}">Owed to me</button></div>
      <label class="field"><span>Name</span><input id="dName" value="${esc(d?.name || '')}" maxlength="50" placeholder="e.g. Car loan, or a friend's name" autofocus></label>
      <div class="row2"><label class="field"><span>Total amount</span><input id="dAmt" inputmode="decimal" value="${d?.amount || ''}" placeholder="0.00"></label><label class="field"><span>Paid so far</span><input id="dPaid" inputmode="decimal" value="${d?.paid || ''}" placeholder="0.00"></label></div>
      <div class="row2"><label class="field"><span>Next due (optional)</span><input type="date" id="dDue" value="${d?.due || ''}"></label><label class="field"><span>Note</span><input id="dNote" value="${esc(d?.note || '')}" maxlength="60"></label></div>
      <p class="form-err" id="dErr"></p>
      <div class="form-actions">${d ? '<button type="button" class="btn danger" id="dDel">Delete</button>' : ''}<button class="btn primary grow">Save</button></div></form>`, (p) => {
      $('#dDir', p).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { dir = b.dataset.t; $$('#dDir button', p).forEach((x) => x.classList.toggle('on', x === b)); } };
      $('#dDel', p)?.addEventListener('click', () => { const snap = snapshot(); S.debts = S.debts.filter((x) => x.id !== d.id); closeSheet(); commit('Debt deleted', restore(snap)); });
      $('#df', p).onsubmit = (e) => {
        e.preventDefault();
        const o = { direction: dir, name: $('#dName', p).value.trim(), amount: numVal($('#dAmt', p)), paid: numVal($('#dPaid', p)) || 0, due: $('#dDue', p).value, note: $('#dNote', p).value.trim() };
        if (!o.name) return void ($('#dErr', p).textContent = 'Give it a name.');
        if (!(o.amount > 0)) return void ($('#dErr', p).textContent = 'Enter the total amount.');
        if (d) Object.assign(d, o); else S.debts.push({ id: uid(), ...o });
        closeSheet(); commit('Debt saved');
      };
    });
  }

  /* ---------- icon picker ---------- */
  const iconPicker = (sel, color) => `<div class="icon-pick" style="--c:${color}">
      <label class="search ip-search">${icon('search', 16)}<input type="search" placeholder="Search icons — e.g. car, rent, pets" aria-label="Search icons"></label>
      <div class="icon-grid" role="radiogroup" aria-label="Icon">${PICKABLE.map((k) => `<button type="button" class="ip${k === sel ? ' on' : ''}" data-icon="${k}" role="radio" aria-checked="${k === sel}" title="${CI_LABEL[k]}" aria-label="${CI_LABEL[k]}">${ci(k, 20)}</button>`).join('')}</div></div>`;
  function bindIconPicker(root, onPick) {
    const grid = $('.icon-grid', root);
    $('.ip-search input', root).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.ip', grid).forEach((b) => { b.hidden = !!q && !(`${CI_LABEL[b.dataset.icon]} ${b.dataset.icon}`.toLowerCase().includes(q)); });
    });
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.ip'); if (!b) return;
      $$('.ip', grid).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      onPick(b.dataset.icon);
    });
  }
  const fallbackCatId = (kind, except) => {
    const pref = { expense: 'other', income: 'other_in', transfer: 'tr_between' }[kind];
    const pool = catsOf(kind).filter((x) => x.id !== except);
    return (pool.find((x) => x.id === pref) || pool[0] || {}).id;
  };
  /** Move everything that uses one category onto another, then remove it. Nothing is deleted from history. */
  function reassignCategory(fromId, toId) {
    S.txns.forEach((t) => {
      if (t.categoryId === fromId) t.categoryId = toId;
      if (t.splits && t.splits.length) {
        const m = {};
        t.splits.forEach((s) => { const id = s.categoryId === fromId ? toId : s.categoryId; m[id] = r2((m[id] || 0) + s.amount); });
        const merged = Object.entries(m).map(([categoryId, amount]) => ({ categoryId, amount }));
        if (merged.length > 1) t.splits = merged; else { t.splits = null; t.categoryId = merged[0].categoryId; }
      }
    });
    S.recurring.forEach((r) => { if (r.categoryId === fromId) r.categoryId = toId; });
    if (S.budgets[fromId]) { S.budgets[toId] = r2((S.budgets[toId] || 0) + S.budgets[fromId]); delete S.budgets[fromId]; }
    if (UI.trendCat === fromId) UI.trendCat = null;
    if (UI.filter.cat === fromId) UI.filter.cat = '';
    S.categories = S.categories.filter((x) => x.id !== fromId);
  }

  function catSheet(id, kindIn) {
    const c = id ? cat(id) : null;
    const st = { kind: c?.kind || kindIn || UI.catTab || 'expense' };
    st.icon = c ? iconKey(c.icon) : { income: 'coins', transfer: 'arrows' }[st.kind] || 'tag';
    st.color = c?.color || COLORS[S.categories.length % COLORS.length];
    const u = c ? catUsage(c.id) : null;
    const usage = u ? [u.txns && `${u.txns} transaction${u.txns === 1 ? '' : 's'}`, u.rec && `${u.rec} recurring`, u.budget && `a ${fmtW(u.budget)} budget`].filter(Boolean) : [];
    openSheet(c ? 'Edit category' : 'New category', `<form class="form" id="cf" novalidate>
      <div class="cat-preview"><span id="cPrev">${catIco(st.icon, st.color)}</span><div><b id="cPrevName">${esc(c?.name || 'New category')}</b><span class="muted sm" id="cPrevKind">${KIND_LABEL[st.kind]} category</span></div></div>
      ${c ? '' : `<div class="field"><span>Type</span><div class="seg full" id="cKind">${['expense', 'income', 'transfer'].map((k) => `<button type="button" data-k="${k}" class="${st.kind === k ? 'on' : ''}">${KIND_LABEL[k]}</button>`).join('')}</div></div>`}
      <label class="field"><span>Name</span><input id="cName" value="${esc(c?.name || '')}" maxlength="30" placeholder="e.g. Pets, Car insurance, School fees" autocomplete="off" autofocus></label>
      <div class="field"><span>Icon</span>${iconPicker(st.icon, st.color)}</div>
      <div class="field"><span>Colour</span>${swatches('cColor', st.color)}</div>
      ${c ? `<p class="muted sm cat-note">${ci('check', 14)} ${usage.length ? `Used by ${usage.join(', ')}. ` : ''}Changes show up everywhere straight away — history is kept.</p>` : ''}
      <div id="cDelPanel"></div>
      <p class="form-err" id="cErr" role="alert"></p>
      <div class="form-actions">${c ? `<button type="button" class="btn danger" id="cDel">${ci('trash', 16)} Delete</button>` : ''}<button class="btn primary grow">${c ? 'Save changes' : 'Create category'}</button></div></form>`, (p) => {
      const preview = () => {
        $('#cPrev', p).innerHTML = catIco(st.icon, st.color);
        $('#cPrevName', p).textContent = $('#cName', p).value.trim() || c?.name || 'New category';
        $('#cPrevKind', p).textContent = `${KIND_LABEL[st.kind]} category`;
        $('.icon-pick', p).style.setProperty('--c', st.color);
      };
      bindIconPicker(p, (k) => { st.icon = k; preview(); });
      $('#cName', p).addEventListener('input', preview);
      $$('[name=cColor]', p).forEach((r) => r.addEventListener('change', () => { st.color = r.value; preview(); }));
      $('#cKind', p)?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        st.kind = b.dataset.k;
        $$('#cKind button', p).forEach((x) => x.classList.toggle('on', x === b));
        preview();
      });

      $('#cDel', p)?.addEventListener('click', () => {
        const panel = $('#cDelPanel', p);
        const others = catsOf(c.kind).filter((x) => x.id !== c.id);
        const name = esc(c.name);
        if (!u.total && !u.budget) {
          panel.innerHTML = `<div class="del-panel"><div class="dp-h">${ci('alert', 18)} Delete “${name}”?</div><p>No transactions use it, so nothing else changes.</p>
            <div class="btn-row"><button type="button" class="btn ghost sm" data-dp="cancel">Cancel</button><button type="button" class="btn danger-solid sm" data-dp="go">Delete category</button></div></div>`;
        } else if (!others.length) {
          panel.innerHTML = `<div class="del-panel"><div class="dp-h">${ci('alert', 18)} “${name}” can't be deleted yet</div><p>It's used by ${usage.join(', ')} and it's your only ${KIND_LABEL[c.kind].toLowerCase()} category. Create another one first so these have somewhere to go.</p>
            <div class="btn-row"><button type="button" class="btn ghost sm" data-dp="cancel">OK</button></div></div>`;
        } else {
          panel.innerHTML = `<div class="del-panel"><div class="dp-h">${ci('alert', 18)} “${name}” is in use</div>
            <p>It's used by <b>${usage.join(', ')}</b>. Nothing will be lost — choose a category to move ${u.total === 1 ? 'it' : 'them'} to.${u.budget ? ' Its budget is added to that category.' : ''}</p>
            <label class="field"><span>Move everything to</span><select id="dpTo">${opts(others, fallbackCatId(c.kind, c.id))}</select></label>
            <div class="btn-row"><button type="button" class="btn ghost sm" data-dp="cancel">Cancel</button><button type="button" class="btn danger-solid sm" data-dp="go">Move & delete</button></div></div>`;
        }
        panel.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
        panel.onclick = (e) => {
          const b = e.target.closest('[data-dp]'); if (!b) return;
          if (b.dataset.dp === 'cancel') { panel.innerHTML = ''; return; }
          const snap = snapshot();
          const to = $('#dpTo', panel)?.value;
          const toName = to ? cat(to)?.name : '';
          if (to) reassignCategory(c.id, to); else S.categories = S.categories.filter((x) => x.id !== c.id);
          closeSheet();
          commit(to ? `Deleted ${c.name} — ${u.total} item${u.total === 1 ? '' : 's'} moved to ${toName}` : `Deleted ${c.name}`, restore(snap));
        };
      });

      $('#cf', p).onsubmit = (e) => {
        e.preventDefault();
        const name = $('#cName', p).value.trim();
        if (!name) return void ($('#cErr', p).textContent = 'Give the category a name.');
        const clash = catsOf(st.kind).find((x) => x.id !== c?.id && x.name.toLowerCase() === name.toLowerCase());
        if (clash) return void ($('#cErr', p).textContent = `You already have ${st.kind === 'transfer' ? 'a' : 'an'} ${KIND_LABEL[st.kind].toLowerCase()} category called “${clash.name}”.`);
        const o = { name, icon: st.icon, color: st.color };
        if (c) Object.assign(c, o); else S.categories.push({ id: uid(), kind: st.kind, ...o });
        UI.catTab = st.kind;
        closeSheet(); commit(c ? 'Category updated' : `${name} added`);
      };
    });
  }

  /* ---------- passcode ---------- */
  async function hash(pin, salt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function keypad(title, sub, len, onDone) {
    const ov = $('#overlay');
    let val = '';
    ov.innerHTML = `<div class="lock" role="dialog" aria-modal="true" aria-label="${esc(title)}"><img src="icon.svg" width="56" height="56" alt=""><h2>${esc(title)}</h2><p class="muted" id="lkSub">${esc(sub)}</p>
      <div class="dots" id="dots">${'<i></i>'.repeat(len)}</div>
      <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
      <button class="btn ghost sm" id="lkCancel" hidden>Cancel</button></div>`;
    ov.classList.add('show');
    const dots = $$('#dots i', ov);
    const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < val.length));
    const api = {
      fail(msg) { $('#dots', ov).classList.remove('shake'); void ov.offsetWidth; $('#dots', ov).classList.add('shake'); $('#lkSub', ov).textContent = msg; val = ''; draw(); },
      setSub(msg) { $('#lkSub', ov).textContent = msg; val = ''; draw(); },
      close() { ov.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(() => (ov.innerHTML = ''), 300); },
      cancellable(fn) { const b = $('#lkCancel', ov); b.hidden = false; b.onclick = () => { api.close(); fn?.(); }; },
    };
    const press = (k) => {
      if (k === '⌫') val = val.slice(0, -1);
      else if (val.length < len) val += k;
      draw();
      if (val.length === len) { const v = val; setTimeout(() => onDone(v, api), 120); }
    };
    ov.querySelector('.keys').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
    const onKey = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); };
    document.addEventListener('keydown', onKey);
    return api;
  }
  let locked = false;
  function showLock() {
    const L = S.settings.lock;
    if (!L || locked) return;
    locked = true;
    keypad('Welcome back', 'Enter your passcode', L.len, async (v, api) => {
      if ((await hash(v, L.salt)) === L.hash) { api.close(); locked = false; }
      else api.fail('Wrong passcode — try again');
    });
  }
  function setLock() {
    let first = null;
    const api = keypad('Set a passcode', 'Choose 4 digits', 4, async (v, k) => {
      if (!first) { first = v; k.setSub('Enter it again to confirm'); return; }
      if (v !== first) { first = null; k.fail('They did not match — start again'); return; }
      const salt = uid();
      S.settings.lock = { salt, len: 4, hash: await hash(v, salt) };
      k.close(); commit('Passcode on');
    });
    api.cancellable();
  }

  /* ---------- import / export ---------- */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCSV() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Amount', 'Category', 'Account', 'To account', 'Note']];
    sortTx(S.txns).forEach((t) => {
      parts(t).forEach((p) => rows.push([t.date, t.type, (t.type === 'expense' ? -p.amount : p.amount).toFixed(2), cat(p.categoryId)?.name || '', acct(t.accountId)?.name || '', acct(t.toAccountId)?.name || '', t.note + (t.splits?.length > 1 ? ' (split)' : '')]));
    });
    download(`wisely-transactions-${today()}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
    toast('CSV downloaded');
  }
  function importJSON(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.txns) || !Array.isArray(d.accounts)) throw new Error('bad');
        if (!confirm(`Restore this backup? It replaces your current data (${S.txns.length} transactions) with ${d.txns.length} transactions.`)) return;
        const snap = snapshot();
        S = Object.assign(defaults(), d);
        migrate();
        setupFormatters(); applyTheme(); commit('Backup restored', restore(snap));
      } catch (err) { toast('That file is not a Wisely backup.'); }
    };
    rd.readAsText(f);
    e.target.value = '';
  }

  /* ---------- backups ---------- */
  const daysSince = (d) => Math.round((parseD(today()) - parseD(d)) / 864e5);
  function backupStatus() {
    const l = S.settings.lastBackup;
    if (!l) return '<span class="pill warn">Never backed up</span>';
    const n = daysSince(l);
    return `<span class="pill ${n >= 7 ? 'warn' : 'good'}">Last backup ${n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`}</span>`;
  }
  function backupNudge() {
    if (S.txns.length < 10) return '';
    if (S.settings.backupSnooze && S.settings.backupSnooze > today()) return '';
    const l = S.settings.lastBackup;
    if (l && daysSince(l) < 7) return '';
    return `<section class="card span-12 backup-nudge"><span class="bn-ico">${ci('lifebuoy', 26)}</span>
      <div class="bn-text"><b>${l ? `Your last backup was ${daysSince(l)} days ago` : 'You haven\'t backed up yet'}</b>
        <span>Your money data only lives on this device. A backup is the only way to get it back if the phone is lost or the browser is cleared.</span></div>
      <div class="btn-row"><button class="btn ghost sm" data-act="snooze-backup">Later</button><button class="btn primary sm" data-act="backup-now">Back up now</button></div></section>`;
  }
  async function backupNow() {
    const prev = S.settings.lastBackup;
    S.settings.lastBackup = today();
    delete S.settings.backupSnooze;
    const name = `wisely-backup-${today()}.json`;
    const text = JSON.stringify(S, null, 2);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        // On phones the share sheet lets you save straight to Google Drive, iCloud, email or WhatsApp.
        await navigator.share({ files: [file], title: 'Wisely backup' });
      } else download(name, text, 'application/json');
      commit('Backup saved — keep the file somewhere safe');
    } catch (e) {
      S.settings.lastBackup = prev;
      if (e && e.name === 'AbortError') return;
      download(name, text, 'application/json');
      S.settings.lastBackup = today();
      commit('Backup downloaded');
    }
  }

  /* ---------- bank statement import ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const head = text.split(/\r?\n/).slice(0, 40).join('\n');
    const count = (ch) => head.split(ch).length - 1;
    const delim = [',', ';', '\t', '|'].sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  }
  function parseAmount(v) {
    let s = String(v ?? '').trim();
    if (!s || !/\d/.test(s)) return NaN;
    const neg = /-/.test(s) || /^\(.*\)$/.test(s) || /\bdr\b/i.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c >= 0) s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(v) {
    const s = String(v ?? '').trim();
    let y, m, d, x;
    if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [, y, m, d] = x;
    else if ((x = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [, y, m, d] = x;
    else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) { [, d, m, y] = x; if (+m > 12 && +d <= 12) [d, m] = [m, d]; }
    else if ((x = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?(?:[\s-,]+(\d{2,4}))?/))) { d = x[1]; m = MON[x[2].slice(0, 3).toLowerCase()]; y = x[3]; }
    else if ((x = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/))) { m = MON[x[1].slice(0, 3).toLowerCase()]; d = x[2]; y = x[3]; }
    else return null;
    m = +m; d = +d; y = +y;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    if (!y) { y = new Date().getFullYear(); if (`${y}-${pad(m)}-${pad(d)}` > today()) y--; }
    else if (y < 100) y += 2000;
    if (y < 1990 || y > 2100) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  function detectColumns(rows) {
    const map = { header: -1, date: -1, desc: -1, amount: -1, credit: -1, debit: -1, fee: -1, skip: [] };
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i].map((c) => c.toLowerCase());
      if (r.some((c) => /date/.test(c)) && r.some((c) => /amount|description|money|debit|credit|details|narrative/.test(c))) { map.header = i; break; }
    }
    if (map.header >= 0) {
      const H = rows[map.header].map((c) => c.toLowerCase().trim());
      const find = (res) => { for (const re of res) { const i = H.findIndex((c) => re.test(c)); if (i >= 0) return i; } return -1; };
      map.date = find([/^transaction date$/, /^date$/, /^posting date$/, /date/]);
      map.desc = find([/^description$/, /description/, /narrative|details|payee|reference|beneficiary|particulars/]);
      map.amount = find([/^amount/, /amount/]);
      map.credit = find([/money in|credit|deposit|paid in/]);
      map.debit = find([/money out|debit|withdrawal|paid out/]);
      map.fee = find([/^fees?$/, /\bfees?\b/]);
      return map;
    }
    // No header row (e.g. Standard Bank exports): work the columns out from the data itself.
    const sample = rows.filter((r) => r.length > 2).slice(0, 60);
    const width = Math.max(0, ...sample.map((r) => r.length));
    const score = (fn) => Array.from({ length: width }, (_, i) => sample.filter((r) => fn(r[i] ?? '')).length);
    const best = (arr, not = []) => { let bi = -1, bv = 0; arr.forEach((v, i) => { if (!not.includes(i) && v > bv) { bv = v; bi = i; } }); return bi; };
    map.date = best(score((c) => /\d/.test(c) && c.length >= 6 && !!parseDate(c)));
    // Columns that never change on transaction rows (like Standard Bank's "HIST") are noise.
    const txRows = sample.filter((r) => parseDate(r[map.date]));
    for (let i = 0; i < width; i++) { const vals = new Set(txRows.map((r) => r[i] ?? '')); if (vals.size === 1 && txRows.length > 1 && i !== map.date) map.skip.push(i); }
    map.amount = best(score((c) => /^[\s(R-]*[\d\s,.]*\d[.,]\d{2}\)?\s*(cr|dr)?$/i.test(c)), [...map.skip, map.date]);
    map.desc = best(score((c) => /[a-z]{3}/i.test(c)), [...map.skip, map.date, map.amount]);
    return map;
  }
  function statementRows(rows, map) {
    const out = [];
    for (let i = map.header + 1; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDate(r[map.date]);
      if (!date) continue;
      let amt;
      if (map.amount >= 0) amt = parseAmount(r[map.amount]);
      else {
        const c = parseAmount(r[map.credit]), d = parseAmount(r[map.debit]);
        amt = isFinite(c) && c !== 0 ? Math.abs(c) : isFinite(d) && d !== 0 ? -Math.abs(d) : NaN;
      }
      let raw = map.desc >= 0 ? r[map.desc] : '';
      if (map.header < 0) raw = r.filter((c, j) => j !== map.date && j !== map.amount && !map.skip.includes(j) && /[a-z]{2}/i.test(c)).join(' ');
      raw = (raw || '').replace(/\s+/g, ' ').trim();
      if (isFinite(amt) && amt !== 0) out.push({ date, amount: r2(amt), raw: raw || 'Transaction' });
      if (map.fee >= 0) { const f = parseAmount(r[map.fee]); if (isFinite(f) && f !== 0) out.push({ date, amount: -Math.abs(r2(f)), raw: `Bank fee${raw ? ' — ' + raw : ''}`, fee: true }); }
    }
    return out;
  }
  function cleanDesc(s) {
    let t = String(s).replace(/\s+/g, ' ').replace(/^[#*\s]+/, '').trim();
    t = t.replace(/\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b\.?/gi, '');
    t = t.replace(/^(pos (local )?purchase|card purchase|pos purchase|purchase|debit order|magtape debit|fnb app payment to|payment to|ib payment to|internet (banking )?payment( to)?|send money( to)?|recurring card purchase)[:\s-]*/i, '');
    t = t.replace(/\b\d{4,}\*+\d{2,}\b|\*{2,}\d+|\b\d{6,}\b|\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, '').replace(/\s+/g, ' ').replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, '');
    // Banks shout: "CHECKERS SANDTON" → "Checkers Sandton" (short codes like "ZA" stay as they are).
    t = t.replace(/\b[A-Z][A-Z'&]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/\.(Com|Co\.Za|Co|Za|Net|Org)\b/g, (m) => m.toLowerCase());
    return t.slice(0, 80) || 'Transaction';
  }
  const RULES = [
    [/salary|payroll|wages|\bsal\b/i, 'salary'],
    [/interest|dividend/i, 'invest'],
    [/bank fee|service fee|monthly (account )?fee|admin fee|\bfees?\b|bank charges?/i, 'fees'],
    [/uber ?eats|mr ?d\b|nando|kfc|mcdonald|burger king|steers|wimpy|debonairs|spur\b|roman'?s|fishaways|ocean basket|vida e|kauai|mugg|seattle|starbucks|bootlegger|restaurant|cafe|coffee|pizza|sushi|chicken licken/i, 'dining'],
    [/checkers|pick ?n ?pay|\bpnp\b|woolworths food|ww food|\bspar\b|shoprite|food lover|usave|boxer|ok foods/i, 'groceries'],
    [/\buber\b|\bbolt\b|engen|shell|\bbp\b|sasol|caltex|totalenergies|astron|gautrain|e-?toll|sanral|parking|taxi|\bfuel\b|petrol/i, 'transport'],
    [/netflix|spotify|showmax|dstv|multichoice|youtube|apple\.com|itunes|google|disney|prime video|amazon prime|icloud|microsoft|adobe|openai|chatgpt/i, 'subs'],
    [/vodacom|\bmtn\b|telkom|cell ?c|\brain\b|afrihost|vumatel|openserve|webafrica|cool ideas|electricity|prepaid elec|eskom|city of|municipal|\brates\b|\bwater\b/i, 'utilities'],
    [/dis-?chem|clicks|pharmac|discovery health|medical|momentum health|bonitas|virgin active|planet fitness|doctor|hospital|netcare|mediclinic|life health/i, 'health'],
    [/ster-?kinekor|nu metro|computicket|ticketpro|quicket|playstation|steam|xbox|betway|hollywoodbets/i, 'fun'],
    [/\brent\b|\bbond\b|\blevy\b|home loan/i, 'housing'],
    [/takealot|mr ?price|woolworths|makro|\bgame\b|h&m|zara|superbalist|amazon|temu|shein|edgars|truworths|foschini|ackermans|\bpep\b|incredible|builders|cotton on|sportscene|totalsports/i, 'shopping'],
    [/udemy|coursera|unisa|school|varsity|university|exclusive books|\bcna\b/i, 'education'],
    [/flysafair|\blift\b|airlink|kulula|airbnb|booking\.com|hotel|lodge|travelstart/i, 'travel'],
  ];
  function guessCat(note, raw, type, learned) {
    const kind = type === 'income' ? 'income' : 'expense';
    const l = learned.get(note.toLowerCase());
    if (l && cat(l)?.kind === kind) return l;
    const text = `${note} ${raw}`;
    for (const [re, id] of RULES) if (re.test(text) && cat(id)?.kind === kind) return id;
    return cat(kind === 'income' ? 'other_in' : 'other') ? (kind === 'income' ? 'other_in' : 'other') : catsOf(kind)[0]?.id;
  }

  function importSheet() {
    if (!S.accounts.length) { toast('Add an account first'); location.hash = '#/accounts'; return; }
    let rows = null, map = null, items = [], fileName = '';
    openSheet('Import bank statement', `<div class="form" id="imp">
      <p class="muted">In your banking app or website, download a statement as <b>CSV</b>, then choose it here. FNB, Capitec, Standard Bank, Absa, Nedbank, Discovery and TymeBank all work.</p>
      <label class="field"><span>Which account is this statement for?</span><select id="impAcct">${opts(S.accounts, S.accounts.find((a) => a.type === 'bank')?.id || S.accounts[0].id)}</select></label>
      <label class="drop" id="impDrop"><input type="file" id="impFile" accept=".csv,text/csv,.txt,text/plain" hidden><span class="drop-ico">${ci('file', 26)}</span><b>Choose CSV statement</b><span class="muted sm">or drag the file here</span></label>
      <div id="impBody"></div></div>`, (p) => {
      p.classList.add('wide');
      const body = $('#impBody', p), drop = $('#impDrop', p);
      const headers = () => (map.header >= 0 ? rows[map.header] : (rows.find((r) => r.length > 2) || rows[0]).map((c, i) => `Column ${i + 1} (${c.slice(0, 16)})`));
      const colOpts = (sel) => `<option value="-1">—</option>${headers().map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}`;
      const mapUI = (open) => `<details class="imp-map" ${open ? 'open' : ''}><summary>Columns ${open ? '' : '<span class="muted">— worked out automatically, tap to change</span>'}</summary>
        <div class="row2">${[['date', 'Date'], ['desc', 'Description'], ['amount', 'Amount (+ / −)'], ['credit', 'Money in'], ['debit', 'Money out']].map(([k, l]) => `<label class="field"><span>${l}</span><select data-map="${k}">${colOpts(map[k])}</select></label>`).join('')}</div>
        <p class="muted sm">Use one Amount column, or separate Money in / Money out columns.</p></details>`;
      const learnedMap = () => { const m = new Map(); sortTx(S.txns).reverse().forEach((t) => { if (t.note && t.categoryId && t.type !== 'transfer' && !(t.splits && t.splits.length)) m.set(t.note.toLowerCase(), t.categoryId); }); return m; };

      const build = () => {
        const acc = $('#impAcct', p).value;
        const learned = learnedMap();
        const keys = new Set(S.txns.map((t) => t.importKey).filter(Boolean));
        const manual = new Set(S.txns.filter((t) => t.accountId === acc && !t.importKey && t.type !== 'transfer').map((t) => `${t.date}|${t.type}|${t.amount.toFixed(2)}`));
        const seen = new Map();
        items = statementRows(rows, map).map((r) => {
          const type = r.amount > 0 ? 'income' : 'expense';
          const amount = Math.abs(r.amount);
          const note = cleanDesc(r.raw);
          let key = `${acc}|${r.date}|${r.amount.toFixed(2)}|${r.raw.toLowerCase()}`;
          const n = (seen.get(key) || 0) + 1; seen.set(key, n);
          if (n > 1) key += `#${n}`;
          const dup = keys.has(key) ? 'Already imported' : manual.has(`${r.date}|${type}|${amount.toFixed(2)}`) ? 'Possible duplicate' : '';
          return { date: r.date, type, amount, note, raw: r.raw, key, dup, on: !dup, categoryId: r.fee && cat('fees') ? 'fees' : guessCat(note, r.raw, type, learned) };
        }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        draw();
      };
      const footer = () => {
        const on = items.filter((x) => x.on);
        const inc = sum(on.filter((x) => x.type === 'income').map((x) => x.amount)), out = sum(on.filter((x) => x.type === 'expense').map((x) => x.amount));
        const go = $('#impGo', p);
        if (go) { go.disabled = !on.length; go.textContent = `Import ${on.length} transaction${on.length === 1 ? '' : 's'}`; }
        const t = $('#impTot', p);
        if (t) t.innerHTML = `<span class="pos">+${fmt(inc)}</span><span class="neg">−${fmt(out)}</span>`;
      };
      const draw = () => {
        if (!items.length) {
          body.innerHTML = `<p class="form-err">Couldn't find any transactions in that file. Check the columns below.</p>${mapUI(true)}`;
          return;
        }
        const dups = items.filter((x) => x.dup).length;
        const first = items[items.length - 1].date, last = items[0].date;
        body.innerHTML = `<div class="imp-sum"><div><b>${items.length}</b> transactions · ${shortD(first)} – ${shortD(last)}${dups ? ` · <span class="warn-t">${dups} already in Wisely (unticked)</span>` : ''}</div><div id="impTot" class="imp-tot"></div></div>
          ${mapUI(false)}
          <div class="imp-tools"><span class="muted sm">Check the categories — changing one updates all matching rows.</span><span><button type="button" class="btn ghost sm" data-all="1">Tick all</button> <button type="button" class="btn ghost sm" data-all="0">Untick all</button></span></div>
          <div class="imp-list">${items.map((x, i) => `<div class="imp-row${x.on ? '' : ' off'}" data-i="${i}" style="--i:${Math.min(i, 20)}">
            <input type="checkbox" class="imp-on" ${x.on ? 'checked' : ''} aria-label="Include ${esc(x.note)}">
            <span class="imp-date">${shortD(x.date)}</span>
            <span class="imp-desc"><b title="${esc(x.raw)}">${esc(x.note)}</b>${x.dup ? `<em>${x.dup}</em>` : ''}</span>
            <select class="imp-cat" aria-label="Category">${opts(catsOf(x.type === 'income' ? 'income' : 'expense'), x.categoryId)}</select>
            <b class="tx-amt ${x.type}">${x.type === 'income' ? '+' : '−'}${fmt(x.amount)}</b></div>`).join('')}</div>
          <div class="form-actions imp-actions"><button type="button" class="btn primary grow" id="impGo"></button></div>`;
        footer();
      };
      const load = (f) => {
        if (!f) return;
        if (/\.(pdf|xlsx?|ofx|qif|qfx)$/i.test(f.name)) {
          body.innerHTML = '<p class="form-err">Wisely reads CSV files. In your bank\'s app, choose CSV (sometimes called "comma separated" or "Excel CSV") when you download the statement.</p>';
          return;
        }
        fileName = f.name;
        const rd = new FileReader();
        rd.onload = () => {
          rows = parseCSV(rd.result);
          if (!rows.length) { body.innerHTML = '<p class="form-err">That file is empty.</p>'; return; }
          map = detectColumns(rows);
          drop.classList.add('done');
          $('b', drop).textContent = fileName;
          $('.muted', drop).textContent = 'Tap to choose a different file';
          build();
        };
        rd.readAsText(f);
      };
      $('#impFile', p).addEventListener('change', (e) => { load(e.target.files?.[0]); e.target.value = ''; });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files?.[0]); });
      $('#impAcct', p).addEventListener('change', () => { if (rows) build(); });
      body.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.map) { map[t.dataset.map] = +t.value; if (t.dataset.map === 'amount' && +t.value >= 0) { map.credit = -1; map.debit = -1; } build(); return; }
        const row = t.closest('.imp-row'); if (!row) return;
        const x = items[+row.dataset.i];
        if (t.classList.contains('imp-on')) { x.on = t.checked; row.classList.toggle('off', !x.on); footer(); }
        if (t.classList.contains('imp-cat')) {
          x.categoryId = t.value;
          let n = 0;
          items.forEach((y, j) => {
            if (y !== x && y.type === x.type && y.note.toLowerCase() === x.note.toLowerCase() && y.categoryId !== t.value) {
              y.categoryId = t.value; n++;
              const sel = $(`.imp-row[data-i="${j}"] .imp-cat`, body); if (sel) sel.value = t.value;
            }
          });
          if (n) toast(`Also changed ${n} other "${x.note}" row${n === 1 ? '' : 's'}`);
        }
      });
      body.addEventListener('click', (e) => {
        const all = e.target.closest('[data-all]');
        if (all) { items.forEach((x) => (x.on = all.dataset.all === '1')); draw(); return; }
        if (e.target.closest('#impGo')) {
          const chosen = items.filter((x) => x.on);
          if (!chosen.length) return;
          const acc = $('#impAcct', p).value;
          const snap = snapshot();
          chosen.forEach((x) => S.txns.push({ id: uid(), date: x.date, type: x.type, amount: r2(x.amount), accountId: acc, categoryId: x.categoryId, note: x.note, importKey: x.key }));
          closeSheet();
          UI.filter = { q: '', type: 'all', cat: '', month: '' };
          if (route() !== 'activity') location.hash = '#/activity';
          commit(`Imported ${chosen.length} transaction${chosen.length === 1 ? '' : 's'} into ${acct(acc)?.name}`, restore(snap));
        }
      });
    });
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $('meta[name=theme-color]').setAttribute('content', dark ? '#0c0e16' : '#f4f5fa');
  }

  /* ---------- actions ---------- */
  const ACTIONS = {
    'add-tx': () => txSheet(null),
    'edit-tx': (el) => txSheet(el.dataset.id),
    transfer: () => txSheet(null, { type: 'transfer' }),
    month: (el) => { const k = el.dataset.key; UI[k] = addMonths(UI[k], +el.dataset.d); if (UI[k] > curP()) UI[k] = curP(); render(false); },
    'confirm-rec': (el) => { const r = S.recurring.find((x) => x.id === el.dataset.id); if (!r) return; S.txns.push(txFromRec(r, r.next)); r.next = addFreq(r.next, r.freq); commit(`${r.name} logged`); },
    'skip-rec': (el) => { const r = S.recurring.find((x) => x.id === el.dataset.id); if (!r) return; const snap = snapshot(); r.next = addFreq(r.next, r.freq); commit(`Skipped ${r.name} this time`, restore(snap)); },
    'edit-budgets': budgetSheet,
    ftype: (el) => { UI.filter.type = el.dataset.t; UI.limit = 120; render(false); },
    'more-tx': () => { UI.limit += 200; $('#txWrap').innerHTML = activityList(); Charts.animate($('#txWrap')); },
    range: (el) => { UI.range = +el.dataset.n; render(false); },
    trend: (el) => { UI.trendCat = el.dataset.id; render(false); },
    'add-acct': () => acctSheet(null), 'edit-acct': (el) => acctSheet(el.dataset.id),
    'add-rec': () => recSheet(null), 'edit-rec': (el) => recSheet(el.dataset.id),
    'add-goal': () => goalSheet(null), 'edit-goal': (el) => goalSheet(el.dataset.id),
    'fund-goal': (el) => {
      const g = S.goals.find((x) => x.id === el.dataset.id); if (!g) return;
      amountSheet(`Add to ${g.name}`, 'Save', `${fmt(g.saved)} saved of ${fmt(g.target)}.`, (v) => {
        const was = g.saved >= g.target;
        g.saved = r2(Math.max(0, g.saved + v));
        commit(v > 0 ? `${fmt(v)} added to ${g.name}` : `${fmt(-v)} taken out`);
        if (!was && g.saved >= g.target) { confetti(); toast(`You hit your ${g.name} goal!`); }
      }, true);
    },
    'add-debt': () => debtSheet(null), 'edit-debt': (el) => debtSheet(el.dataset.id),
    'pay-debt': (el) => {
      const d = S.debts.find((x) => x.id === el.dataset.id); if (!d) return;
      amountSheet(d.direction === 'owe' ? 'Record a payment' : 'Record a repayment', 'Record', `${fmt(d.amount - d.paid)} left on ${esc(d.name)}.`, (v) => {
        d.paid = r2(Math.min(d.amount, d.paid + v));
        if (d.paid >= d.amount) { commit(`${d.name} is paid off!`); confetti(); } else commit('Payment recorded');
      });
    },
    'add-cat': (el) => catSheet(null, el.dataset.kind), 'edit-cat': (el) => catSheet(el.dataset.id),
    'cat-tab': (el) => { UI.catTab = el.dataset.k; render(false); },
    theme: (el) => { S.settings.theme = el.dataset.t; save(); applyTheme(); render(false); },
    'set-lock': setLock,
    'remove-lock': () => { S.settings.lock = null; commit('Passcode turned off'); },
    'export-json': () => backupNow(),
    'backup-now': () => backupNow(),
    'snooze-backup': () => { const d = parseD(today()); d.setDate(d.getDate() + 3); S.settings.backupSnooze = dstr(d); commit('I\'ll remind you again in 3 days'); },
    'import-bank': () => importSheet(),
    'export-csv': exportCSV,
    'load-demo': () => {
      if (S.txns.length && !confirm('Replace your current data with demo data?')) return;
      const snap = snapshot(); seedDemo(); processRecurring(); UI.month = UI.reportMonth = curP(); location.hash = '#/home'; commit('Demo data loaded', restore(snap));
    },
    reset: () => {
      if (!confirm('Erase all Wisely data on this device? This cannot be undone unless you have a backup.')) return;
      const keep = { ...S.settings, lock: null }; S = defaults(); S.settings = keep; save(); location.hash = '#/home'; render(); toast('All data erased');
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (!typing && !$('#sheet').classList.contains('open') && !locked && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); txSheet(null); }
  });
  window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo({ top: 0 }); });
  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) < 30) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(() => render(false), 220); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); render(false); });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (S.settings.lock && Date.now() - hiddenAt > 60000 && hiddenAt) showLock();
      if (processRecurring()) render(false);
    }
  });

  /* ---------- onboarding ---------- */
  function welcome() {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="welcome"><div class="w-card"><img src="icon.svg" width="72" height="72" alt="">
      <h1>Welcome to Wisely</h1><p>Budgets, goals, debts and beautiful charts — private, offline and free. Your data stays on this device.</p>
      <ul class="w-feats"><li>${ci('pie', 18)}Animated reports & trends</li><li>${ci('target', 18)}Budgets with "safe to spend"</li><li>${ci('repeat', 18)}Recurring bills on autopilot</li><li>${ci('piggy', 18)}Savings goals & debt payoff</li></ul>
      <div class="w-btns"><button class="btn primary block" id="wDemo">Explore with demo data</button><button class="btn ghost block" id="wFresh">Start fresh</button></div></div></div>`;
    ov.classList.add('show');
    const done = () => { ov.classList.remove('show'); setTimeout(() => (ov.innerHTML = ''), 300); render(); };
    $('#wDemo').onclick = () => { seedDemo(); processRecurring(); UI.month = UI.reportMonth = curP(); done(); };
    $('#wFresh').onclick = () => { save(); done(); };
  }

  /* ---------- boot ---------- */
  const had = load();
  setupFormatters();
  applyTheme();
  UI.month = UI.reportMonth = curP();
  drawNav();
  processRecurring();
  render();
  if (!had) welcome();
  else if (S.settings.lock) showLock();
  const add = new URLSearchParams(location.search).get('add');
  if (add) { txSheet(null, { type: add }); history.replaceState(null, '', location.pathname + location.hash); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
