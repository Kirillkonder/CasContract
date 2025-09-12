const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class RocketGame {
    constructor(server) {
        this.wss = new WebSocket.Server({ server, path: '/rocket-ws' });
        this.players = new Map();
        this.bots = new Map();
        this.currentGame = null;
        this.gameState = 'waiting';
        this.betTime = 10; // 10 seconds for betting
        this.roundInterval = null;
        
        this.setupWebSocket();
        this.startGameLoop();
        this.addBot();
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const token = new URLSearchParams(req.url.split('?')[1]).get('token');
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                ws.userId = decoded.userId;
                ws.isDemo = decoded.isDemo || false;
                
                this.players.set(ws.userId, { ws, bets: [] });
                
                ws.on('message', (message) => this.handleMessage(ws, message));
                ws.on('close', () => this.handleDisconnect(ws));
                
                this.sendGameState(ws);
            } catch (error) {
                ws.close();
            }
        });
    }

    handleMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'place_bet':
                    this.handlePlaceBet(ws, data);
                    break;
                case 'cash_out':
                    this.handleCashOut(ws, data);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    handlePlaceBet(ws, data) {
        if (this.gameState !== 'betting') return;
        
        const { amount } = data;
        const player = this.players.get(ws.userId);
        
        if (player && amount > 0) {
            player.bets.push({
                amount,
                cashedOut: false,
                cashOutMultiplier: 1
            });
            
            this.broadcastPlayerBets();
        }
    }

    handleCashOut(ws, data) {
        if (this.gameState !== 'flying') return;
        
        const player = this.players.get(ws.userId);
        if (player && player.bets.length > 0) {
            const activeBet = player.bets[player.bets.length - 1];
            if (!activeBet.cashedOut) {
                activeBet.cashedOut = true;
                activeBet.cashOutMultiplier = this.currentGame.currentMultiplier;
                
                this.broadcastPlayerBets();
            }
        }
    }

    handleDisconnect(ws) {
        this.players.delete(ws.userId);
    }

    generateMultiplier() {
        const random = Math.random();
        
        if (random < 0.7) return (Math.random() * 3 + 1.01).toFixed(2); // 1.01-4.00 (70%)
        if (random < 0.9) return (Math.random() * 15 + 5).toFixed(2);   // 5-20 (20%)
        return (Math.random() * 80 + 20).toFixed(2);                    // 20-100 (10%)
    }

    startGameLoop() {
        this.roundInterval = setInterval(() => {
            this.startNewRound();
        }, (this.betTime + 30) * 1000); // 10s betting + 30s flight time
    }

    startNewRound() {
        this.gameState = 'betting';
        this.currentGame = {
            roundId: Date.now(),
            targetMultiplier: this.generateMultiplier(),
            currentMultiplier: 1.0,
            startTime: Date.now(),
            crashed: false
        };

        // Clear previous bets for all players
        this.players.forEach(player => player.bets = []);

        this.broadcastGameState();

        // Betting phase
        setTimeout(() => {
            this.gameState = 'flying';
            this.startFlight();
        }, this.betTime * 1000);
    }

    startFlight() {
        const startTime = Date.now();
        const flightDuration = 30000; // 30 seconds flight
        const updateInterval = 100; // Update every 100ms

        const flightInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / flightDuration, 1);
            
            // Calculate current multiplier (exponential growth)
            const growthFactor = 0.1;
            this.currentGame.currentMultiplier = 1.0 + (this.currentGame.targetMultiplier - 1.0) * 
                (1 - Math.exp(-growthFactor * progress * 10));
            
            this.currentGame.currentMultiplier = parseFloat(this.currentGame.currentMultiplier.toFixed(2));
            
            // Check if crashed
            if (progress >= 1 || this.currentGame.currentMultiplier >= this.currentGame.targetMultiplier) {
                this.currentGame.crashed = true;
                clearInterval(flightInterval);
                this.gameState = 'crashed';
                
                // Auto cashout all remaining bets
                this.players.forEach(player => {
                    if (player.bets.length > 0) {
                        const bet = player.bets[player.bets.length - 1];
                        if (!bet.cashedOut) {
                            bet.cashedOut = true;
                            bet.cashOutMultiplier = this.currentGame.currentMultiplier;
                        }
                    }
                });
            }
            
            this.broadcastGameState();
            
        }, updateInterval);
    }

    broadcastGameState() {
        const gameData = {
            type: 'game_state',
            state: this.gameState,
            game: this.currentGame,
            timeRemaining: this.gameState === 'betting' ? 
                Math.max(0, this.betTime - Math.floor((Date.now() - this.currentGame.startTime) / 1000)) : 0
        };
        
        this.broadcast(JSON.stringify(gameData));
    }

    broadcastPlayerBets() {
        const betsData = {
            type: 'bets_update',
            bets: Array.from(this.players.entries()).map(([userId, player]) => ({
                userId,
                bets: player.bets
            }))
        };
        
        this.broadcast(JSON.stringify(betsData));
    }

    broadcast(message) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    sendGameState(ws) {
        if (this.currentGame) {
            const gameData = {
                type: 'game_state',
                state: this.gameState,
                game: this.currentGame,
                timeRemaining: this.gameState === 'betting' ? 
                    Math.max(0, this.betTime - Math.floor((Date.now() - this.currentGame.startTime) / 1000)) : 0
            };
            
            ws.send(JSON.stringify(gameData));
        }
    }

    addBot() {
        // Simple bot that places random bets
        setInterval(() => {
            if (this.gameState === 'betting') {
                const botBet = {
                    amount: Math.floor(Math.random() * 100) + 1,
                    cashedOut: false,
                    cashOutMultiplier: 1,
                    isBot: true
                };
                
                // Broadcast bot bet
                const botData = {
                    type: 'bot_bet',
                    bet: botBet
                };
                
                this.broadcast(JSON.stringify(botData));
            }
        }, 5000); // Bot places bet every 5 seconds during betting phase
    }
}

module.exports = RocketGame;