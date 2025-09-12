require('dotenv').config();
const express = require('express');
const path = require('path');
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

// Импорт роутов
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const minesRoutes = require('./routes/mines');
const rocketRoutes = require('./routes/rocket');
const paymentRoutes = require('./routes/payment');

// Использование роутов
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/mines', minesRoutes);
app.use('/api/rocket', rocketRoutes);
app.use('/api', paymentRoutes);

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

// Экспорт функций для использования в роутах
module.exports = {
    getDb: () => db,
    getCollections: () => ({ users, transactions, casinoBank, adminLogs, minesGames, rocketGames, rocketBets }),
    getRocketGame: () => rocketGame,
    setRocketGame: (game) => { rocketGame = game; },
    getRocketBots: () => rocketBots,
    cryptoPayRequest: async (method, data = {}, demoMode = false) => {
        try {
            const axios = require('axios');
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
    },
    logAdminAction: (action, telegramId, details = {}) => {
        adminLogs.insert({
            action: action,
            telegram_id: telegramId,
            details: details,
            created_at: new Date()
        });
    },
    getCasinoBank: () => casinoBank.findOne({}),
    updateCasinoBank: (amount) => {
        const bank = casinoBank.findOne({});
        casinoBank.update({
            ...bank,
            total_balance: bank.total_balance + amount,
            updated_at: new Date()
        });
    },
    calculateMultiplier: (openedCells, displayedMines) => {
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
    },
    generateCrashPoint: () => {
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
    },
    broadcastRocketUpdate: () => {
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
};

// Rocket Game Functions
function startRocketGame() {
    if (rocketGame.status !== 'waiting') return;

    rocketGame.status = 'counting';
    rocketGame.multiplier = 1.00;
    rocketGame.crashPoint = module.exports.generateCrashPoint();
    rocketGame.startTime = Date.now();
    rocketGame.endBetTime = Date.now() + 10000;
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

    module.exports.broadcastRocketUpdate();

    setTimeout(() => {
        rocketGame.status = 'flying';
        module.exports.broadcastRocketUpdate();
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
        rocketGame.multiplier = 1.00 + (elapsed * 0.1);

        rocketGame.players.forEach(player => {
            if (player.isBot && !player.cashedOut && rocketGame.multiplier >= player.autoCashout) {
                player.cashedOut = true;
                player.winAmount = player.betAmount * rocketGame.multiplier;
            }
        });

        if (rocketGame.multiplier >= rocketGame.crashPoint) {
            rocketGame.status = 'crashed';
            clearInterval(flightInterval);
            processRocketGameEnd();
        }

        module.exports.broadcastRocketUpdate();
    }, 100);
}

function processRocketGameEnd() {
    const { rocketGames, rocketBets, users, transactions, updateCasinoBank } = module.exports.getCollections();
    
    const gameRecord = rocketGames.insert({
        crashPoint: rocketGame.crashPoint,
        maxMultiplier: rocketGame.multiplier,
        startTime: new Date(rocketGame.startTime),
        endTime: new Date(),
        playerCount: rocketGame.players.length,
        totalBets: rocketGame.players.reduce((sum, p) => sum + p.betAmount, 0),
        totalPayouts: rocketGame.players.reduce((sum, p) => sum + (p.cashedOut ? p.winAmount : 0), 0)
    });

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

                transactions.insert({
                    user_id: user.$loki,
                    amount: winAmount,
                    type: 'rocket_win',
                    status: 'completed',
                    demo_mode: player.demoMode,
                    game_id: gameRecord.$loki,
                    created_at: new Date()
                });

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

    rocketGame.history.unshift({
        crashPoint: rocketGame.crashPoint,
        multiplier: rocketGame.multiplier
    });

    if (rocketGame.history.length > 50) {
        rocketGame.history.pop();
    }

    module.exports.broadcastRocketUpdate();

    setTimeout(() => {
        rocketGame.status = 'waiting';
        rocketGame.multiplier = 1.00;
        rocketGame.players = [];
        module.exports.broadcastRocketUpdate();
        startRocketGame();
    }, 5000);
}

// WebSocket обработчик
wss.on('connection', function connection(ws) {
    console.log('Rocket game client connected');
    
    ws.send(JSON.stringify({
        type: 'rocket_update',
        game: rocketGame
    }));

    ws.on('close', () => {
        console.log('Rocket game client disconnected');
    });
});

// Крон задача для проверки инвойсов
cron.schedule('* * * * *', async () => {
    try {
        const { transactions, users, updateCasinoBank } = module.exports.getCollections();
        const cryptoPayRequest = module.exports.cryptoPayRequest;

        const pendingTransactions = transactions.find({
            status: 'pending',
            type: 'deposit'
        });

        for (const transaction of pendingTransactions) {
            const invoice = await cryptoPayRequest('getInvoices', {
                invoice_ids: transaction.invoice_id
            }, transaction.demo_mode);

            if (invoice.ok && invoice.result.items.length > 0) {
                const invoiceData = invoice.result.items[0];
                
                if (invoiceData.status === 'paid') {
                    const user = users.get(transaction.user_id);
                    
                    if (transaction.demo_mode) {
                        users.update({
                            ...user,
                            demo_balance: user.demo_balance + transaction.amount
                        });
                    } else {
                        users.update({
                            ...user,
                            main_balance: user.main_balance + transaction.amount
                        });
                        updateCasinoBank(transaction.amount);
                    }

                    transactions.update({
                        ...transaction,
                        status: 'completed',
                        updated_at: new Date()
                    });
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
    startRocketGame();
    console.log(`TON Casino Server started on port ${PORT}`);
}

startServer();