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
let users, transactions, casinoBank, adminLogs, minesGames, rocketBets;

// Глобальное состояние игры Rocket
global.rocketGameState = {
    isRoundPreparing: true,
    roundTimer: 10,
    bets: [],
    crashPoint: null,
    currentMultiplier: 1.00,
    gameActive: false
};

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
                    // Инициализируем банк казино (только реальные TON)
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

                if (!rocketBets) {
                    rocketBets = db.addCollection('rocket_bets', {
                        indices: ['telegramId', 'createdAt', 'status']
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
    
    // Генерируем мины
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
    // Множители для разных количеств мин (как в 1win)
    const multipliers = {
        3: [1.00, 1.07, 1.14, 1.23, 1.33, 1.45, 1.59, 1.75, 1.95, 2.18, 2.47, 2.83, 3.28, 3.86, 4.62, 5.63, 7.00, 8.92, 11.67, 15.83, 22.50, 34.00, 56.67, 113.33],
        5: [1.00, 1.11, 1.22, 1.35, 1.50, 1.67, 1.88, 2.14, 2.45, 2.86, 3.38, 4.05, 4.95, 6.15, 7.83, 10.21, 13.68, 18.91, 27.14, 40.71, 65.14, 113.99, 227.98, 569.95],
        7: [1.00, 1.20, 1.40, 1.64, 1.92, 2.26, 2.67, 3.17, 3.80, 4.60, 5.63, 6.98, 8.75, 11.11, 14.29, 18.75, 25.00, 34.00, 47.50, 68.00, 100.00, 152.00, 240.00, 400.00]
    };

    const mineMultipliers = multipliers[displayedMines];
    
    if (mineMultipliers && openedCells < mineMultipliers.length) {
        return mineMultipliers[openedCells];
    }
    
    // Если открыли все клетки - максимальный множитель ×2
    return mineMultipliers ? mineMultipliers[mineMultipliers.length - 1] * 2 : 1.00;
}

// Функция для управления раундами Rocket
function startNewRocketRound() {
    console.log('🚀 Starting new Rocket round...');
    
    global.rocketGameState.isRoundPreparing = true;
    global.rocketGameState.roundTimer = 10;
    global.rocketGameState.bets = [];
    global.rocketGameState.crashPoint = generateCrashPoint();
    global.rocketGameState.currentMultiplier = 1.00;
    global.rocketGameState.gameActive = false;
    
    console.log('🎯 Crash point set to:', global.rocketGameState.crashPoint.toFixed(2) + 'x');
    
    // Запускаем таймер раунда
    const roundInterval = setInterval(() => {
        global.rocketGameState.roundTimer--;
        
        if (global.rocketGameState.roundTimer <= 0) {
            clearInterval(roundInterval);
            global.rocketGameState.isRoundPreparing = false;
            global.rocketGameState.gameActive = true;
            
            console.log('🎮 Rocket game started!');
            simulateRocketGame();
        }
    }, 1000);
}

const wss = new WebSocket.Server({ server: app.listen(PORT) });
const connectedClients = new Map();
wss.on('connection', function connection(ws) {
    console.log('🔗 New WebSocket connection');
    
    ws.on('message', function message(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'auth') {
                // Аутентификация клиента
                connectedClients.set(message.telegramId, ws);
                ws.telegramId = message.telegramId;
                
                // Отправляем текущее состояние игры
                ws.send(JSON.stringify({
                    type: 'game_state',
                    state: global.rocketGameState
                }));
            }
            
            if (message.type === 'place_bet') {
                handleRocketBet(message);
            }
            
            if (message.type === 'cashout') {
                handleRocketCashout(message);
            }
            
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', function() {
        console.log('🔌 WebSocket connection closed');
        if (ws.telegramId) {
            connectedClients.delete(ws.telegramId);
        }
    });
});

// Функция для отправки сообщений всем клиентам
function broadcast(message) {
    const data = JSON.stringify(message);
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Функция для отправки сообщения конкретному клиенту
function sendToClient(telegramId, message) {
    const client = connectedClients.get(telegramId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
}

// Обработка ставок через WebSocket
async function handleRocketBet(message) {
    const { telegramId, betAmount, autoCashout } = message;
    
    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            sendToClient(telegramId, { type: 'bet_error', error: 'User not found' });
            return;
        }

        if (!global.rocketGameState.isRoundPreparing) {
            sendToClient(telegramId, { type: 'bet_error', error: 'Round already started' });
            return;
        }

        const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
            sendToClient(telegramId, { type: 'bet_error', error: 'Insufficient balance' });
            return;
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
        }

        // Создаем запись ставки
        const betRecord = rocketBets.insert({
            telegramId: parseInt(telegramId),
            betAmount: betAmount,
            autoCashout: autoCashout,
            status: 'placed',
            createdAt: new Date(),
            demoMode: user.demo_mode,
            roundCrashPoint: global.rocketGameState.crashPoint
        });

        // Добавляем в текущий раунд
        global.rocketGameState.bets.push({
            betId: betRecord.$loki,
            telegramId: parseInt(telegramId),
            betAmount: betAmount,
            autoCashout: autoCashout,
            demoMode: user.demo_mode,
            cashedOut: false,
            cashoutMultiplier: null,
            username: user.username || `User${telegramId}`
        });

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: -betAmount,
            type: 'rocket_bet',
            status: 'completed',
            game_id: betRecord.$loki,
            created_at: new Date(),
            demo_mode: user.demo_mode
        });

        // Отправляем подтверждение
        sendToClient(telegramId, {
            type: 'bet_placed',
            betId: betRecord.$loki,
            newBalance: user.demo_mode ? user.demo_balance - betAmount : user.main_balance - betAmount
        });

        // Рассылаем обновление всем клиентам
        broadcast({
            type: 'bet_added',
            bet: {
                betId: betRecord.$loki,
                telegramId: parseInt(telegramId),
                betAmount: betAmount,
                demoMode: user.demo_mode,
                username: user.username || `User${telegramId}`
            }
        });

    } catch (error) {
        console.error('WebSocket bet error:', error);
        sendToClient(telegramId, { type: 'bet_error', error: 'Internal server error' });
    }
}

// Обработка кэшаута через WebSocket
async function handleRocketCashout(message) {
    const { betId } = message;
    
    try {
        const bet = rocketBets.get(parseInt(betId));
        if (!bet) {
            sendToClient(message.telegramId, { type: 'cashout_error', error: 'Bet not found' });
            return;
        }

        if (bet.status !== 'placed') {
            sendToClient(message.telegramId, { type: 'cashout_error', error: 'Bet already processed' });
            return;
        }

        const user = users.findOne({ telegram_id: bet.telegramId });
        if (!user) {
            sendToClient(message.telegramId, { type: 'cashout_error', error: 'User not found' });
            return;
        }

        if (!global.rocketGameState.gameActive) {
            sendToClient(message.telegramId, { type: 'cashout_error', error: 'Game not active' });
            return;
        }

        const currentMultiplier = global.rocketGameState.currentMultiplier;
        const winAmount = bet.betAmount * currentMultiplier;

        // Обновляем ставку
        rocketBets.update({
            ...bet,
            status: 'cashed_out',
            cashoutMultiplier: currentMultiplier,
            winAmount: winAmount,
            updatedAt: new Date()
        });

        // Обновляем в текущем раунде
        const roundBet = global.rocketGameState.bets.find(b => b.betId === parseInt(betId));
        if (roundBet) {
            roundBet.cashedOut = true;
            roundBet.cashoutMultiplier = currentMultiplier;
        }

        // Зачисляем выигрыш
        if (bet.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });

            // Обновляем банк казино
            const profit = winAmount - bet.betAmount;
            if (profit > 0) {
                updateCasinoBank(-profit);
            }
        }

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'rocket_win',
            status: 'completed',
            game_id: bet.$loki,
            created_at: new Date(),
            demo_mode: bet.demoMode,
            multiplier: currentMultiplier
        });

        // Отправляем подтверждение
        sendToClient(bet.telegramId, {
            type: 'cashout_success',
            winAmount: winAmount,
            multiplier: currentMultiplier,
            newBalance: bet.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });

        // Рассылаем обновление
        broadcast({
            type: 'cashout_processed',
            betId: betId,
            multiplier: currentMultiplier,
            winAmount: winAmount
        });

    } catch (error) {
        console.error('WebSocket cashout error:', error);
        sendToClient(message.telegramId, { type: 'cashout_error', error: 'Internal server error' });
    }
}

// Модифицируем функцию simulateRocketGame для рассылки обновлений
function simulateRocketGame() {
    console.log('🚀 Rocket launch! Target:', global.rocketGameState.crashPoint.toFixed(2) + 'x');
    
    let multiplier = 1.00;
    const gameInterval = setInterval(() => {
        if (!global.rocketGameState.gameActive) {
            clearInterval(gameInterval);
            return;
        }
        
        multiplier += 0.01;
        global.rocketGameState.currentMultiplier = multiplier;
        
        // Рассылаем обновление множителя всем клиентам
        broadcast({
            type: 'multiplier_update',
            multiplier: multiplier
        });
        
        // Проверяем автокэшаут для ставок
        global.rocketGameState.bets.forEach(bet => {
            if (!bet.cashedOut && bet.autoCashout && multiplier >= bet.autoCashout) {
                handleRocketCashout({
                    betId: bet.betId,
                    telegramId: bet.telegramId
                });
            }
        });
        
        // Проверяем достигли ли точки краха
        if (multiplier >= global.rocketGameState.crashPoint) {
            clearInterval(gameInterval);
            global.rocketGameState.gameActive = false;
            
            console.log('💥 Rocket crashed at:', multiplier.toFixed(2) + 'x');
            
            // Рассылаем сообщение о крахе
            broadcast({
                type: 'game_crashed',
                multiplier: multiplier
            });
            
            // Обрабатываем все активные ставки как проигравшие
            processCrashedBets();
            
            // Запускаем новый раунд через 5 секунд
            setTimeout(() => {
                startNewRocketRound();
                // Рассылаем информацию о новом раунде
                broadcast({
                    type: 'new_round_starting',
                    timer: 10
                });
            }, 5000);
        }
    }, 100);
}

// Генерация точки краха
function generateCrashPoint() {
    const probabilities = [
        { multiplier: 1.5, chance: 0.3 },
        { multiplier: 2.0, chance: 0.2 },
        { multiplier: 3.0, chance: 0.15 },
        { multiplier: 5.0, chance: 0.1 },
        { multiplier: 10.0, chance: 0.05 },
        { multiplier: 20.0, chance: 0.02 },
        { multiplier: 50.0, chance: 0.01 }
    ];

    let random = Math.random();
    let cumulative = 0;

    for (const prob of probabilities) {
        cumulative += prob.chance;
        if (random <= cumulative) {
            return prob.multiplier;
        }
    }

    return 1.1 + Math.random() * 98.9;
}

// Симуляция игры Rocket
function simulateRocketGame() {
    console.log('🚀 Rocket launch! Target:', global.rocketGameState.crashPoint.toFixed(2) + 'x');
    
    let multiplier = 1.00;
    const gameInterval = setInterval(() => {
        if (!global.rocketGameState.gameActive) {
            clearInterval(gameInterval);
            return;
        }
        
        multiplier += 0.01;
        global.rocketGameState.currentMultiplier = multiplier;
        
        // Проверяем достигли ли точки краха
        if (multiplier >= global.rocketGameState.crashPoint) {
            clearInterval(gameInterval);
            global.rocketGameState.gameActive = false;
            
            console.log('💥 Rocket crashed at:', multiplier.toFixed(2) + 'x');
            
            // Обрабатываем все активные ставки как проигравшие
            processCrashedBets();
            
            // Запускаем новый раунд через 5 секунд
            setTimeout(() => {
                startNewRocketRound();
            }, 5000);
        }
    }, 100); // Обновление каждые 100ms
}

// Обработка ставок при крахе
function processCrashedBets() {
    // Здесь обрабатываем все активные ставки как проигравшие
    console.log('💸 Processing', global.rocketGameState.bets.length, 'crashed bets');
    
    // В реальном приложении здесь была бы логика обновления БД
}

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

        res.json({
            bank_balance: bank.total_balance,
            total_users: totalUsers,
            total_transactions: totalTransactions,
            total_mines_games: totalMinesGames
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

        // Выводим через Crypto Pay
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
            demo_balance: targetUser.demo_balance + amount
        });

        // Записываем транзакцию
        transactions.insert({
            user_id: targetUser.$loki,
            amount: amount,
            type: 'admin_demo_deposit',
            status: 'completed',
            demo_mode: true,
            created_at: new Date(),
            admin_telegram_id: telegramId
        });

        logAdminAction('add_demo_balance', telegramId, { 
            target_telegram_id: targetTelegramId, 
            amount: amount 
        });

        res.json({
            success: true,
            message: `Добавлено ${amount} тестовых TON пользователю ${targetTelegramId}`,
            new_demo_balance: targetUser.demo_balance + amount
        });
    } catch (error) {
        console.error('Add demo balance error:', error);
        res.status(500).json({ error: 'Ошибка пополнения баланса' });
    }
});

// API: Получить данные пользователя
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        let user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            user = users.insert({
                telegram_id: telegramId,
                main_balance: 0,
                demo_balance: 1000,
                created_at: new Date(),
                demo_mode: false
            });
            
            res.json({ 
                balance: 0,
                demo_balance: 1000,
                main_balance: 0,
                demo_mode: false
            });
        } else {
            const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
            res.json({ 
                balance: currentBalance,
                demo_balance: user.demo_balance,
                main_balance: user.main_balance,
                demo_mode: user.demo_mode
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// API: Переключить режим демо/реальный
app.post('/api/toggle-mode', async (req, res) => {
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

        const currentBalance = newDemoMode ? user.demo_balance : user.main_balance;

        res.json({ 
            success: true, 
            demo_mode: newDemoMode,
            balance: currentBalance,
            demo_balance: user.demo_balance,
            main_balance: user.main_balance
        });
    } catch (error) {
        console.error('Toggle mode error:', error);
        res.status(500).json({ error: 'Toggle mode error' });
    }
});

// API: Получить историю транзакций
app.get('/api/transactions/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userTransactions = transactions.chain()
            .find({ user_id: user.$loki })
            .simplesort('created_at', true)
            .data();

        res.json(userTransactions);
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ error: 'Transactions error' });
    }
});

// API: Создать инвойс для пополнения
app.post('/api/create-invoice', async (req, res) => {
    const { telegramId, amount } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Создаем инвойс через Crypto Pay
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'callback',
            paid_btn_url: `https://t.me/toncasinobot`,
            payload: JSON.stringify({ 
                telegramId: telegramId,
                type: 'deposit'
            }),
            allow_comments: false,
            allow_anonymous: false
        }, false);

        if (invoice.ok && invoice.result) {
            // Сохраняем транзакцию как ожидающую
            transactions.insert({
                user_id: user.$loki,
                amount: amount,
                type: 'deposit',
                status: 'pending',
                invoice_id: invoice.result.invoice_id,
                created_at: new Date(),
                demo_mode: false
            });

            res.json({
                success: true,
                invoice_url: invoice.result.pay_url,
                invoice_id: invoice.result.invoice_id
            });
        } else {
            res.status(500).json({ error: 'Invoice creation failed' });
        }
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Invoice creation error' });
    }
});

// API: Проверить статус инвойса
app.get('/api/check-invoice/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;

    try {
        const transaction = transactions.findOne({ invoice_id: invoiceId });
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Проверяем статус через Crypto Pay
        const invoices = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, false);

        if (invoices.ok && invoices.result && invoices.result.items.length > 0) {
            const invoice = invoices.result.items[0];
            
            if (invoice.status === 'paid' && transaction.status === 'pending') {
                // Обновляем статус транзакции
                transactions.update({
                    ...transaction,
                    status: 'completed',
                    updated_at: new Date()
                });

                // Пополняем баланс пользователя
                const user = users.get(transaction.user_id);
                users.update({
                    ...user,
                    main_balance: user.main_balance + transaction.amount
                });

                res.json({ 
                    status: 'paid',
                    amount: transaction.amount
                });
            } else {
                res.json({ status: invoice.status });
            }
        } else {
            res.status(500).json({ error: 'Invoice check failed' });
        }
    } catch (error) {
        console.error('Check invoice error:', error);
        res.status(500).json({ error: 'Invoice check error' });
    }
});

// API: Вывод средств
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, walletAddress } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.demo_mode) {
            return res.status(400).json({ error: 'Cannot withdraw in demo mode' });
        }

        if (user.main_balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        if (amount < 1) {
            return res.status(400).json({ error: 'Minimum withdrawal is 1 TON' });
        }

        // Создаем вывод через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdraw_${telegramId}_${Date.now()}`,
            comment: `Withdrawal to ${walletAddress}`
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
                wallet_address: walletAddress,
                created_at: new Date(),
                demo_mode: false,
                tx_hash: transfer.result.hash
            });

            res.json({
                success: true,
                message: 'Withdrawal successful',
                hash: transfer.result.hash,
                new_balance: user.main_balance - amount
            });
        } else {
            res.status(500).json({ error: 'Withdrawal failed' });
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Withdrawal error' });
    }
});

// API: Mines Game - Начать игру
app.post('/api/mines/start', async (req, res) => {
    const { telegramId, betAmount, minesCount } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Создаем новую игру
        const game = generateMinesGame(minesCount);
        game.betAmount = betAmount;
        game.userId = user.$loki;
        game.demoMode = user.demo_mode;
        game.createdAt = new Date();

        const gameRecord = minesGames.insert(game);

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
        }

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: -betAmount,
            type: 'mines_bet',
            status: 'completed',
            game_id: gameRecord.$loki,
            created_at: new Date(),
            demo_mode: user.demo_mode
        });

        res.json({
            success: true,
            gameId: gameRecord.$loki,
            minesCount: minesCount,
            betAmount: betAmount,
            newBalance: user.demo_mode ? user.demo_balance - betAmount : user.main_balance - betAmount
        });
    } catch (error) {
        console.error('Mines start error:', error);
        res.status(500).json({ error: 'Game start error' });
    }
});

// API: Mines Game - Открыть клетку
app.post('/api/mines/open', async (req, res) => {
    const { gameId, cellIndex } = req.body;

    try {
        const game = minesGames.get(parseInt(gameId));
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.gameOver) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        const user = users.get(game.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Проверяем, не мина ли это
        if (game.mines.includes(cellIndex)) {
            // Игра окончена - проигрыш
            minesGames.update({
                ...game,
                gameOver: true,
                win: false,
                revealedCells: [...game.revealedCells, cellIndex]
            });

            // Записываем транзакцию проигрыша
            transactions.insert({
                user_id: user.$loki,
                amount: -game.betAmount,
                type: 'mines_loss',
                status: 'completed',
                game_id: game.$loki,
                created_at: new Date(),
                demo_mode: game.demoMode
            });

            // Обновляем банк казино (только для реальных игр)
            if (!game.demoMode) {
                updateCasinoBank(game.betAmount);
            }

            res.json({
                success: true,
                gameOver: true,
                win: false,
                isMine: true,
                revealedCell: cellIndex,
                multiplier: 0,
                totalWin: 0,
                newBalance: game.demoMode ? user.demo_balance : user.main_balance
            });
        } else {
            // Клетка безопасна
            const newRevealedCells = [...game.revealedCells, cellIndex];
            const openedCells = newRevealedCells.length;
            
            // Рассчитываем множитель как в 1win
            const multiplier = calculateMultiplier(openedCells, game.minesCount);
            
            minesGames.update({
                ...game,
                revealedCells: newRevealedCells,
                currentMultiplier: multiplier
            });

            res.json({
                success: true,
                gameOver: false,
                win: false,
                isMine: false,
                revealedCell: cellIndex,
                multiplier: multiplier,
                openedCells: openedCells,
                totalWin: game.betAmount * multiplier
            });
        }
    } catch (error) {
        console.error('Mines open error:', error);
        res.status(500).json({ error: 'Open cell error' });
    }
});

// API: Mines Game - Забрать выигрыш
app.post('/api/mines/cashout', async (req, res) => {
    const { gameId } = req.body;

    try {
        const game = minesGames.get(parseInt(gameId));
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.gameOver) {
            return res.status(400).json({ error: 'Game already finished' });
        }

        const user = users.get(game.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const winAmount = game.betAmount * game.currentMultiplier;
        const profit = winAmount - game.betAmount;

        // Обновляем игру
        minesGames.update({
            ...game,
            gameOver: true,
            win: true,
            winAmount: winAmount
        });

        // Зачисляем выигрыш
        if (game.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });

            // Обновляем банк казино (вычитаем прибыль игрока)
            if (profit > 0) {
                updateCasinoBank(-profit);
            }
        }

        // Записываем транзакцию выигрыша
        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'mines_win',
            status: 'completed',
            game_id: game.$loki,
            created_at: new Date(),
            demo_mode: game.demoMode,
            multiplier: game.currentMultiplier
        });

        res.json({
            success: true,
            gameOver: true,
            win: true,
            winAmount: winAmount,
            multiplier: game.currentMultiplier,
            newBalance: game.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });
    } catch (error) {
        console.error('Mines cashout error:', error);
        res.status(500).json({ error: 'Cashout error' });
    }
});

// API: Получить историю игр Mines
app.get('/api/mines/history/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userGames = minesGames.chain()
            .find({ userId: user.$loki })
            .simplesort('createdAt', true)
            .limit(20)
            .data();

        res.json(userGames);
    } catch (error) {
        console.error('Mines history error:', error);
        res.status(500).json({ error: 'History error' });
    }
});

// API: Получить текущее состояние Rocket игры
app.get('/api/rocket/state', async (req, res) => {
    try {
        res.json({
            success: true,
            state: global.rocketGameState
        });
    } catch (error) {
        console.error('Rocket state error:', error);
        res.status(500).json({ error: 'Failed to get rocket state' });
    }
});

// API: Сделать ставку в Rocket
app.post('/api/rocket/bet', async (req, res) => {
    const { telegramId, betAmount, autoCashout } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!global.rocketGameState.isRoundPreparing) {
            return res.status(400).json({ error: 'Round already started' });
        }

        const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
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
        }

        // Создаем запись ставки
        const betRecord = rocketBets.insert({
            telegramId: parseInt(telegramId),
            betAmount: betAmount,
            autoCashout: autoCashout,
            status: 'placed',
            createdAt: new Date(),
            demoMode: user.demo_mode,
            roundCrashPoint: global.rocketGameState.crashPoint
        });

        // Добавляем в текущий раунд
        global.rocketGameState.bets.push({
            betId: betRecord.$loki,
            telegramId: parseInt(telegramId),
            betAmount: betAmount,
            autoCashout: autoCashout,
            demoMode: user.demo_mode,
            cashedOut: false,
            cashoutMultiplier: null
        });

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: -betAmount,
            type: 'rocket_bet',
            status: 'completed',
            game_id: betRecord.$loki,
            created_at: new Date(),
            demo_mode: user.demo_mode
        });

        res.json({
            success: true,
            betId: betRecord.$loki,
            roundTimer: global.rocketGameState.roundTimer,
            newBalance: user.demo_mode ? user.demo_balance - betAmount : user.main_balance - betAmount
        });
    } catch (error) {
        console.error('Rocket bet error:', error);
        res.status(500).json({ error: 'Bet placement error' });
    }
});

// API: Забрать выигрыш в Rocket
app.post('/api/rocket/cashout', async (req, res) => {
    const { betId } = req.body;

    try {
        const bet = rocketBets.get(parseInt(betId));
        if (!bet) {
            return res.status(404).json({ error: 'Bet not found' });
        }

        if (bet.status !== 'placed') {
            return res.status(400).json({ error: 'Bet already processed' });
        }

        const user = users.findOne({ telegram_id: bet.telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!global.rocketGameState.gameActive) {
            return res.status(400).json({ error: 'Game not active' });
        }

        const currentMultiplier = global.rocketGameState.currentMultiplier;
        const winAmount = bet.betAmount * currentMultiplier;

        // Обновляем ставку
        rocketBets.update({
            ...bet,
            status: 'cashed_out',
            cashoutMultiplier: currentMultiplier,
            winAmount: winAmount,
            updatedAt: new Date()
        });

        // Обновляем в текущем раунде
        const roundBet = global.rocketGameState.bets.find(b => b.betId === parseInt(betId));
        if (roundBet) {
            roundBet.cashedOut = true;
            roundBet.cashoutMultiplier = currentMultiplier;
        }

        // Зачисляем выигрыш
        if (bet.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });

            // Обновляем банк казино
            const profit = winAmount - bet.betAmount;
            if (profit > 0) {
                updateCasinoBank(-profit);
            }
        }

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'rocket_win',
            status: 'completed',
            game_id: bet.$loki,
            created_at: new Date(),
            demo_mode: bet.demoMode,
            multiplier: currentMultiplier
        });

        res.json({
            success: true,
            winAmount: winAmount,
            multiplier: currentMultiplier,
            newBalance: bet.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });
    } catch (error) {
        console.error('Rocket cashout error:', error);
        res.status(500).json({ error: 'Cashout error' });
    }
});

// API: Получить историю ставок Rocket
app.get('/api/rocket/history/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const user = users.findOne({ telegram_id: telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userBets = rocketBets.chain()
            .find({ telegramId: telegramId })
            .simplesort('createdAt', true)
            .limit(20)
            .data();

        res.json(userBets);
    } catch (error) {
        console.error('Rocket history error:', error);
        res.status(500).json({ error: 'History error' });
    }
});

// Keep-alive для Render
app.get('/keep-alive', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Запуск keep-alive каждые 14 минут
cron.schedule('*/14 * * * *', async () => {
    try {
        await axios.get(`https://${process.env.RENDER_EXTERNAL_URL || 'localhost:' + PORT}/keep-alive`);
        console.log('Keep-alive ping sent at', new Date().toISOString());
    } catch (error) {
        console.error('Keep-alive error:', error.message);
    }
});

// Запуск сервера
async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Rocket game WebSocket server running on port ${PORT}`);
            console.log(`🏦 Casino bank initialized`);
            console.log(`👑 Owner ID: ${process.env.OWNER_TELEGRAM_ID}`);
            console.log(`💣 Mines game ready`);
            
            
            // Запускаем игру Rocket
            startNewRocketRound();
            
            console.log(`🎮 Rocket game system started`);
            console.log('🔄 Keep-alive service started (ping every 14 minutes)');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();