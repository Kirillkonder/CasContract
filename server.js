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
      bank_balance: bank ? bank.total_balance : 0,
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

    res.json({ 
      success: true, 
      message: 'Demo balance added successfully',
      new_balance: targetUser.demo_balance + parseFloat(amount)
    });
  } catch (error) {
    console.error('Add demo balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить список пользователей
app.get('/api/admin/users/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const allUsers = users.find();
    const userList = allUsers.map(user => ({
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      main_balance: user.main_balance,
      demo_balance: user.demo_balance,
      demo_mode: user.demo_mode,
      created_at: user.created_at,
      last_active: user.last_active
    }));

    res.json({ users: userList });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить транзакции пользователя
app.get('/api/admin/user-transactions/:telegramId/:targetTelegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const targetTelegramId = parseInt(req.params.targetTelegramId);

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const targetUser = users.findOne({ telegram_id: targetTelegramId });
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userTransactions = transactions.find({ user_id: targetUser.$loki });
    res.json({ transactions: userTransactions });
  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить игры пользователя
app.get('/api/admin/user-games/:telegramId/:targetTelegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const targetTelegramId = parseInt(req.params.targetTelegramId);

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const targetUser = users.findOne({ telegram_id: targetTelegramId });
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userMinesGames = minesGames.find({ user_id: targetUser.$loki });
    const userRocketBets = rocketBets.find({ user_id: targetUser.$loki });

    res.json({ 
      mines_games: userMinesGames,
      rocket_bets: userRocketBets
    });
  } catch (error) {
    console.error('Get user games error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить логи админских действий
app.get('/api/admin/logs/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);

  if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const logs = adminLogs.find().sort((a, b) => b.created_at - a.created_at);
    res.json({ logs: logs });
  } catch (error) {
    console.error('Get admin logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить статистику казино
app.get('/api/admin/stats/:telegramId', async (req, res) => {
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

    // Статистика по играм за последние 7 дней
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentMinesGames = minesGames.find({ 
      created_at: { $gte: sevenDaysAgo } 
    });
    const recentRocketBets = rocketBets.find({ 
      created_at: { $gte: sevenDaysAgo } 
    });

    const minesProfit = recentMinesGames.reduce((sum, game) => {
      return sum + (game.bet_amount - (game.win_amount || 0));
    }, 0);

    const rocketProfit = recentRocketBets.reduce((sum, bet) => {
      return sum + (bet.bet_amount - (bet.win_amount || 0));
    }, 0);

    res.json({
      bank_balance: bank.total_balance,
      total_users: totalUsers,
      total_transactions: totalTransactions,
      total_mines_games: totalMinesGames,
      total_rocket_games: totalRocketGames,
      recent_mines_games: recentMinesGames.length,
      recent_rocket_bets: recentRocketBets.length,
      recent_mines_profit: minesProfit,
      recent_rocket_profit: rocketProfit,
      total_recent_profit: minesProfit + rocketProfit
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Регистрация/авторизация пользователя
app.post('/api/user/auth', async (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body;

  try {
    let user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      user = users.insert({
        telegram_id: parseInt(telegramId),
        username: username,
        first_name: firstName,
        last_name: lastName,
        main_balance: 0,
        demo_balance: 100, // Начальный демо-баланс
        demo_mode: true,
        created_at: new Date(),
        last_active: new Date()
      });
      
      res.json({ 
        success: true, 
        user: user,
        isNew: true 
      });
    } else {
      // Обновляем последнюю активность
      users.update({
        ...user,
        last_active: new Date()
      });
      
      res.json({ 
        success: true, 
        user: user,
        isNew: false 
      });
    }
  } catch (error) {
    console.error('User auth error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить данные пользователя
app.get('/api/user/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);

  try {
    const user = users.findOne({ telegram_id: telegramId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      user: user 
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить историю транзакций
app.get('/api/user/transactions/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);

  try {
    const user = users.findOne({ telegram_id: telegramId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userTransactions = transactions.find({ user_id: user.$loki })
      .sort((a, b) => b.created_at - a.created_at);
    
    res.json({ 
      success: true, 
      transactions: userTransactions 
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Игра в мины
app.post('/api/game/mines', async (req, res) => {
  const { telegramId, minesCount, betAmount, demoMode } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentBalance = demoMode ? user.demo_balance : user.main_balance;
    
    if (currentBalance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Создаем новую игру
    const game = generateMinesGame(minesCount);
    game.betAmount = betAmount;
    
    // Сохраняем игру в базу
    const gameRecord = minesGames.insert({
      user_id: user.$loki,
      mines_count: minesCount,
      bet_amount: betAmount,
      mines: game.mines,
      revealed_cells: [],
      game_over: false,
      win: false,
      current_multiplier: 1,
      demo_mode: demoMode,
      created_at: new Date()
    });

    // Списываем ставку
    if (demoMode) {
      users.update({
        ...user,
        demo_balance: user.demo_balance - betAmount
      });
    } else {
      users.update({
        ...user,
        main_balance: user.main_balance - betAmount
      });
      updateCasinoBank(betAmount);
    }

    // Записываем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: -betAmount,
      type: 'mines_bet',
      status: 'completed',
      demo_mode: demoMode,
      game_id: gameRecord.$loki,
      created_at: new Date()
    });

    res.json({
      success: true,
      game: {
        id: gameRecord.$loki,
        minesCount: minesCount,
        betAmount: betAmount,
        mines: game.mines,
        revealedCells: [],
        gameOver: false,
        win: false,
        currentMultiplier: 1
      },
      newBalance: demoMode ? user.demo_balance - betAmount : user.main_balance - betAmount
    });
  } catch (error) {
    console.error('Mines game error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Открыть ячейку в минах
app.post('/api/game/mines/reveal', async (req, res) => {
  const { telegramId, gameId, cellIndex } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    const game = minesGames.get(gameId);
    
    if (!user || !game || game.user_id !== user.$loki) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Game already finished' });
    }

    // Проверяем, не открыта ли уже эта ячейка
    if (game.revealed_cells.includes(cellIndex)) {
      return res.status(400).json({ error: 'Cell already revealed' });
    }

    // Проверяем, есть ли мина в этой ячейке
    if (game.mines.includes(cellIndex)) {
      // Игра проиграна
      minesGames.update({
        ...game,
        revealed_cells: [...game.revealed_cells, cellIndex],
        game_over: true,
        win: false
      });

      res.json({
        success: true,
        mine: true,
        gameOver: true,
        win: false,
        winAmount: 0
      });
    } else {
      // Ячейка безопасна
      const newRevealedCells = [...game.revealed_cells, cellIndex];
      const openedCells = newRevealedCells.length;
      
      // Рассчитываем множитель как в 1WIN
      const multiplier = calculateMultiplier(openedCells, game.mines_count);
      
      minesGames.update({
        ...game,
        revealed_cells: newRevealedCells,
        current_multiplier: multiplier
      });

      res.json({
        success: true,
        mine: false,
        gameOver: false,
        multiplier: multiplier,
        openedCells: openedCells
      });
    }
  } catch (error) {
    console.error('Mines reveal error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Забрать выигрыш в минах
app.post('/api/game/mines/cashout', async (req, res) => {
  const { telegramId, gameId } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    const game = minesGames.get(gameId);
    
    if (!user || !game || game.user_id !== user.$loki) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Game already finished' });
    }

    const winAmount = game.bet_amount * game.current_multiplier;
    
    // Обновляем игру
    minesGames.update({
      ...game,
      game_over: true,
      win: true,
      win_amount: winAmount
    });

    // Зачисляем выигрыш
    if (game.demo_mode) {
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
      type: 'mines_win',
      status: 'completed',
      demo_mode: game.demo_mode,
      game_id: gameId,
      created_at: new Date()
    });

    res.json({
      success: true,
      winAmount: winAmount,
      multiplier: game.current_multiplier,
      newBalance: game.demo_mode ? user.demo_balance + winAmount : user.main_balance + winAmount
    });
  } catch (error) {
    console.error('Mines cashout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Игра в ракетку - сделать ставку
app.post('/api/game/rocket/bet', async (req, res) => {
  const { telegramId, betAmount, demoMode } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (rocketGame.status !== 'counting') {
      return res.status(400).json({ error: 'Game not accepting bets' });
    }

    const currentBalance = demoMode ? user.demo_balance : user.main_balance;
    
    if (currentBalance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Проверяем, не сделал ли уже пользователь ставку в этой игре
    const existingBet = rocketGame.players.find(p => 
      !p.isBot && p.userId === telegramId.toString()
    );

    if (existingBet) {
      return res.status(400).json({ error: 'Already placed a bet in this game' });
    }

    // Списываем ставку
    if (demoMode) {
      users.update({
        ...user,
        demo_balance: user.demo_balance - betAmount
      });
    } else {
      users.update({
        ...user,
        main_balance: user.main_balance - betAmount
      });
      updateCasinoBank(betAmount);
    }

    // Записываем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: -betAmount,
      type: 'rocket_bet',
      status: 'completed',
      demo_mode: demoMode,
      created_at: new Date()
    });

    // Добавляем игрока в текущую игру
    rocketGame.players.push({
      userId: telegramId.toString(),
      name: user.username || `${user.first_name} ${user.last_name}`,
      betAmount: betAmount,
      isBot: false,
      cashedOut: false,
      cashoutMultiplier: null,
      winAmount: 0,
      demoMode: demoMode
    });

    broadcastRocketUpdate();

    res.json({
      success: true,
      newBalance: demoMode ? user.demo_balance - betAmount : user.main_balance - betAmount
    });
  } catch (error) {
    console.error('Rocket bet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Игра в ракетку - вывод средств
app.post('/api/game/rocket/cashout', async (req, res) => {
  const { telegramId } = req.body;

  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (rocketGame.status !== 'flying') {
      return res.status(400).json({ error: 'Game not in flight' });
    }

    // Находим ставку пользователя
    const playerIndex = rocketGame.players.findIndex(p => 
      !p.isBot && p.userId === telegramId.toString()
    );

    if (playerIndex === -1) {
      return res.status(400).json({ error: 'No bet found for this game' });
    }

    const player = rocketGame.players[playerIndex];
    
    if (player.cashedOut) {
      return res.status(400).json({ error: 'Already cashed out' });
    }

    // Обновляем информацию о выводе
    player.cashedOut = true;
    player.cashoutMultiplier = rocketGame.multiplier;
    player.winAmount = player.betAmount * rocketGame.multiplier;

    broadcastRocketUpdate();

    res.json({
      success: true,
      multiplier: rocketGame.multiplier,
      winAmount: player.winAmount
    });
  } catch (error) {
    console.error('Rocket cashout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить текущее состояние ракетки
app.get('/api/game/rocket/status', async (req, res) => {
  res.json({
    success: true,
    game: rocketGame
  });
});

// API: Получить историю ракетки
app.get('/api/game/rocket/history', async (req, res) => {
  const history = rocketGames.find()
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 20);
  
  res.json({
    success: true,
    history: history
  });
});

// API: Проверка админа
app.post('/api/admin/check', async (req, res) => {
    const { telegramId } = req.body;

    try {
        const isAdmin = parseInt(telegramId) === parseInt(process.env.OWNER_TELEGRAM_ID);
        res.json({ success: true, isAdmin: isAdmin });
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Переключение режима
app.post('/api/user/toggle-mode', async (req, res) => {
    const { telegramId } = req.body;

    try {
        let user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newDemoMode = !user.demo_mode;
        
        users.update({
            ...user,
            demo_mode: newDemoMode
        });

        res.json({ 
            success: true, 
            demo_mode: newDemoMode,
            balance: newDemoMode ? user.demo_balance : user.main_balance
        });
    } catch (error) {
        console.error('Toggle mode error:', error);
        res.status(500).json({ error: 'Toggle mode error' });
    }
});

// API: Депозит
app.post('/api/deposit', async (req, res) => {
    const { telegramId, amount, demoMode } = req.body;
    
    if (!amount || amount < 1) {
        return res.status(400).json({ error: 'Минимальный депозит: 1 TON' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'completed',
                demo_mode: true,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo: true,
                message: 'Demo deposit successful',
                new_balance: user.demo_balance + amount
            });
        }

        // Реальный депозит через Crypto Pay
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${process.env.BOT_USERNAME.replace('@', '')}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        }, false);

        if (invoice.ok && invoice.result) {
            const transaction = transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                demo_mode: false,
                crypto_pay_invoice_id: invoice.result.invoice_id,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
                invoiceUrl: invoice.result.pay_url,
                invoiceId: invoice.result.invoice_id,
                transactionId: transaction.$loki
            });
        } else {
            res.status(500).json({ error: 'Ошибка при создании инвойса' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Ошибка Crypto Pay' });
    }
});

// API: Статус инвойса
app.get('/api/invoice/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;

    try {
        const response = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, false);

        if (response.ok && response.result && response.result.items.length > 0) {
            const invoice = response.result.items[0];
            
            if (invoice.status === 'paid') {
                const transaction = transactions.findOne({ crypto_pay_invoice_id: parseInt(invoiceId) });
                if (transaction && transaction.status === 'pending') {
                    const user = users.get(transaction.user_id);
                    users.update({
                        ...user,
                        main_balance: user.main_balance + transaction.amount
                    });
                    
                    transactions.update({
                        ...transaction,
                        status: 'completed'
                    });

                    updateCasinoBank(transaction.amount);
                }
            }

            res.json({ status: invoice.status });
        } else {
            res.status(404).json({ error: 'Инвойс не найден' });
        }
    } catch (error) {
        console.error('Invoice status error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// API: Вывод средств
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Неверная сумма или адрес' });
    }

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств на балансе' });
        }

        if (demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance - amount
            });

            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'withdraw',
                status: 'completed',
                demo_mode: true,
                address: address,
                created_at: new Date()
            });

            return res.json({
                success: true,
                demo: true,
                message: 'Demo withdrawal successful',
                new_balance: user.demo_balance - amount
            });
        }

        // Реальный вывод
        const bank = getCasinoBank();
        if (bank.total_balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств в банке казино' });
        }

        const transfer = await cryptoPayRequest('transfer', {
            user_id: parseInt(telegramId),
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`
        }, false);

        if (transfer.ok && transfer.result) {
            users.update({
                ...user,
                main_balance: user.main_balance - amount
            });

            updateCasinoBank(-amount);

            transactions.insert({
                user_id: user.$loki,
                amount: -amount,
                type: 'withdraw',
                status: 'completed',
                demo_mode: false,
                address: address,
                hash: transfer.result.hash,
                created_at: new Date()
            });

            res.json({
                success: true,
                demo: false,
                message: 'Withdrawal successful',
                hash: transfer.result.hash,
                new_balance: user.main_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Ошибка при выводе средств' });
        }
    } catch (error) {
        console.error('Crypto Pay error:', error);
        res.status(500).json({ error: 'Ошибка Crypto Pay' });
    }
});

// API: Добавление демо-баланса
app.post('/api/admin/add-balance', async (req, res) => {
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

        transactions.insert({
            user_id: targetUser.$loki,
            amount: parseFloat(amount),
            type: 'admin_deposit',
            status: 'completed',
            demo_mode: true,
            created_at: new Date(),
            admin_telegram_id: telegramId
        });

        res.json({ 
            success: true, 
            message: 'Demo balance added successfully',
            new_balance: targetUser.demo_balance + parseFloat(amount)
        });
    } catch (error) {
        console.error('Add demo balance error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Вывод прибыли
app.post('/api/admin/withdraw', async (req, res) => {
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


app.get('/api/admin/dashboard/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const bank = getCasinoBank();
        const totalUsers = users.count();
        const totalTransactions = transactions.count();

        res.json({
            bank_balance: bank ? bank.total_balance : 0,
            total_users: totalUsers,
            total_transactions: totalTransactions
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Обслуживание статических файлов
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/mines', (req, res) => {
  res.sendFile(path.join(__dirname, 'mines.html'));
});

app.get('/rocket', (req, res) => {
  res.sendFile(path.join(__dirname, 'rocket.html'));
});

// Запуск сервера
const server = app.listen(PORT, async () => {
  await initDatabase();
  startRocketGame(); // Запускаем игру в ракетку
  console.log(`TON Casino Server running on port ${PORT}`);
});

// WebSocket сервер
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Планировщик для очистки старых данных
cron.schedule('0 0 * * *', () => {
  console.log('Running daily cleanup...');
  
  // Удаляем транзакции старше 30 дней
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const oldTransactions = transactions.find({ 
    created_at: { $lt: thirtyDaysAgo } 
  });
  
  oldTransactions.forEach(t => transactions.remove(t));
  
  // Удаляем игры старше 30 дней
  const oldMinesGames = minesGames.find({ 
    created_at: { $lt: thirtyDaysAgo } 
  });
  
  oldMinesGames.forEach(g => minesGames.remove(g));
  
  // Удаляем ставки в ракетку старше 30 дней
  const oldRocketBets = rocketBets.find({ 
    created_at: { $lt: thirtyDaysAgo } 
  });
  
  oldRocketBets.forEach(b => rocketBets.remove(b));
  
  console.log(`Cleaned up ${oldTransactions.length} transactions, ${oldMinesGames.length} mines games, ${oldRocketBets.length} rocket bets`);
});
