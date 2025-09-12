// server.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

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
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

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
                    
                    // Создаем администратора по умолчанию
                    users.insert({
                        telegram_id: parseInt(process.env.OWNER_TELEGRAM_ID) || 842428912,
                        main_balance: 0,
                        demo_balance: 1000,
                        created_at: new Date(),
                        demo_mode: false,
                        is_admin: true
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
    const cryptoPayApi = demoMode ? 
      'https://testnet-pay.crypt.bot/api' : 
      'https://pay.crypt.bot/api';
      
    const cryptoPayToken = demoMode ?
      process.env.CRYPTO_PAY_TESTNET_TOKEN :
      process.env.CRYPTO_PAY_MAINNET_TOKEN;

    const response = await axios.post(`${cryptoPayApi}/${method}`, data, {
      headers: {
        'Crypto-Pay-API-Token': cryptoPayToken,
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

// API: Получить пользователя
app.get('/api/user/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  
  try {
    let user = users.findOne({ telegram_id: telegramId });
    
    if (!user) {
      // Создаем нового пользователя
      user = users.insert({
        telegram_id: telegramId,
        main_balance: 0,
        demo_balance: 1000,
        created_at: new Date(),
        demo_mode: true,
        is_admin: telegramId === parseInt(process.env.OWNER_TELEGRAM_ID)
      });
    }
    
    res.json({
      telegram_id: user.telegram_id,
      main_balance: user.main_balance,
      demo_balance: user.demo_balance,
      demo_mode: user.demo_mode,
      is_admin: user.is_admin,
      created_at: user.created_at,
      balance: user.demo_mode ? user.demo_balance : user.main_balance // Добавляем общий баланс для совместимости
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Переключить демо режим
app.post('/api/user/toggle-demo', async (req, res) => {
  const { telegramId } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (user) {
      users.update({
        ...user,
        demo_mode: !user.demo_mode
      });
      
      res.json({
        success: true,
        demo_mode: !user.demo_mode,
        main_balance: user.main_balance,
        demo_balance: user.demo_balance,
        balance: !user.demo_mode ? user.demo_balance : user.main_balance // Добавляем общий баланс
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Toggle demo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Создать депозит (ИСПРАВЛЕННАЯ ВЕРСИЯ)
app.post('/api/deposit/create', async (req, res) => {
  const { telegramId, amount } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Для демо-режима сразу зачисляем средства
    if (user.demo_mode) {
      const newBalance = user.demo_balance + parseFloat(amount);
      users.update({
        ...user,
        demo_balance: newBalance
      });

      // Записываем транзакцию
      transactions.insert({
        user_id: user.$loki,
        amount: parseFloat(amount),
        type: 'demo_deposit',
        status: 'completed',
        demo_mode: true,
        created_at: new Date()
      });

      return res.json({
        success: true,
        invoice_url: null,
        invoice_id: null,
        is_demo: true,
        new_balance: newBalance
      });
    }

    // Для реального режима создаем инвойс
    const invoice = await cryptoPayRequest('createInvoice', {
      asset: 'TON',
      amount: parseFloat(amount),
      description: `Deposit for user ${telegramId}`,
      paid_btn_name: 'return',
      paid_btn_url: 'https://t.me/your_bot',
      payload: JSON.stringify({
        telegramId: telegramId,
        type: 'deposit'
      }),
      allow_comments: false
    }, false);

    if (invoice.ok) {
      // Сохраняем транзакцию как ожидающую
      transactions.insert({
        user_id: user.$loki,
        amount: parseFloat(amount),
        type: 'deposit',
        status: 'pending',
        invoice_id: invoice.result.invoice_id,
        demo_mode: false,
        created_at: new Date()
      });

      res.json({
        success: true,
        invoice_url: invoice.result.pay_url,
        invoice_id: invoice.result.invoice_id,
        is_demo: false
      });
    } else {
      res.status(400).json({ error: invoice.error });
    }
  } catch (error) {
    console.error('Create deposit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Создать вывод (ИСПРАВЛЕННАЯ ВЕРСИЯ)
app.post('/api/withdraw/create', async (req, res) => {
  const { telegramId, amount, address } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Проверяем достаточно ли средств
    const availableBalance = user.demo_mode ? user.demo_balance : user.main_balance;
    if (availableBalance < parseFloat(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Для демо-режима просто списываем средства
    if (user.demo_mode) {
      const newBalance = user.demo_balance - parseFloat(amount);
      users.update({
        ...user,
        demo_balance: newBalance
      });

      transactions.insert({
        user_id: user.$loki,
        amount: parseFloat(amount),
        type: 'demo_withdraw',
        status: 'completed',
        demo_mode: true,
        address: address,
        created_at: new Date()
      });

      return res.json({
        success: true,
        is_demo: true,
        new_balance: newBalance
      });
    }

    // Для реального режима создаем вывод
    const transfer = await cryptoPayRequest('transfer', {
      asset: 'TON',
      amount: parseFloat(amount),
      user_id: telegramId,
      spend_id: `withdraw_${telegramId}_${Date.now()}`,
      comment: 'Withdrawal from casino'
    }, false);

    if (transfer.ok) {
      // Списываем средства
      const newBalance = user.main_balance - parseFloat(amount);
      users.update({
        ...user,
        main_balance: newBalance
      });

      // Обновляем банк казино
      updateCasinoBank(parseFloat(amount));

      // Сохраняем транзакцию
      transactions.insert({
        user_id: user.$loki,
        amount: parseFloat(amount),
        type: 'withdraw',
        status: 'completed',
        demo_mode: false,
        address: address,
        transfer_id: transfer.result.transfer_id,
        created_at: new Date()
      });

      res.json({
        success: true,
        is_demo: false,
        new_balance: newBalance
      });
    } else {
      res.status(400).json({ error: transfer.error });
    }
  } catch (error) {
    console.error('Create withdraw error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Проверить статус депозита
app.get('/api/deposit/check/:invoiceId', async (req, res) => {
  const { invoiceId } = req.params;
  
  try {
    const transaction = transactions.findOne({ invoice_id: invoiceId });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'completed') {
      return res.json({ status: 'completed' });
    }

    // Проверяем статус инвойса
    const invoiceStatus = await cryptoPayRequest('getInvoices', {
      invoice_ids: invoiceId
    }, false);

    if (invoiceStatus.ok && invoiceStatus.result.items.length > 0) {
      const invoice = invoiceStatus.result.items[0];
      
      if (invoice.status === 'paid') {
        // Обновляем баланс пользователя
        const user = users.get(transaction.user_id);
        const newBalance = user.main_balance + transaction.amount;
        
        users.update({
          ...user,
          main_balance: newBalance
        });

        // Обновляем статус транзакции
        transactions.update({
          ...transaction,
          status: 'completed'
        });

        // Обновляем банк казино
        updateCasinoBank(-transaction.amount);

        res.json({ status: 'completed' });
      } else {
        res.json({ status: invoice.status });
      }
    } else {
      res.status(404).json({ error: 'Invoice not found' });
    }
  } catch (error) {
    console.error('Check deposit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить историю транзакций
app.get('/api/transactions/:telegramId', async (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const user = users.findOne({ telegram_id: telegramId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userTransactions = transactions
      .chain()
      .find({ user_id: user.$loki })
      .simplesort('created_at', true)
      .offset(parseInt(offset))
      .limit(parseInt(limit))
      .data();

    res.json({
      transactions: userTransactions.map(t => ({
        id: t.$loki,
        amount: t.amount,
        type: t.type,
        status: t.status,
        demo_mode: t.demo_mode,
        created_at: t.created_at,
        address: t.address
      })),
      total: transactions.find({ user_id: user.$loki }).length
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Mines - Начать игру
app.post('/api/mines/start', async (req, res) => {
  const { telegramId, betAmount, minesCount } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const availableBalance = user.demo_mode ? user.demo_balance : user.main_balance;
    if (availableBalance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Списываем ставку
    if (user.demo_mode) {
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

    // Создаем игру
    const game = generateMinesGame(minesCount);
    game.betAmount = betAmount;
    
    const gameRecord = minesGames.insert({
      user_id: user.$loki,
      bet_amount: betAmount,
      mines_count: minesCount,
      mines: game.mines,
      revealed_cells: [],
      game_over: false,
      win: false,
      current_multiplier: 1,
      demo_mode: user.demo_mode,
      created_at: new Date()
    });

    // Сохраняем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: -betAmount,
      type: 'mines_bet',
      status: 'completed',
      demo_mode: user.demo_mode,
      game_id: gameRecord.$loki,
      created_at: new Date()
    });

    res.json({
      success: true,
      game_id: gameRecord.$loki,
      mines_count: minesCount,
      balance: user.demo_mode ? user.demo_balance : user.main_balance
    });
  } catch (error) {
    console.error('Mines start error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Mines - Открыть ячейку
app.post('/api/mines/reveal', async (req, res) => {
  const { telegramId, gameId, cellIndex } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    const game = minesGames.get(parseInt(gameId));
    
    if (!user || !game) {
      return res.status(404).json({ error: 'User or game not found' });
    }

    if (game.user_id !== user.$loki) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Game already finished' });
    }

    // Проверяем, не мина ли это
    if (game.mines.includes(cellIndex)) {
      // Игра проиграна
      minesGames.update({
        ...game,
        game_over: true,
        win: false
      });

      res.json({
        success: true,
        game_over: true,
        win: false,
        mine_hit: true,
        cell_index: cellIndex,
        current_multiplier: 1,
        win_amount: 0
      });
    } else {
      // Открываем ячейку
      const revealedCells = [...game.revealed_cells, cellIndex];
      const openedCells = revealedCells.length;
      
      // Рассчитываем множитель по новой системе
      const currentMultiplier = calculateMultiplier(openedCells, game.mines_count);

      minesGames.update({
        ...game,
        revealed_cells: revealedCells,
        current_multiplier: currentMultiplier
      });

      res.json({
        success: true,
        game_over: false,
        win: false,
        mine_hit: false,
        cell_index: cellIndex,
        current_multiplier: currentMultiplier,
        win_amount: game.bet_amount * currentMultiplier
      });
    }
  } catch (error) {
    console.error('Mines reveal error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Mines - Забрать выигрыш
app.post('/api/mines/cashout', async (req, res) => {
  const { telegramId, gameId } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    const game = minesGames.get(parseInt(gameId));
    
    if (!user || !game) {
      return res.status(404).json({ error: 'User or game not found' });
    }

    if (game.user_id !== user.$loki) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (game.game_over) {
      return res.status(400).json({ error: 'Game already finished' });
    }

    const winAmount = game.bet_amount * game.current_multiplier;

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

    // Обновляем игру
    minesGames.update({
      ...game,
      game_over: true,
      win: true
    });

    // Сохраняем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: winAmount,
      type: 'mines_win',
      status: 'completed',
      demo_mode: game.demo_mode,
      game_id: game.$loki,
      created_at: new Date()
    });

    res.json({
      success: true,
      win_amount: winAmount,
      balance: game.demo_mode ? user.demo_balance : user.main_balance
    });
  } catch (error) {
    console.error('Mines cashout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Rocket - Сделать ставку
app.post('/api/rocket/bet', async (req, res) => {
  const { telegramId, betAmount, autoCashout } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const availableBalance = user.demo_mode ? user.demo_balance : user.main_balance;
    if (availableBalance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Списываем ставку
    if (user.demo_mode) {
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

    // Добавляем игрока в текущую игру
    rocketGame.players.push({
      userId: telegramId,
      name: `User_${telegramId}`,
      betAmount: parseFloat(betAmount),
      autoCashout: parseFloat(autoCashout),
      isBot: false,
      demoMode: user.demo_mode,
      cashedOut: false,
      cashoutMultiplier: null,
      winAmount: 0
    });

    // Сохраняем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: -betAmount,
      type: 'rocket_bet',
      status: 'completed',
      demo_mode: user.demo_mode,
      created_at: new Date()
    });

    res.json({
      success: true,
      balance: user.demo_mode ? user.demo_balance : user.main_balance
    });
  } catch (error) {
    console.error('Rocket bet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Rocket - Забрать выигрыш
app.post('/api/rocket/cashout', async (req, res) => {
  const { telegramId } = req.body;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Находим игрока в текущей игре
    const player = rocketGame.players.find(p => 
      !p.isBot && p.userId === telegramId.toString() && !p.cashedOut
    );

    if (!player) {
      return res.status(400).json({ error: 'No active bet found' });
    }

    player.cashedOut = true;
    player.cashoutMultiplier = rocketGame.multiplier;
    player.winAmount = player.betAmount * rocketGame.multiplier;

    // Зачисляем выигрыш
    if (player.demoMode) {
      users.update({
        ...user,
        demo_balance: user.demo_balance + player.winAmount
      });
    } else {
      users.update({
        ...user,
        main_balance: user.main_balance + player.winAmount
      });
      updateCasinoBank(-player.winAmount);
    }

    // Сохраняем транзакцию
    transactions.insert({
      user_id: user.$loki,
      amount: player.winAmount,
      type: 'rocket_win',
      status: 'completed',
      demo_mode: player.demoMode,
      created_at: new Date()
    });

    res.json({
      success: true,
      cashout_multiplier: rocketGame.multiplier,
      win_amount: player.winAmount,
      balance: player.demoMode ? user.demo_balance : user.main_balance
    });
  } catch (error) {
    console.error('Rocket cashout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Получить историю ракетки
app.get('/api/rocket/history', async (req, res) => {
  try {
    const history = rocketGames
      .chain()
      .simplesort('startTime', true)
      .limit(50)
      .data();

    res.json({
      history: history.map(game => ({
        crashPoint: game.crashPoint,
        maxMultiplier: game.maxMultiplier,
        startTime: game.startTime,
        playerCount: game.playerCount
      }))
    });
  } catch (error) {
    console.error('Get rocket history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Админка - Получить статистику
app.get('/api/admin/stats', async (req, res) => {
  const { telegramId } = req.query;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const totalUsers = users.count();
    const totalDeposits = transactions.find({ type: 'deposit', status: 'completed' }).length;
    const totalWithdrawals = transactions.find({ type: 'withdraw', status: 'completed' }).length;
    const bank = getCasinoBank();

    res.json({
      total_users: totalUsers,
      total_deposits: totalDeposits,
      total_withdrawals: totalWithdrawals,
      casino_bank: bank.total_balance
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Админка - Изменить баланс пользователя
app.post('/api/admin/update-balance', async (req, res) => {
  const { adminTelegramId, targetTelegramId, amount, isDemo } = req.body;
  
  try {
    const admin = users.findOne({ telegram_id: parseInt(adminTelegramId) });
    const targetUser = users.findOne({ telegram_id: parseInt(targetTelegramId) });
    
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (isDemo) {
      users.update({
        ...targetUser,
        demo_balance: targetUser.demo_balance + parseFloat(amount)
      });
    } else {
      users.update({
        ...targetUser,
        main_balance: targetUser.main_balance + parseFloat(amount)
      });
      
      if (parseFloat(amount) > 0) {
        updateCasinoBank(-parseFloat(amount));
      } else {
        updateCasinoBank(Math.abs(parseFloat(amount)));
      }
    }

    // Логируем действие
    logAdminAction('update_balance', adminTelegramId, {
      target_user: targetTelegramId,
      amount: amount,
      is_demo: isDemo
    });

    res.json({
      success: true,
      new_balance: isDemo ? targetUser.demo_balance : targetUser.main_balance
    });
  } catch (error) {
    console.error('Admin update balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Админка - Получить логи
app.get('/api/admin/logs', async (req, res) => {
  const { telegramId, limit = 100 } = req.query;
  
  try {
    const user = users.findOne({ telegram_id: parseInt(telegramId) });
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = adminLogs
      .chain()
      .simplesort('created_at', true)
      .limit(parseInt(limit))
      .data();

    res.json({ logs });
  } catch (error) {
    console.error('Admin logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Крон задача для проверки депозитов
cron.schedule('*/30 * * * * *', async () => {
  try {
    const pendingDeposits = transactions.find({ 
      type: 'deposit', 
      status: 'pending' 
    });

    for (const deposit of pendingDeposits) {
      const invoiceStatus = await cryptoPayRequest('getInvoices', {
        invoice_ids: deposit.invoice_id
      }, false);

      if (invoiceStatus.ok && invoiceStatus.result.items.length > 0) {
        const invoice = invoiceStatus.result.items[0];
        
        if (invoice.status === 'paid') {
          const user = users.get(deposit.user_id);
          
          users.update({
            ...user,
            main_balance: user.main_balance + deposit.amount
          });

          transactions.update({
            ...deposit,
            status: 'completed'
          });

          updateCasinoBank(-deposit.amount);
        }
      }
    }
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

// Запуск сервера
async function startServer() {
  await initDatabase();
  
  // Запускаем игру в ракетку
  startRocketGame();
  
  console.log(`TON Casino Server started on port ${PORT}`);
}

startServer();