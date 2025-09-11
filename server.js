require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const Loki = require('lokijs');

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
let users, transactions, casinoBank, adminLogs, minesGames;

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

                // Глобальное состояние игры Rocket
global.rocketGameState = {
    isRoundPreparing: true,
    roundTimer: 10,
    bets: [],
    crashPoint: null,
    currentMultiplier: 1.00,
    gameActive: false
};

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


// server.js - правильная формула как на 1win

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

        res.json({
            success: true,
            transactions: userTransactions
        });
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Создать депозит
app.post('/api/create-deposit', async (req, res) => {
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

        const botUsername = process.env.BOT_USERNAME.replace('@', '');
        
        const invoice = await cryptoPayRequest('createInvoice', {
            asset: 'TON',
            amount: amount.toString(),
            description: `Deposit for user ${telegramId}`,
            paid_btn_name: 'viewItem',
            paid_btn_url: `https://t.me/${botUsername}`,
            payload: `deposit_${telegramId}_${Date.now()}`
        }, false);

        if (invoice.ok && invoice.result) {
            // Транзакция добавляется только при успешном создании инвойса, но со статусом pending
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
app.get('/api/invoice-status/:invoiceId', async (req, res) => {
    const invoiceId = req.params.invoiceId;

    try {
        const response = await cryptoPayRequest('getInvoices', {
            invoice_ids: invoiceId
        }, false);

        if (response.ok && response.result && response.result.items.length > 0) {
            const invoice = response.result.items[0];
            
            if (invoice.status === 'paid') {
                // Обновляем баланс пользователя только при успешной оплате
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

// API: Запрос на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, address, demoMode } = req.body;

    if (!amount || amount < 1 || !address) {
        return res.status(400).json({ error: 'Неверная сумма или адрес' });
    }

    if (!address.startsWith('UQ') || address.length < 48) {
        return res.status(400).json({ error: 'Неверный формат TON адреса' });
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

        // В реальном режиме проверяем банк казино
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

// Mines Game Routes
app.get('/mines', (req, res) => {
    res.sendFile(path.join(__dirname, 'mines.html'));
});

// server.js - изменяем логику количества мин
app.post('/api/mines/start', async (req, res) => {
    try {
        const { telegramId, betAmount, minesCount, demoMode } = req.body;
        
        // Маппинг: что показываем -> сколько реально
        const realMinesCount = {
            3: 5,  // показываем 3, реально 5 мин
            5: 7,  // показываем 5, реально 7 мин  
            7: 9   // показываем 7, реально 9 мин
        }[minesCount];

        if (betAmount < 0.1 || betAmount > 10) {
            return res.status(400).json({ error: 'Ставка должна быть от 0.1 до 10 TON' });
        }

        // Проверяем валидность выбранного количества мин
        if (![3, 5, 7].includes(minesCount)) {
            return res.status(400).json({ error: 'Количество мин должно быть 3, 5 или 7' });
        }

        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Создаем игру с РЕАЛЬНЫМ количеством мин
        const gameState = generateMinesGame(realMinesCount);
        gameState.betAmount = betAmount;
        gameState.demoMode = demoMode;
        gameState.userId = user.$loki;
        gameState.telegramId = telegramId;
        gameState.createdAt = new Date();
        gameState.displayedMines = minesCount; // сохраняем то, что показываем пользователю
        gameState.realMines = realMinesCount;   // сохраняем реальное количество

        // Сохраняем игру в базу
        const gameRecord = minesGames.insert(gameState);

        // Списываем средства
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
        }

        res.json({
            success: true,
            gameId: gameRecord.$loki,
            gameState: gameState,
            displayedMines: minesCount // возвращаем то, что показываем пользователю
        });

    } catch (error) {
        console.error('Mines start error:', error);
        res.status(500).json({ error: 'Ошибка начала игры' });
    }
});

app.post('/api/mines/reveal', async (req, res) => {
    try {
        const { gameId, cellIndex, telegramId } = req.body;

        const gameRecord = minesGames.get(gameId);
        if (!gameRecord) {
            return res.status(404).json({ error: 'Игра не найдена' });
        }

        if (gameRecord.telegramId !== parseInt(telegramId)) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        if (gameRecord.gameOver) {
            return res.status(400).json({ error: 'Игра уже завершена' });
        }

        if (gameRecord.revealedCells.includes(cellIndex)) {
            return res.status(400).json({ error: 'Ячейка уже открыта' });
        }

        // Проверяем, есть ли мина в ячейке (используем РЕАЛЬНОЕ количество мин)
        if (gameRecord.mines.includes(cellIndex)) {
            gameRecord.gameOver = true;
            gameRecord.win = false;
            gameRecord.endedAt = new Date();

            // В реальном режиме - средства уходят казино
            if (!gameRecord.demoMode) {
                updateCasinoBank(gameRecord.betAmount);
            }

            minesGames.update(gameRecord);

            return res.json({
                success: true,
                gameOver: true,
                win: false,
                mineHit: true,
                cellIndex: cellIndex,
                currentMultiplier: gameRecord.currentMultiplier
            });
        }

        // Открываем ячейку
        gameRecord.revealedCells.push(cellIndex);

        // Используем ОТОБРАЖАЕМОЕ количество мин для множителя
        gameRecord.currentMultiplier = calculateMultiplier(
            gameRecord.revealedCells.length, 
            gameRecord.displayedMines // используем то, что показываем игроку
        );

        minesGames.update(gameRecord);

        res.json({
            success: true,
            gameOver: false,
            revealedCell: cellIndex,
            currentMultiplier: gameRecord.currentMultiplier,
            potentialWin: gameRecord.betAmount * gameRecord.currentMultiplier
        });

    } catch (error) {
        console.error('Mines reveal error:', error);
        res.status(500).json({ error: 'Ошибка открытия ячейки' });
    }
});

app.post('/api/mines/cashout', async (req, res) => {
    try {
        const { gameId, telegramId } = req.body;

        const gameRecord = minesGames.get(gameId);
        if (!gameRecord) {
            return res.status(404).json({ error: 'Игра не найдена' });
        }

        if (gameRecord.telegramId !== parseInt(telegramId)) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        if (gameRecord.gameOver) {
            return res.status(400).json({ error: 'Игра уже завершена' });
        }

        if (gameRecord.revealedCells.length === 0) {
            return res.status(400).json({ error: 'Не открыто ни одной ячейки' });
        }

        gameRecord.gameOver = true;
        gameRecord.win = true;
        gameRecord.endedAt = new Date();

        const winAmount = gameRecord.betAmount * gameRecord.currentMultiplier;
        const user = users.findOne({ telegram_id: parseInt(telegramId) });

        if (gameRecord.demoMode) {
            users.update({
                ...user,
                demo_balance: user.demo_balance + winAmount
            });
        } else {
            users.update({
                ...user,
                main_balance: user.main_balance + winAmount
            });

            // Обновляем банк казино (вычитаем выигрыш)
            updateCasinoBank(-winAmount);
        }

        minesGames.update(gameRecord);

        // Записываем транзакцию
        transactions.insert({
            user_id: user.$loki,
            amount: winAmount,
            type: 'mines_win',
            status: 'completed',
            demo_mode: gameRecord.demoMode,
            game_id: gameId,
            created_at: new Date()
        });

        res.json({
            success: true,
            gameOver: true,
            win: true,
            winAmount: winAmount,
            multiplier: gameRecord.currentMultiplier,
            newBalance: gameRecord.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });

    } catch (error) {
        console.error('Mines cashout error:', error);
        res.status(500).json({ error: 'Ошибка вывода средств' });
    }
});

app.get('/api/mines/history/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        const user = users.findOne({ telegram_id: telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const userGames = minesGames.chain()
            .find({ telegramId: telegramId })
            .simplesort('createdAt', true)
            .data();

        res.json({
            success: true,
            games: userGames
        });

    } catch (error) {
        console.error('Mines history error:', error);
        res.status(500).json({ error: 'Ошибка получения истории' });
    }
});


app.post('/api/rocket/place-bet', async (req, res) => {
    try {
        const { telegramId, betAmount, demoMode } = req.body;

        // 🔥 ПРОВЕРКА: Только во время подготовки раунда!
        if (!global.rocketGameState.isRoundPreparing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Прием ставок закрыт! Дождитесь следующего раунда.' 
            });
        }

        if (betAmount < 1 || betAmount > 50) {
            return res.status(400).json({ error: 'Ставка должна быть от 1 до 50 TON' });
        }

        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Проверяем баланс в зависимости от режима
        const currentBalance = demoMode ? user.demo_balance : user.main_balance;
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Списываем средства в зависимости от режима
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
        }

        // Создаем ставку
        const bet = {
            telegramId: parseInt(telegramId),
            amount: betAmount,
            demoMode: demoMode,
            status: 'active',
            createdAt: new Date(),
            cashoutMultiplier: null,
            winAmount: null
        };

        rocketBets.insert(bet);

        // 🔥 ДОБАВЛЯЕМ СТАВКУ В ТЕКУЩИЙ РАУНД
        global.rocketGameState.bets.push({
            betId: bet.$loki,
            telegramId: parseInt(telegramId),
            amount: betAmount,
            demoMode: demoMode
        });

        res.json({ success: true, betId: bet.$loki });

    } catch (error) {
        console.error('Place bet error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rocket/cashout', async (req, res) => {
    try {
        const { telegramId, betId, multiplier, demoMode } = req.body;
        
        const bet = await Bet.findById(betId);
        if (!bet || bet.telegramId !== telegramId) {
            return res.status(404).json({ success: false, error: 'Ставка не найдена' });
        }
        
        if (bet.status !== 'active') {
            return res.status(400).json({ 
                success: false, 
                error: 'Ставка уже обработана' 
            });
        }
        
        const winAmount = bet.amount * multiplier;
        
        // Обновляем ставку
        bet.status = 'won';
        bet.winAmount = winAmount;
        bet.cashoutMultiplier = multiplier;
        await bet.save();
        
        // Начисляем выигрыш
        const user = await User.findOne({ telegramId });
        if (!user) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }
        
        if (demoMode) {
            user.demo_balance += winAmount;
        } else {
            user.balance += winAmount;
        }
        
        await user.save();
        
        // Удаляем ставку из активной игры
        if (global.gameState.bets) {
            global.gameState.bets = global.gameState.bets.filter(b => b.betId.toString() !== betId);
        }
        
        res.json({ 
            success: true, 
            winAmount,
            newBalance: demoMode ? user.demo_balance : user.balance
        });
        
    } catch (error) {
        console.error('Error cashing out:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});



app.get('/api/rocket/active-bets', async (req, res) => {
    try {
        const activeBets = rocketBets.find({ status: 'active' });
        
        const betsWithUsernames = await Promise.all(activeBets.map(async (bet) => {
            const user = users.findOne({ telegram_id: bet.telegramId });
            return {
                username: user ? (user.first_name || `User ${bet.telegramId}`) : 'Unknown',
                amount: bet.amount
            };
        }));

        res.json(betsWithUsernames);
    } catch (error) {
        console.error('Get active bets error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check для Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is awake',
        timestamp: new Date().toISOString()
    });
});

// Keep-alive система - ПРОСТОЙ ВАРИАНТ БЕЗ node-cron
setInterval(() => {
    console.log('🔁 Keep-alive ping:', new Date().toLocaleTimeString());
}, 14 * 60 * 1000); // Каждые 14 минут

// Инициализация и запуск сервера
async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🏦 Casino bank initialized`);
            console.log(`👑 Owner ID: ${process.env.OWNER_TELEGRAM_ID}`);
            console.log(`💣 Mines game ready`);
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