const WebSocket = require('ws');
const Loki = require('lokijs');

class RocketGameServer {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map();
        this.bots = new Map();
        this.currentGame = null;
        this.gameHistory = [];
        this.betTime = 10000; // 10 секунд на ставки
        
        this.initDatabase();
        this.setupWebSocket();
        this.startGameLoop();
        this.addBots();
    }

    initDatabase() {
        this.db = new Loki('rocket-games.db', {
            autoload: true,
            autoloadCallback: () => {
                this.games = this.db.getCollection('rocket_games') || 
                    this.db.addCollection('rocket_games', {
                        indices: ['created_at', 'crashed_at']
                    });
                
                this.bets = this.db.getCollection('rocket_bets') || 
                    this.db.addCollection('rocket_bets', {
                        indices: ['game_id', 'user_id', 'created_at']
                    });
            },
            autosave: true,
            autosaveInterval: 4000
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const telegramId = req.url.split('=')[1];
            if (telegramId) {
                this.clients.set(telegramId, ws);
                console.log(`Client connected: ${telegramId}`);
            }

            ws.on('close', () => {
                for (let [id, client] of this.clients.entries()) {
                    if (client === ws) {
                        this.clients.delete(id);
                        console.log(`Client disconnected: ${id}`);
                    }
                }
            });

            // Отправляем текущее состояние игры новому клиенту
            if (this.currentGame) {
                ws.send(JSON.stringify({
                    type: 'game_state',
                    game: this.currentGame,
                    timeLeft: this.getTimeLeft()
                }));
            }

            // Отправляем историю игр
            ws.send(JSON.stringify({
                type: 'game_history',
                history: this.gameHistory.slice(-10)
            }));
        });
    }

    startGameLoop() {
        setInterval(() => {
            if (!this.currentGame || this.currentGame.crashed) {
                this.startNewGame();
            } else {
                this.updateGame();
            }
        }, 100);
    }

    startNewGame() {
        this.currentGame = {
            id: Date.now(),
            multiplier: 1.00,
            crashed: false,
            crashedAt: null,
            startTime: Date.now(),
            betTimeEnd: Date.now() + this.betTime,
            players: [],
            totalBets: 0
        };

        // Рассылаем новую игру всем клиентам
        this.broadcast({
            type: 'new_game',
            game: this.currentGame,
            timeLeft: this.betTime
        });

        // Сохраняем в историю
        this.gameHistory.unshift({
            id: this.currentGame.id,
            crashedAt: null,
            startTime: this.currentGame.startTime
        });

        if (this.gameHistory.length > 100) {
            this.gameHistory.pop();
        }

        console.log('New rocket game started');
    }

    updateGame() {
        const now = Date.now();
        
        // Фаза ставок
        if (now < this.currentGame.betTimeEnd) {
            return;
        }

        // Фаза полета ракетки
        if (!this.currentGame.crashed) {
            const elapsed = (now - this.currentGame.betTimeEnd) / 1000;
            
            // Алгоритм краша (как в 1win)
            let crashPoint;
            const random = Math.random();
            
            if (random < 0.7) {
                // 70% шанс краша между 1-4x
                crashPoint = 1 + Math.random() * 3;
            } else if (random < 0.9) {
                // 20% шанс краша между 5-20x
                crashPoint = 5 + Math.random() * 15;
            } else {
                // 10% шанс краша между 21-100x
                crashPoint = 21 + Math.random() * 79;
            }

            // Текущий множитель (экспоненциальный рост)
            const currentMultiplier = Math.min(100, Math.exp(elapsed * 0.1));
            
            if (currentMultiplier >= crashPoint) {
                this.currentGame.crashed = true;
                this.currentGame.crashedAt = crashPoint;
                this.currentGame.multiplier = crashPoint;
                
                // Обновляем историю
                const gameInHistory = this.gameHistory.find(g => g.id === this.currentGame.id);
                if (gameInHistory) {
                    gameInHistory.crashedAt = crashPoint;
                }

                // Рассылаем результат
                this.broadcast({
                    type: 'game_crashed',
                    multiplier: crashPoint
                });

                // Обрабатываем выигрыши
                this.processWinnings();
                
                console.log(`Rocket crashed at: ${crashPoint}x`);
            } else {
                this.currentGame.multiplier = currentMultiplier;
                
                // Рассылаем обновление множителя
                this.broadcast({
                    type: 'multiplier_update',
                    multiplier: currentMultiplier
                });
            }
        }
    }

    processWinnings() {
        const winningBets = this.bets.find({
            game_id: this.currentGame.id,
            cashout_multiplier: { $lte: this.currentGame.crashedAt }
        });

        winningBets.forEach(bet => {
            const winAmount = bet.amount * bet.cashout_multiplier;
            
            // Здесь должна быть логика зачисления выигрыша пользователю
            console.log(`User ${bet.user_id} wins ${winAmount} TON`);
            
            // Отправляем уведомление пользователю
            const client = this.clients.get(bet.user_id.toString());
            if (client) {
                client.send(JSON.stringify({
                    type: 'win',
                    amount: winAmount,
                    multiplier: bet.cashout_multiplier
                }));
            }
        });
    }

    placeBet(userId, amount, autoCashout) {
        if (!this.currentGame || this.currentGame.crashed) {
            return { success: false, error: 'No active game' };
        }

        if (Date.now() > this.currentGame.betTimeEnd) {
            return { success: false, error: 'Betting phase ended' };
        }

        const bet = {
            game_id: this.currentGame.id,
            user_id: userId,
            amount: amount,
            auto_cashout: autoCashout,
            cashout_multiplier: autoCashout || 100,
            created_at: Date.now(),
            status: 'active'
        };

        this.bets.insert(bet);
        this.currentGame.totalBets += amount;

        this.broadcast({
            type: 'new_bet',
            userId: userId,
            amount: amount,
            autoCashout: autoCashout
        });

        return { success: true };
    }

    cashOut(userId) {
        const activeBet = this.bets.findOne({
            game_id: this.currentGame.id,
            user_id: userId,
            status: 'active'
        });

        if (!activeBet) {
            return { success: false, error: 'No active bet' };
        }

        const winAmount = activeBet.amount * this.currentGame.multiplier;
        
        this.bets.update({
            ...activeBet,
            status: 'cashed_out',
            win_amount: winAmount,
            cashout_multiplier: this.currentGame.multiplier
        });

        this.broadcast({
            type: 'cash_out',
            userId: userId,
            amount: winAmount,
            multiplier: this.currentGame.multiplier
        });

        return { success: true, winAmount: winAmount };
    }

    addBots() {
        // Добавляем 3 ботов
        const botNames = ['Bot_Alpha', 'Bot_Beta', 'Bot_Gamma'];
        
        botNames.forEach((name, index) => {
            const botId = `bot_${index + 1}`;
            this.bots.set(botId, {
                id: botId,
                name: name,
                balance: 1000,
                lastBetTime: 0
            });

            setInterval(() => this.makeBotBet(botId), 3000 + Math.random() * 7000);
        });
    }

    makeBotBet(botId) {
        if (!this.currentGame || this.currentGame.crashed || 
            Date.now() > this.currentGame.betTimeEnd) {
            return;
        }

        const bot = this.bots.get(botId);
        const now = Date.now();

        if (now - bot.lastBetTime < 5000) {
            return;
        }

        const amount = 1 + Math.random() * 10;
        const autoCashout = 1.5 + Math.random() * 10;

        this.placeBet(botId, amount, autoCashout);
        bot.lastBetTime = now;

        console.log(`Bot ${bot.name} bet ${amount.toFixed(2)} TON at ${autoCashout.toFixed(2)}x`);
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    getTimeLeft() {
        return Math.max(0, this.currentGame.betTimeEnd - Date.now());
    }
}

module.exports = RocketGameServer;