require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const WebSocket = require('ws');

const {
  initDatabase,
  getCollections,
  cryptoPayRequest,
  getRocketGame,
  setRocketGame,
  getRocketBots,
  generateCrashPoint,
  setWebSocketServer,
  broadcastRocketUpdate
} = require('./utils/db');

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

// Добавить этот маршрут после других роутов
app.post('/api/user/toggle-mode', async (req, res) => {
    const { telegramId } = req.body;
    const { users } = getCollections();

    try {
        const user = users.findOne({ telegram_id: parseInt(telegramId) });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        users.update({
            ...user,
            demo_mode: !user.demo_mode
        });

        res.json({ 
            success: true, 
            demo_mode: !user.demo_mode 
        });
    } catch (error) {
        console.error('Toggle mode error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// WebSocket сервер для ракетки
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Устанавливаем WebSocket сервер в utils
setWebSocketServer(wss);

// Rocket Game Functions
function startRocketGame() {
    const rocketGame = getRocketGame();
    if (rocketGame.status !== 'waiting') return;

    rocketGame.status = 'counting';
    rocketGame.multiplier = 1.00;
    rocketGame.crashPoint = generateCrashPoint();
    rocketGame.startTime = Date.now();
    rocketGame.endBetTime = Date.now() + 10000;
    rocketGame.players = [];

    // Добавляем ставки ботов
    const rocketBots = getRocketBots();
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

    setRocketGame(rocketGame);
    broadcastRocketUpdate();

    setTimeout(() => {
        rocketGame.status = 'flying';
        setRocketGame(rocketGame);
        broadcastRocketUpdate();
        startRocketFlight();
    }, 10000);
}

function startRocketFlight() {
    const startTime = Date.now();
    const flightInterval = setInterval(() => {
        const rocketGame = getRocketGame();
        if (rocketGame.status !== 'flying') {
            clearInterval(flightInterval);
            return;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        rocketGame.multiplier = 1.00 + (elapsed * 0.1);

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
            setRocketGame(rocketGame);
            clearInterval(flightInterval);
            processRocketGameEnd();
        }

        setRocketGame(rocketGame);
        broadcastRocketUpdate();
    }, 100);
}

function processRocketGameEnd() {
    const { rocketGames, rocketBets, users, transactions, updateCasinoBank } = getCollections();
    const rocketGame = getRocketGame();
    
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

    setRocketGame(rocketGame);
    broadcastRocketUpdate();

    // Через 5 секунд начинаем новую игру
    setTimeout(() => {
        rocketGame.status = 'waiting';
        rocketGame.multiplier = 1.00;
        rocketGame.players = [];
        setRocketGame(rocketGame);
        broadcastRocketUpdate();
        startRocketGame();
    }, 5000);
}

// WebSocket обработчик
wss.on('connection', function connection(ws) {
    console.log('Rocket game client connected');
    
    // Отправляем текущее состояние игры при подключении
    ws.send(JSON.stringify({
        type: 'rocket_update',
        game: getRocketGame()
    }));

    ws.on('close', () => {
        console.log('Rocket game client disconnected');
    });
});

// Крон задача для проверки инвойсов
cron.schedule('* * * * *', async () => {
    try {
        const { transactions, users, updateCasinoBank } = getCollections();

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