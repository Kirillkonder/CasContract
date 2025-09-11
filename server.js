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
            
            if (invoice.status === 'paid' && transaction.status !== 'completed') {
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

                res.json({ status: 'paid' });
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

// API: Создать вывод средств
app.post('/api/create-withdrawal', async (req, res) => {
    const { telegramId, amount, walletAddress } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.main_balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        if (amount < 1) {
            return res.status(400).json({ error: 'Минимальная сумма вывода: 1 TON' });
        }

        // Создаем вывод через Crypto Pay
        const transfer = await cryptoPayRequest('transfer', {
            user_id: telegramId,
            asset: 'TON',
            amount: amount.toString(),
            spend_id: `withdrawal_${telegramId}_${Date.now()}`
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
                amount: amount,
                type: 'withdrawal',
                status: 'completed',
                wallet_address: walletAddress,
                hash: transfer.result.hash,
                created_at: new Date(),
                demo_mode: false
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
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal error' });
    }
});

// API: Mines Game - Создать игру
app.post('/api/mines/create-game', async (req, res) => {
    const { telegramId, betAmount, minesCount } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Создаем игру
        const game = generateMinesGame(minesCount);
        game.betAmount = betAmount;
        game.userId = user.$loki;
        game.demoMode = user.demo_mode;
        game.createdAt = new Date();
        game.status = 'active';

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

        res.json({
            success: true,
            gameId: gameRecord.$loki,
            mines: game.mines,
            minesCount: game.minesCount,
            revealedCells: [],
            currentMultiplier: 1.00,
            balance: user.demo_mode ? user.demo_balance - betAmount : user.main_balance - betAmount
        });
    } catch (error) {
        console.error('Mines create game error:', error);
        res.status(500).json({ error: 'Game creation error' });
    }
});

// API: Mines Game - Открыть клетку
app.post('/api/mines/open-cell', async (req, res) => {
    const { gameId, cellIndex } = req.body;

    try {
        const game = minesGames.get(parseInt(gameId));
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.gameOver) {
            return res.status(400).json({ error: 'Game is over' });
        }

        const user = users.get(game.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Проверяем, не мина ли это
        if (game.mines.includes(cellIndex)) {
            // Игра проиграна
            minesGames.update({
                ...game,
                gameOver: true,
                win: false,
                status: 'lost',
                revealedCells: [...game.revealedCells, cellIndex]
            });

            // В реальном режиме добавляем прибыль в банк казино
            if (!game.demoMode) {
                updateCasinoBank(game.betAmount);
            }

            res.json({
                success: true,
                gameOver: true,
                win: false,
                isMine: true,
                revealedCells: [...game.revealedCells, cellIndex],
                mines: game.mines,
                currentMultiplier: calculateMultiplier(game.revealedCells.length, game.minesCount),
                balance: game.demoMode ? user.demo_balance : user.main_balance
            });
            return;
        }

        // Открываем клетку
        const newRevealedCells = [...game.revealedCells, cellIndex];
        const newMultiplier = calculateMultiplier(newRevealedCells.length, game.minesCount);

        minesGames.update({
            ...game,
            revealedCells: newRevealedCells,
            currentMultiplier: newMultiplier
        });

        res.json({
            success: true,
            gameOver: false,
            win: false,
            isMine: false,
            revealedCells: newRevealedCells,
            currentMultiplier: newMultiplier,
            balance: game.demoMode ? user.demo_balance : user.main_balance
        });
    } catch (error) {
        console.error('Mines open cell error:', error);
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
            return res.status(400).json({ error: 'Game is over' });
        }

        const user = users.get(game.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const winAmount = game.betAmount * game.currentMultiplier;
        const profit = winAmount - game.betAmount;

        // Обновляем баланс пользователя
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

            // В реальном режиме вычитаем прибыль из банка казино
            if (profit > 0) {
                updateCasinoBank(-profit);
            }
        }

        // Обновляем игру
        minesGames.update({
            ...game,
            gameOver: true,
            win: true,
            status: 'won',
            winAmount: winAmount
        });

        res.json({
            success: true,
            win: true,
            winAmount: winAmount,
            multiplier: game.currentMultiplier,
            balance: game.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });
    } catch (error) {
        console.error('Mines cashout error:', error);
        res.status(500).json({ error: 'Cashout error' });
    }
});

// API: Rocket Game - Сделать ставку
app.post('/api/rocket/bet', async (req, res) => {
    const { telegramId, betAmount, autoCashout } = req.body;

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBalance = user.demo_mode ? user.demo_balance : user.main_balance;
        
        if (currentBalance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        if (global.rocketGameState.isRoundPreparing) {
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

            // Создаем ставку
            const bet = {
                telegramId: parseInt(telegramId),
                betAmount: betAmount,
                autoCashout: autoCashout,
                status: 'active',
                createdAt: new Date(),
                demoMode: user.demo_mode
            };

            const betRecord = rocketBets.insert(bet);
            global.rocketGameState.bets.push({
                ...bet,
                id: betRecord.$loki
            });

            res.json({
                success: true,
                betId: betRecord.$loki,
                roundTimer: global.rocketGameState.roundTimer,
                balance: user.demo_mode ? user.demo_balance - betAmount : user.main_balance - betAmount
            });
        } else {
            res.status(400).json({ error: 'Ставки в этом раунде закрыты' });
        }
    } catch (error) {
        console.error('Rocket bet error:', error);
        res.status(500).json({ error: 'Bet placement error' });
    }
});

// API: Rocket Game - Забрать выигрыш
app.post('/api/rocket/cashout', async (req, res) => {
    const { betId } = req.body;

    try {
        const bet = rocketBets.get(parseInt(betId));
        if (!bet || bet.status !== 'active') {
            return res.status(404).json({ error: 'Bet not found or already processed' });
        }

        const user = users.findOne({ telegram_id: bet.telegramId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!global.rocketGameState.gameActive) {
            return res.status(400).json({ error: 'Game not active' });
        }

        const winAmount = bet.betAmount * global.rocketGameState.currentMultiplier;
        const profit = winAmount - bet.betAmount;

        // Обновляем баланс пользователя
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

            // В реальном режиме вычитаем прибыль из банка казино
            if (profit > 0) {
                updateCasinoBank(-profit);
            }
        }

        // Обновляем ставку
        rocketBets.update({
            ...bet,
            status: 'cashed_out',
            cashoutMultiplier: global.rocketGameState.currentMultiplier,
            winAmount: winAmount,
            updatedAt: new Date()
        });

        // Удаляем ставку из активных
        global.rocketGameState.bets = global.rocketGameState.bets.filter(b => b.id !== bet.$loki);

        res.json({
            success: true,
            winAmount: winAmount,
            multiplier: global.rocketGameState.currentMultiplier,
            balance: bet.demoMode ? user.demo_balance + winAmount : user.main_balance + winAmount
        });
    } catch (error) {
        console.error('Rocket cashout error:', error);
        res.status(500).json({ error: 'Cashout error' });
    }
});

// API: Rocket Game - Получить состояние игры
app.get('/api/rocket/state', async (req, res) => {
    res.json({
        isRoundPreparing: global.rocketGameState.isRoundPreparing,
        roundTimer: global.rocketGameState.roundTimer,
        currentMultiplier: global.rocketGameState.currentMultiplier,
        gameActive: global.rocketGameState.gameActive
    });
});

// API: Rocket Game - Получить историю ставок пользователя
app.get('/api/rocket/history/:telegramId', async (req, res) => {
    const telegramId = parseInt(req.params.telegramId);

    try {
        const userBets = rocketBets.chain()
            .find({ telegramId: telegramId })
            .simplesort('createdAt', true)
            .data();

        res.json(userBets);
    } catch (error) {
        console.error('Rocket history error:', error);
        res.status(500).json({ error: 'History error' });
    }
});

// Функция для генерации точки краша (как в оригинальной игре)
function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.01) return 1.00; // 1% chance of instant crash
    if (r < 0.02) return 1.01; // 1% chance of very early crash
    
    // Формула как в оригинальной игре
    const e = 0.0001;
    const crashPoint = (1 - e) / (1 - r);
    return Math.max(1.01, Math.min(crashPoint, 1000)); // Limit between 1.01x and 1000x
}

// Функция симуляции игры Rocket
function simulateRocketGame() {
    let multiplier = 1.00;
    const step = 0.01;
    const updateInterval = 100; // Update every 100ms

    const gameInterval = setInterval(() => {
        multiplier += step;
        global.rocketGameState.currentMultiplier = parseFloat(multiplier.toFixed(2));

        // Проверяем автозаборы
        global.rocketGameState.bets.forEach(bet => {
            if (bet.autoCashout && multiplier >= bet.autoCashout) {
                // Автоматический забор
                const winAmount = bet.betAmount * multiplier;
                const user = users.findOne({ telegram_id: bet.telegramId });
                
                if (user) {
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

                        const profit = winAmount - bet.betAmount;
                        if (profit > 0) {
                            updateCasinoBank(-profit);
                        }
                    }

                    rocketBets.update({
                        ...bet,
                        status: 'auto_cashed_out',
                        cashoutMultiplier: multiplier,
                        winAmount: winAmount,
                        updatedAt: new Date()
                    });
                }
            }
        });

        // Удаляем обработанные ставки
        global.rocketGameState.bets = global.rocketGameState.bets.filter(bet => {
            const betRecord = rocketBets.get(bet.id);
            return betRecord && betRecord.status === 'active';
        });

        // Проверяем краш
        if (multiplier >= global.rocketGameState.crashPoint) {
            clearInterval(gameInterval);
            
            // Все оставшиеся ставки проигрывают
            global.rocketGameState.bets.forEach(bet => {
                const betRecord = rocketBets.get(bet.id);
                if (betRecord && betRecord.status === 'active') {
                    rocketBets.update({
                        ...betRecord,
                        status: 'crashed',
                        updatedAt: new Date()
                    });

                    // В реальном режиме добавляем в банк казино
                    if (!betRecord.demoMode) {
                        updateCasinoBank(betRecord.betAmount);
                    }
                }
            });

            global.rocketGameState.bets = [];
            global.rocketGameState.gameActive = false;

            console.log('💥 Rocket crashed at:', multiplier.toFixed(2) + 'x');
            
            // Запускаем новый раунд через 5 секунд
            setTimeout(startNewRocketRound, 5000);
        }
    }, updateInterval);
}

// Запускаем первый раунд Rocket при старте сервера
startNewRocketRound();

// Крон задача для очистки старых данных (каждый час)
cron.schedule('0 * * * *', () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Очищаем старые транзакции
    transactions.find({ created_at: { $lt: oneWeekAgo } }).forEach(tx => {
        transactions.remove(tx);
    });

    // Очищаем старые логи админа
    adminLogs.find({ created_at: { $lt: oneWeekAgo } }).forEach(log => {
        adminLogs.remove(log);
    });

    console.log('Cron: Old data cleaned');
});

// Крон задача для проверки pending инвойсов (каждые 5 минут)
cron.schedule('*/5 * * * *', async () => {
    try {
        const pendingInvoices = transactions.find({ 
            status: 'pending',
            type: 'deposit'
        });

        for (const invoice of pendingInvoices) {
            const invoices = await cryptoPayRequest('getInvoices', {
                invoice_ids: invoice.invoice_id
            }, false);

            if (invoices.ok && invoices.result && invoices.result.items.length > 0) {
                const invoiceData = invoices.result.items[0];
                
                if (invoiceData.status === 'paid') {
                    // Обновляем статус транзакции
                    transactions.update({
                        ...invoice,
                        status: 'completed',
                        updated_at: new Date()
                    });

                    // Пополняем баланс пользователя
                    const user = users.get(invoice.user_id);
                    users.update({
                        ...user,
                        main_balance: user.main_balance + invoice.amount
                    });

                    console.log(`Invoice ${invoice.invoice_id} marked as paid`);
                }
            }
        }
    } catch (error) {
        console.error('Cron invoice check error:', error);
    }
});

// WebSocket для реального обновления состояния Rocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Функция broadcast для всех WebSocket клиентов
function broadcastRocketState() {
    const state = {
        type: 'rocket_update',
        data: {
            isRoundPreparing: global.rocketGameState.isRoundPreparing,
            roundTimer: global.rocketGameState.roundTimer,
            currentMultiplier: global.rocketGameState.currentMultiplier,
            gameActive: global.rocketGameState.gameActive
        }
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(state));
        }
    });
}

// Обновляем состояние через WebSocket каждую секунду
setInterval(broadcastRocketState, 1000);

// Обработка WebSocket upgrade
app.server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    app.server.close(() => {
        console.log('HTTP server closed');
        wss.close(() => {
            console.log('WebSocket server closed');
            process.exit(0);
        });
    });
});

// Инициализация сервера
async function startServer() {
    try {
        await initDatabase();
        console.log(`Server started on port ${PORT}`);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();