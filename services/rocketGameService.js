const { getRocketGames, getRocketBets, getUsers, getTransactions, getCasinoBank } = require('../config/database');
const { updateCasinoBank } = require('./casinoService');

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
    rocketGame.startTime = Date.now(); // Записываем время начала
    rocketGame.endBetTime = Date.now() + 10000; // Время окончания ставок
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
    const rocketGames = getRocketGames();
    const rocketBets = getRocketBets();
    const users = getUsers();
    const transactions = getTransactions();

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
    const { wss } = require('../server');
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

module.exports = {
    rocketGame,
    startRocketGame,
    broadcastRocketUpdate,
    processRocketGameEnd
};