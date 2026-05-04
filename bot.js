import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN belum diisi. Copy .env.example jadi .env lalu isi token dari BotFather.');
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), 'data.json');
const bot = new Telegraf(BOT_TOKEN);

const defaultAccounts = [
  { id: 'acc_1', name: 'Tunai', balance: 0 },
  { id: 'acc_2', name: 'BCA', balance: 0 },
  { id: 'acc_3', name: 'Gopay', balance: 0 }
];

const userSteps = new Map();

function readDB() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
}

function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getState(userId) {
  const db = readDB();
  if (!db[userId]) {
    db[userId] = {
      transactions: [],
      accounts: structuredClone(defaultAccounts),
      budgets: [],
      createdAt: new Date().toISOString()
    };
    writeDB(db);
  }
  return db[userId];
}

function saveState(userId, state) {
  const db = readDB();
  db[userId] = state;
  writeDB(db);
}

function id() {
  return '_' + Math.random().toString(36).slice(2, 11);
}

function rp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function monthKey(dateStr = new Date().toISOString().slice(0, 10)) {
  return dateStr.slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mainKeyboard() {
  return Markup.keyboard([
    ['➕ Catat Transaksi'],
    ['💰 Ringkasan', '📒 Riwayat'],
    ['🎯 Budget', '👛 Dompet'],
    ['🤖 AI Budget Planner', '⚙️ Reset']
  ]).resize();
}

function typeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💸 Pengeluaran', 'tx_expense'), Markup.button.callback('💵 Pemasukan', 'tx_income')],
    [Markup.button.callback('🔁 Transfer', 'tx_transfer'), Markup.button.callback('🤝 Utang/Piutang', 'tx_debt')]
  ]);
}

function cancelKeyboard() {
  return Markup.keyboard([['❌ Batal']]).resize();
}

function applyBalance(state, tx) {
  const acc = state.accounts.find(a => a.id === tx.accountId);
  if (!acc) return;
  if (tx.type === 'income') acc.balance += tx.amount;
  if (tx.type === 'expense' || tx.type === 'debt') acc.balance -= tx.amount;
  if (tx.type === 'transfer') {
    acc.balance -= tx.amount;
    const to = state.accounts.find(a => a.id === tx.accountToId);
    if (to) to.balance += tx.amount;
  }
}

function summaryText(state) {
  const current = monthKey();
  const total = state.accounts.reduce((sum, a) => sum + a.balance, 0);
  let income = 0;
  let expense = 0;
  state.transactions.filter(t => monthKey(t.date) === current).forEach(t => {
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') expense += t.amount;
  });

  return `💰 *KITA TABUNG - Ringkasan Bulan Ini*\n\nTotal uang kamu: *${rp(total)}*\nMasuk: *+${rp(income)}*\nKeluar: *-${rp(expense)}*\n\nDompet:\n${state.accounts.map(a => `• ${a.name}: *${rp(a.balance)}*`).join('\n')}`;
}

function historyText(state, limit = 10) {
  const list = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
  if (!list.length) return '📒 Belum ada riwayat transaksi.';
  return '📒 *Riwayat Terakhir*\n\n' + list.map(t => {
    const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '-';
    const acc = state.accounts.find(a => a.id === t.accountId)?.name || '-';
    return `• ${t.date} | ${t.category}\n  ${t.type} ${sign}${rp(t.amount)} | ${acc}`;
  }).join('\n\n');
}

function budgetText(state) {
  if (!state.budgets.length) return '🎯 Belum ada budget. Ketik /budget untuk tambah budget.';
  const current = monthKey();
  return '🎯 *Budget Bulan Ini*\n\n' + state.budgets.map(b => {
    const spent = state.transactions
      .filter(t => t.type === 'expense' && t.budgetId === b.id && monthKey(t.date) === current)
      .reduce((s, t) => s + t.amount, 0);
    const pct = b.limit ? Math.min(Math.round((spent / b.limit) * 100), 100) : 0;
    return `• ${b.name}\n  Terpakai: ${rp(spent)} / ${rp(b.limit)} (${pct}%)\n  Sisa: ${rp(b.limit - spent)}`;
  }).join('\n\n');
}

function accountButtons(state, prefix) {
  return Markup.inlineKeyboard(state.accounts.map(a => [Markup.button.callback(`${a.name} (${rp(a.balance)})`, `${prefix}_${a.id}`)]));
}

function budgetButtons(state) {
  const rows = [[Markup.button.callback('Tidak masuk budget', 'budget_none')]];
  state.budgets.forEach(b => rows.push([Markup.button.callback(b.name, `budget_${b.id}`)]));
  return Markup.inlineKeyboard(rows);
}

async function startTransaction(ctx, type) {
  const userId = String(ctx.from.id);
  const state = getState(userId);
  userSteps.set(userId, { mode: 'tx', type, step: 'amount' });
  const label = { expense: 'pengeluaran', income: 'pemasukan', transfer: 'transfer', debt: 'utang/piutang' }[type];
  await ctx.reply(`Oke, catat *${label}*.\nMasukkan nominalnya saja, contoh: 25000`, { parse_mode: 'Markdown', ...cancelKeyboard() });
}

bot.start(ctx => ctx.reply('Halo, Bestie! 👋\nIni versi Bot Telegram dari KITA TABUNG. Semua jalan lewat chat, tanpa install aplikasi.', mainKeyboard()));
bot.command('menu', ctx => ctx.reply('Pilih menu:', mainKeyboard()));
bot.command('ringkasan', ctx => ctx.reply(summaryText(getState(String(ctx.from.id))), { parse_mode: 'Markdown', ...mainKeyboard() }));
bot.command('riwayat', ctx => ctx.reply(historyText(getState(String(ctx.from.id))), { parse_mode: 'Markdown', ...mainKeyboard() }));
bot.command('budget', ctx => {
  const userId = String(ctx.from.id);
  userSteps.set(userId, { mode: 'budget', step: 'name' });
  return ctx.reply('🎯 Nama budget/amplopnya apa? Contoh: Makan, Bensin, Healing', cancelKeyboard());
});
bot.command('dompet', ctx => {
  const userId = String(ctx.from.id);
  userSteps.set(userId, { mode: 'wallet', step: 'name' });
  return ctx.reply('👛 Nama dompet/rekeningnya apa? Contoh: Mandiri, Dana, Kas Toko', cancelKeyboard());
});

bot.hears('➕ Catat Transaksi', ctx => ctx.reply('Mau catat transaksi jenis apa?', typeKeyboard()));
bot.hears('💰 Ringkasan', ctx => ctx.reply(summaryText(getState(String(ctx.from.id))), { parse_mode: 'Markdown', ...mainKeyboard() }));
bot.hears('📒 Riwayat', ctx => ctx.reply(historyText(getState(String(ctx.from.id))), { parse_mode: 'Markdown', ...mainKeyboard() }));
bot.hears('🎯 Budget', ctx => ctx.reply(budgetText(getState(String(ctx.from.id))), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Tambah Budget', 'add_budget')]]) }));
bot.hears('👛 Dompet', ctx => {
  const state = getState(String(ctx.from.id));
  return ctx.reply('👛 *Dompet & Rekening*\n\n' + state.accounts.map(a => `• ${a.name}: *${rp(a.balance)}*`).join('\n'), { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Tambah Dompet', 'add_wallet')]]) });
});
bot.hears('🤖 AI Budget Planner', ctx => {
  const userId = String(ctx.from.id);
  userSteps.set(userId, { mode: 'ai_budget', step: 'income' });
  return ctx.reply('🤖 Masukkan estimasi pemasukan bulan ini. Contoh: 4000000', cancelKeyboard());
});
bot.hears('⚙️ Reset', ctx => ctx.reply('Yakin hapus semua data?', Markup.inlineKeyboard([[Markup.button.callback('Ya, reset', 'reset_yes'), Markup.button.callback('Batal', 'reset_no')]])));

bot.action('tx_expense', ctx => startTransaction(ctx, 'expense'));
bot.action('tx_income', ctx => startTransaction(ctx, 'income'));
bot.action('tx_transfer', ctx => startTransaction(ctx, 'transfer'));
bot.action('tx_debt', ctx => startTransaction(ctx, 'debt'));
bot.action('add_budget', ctx => {
  userSteps.set(String(ctx.from.id), { mode: 'budget', step: 'name' });
  return ctx.reply('🎯 Nama budget/amplopnya apa?', cancelKeyboard());
});
bot.action('add_wallet', ctx => {
  userSteps.set(String(ctx.from.id), { mode: 'wallet', step: 'name' });
  return ctx.reply('👛 Nama dompet/rekeningnya apa?', cancelKeyboard());
});
bot.action('reset_no', ctx => ctx.reply('Reset dibatalkan.', mainKeyboard()));
bot.action('reset_yes', ctx => {
  const db = readDB();
  delete db[String(ctx.from.id)];
  writeDB(db);
  userSteps.delete(String(ctx.from.id));
  return ctx.reply('Data berhasil direset.', mainKeyboard());
});

bot.on('callback_query', async ctx => {
  const data = ctx.callbackQuery.data;
  const userId = String(ctx.from.id);
  const step = userSteps.get(userId);
  const state = getState(userId);

  if (!step) return ctx.answerCbQuery();

  if (data.startsWith('acc_') && step.mode === 'tx') {
    const accountId = data.replace('acc_', '');
    step.accountId = accountId;
    if (step.type === 'transfer' && !step.waitingTo) {
      step.waitingTo = true;
      userSteps.set(userId, step);
      await ctx.reply('Pilih rekening tujuan:', accountButtons(state, 'to'));
      return ctx.answerCbQuery();
    }
    if (step.type === 'expense') {
      step.step = 'budget';
      userSteps.set(userId, step);
      await ctx.reply('Potong dari budget mana?', budgetButtons(state));
      return ctx.answerCbQuery();
    }
    step.step = 'date';
    userSteps.set(userId, step);
    await ctx.reply(`Tanggal transaksi? Ketik YYYY-MM-DD atau ketik *hari ini*.`, { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('to_') && step.mode === 'tx') {
    const accountToId = data.replace('to_', '');
    if (accountToId === step.accountId) {
      await ctx.reply('Rekening asal dan tujuan tidak boleh sama. Pilih tujuan lain:', accountButtons(state, 'to'));
      return ctx.answerCbQuery();
    }
    step.accountToId = accountToId;
    step.step = 'date';
    userSteps.set(userId, step);
    await ctx.reply('Tanggal transfer? Ketik YYYY-MM-DD atau ketik *hari ini*.', { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('budget_') && step.mode === 'tx') {
    step.budgetId = data === 'budget_none' ? null : data.replace('budget_', '');
    step.step = 'date';
    userSteps.set(userId, step);
    await ctx.reply('Tanggal transaksi? Ketik YYYY-MM-DD atau ketik *hari ini*.', { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  }

  return ctx.answerCbQuery();
});

bot.on('text', async ctx => {
  const userId = String(ctx.from.id);
  const text = ctx.message.text.trim();
  const step = userSteps.get(userId);
  const state = getState(userId);

  if (text === '❌ Batal') {
    userSteps.delete(userId);
    return ctx.reply('Dibatalkan.', mainKeyboard());
  }

  if (!step) return ctx.reply('Pilih menu dulu ya.', mainKeyboard());

  if (step.mode === 'tx') {
    if (step.step === 'amount') {
      const amount = Number(text.replace(/[^0-9]/g, ''));
      if (!amount) return ctx.reply('Nominal tidak valid. Contoh: 25000');
      step.amount = amount;
      step.step = 'category';
      userSteps.set(userId, step);
      const q = step.type === 'expense' ? 'Beli/bayar apa?' : step.type === 'income' ? 'Dapat uang dari mana?' : step.type === 'transfer' ? 'Keterangan transfer?' : 'Nama peminjam/utang?';
      return ctx.reply(q);
    }
    if (step.step === 'category') {
      step.category = text;
      step.step = 'account';
      userSteps.set(userId, step);
      return ctx.reply(step.type === 'income' ? 'Masuk ke rekening mana?' : 'Dari rekening mana?', accountButtons(state, 'acc'));
    }
    if (step.step === 'date') {
      const date = text.toLowerCase() === 'hari ini' ? today() : text;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ctx.reply('Format tanggal harus YYYY-MM-DD. Contoh: 2026-05-04 atau ketik hari ini');
      const tx = {
        id: id(),
        type: step.type,
        amount: step.amount,
        category: step.category,
        accountId: step.accountId,
        accountToId: step.accountToId || null,
        budgetId: step.budgetId || null,
        date
      };
      state.transactions.push(tx);
      applyBalance(state, tx);
      saveState(userId, state);
      userSteps.delete(userId);
      return ctx.reply(`✅ Transaksi tersimpan.\n${tx.category}: ${rp(tx.amount)}`, mainKeyboard());
    }
  }

  if (step.mode === 'budget') {
    if (step.step === 'name') {
      step.name = text;
      step.step = 'limit';
      userSteps.set(userId, step);
      return ctx.reply('Batas maksimal sebulan berapa? Contoh: 500000');
    }
    if (step.step === 'limit') {
      const limit = Number(text.replace(/[^0-9]/g, ''));
      if (!limit) return ctx.reply('Nominal tidak valid. Contoh: 500000');
      state.budgets.push({ id: id(), name: step.name, limit });
      saveState(userId, state);
      userSteps.delete(userId);
      return ctx.reply(`✅ Budget ${step.name} dibuat: ${rp(limit)}`, mainKeyboard());
    }
  }

  if (step.mode === 'wallet') {
    if (step.step === 'name') {
      step.name = text;
      step.step = 'balance';
      userSteps.set(userId, step);
      return ctx.reply('Saldo awalnya berapa? Contoh: 100000');
    }
    if (step.step === 'balance') {
      const balance = Number(text.replace(/[^0-9]/g, ''));
      state.accounts.push({ id: id(), name: step.name, balance });
      saveState(userId, state);
      userSteps.delete(userId);
      return ctx.reply(`✅ Dompet ${step.name} dibuat: ${rp(balance)}`, mainKeyboard());
    }
  }

  if (step.mode === 'ai_budget') {
    const income = Number(text.replace(/[^0-9]/g, ''));
    if (!income) return ctx.reply('Nominal tidak valid. Contoh: 4000000');
    state.budgets = [
      { id: id(), name: 'Kebutuhan Hidup (Makan, Kos)', limit: Math.round(income * 0.45) },
      { id: id(), name: 'Healing & Jajan', limit: Math.round(income * 0.30) },
      { id: id(), name: 'Tabungan & Investasi', limit: Math.round(income * 0.15) },
      { id: id(), name: 'Dana Darurat / Donasi', limit: Math.round(income * 0.10) }
    ];
    saveState(userId, state);
    userSteps.delete(userId);
    return ctx.reply('🤖 AI Budget Planner selesai dibuat:\n\n' + budgetText(state), { parse_mode: 'Markdown', ...mainKeyboard() });
  }
});

bot.launch();
console.log('KITA TABUNG Telegram Bot berjalan...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
