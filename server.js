require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const Loki = require('lokijs');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// Для Render сохраняем базу данных в памяти
const dbPath = process.env.NODE_ENV === 'production' ? 
    path.join('/tmp', 'ton-casino.db') : 
    'ton-casino.db';

// LokiJS база данных
let db;
let users, transactions, casinoBank, adminLogs, minesGames, rocketGames, rocketBets;

// WebSocket сервер для ракетки
const wss = new WebSocket.Server({ noServer: true });

// Глобальные переменные для игры Ракетка
let rocketGame = {
  status: 'waiting', // waiting, counting, flying, crashed
  multiplier: 1.00,
  startTime: null,
  crashPoint: null,
  players: [],
  history: []
};

// Боты для ракетки
const rocketBots = [
  { name: "Bot_1", minBet: 1, maxBet: 10, risk: "medium" },
  { name: "Bot_2", minBet: 5, maxBet: 20, risk: "high" },
  { name: "Bot_3", minBet: 0.5, maxBet: 5, risk: "low" }
];

function initDatabase() {
  return new Promise((resolve) => {
    db = new Loki(dbPath, {
      autoload: true,
      autoloadCallback: () => {
        users = db.getCollection('users');
        transactions = db.getCollection('transactions');
        casinoBank = db.getCollection('casino_bank');
        adminLogs = db.getCollection('admin_logs');
        minesGames = db.getCollection('mines_games');
        rocketGames = db.getCollection('rocket_games');
        rocketBets = db.getCollection('rocket_bets');
        
        if (!users) {
          users = db.addCollection('users', { 
            unique: ['telegram_id'],
            indices: ['telegram_id']
          });
        }
        
        if (!transactions) {
          transactions = db.addCollection('transactions', {
            indices: ['user_id', 'created_at', 'demo_mode']
          });
        }

        if (!casinoBank) {
          casinoBank = db.addCollection('casino_bank');
          casinoBank.insert({
            total_balance: 0,
            owner_telegram_id: process.env.OWNER_TELEGRAM_ID || 842428912,
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        if (!adminLogs) {
          adminLogs = db.addCollection('admin_logs', {
            indices: ['created_at']
          });
        }

        if (!minesGames) {
          minesGames = db.addCollection('mines_games', {
            indices: ['user_id', 'created_at', 'demo_mode']
          });
        }

        if (!rocketGames) {
          rocketGames = db.addCollection('rocket_games', {
            indices: ['created_at', 'crashed_at']
          });
        }

        if (!rocketBets) {
          rocketBets = db.addCollection('rocket_bets', {
            indices: ['game_id', 'user_id', 'created_at']
          });
        }
        
        console.log('LokiJS database initialized');
        resolve(true);
      },
      autosave: true,
      autosaveInterval: 4000
    });
  });
}

// Функция для работы с Crypto Pay API
async function cryptoPayRequest(method, data = {}, demoMode = false) {
  try {
    const CRYPTO_PAY_API = demoMode ? 
      'https://testnet-pay.crypt.bot/api' : 
      'https://pay.crypt.bot/api';
      
    const CRYPTO_PAY_TOKEN = demoMode ?
      process.env.CRYPTO_PAY_TESTNET_TOKEN :
      process.env.CRYPTO_PAY_MAINNET_TOKEN;

    const response = await axios.post(`${CRYPTO_PAY_API}/${method}`, data, {
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Crypto Pay API error:', error.response?.data || error.message);
    throw error;
  }
}

// Функция логирования админских действий
function logAdminAction(action, telegramId, details = {}) {
  adminLogs.insert({
    action: action,
    telegram_id: telegramId,
    details: details,
    created_at: new Date()
  });
}

// Получить банк казино
function getCasinoBank() {
  return casinoBank.findOne({});
}

// Обновить банк казино
function updateCasinoBank(amount) {
  const bank = getCasinoBank();
  casinoBank.update({
    ...bank,
    total_balance: bank.total_balance + amount,
    updated_at: new Date()
  });
}

// Mines Game Functions
function generateMinesGame(minesCount) {
  const totalCells = 25;
  const mines = [];
  
  while (mines.length < minesCount) {
    const randomCell = Math.floor(Math.random() * totalCells);
    if (!mines.includes(randomCell)) {
      mines.push(randomCell);
    }
  }
  
  return {
    mines,
    minesCount,
    revealedCells: [],
    gameOver: false,
    win: false,
    currentMultiplier: 1,
    betAmount: 0
  };
}

// 🔥 НОВАЯ ФУНКЦИЯ МНОЖИТЕЛЕЙ КАК В 1WIN
function calculateMultiplier(openedCells, displayedMines) {
  const multipliers = {
    3: [1.00, 1.07, 1.14, 1.23, 1.33, 1.45, 1.59, 1.75, 1.95, 2.18, 2.47, 2.83, 3.28, 3.86, 4.62, 5.63, 7.00, 8.92, 11.67, 15.83, 22.50, 34.00, 56.67, 113.33],
    5: [1.00, 1.11, 1.22, 1.35, 1.50, 1.67, 1.88, 2.14, 2.45, 2.86, 3.38, 4.05, 4.95, 6.15, 7.83, 10.21, 13.68, 18.91, 27.14, 40.71, 65.14, 113.99, 227.98, 569.95],
    7: [1.00, 1.20, 1.40, 1.64, 1.92, 2.26, 2.67, 3.17, 3.80, 4.60, 5.63, 6.98, 8.75, 11.11, 14.29, 18.75, 25.00, 34.00, 47.50, 68.00, 100.00, 152.00, 240.00, 400.00]
  };

  const mineMultipliers = multipliers[displayedMines];
  
  if (mineMultipliers && openedCells < mineMultipliers.length) {
    return mineMultipliers[openedCells];
  }
  
  return mineMultipliers ? mineMultipliers[mineMultipliers.length - 1] * 2 : 1.00;
}

// Rocket Game Functions
function generateCrashPoint() {
  const random = Math.random();
  
  if (random < 0.7) {
    // 70% chance: 1x - 4x
    return 1 + Math.random() * 3;
  } else if (random < 0.9) {
    // 20% chance: 5x - 20x
    return 5 + Math.random() * 15;
  } else {
    // 10% chance: 21x - 100x
    return 21 + Math.random() * 79;
  }
}

function startRocketGame() {
  if (rocketGame.status !== 'waiting') return;

  rocketGame.status = 'counting';
  rocketGame.multiplier = 1.00;
  rocketGame.crashPoint = generateCrashPoint();
  rocketGame.startTime = Date.now();
  rocketGame.players = [];

  // Добавляем ставки ботов
  rocketBots.forEach(bot => {
    const betAmount = bot.minBet + Math.random() * (bot.maxBet - bot.minBet);
    const autoCashout = bot.risk === 'low' ? 2 + Math.random() * 3 : 
                       bot.risk === 'medium' ? 5 + Math.random() * 10 : 
                       10 + Math.random() * 30;
    
    rocketGame.players.push({
      name: bot.name,
      betAmount: parseFloat(betAmount.toFixed(2)),
      autoCashout: parseFloat(autoCashout.toFixed(2)),
      isBot: true,
      cashedOut: false,
      winAmount: 0
    });
  });

  broadcastRocketUpdate();

  // 10 секунд на ставки
  setTimeout(() => {
    rocketGame.status = 'flying';
    broadcastRocketUpdate();
    startRocketFlight();
  }, 10000);
}

function startRocketFlight() {
  const startTime = Date.now();
  const flightInterval = setInterval(() => {
    if (rocketGame.status !== 'flying') {
      clearInterval(flightInterval);
      return;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    rocketGame.multiplier = 1.00 + (elapsed * 0.1); // Увеличиваем множитель со временем

    // Проверяем автоматический вывод у ботов
    rocketGame.players.forEach(player => {
      if (player.isBot && !player.cashedOut && rocketGame.multiplier >= player.autoCashout) {
        player.cashedOut = true;
        player.winAmount = player.betAmount * rocketGame.multiplier;
      }
    });

    // Проверяем, достигли ли точки краша
    if (rocketGame.multiplier >= rocketGame.crashPoint) {
      rocketGame.status = 'crashed';
      clearInterval(flightInterval);
      processRocketGameEnd();
    }

    broadcastRocketUpdate();
  }, 100); // Обновляем каждые 100ms
}

function processRocketGameEnd() {
  // Сохраняем игру в историю
  const gameRecord = rocketGames.insert({
    crashPoint: rocketGame.crashPoint,
    maxMultiplier: rocketGame.multiplier,
    startTime: new Date(rocketGame.startTime),
    endTime: new Date(),
    playerCount: rocketGame.players.length,
    totalBets: rocketGame.players.reduce((sum, p) => sum + p.betAmount, 0),
    totalPayouts: rocketGame.players.reduce((sum, p) => sum + (p.cashedOut ? p.winAmount : 0), 0)
  });

  // Обрабатываем выплаты для реальных игроков
  rocketGame.players.forEach(player => {
    if (!player.isBot) {
      const user = users.findOne({ telegram_id: parseInt(player.userId) });
      if (user && player.cashedOut) {
        const winAmount = player.betAmount * player.cashoutMultiplier;
        
        if (player.demoMode) {
          users.update({
            ...user,
            demo_balance: user.demo_balance + winAmount
          });
        } else {
          users.update({
            ...user,
            main_balance: user.main_balance + winAmount
          });
          updateCasinoBank(-winAmount);
        }

        // Записываем транзакцию
        transactions.insert({
          user_id: user.$loki,
          amount: winAmount,
          type: 'rocket_win',
          status: 'completed',
          demo_mode: player.demoMode,
          game_id: gameRecord.$loki,
          created_at: new Date()
        });

        // Сохраняем ставку
        rocketBets.insert({
          game_id: gameRecord.$loki,
          user_id: user.$loki,
          bet_amount: player.betAmount,
          cashout_multiplier: player.cashoutMultiplier,
          win_amount: winAmount,
          demo_mode: player.demoMode,
          created_at: new Date()
        });
      }
    }
  });

  // Добавляем в историю
  rocketGame.history.unshift({
    crashPoint: rocketGame.crashPoint,
    multiplier: rocketGame.multiplier
  });

  if (rocketGame.history.length > 50) {
    rocketGame.history.pop();
  }

  broadcastRocketUpdate();

  // Через 5 секунд начинаем новую игру
  setTimeout(() => {
    rocketGame.status = 'waiting';
    rocketGame.multiplier = 1.00;
    rocketGame.players = [];
    broadcastRocketUpdate();
    startRocketGame();
  }, 5000);
}

function broadcastRocketUpdate() {
  const data = JSON.stringify({
    type: 'rocket_update',
    game: rocketGame
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// WebSocket обработчик
wss.on('connection', function connection(ws) {
  console.log('Rocket game client connected');
  
  // Отправляем текущее состояние игры при подключении
  ws.send(JSON.stringify({
    type: 'rocket_update',
    game: rocketGame
  }));

  ws.on('close', () => {
    console.log('Rocket game client disconnected');
  });
});

// API: Аутентификация админа
app.post('/api/admin/login', async (req, res) => {
  const { telegramId, password } = req.body;

  if (password === process.env.ADMIN_PASSWORD && 
    parseInt(telegramId) === parseInt(process.env.OWNER_TELEGRAM_ID)) {
    
    logAdminAction('admin_login', telegramId);
    res.json({ success: true, isAdmin: true });
  } else {
    res.json({ success: false, isAdmin: false });
  }
});

// API: Получить данные админки
app.get('/api/admin/dashboard/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const bank = getCasinoBank();
    const totalUsers = users.count();
    const totalTransactions = transactions.count();
    const totalMinesGames = minesGames.count();
    const totalRocketGames = rocketGames.count();

    res.json({
      bank_balance: bank.total_balance,
      total_users: totalUsers,
      total_transactions: totalTransactions,
      total_mines_games: totalMinesGames,
      total_rocket_games: totalRocketGames
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Вывод прибыли владельцу
app.post('/api/admin/withdraw-profit', async (req, res) => {
  const { telegramId, amount } = req.body;

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const bank = getCasinoBank();
    
    if (bank.total_balance < amount) {
      return res.status(400).json({ error: 'Недостаточно средств в банке казино' });
    }

    const transfer = await cryptoPayRequest('transfer', {
      user_id: telegramId,
      asset: 'TON',
      amount: amount.toString(),
      spend_id: `owner_withdraw_${Date.now()}`
    }, false);

    if (transfer.ok && transfer.result) {
      updateCasinoBank(-amount);
      
      logAdminAction('withdraw_profit', telegramId, { amount: amount });
      
      res.json({
        success: true,
        message: 'Profit withdrawn successfully',
        hash: transfer.result.hash,
        new_balance: bank.total_balance - amount
      });
    } else {
      res.status(500).json({ error: 'Withdrawal failed' });
    }
  } catch (error) {
    console.error('Withdraw profit error:', error);
    res.status(500).json({ error: 'Withdrawal error' });
  }
});

app.post('/api/admin/add-demo-balance', async (req, res) => {
  const { telegramId, targetTelegramId, amount } = req.body;

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const targetUser = users.findOne({ telegram_id: parseInt(targetTelegramId) });
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    users.update({
      ...targetUser,
      demo_balance: targetUser.demo_balance + parseFloat(amount)
    });

    logAdminAction('add_demo_balance', telegramId, {
      target_telegram_id: targetTelegramId,
      amount: amount
    });

    res.json({ success: true, message: 'Demo balance added successfully' });
  } catch (error) {
    console.error('Add demo balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить или создать пользователя
app.post('/api/user', async (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body;

  try {
    let user = users.findOne({ telegram_id: parseInt(telegramId) });

    if (!user) {
      user = users.insert({
        telegram_id: parseInt(telegramId),
        username: username || '',
        first_name: firstName || '',
        last_name: lastName || '',
        main_balance: 0,
        demo_balance: 100,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    res.json({
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      main_balance: user.main_balance,
      demo_balance: user.demo_balance
    });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Создать инвойс для пополнения
app.post('/api/create-invoice', async (req, res) => {
  const { telegramId, amount } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const invoice = await cryptoPayRequest('createInvoice', {
      asset: 'TON',
      amount: amount.toString(),
      description: `Пополнение баланса для пользователя ${telegramId}`,
      hidden_message: `Пополнение на ${amount} TON`,
      payload: `deposit_${telegramId}_${Date.now()}`,
      paid_btn_name: 'viewItem',
      paid_btn_url: 'https://t.me/CasinoGiftContractBot',
      allow_comments: false
    }, false);

    if (invoice.ok && invoice.result) {
      transactions.insert({
        user_id: user.$loki,
        amount: amount,
        type: 'deposit',
        status: 'pending',
        invoice_id: invoice.result.invoice_id,
        demo_mode: false,
        created_at: new Date()
      });

      res.json({
        success: true,
        invoice_url: invoice.result.pay_url,
        invoice_id: invoice.result.invoice_id
      });
    } else {
      res.status(500).json({ error: 'Ошибка создания инвойса' });
    }
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Проверить статус инвойса
app.post('/api/check-invoice', async (req, res) => {
  const { invoiceId } = req.body;

  try {
    const transaction = transactions.findOne({ invoice_id: invoiceId });
    if (!transaction) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    const invoices = await cryptoPayRequest('getInvoices', {
      invoice_ids: invoiceId
    }, false);

    if (invoices.ok && invoices.result && invoices.result.items.length > 0) {
      const invoice = invoices.result.items[0];
      
      if (invoice.status === 'paid' && transaction.status !== 'completed') {
        // Обновляем статус транзакции
        transactions.update({
          ...transaction,
          status: 'completed'
        });

        // Пополняем баланс пользователя
        const user = users.get(transaction.user_id);
        users.update({
          ...user,
          main_balance: user.main_balance + transaction.amount
        });

        // Обновляем банк казино
        updateCasinoBank(transaction.amount);

        res.json({ success: true, status: 'paid' });
      } else {
        res.json({ success: true, status: invoice.status });
      }
    } else {
      res.status(500).json({ error: 'Ошибка проверки инвойса' });
    }
  } catch (error) {
    console.error('Check invoice error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Создать вывод средств
app.post('/api/create-withdrawal', async (req, res) => {
  const { telegramId, address, amount } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.main_balance < amount) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    const transfer = await cryptoPayRequest('transfer', {
      user_id: telegramId,
      asset: 'TON',
      amount: amount.toString(),
      spend_id: `withdraw_${telegramId}_${Date.now()}`
    }, false);

    if (transfer.ok && transfer.result) {
      // Обновляем баланс пользователя
      users.update({
        ...user,
        main_balance: user.main_balance - amount
      });

      // Записываем транзакцию
      transactions.insert({
        user_id: user.$loki,
        amount: -amount,
        type: 'withdrawal',
        status: 'completed',
        address: address,
        demo_mode: false,
        created_at: new Date()
      });

      res.json({
        success: true,
        message: 'Вывод успешно создан',
        hash: transfer.result.hash
      });
    } else {
      res.status(500).json({ error: 'Ошибка вывода средств' });
    }
  } catch (error) {
    console.error('Create withdrawal error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Mines Game - Начать игру
app.post('/api/mines/start', async (req, res) => {
  const { telegramId, betAmount, minesCount, demoMode } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const balanceField = demoMode ? 'demo_balance' : 'main_balance';
    if (user[balanceField] < betAmount) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    // Списываем ставку
    users.update({
      ...user,
      [balanceField]: user[balanceField] - betAmount
    });

    // Создаем игру
    const game = minesGames.insert({
      user_id: user.$loki,
      bet_amount: betAmount,
      mines_count: minesCount,
      demo_mode: demoMode,
      revealed_cells: [],
      game_over: false,
      win: false,
      current_multiplier: 1.00,
      created_at: new Date()
    });

    // Обновляем банк казино для реальных ставок
    if (!demoMode) {
      updateCasinoBank(betAmount);
    }

    res.json({
      success: true,
      game_id: game.$loki,
      mines_count: minesCount,
      current_balance: user[balanceField] - betAmount
    });
  } catch (error) {
    console.error('Mines start error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Mines Game - Открыть ячейку
app.post('/api/mines/open', async (req, res) => {
  const { telegramId, gameId, cellIndex } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const game = minesGames.get(gameId);
    if (!game || game.user_id !== user.$loki) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Игра уже завершена' });
    }

    // Проверяем, не открыта ли уже эта ячейка
    if (game.revealed_cells.includes(cellIndex)) {
      return res.status(400).json({ error: 'Ячейка уже открыта' });
    }

    // Проверяем, есть ли мина в этой ячейке
    if (game.mines.includes(cellIndex)) {
      // Игра проиграна
      minesGames.update({
        ...game,
        game_over: true,
        win: false,
        revealed_cells: [...game.revealed_cells, cellIndex]
      });

      res.json({
        success: true,
        game_over: true,
        win: false,
        mine_hit: true,
        cell_index: cellIndex,
        current_multiplier: game.current_multiplier,
        win_amount: 0
      });
    } else {
      // Ячейка безопасна
      const newRevealedCells = [...game.revealed_cells, cellIndex];
      const openedCells = newRevealedCells.length;
      
      // 🔥 ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ МНОЖИТЕЛЕЙ
      const newMultiplier = calculateMultiplier(openedCells, game.mines_count);

      minesGames.update({
        ...game,
        revealed_cells: newRevealedCells,
        current_multiplier: newMultiplier
      });

      res.json({
        success: true,
        game_over: false,
        win: false,
        mine_hit: false,
        cell_index: cellIndex,
        current_multiplier: newMultiplier,
        win_amount: game.bet_amount * newMultiplier
      });
    }
  } catch (error) {
    console.error('Mines open error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Mines Game - Забрать выигрыш
app.post('/api/mines/cashout', async (req, res) => {
  const { telegramId, gameId } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const game = minesGames.get(gameId);
    if (!game || game.user_id !== user.$loki) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Игра уже завершена' });
    }

    const winAmount = game.bet_amount * game.current_multiplier;
    const balanceField = game.demo_mode ? 'demo_balance' : 'main_balance';

    // Зачисляем выигрыш
    users.update({
      ...user,
      [balanceField]: user[balanceField] + winAmount
    });

    // Обновляем банк казино для реальных игр
    if (!game.demo_mode) {
      updateCasinoBank(-winAmount);
    }

    // Завершаем игру
    minesGames.update({
      ...game,
      game_over: true,
      win: true,
      win_amount: winAmount
    });

    res.json({
      success: true,
      win_amount: winAmount,
      current_balance: user[balanceField] + winAmount,
      multiplier: game.current_multiplier
    });
  } catch (error) {
    console.error('Mines cashout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Rocket Game - Сделать ставку
app.post('/api/rocket/bet', async (req, res) => {
  const { telegramId, betAmount, demoMode } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (rocketGame.status !== 'waiting' && rocketGame.status !== 'counting') {
      return res.status(400).json({ error: 'Нельзя сделать ставку сейчас' });
    }

    const balanceField = demoMode ? 'demo_balance' : 'main_balance';
    if (user[balanceField] < betAmount) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    // Списываем ставку
    users.update({
      ...user,
      [balanceField]: user[balanceField] - betAmount
    });

    // Обновляем банк казино для реальных ставок
    if (!demoMode) {
      updateCasinoBank(betAmount);
    }

    // Добавляем игрока в текущую игру
    const existingPlayerIndex = rocketGame.players.findIndex(p => 
      !p.isBot && p.userId === telegramId.toString()
    );

    if (existingPlayerIndex !== -1) {
      rocketGame.players[existingPlayerIndex].betAmount += betAmount;
    } else {
      rocketGame.players.push({
        userId: telegramId.toString(),
        name: user.username || `User_${telegramId}`,
        betAmount: betAmount,
        isBot: false,
        demoMode: demoMode,
        cashedOut: false,
        cashoutMultiplier: null,
        winAmount: 0
      });
    }

    broadcastRocketUpdate();

    res.json({
      success: true,
      current_balance: user[balanceField] - betAmount,
      players_count: rocketGame.players.length
    });
  } catch (error) {
    console.error('Rocket bet error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Rocket Game - Забрать выигрыш
app.post('/api/rocket/cashout', async (req, res) => {
  const { telegramId } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (rocketGame.status !== 'flying') {
      return res.status(400).json({ error: 'Нельзя забрать выигрыш сейчас' });
    }

    const playerIndex = rocketGame.players.findIndex(p => 
      !p.isBot && p.userId === telegramId.toString()
    );

    if (playerIndex === -1) {
      return res.status(400).json({ error: 'Ставка не найдена' });
    }

    const player = rocketGame.players[playerIndex];
    if (player.cashedOut) {
      return res.status(400).json({ error: 'Вы уже забрали выигрыш' });
    }

    player.cashedOut = true;
    player.cashoutMultiplier = rocketGame.multiplier;
    player.winAmount = player.betAmount * rocketGame.multiplier;

    const balanceField = player.demoMode ? 'demo_balance' : 'main_balance';

    // Зачисляем выигрыш
    users.update({
      ...user,
      [balanceField]: user[balanceField] + player.winAmount
    });

    // Обновляем банк казино для реальных игр
    if (!player.demoMode) {
      updateCasinoBank(-player.winAmount);
    }

    broadcastRocketUpdate();

    res.json({
      success: true,
      win_amount: player.winAmount,
      multiplier: rocketGame.multiplier,
      current_balance: user[balanceField] + player.winAmount
    });
  } catch (error) {
    console.error('Rocket cashout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API: Rocket Game - Получить историю
app.get('/api/rocket/history', async (req, res) => {
  try {
    const history = rocketGames.chain()
      .simplesort('endTime', true)
      .limit(20)
      .data()
      .map(game => ({
        crashPoint: game.crashPoint,
        maxMultiplier: game.maxMultiplier,
        startTime: game.startTime,
        playerCount: game.playerCount
      }));

    res.json({ success: true, history: history });
  } catch (error) {
    console.error('Rocket history error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Запускаем игру Ракетка при старте сервера
setTimeout(() => {
  startRocketGame();
}, 5000);

// Запуск сервера
const server = app.listen(PORT, async () => {
  await initDatabase();
  console.log(`Server running on port ${PORT}`);
});

// WebSocket upgrade обработчик
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  
  if (pathname === '/rocket-ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});