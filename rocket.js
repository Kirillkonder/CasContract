// rocket.js - дополнительная логика для игры Ракетка
class RocketGame {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.currentMultiplier = 1.00;
        this.gameStatus = 'waiting';
        this.userBet = 0;
        this.userCashedOut = false;
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/rocket-ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            console.log('Connected to Rocket game server');
        };
        
        this.ws.onmessage = (event) => {
            this.handleMessage(event);
        };
        
        this.ws.onclose = () => {
            this.isConnected = false;
            console.log('Disconnected from Rocket game server');
            this.reconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    reconnect() {
        setTimeout(() => {
            if (!this.isConnected) {
                console.log('Attempting to reconnect...');
                this.connectWebSocket();
            }
        }, 5000);
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'rocket_update') {
                this.updateGameState(data.game);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    updateGameState(gameState) {
        this.gameStatus = gameState.status;
        this.currentMultiplier = gameState.multiplier;

        // Обновляем UI
        this.updateUI(gameState);
        
        // Обновляем кнопки
        this.updateButtons();
    }

    updateUI(gameState) {
        // Обновляем множитель
        const multiplierElement = document.getElementById('multiplierDisplay');
        if (multiplierElement) {
            multiplierElement.textContent = gameState.multiplier.toFixed(2) + 'x';
        }

        // Обновляем статус игры
        this.updateGameStatus(gameState.status);

        // Обновляем позицию ракеты
        this.updateRocketPosition(gameState.multiplier);

        // Обновляем список игроков
        this.updatePlayersList(gameState.players);

        // Обновляем историю
        this.updateHistory(gameState.history);

        // Обновляем потенциальный выигрыш
        if (this.userBet > 0 && !this.userCashedOut && gameState.status === 'flying') {
            const potentialWin = this.userBet * gameState.multiplier;
            const potentialWinElement = document.getElementById('potentialWin');
            if (potentialWinElement) {
                potentialWinElement.textContent = potentialWin.toFixed(2);
            }
        }
    }

    updateGameStatus(status) {
        const statusElement = document.getElementById('statusText');
        const countdownElement = document.getElementById('countdown');
        const statusClass = `status-${status}`;
        
        if (statusElement && countdownElement) {
            const gameStatusElement = document.getElementById('gameStatus');
            if (gameStatusElement) {
                gameStatusElement.className = `game-status ${statusClass}`;
            }

            switch(status) {
                case 'waiting':
                    statusElement.textContent = 'Ожидание начала игры...';
                    countdownElement.textContent = '';
                    this.resetBettingUI();
                    break;
                    
                case 'counting':
                    const timeLeft = Math.ceil((10000 - (Date.now() - rocketGame.startTime)) / 1000);
                    statusElement.textContent = 'Прием ставок: ';
                    countdownElement.textContent = `${timeLeft}с`;
                    break;
                    
                case 'flying':
                    statusElement.textContent = 'Ракета взлетает!';
                    countdownElement.textContent = '';
                    break;
                    
                case 'crashed':
                    statusElement.textContent = `Ракета взорвалась на ${rocketGame.crashPoint.toFixed(2)}x!`;
                    countdownElement.textContent = '';
                    this.showExplosion();
                    break;
            }
        }
    }

    updateRocketPosition(multiplier) {
        const rocketElement = document.getElementById('rocket');
        const trailElement = document.getElementById('rocketTrail');
        
        if (rocketElement && trailElement) {
            const newPosition = 50 + (multiplier * 2);
            rocketElement.style.bottom = `${newPosition}px`;
            trailElement.style.height = `${newPosition - 90}px`;
        }
    }

    showExplosion() {
        const canvas = document.getElementById('rocketCanvas');
        if (canvas) {
            const explosion = document.createElement('div');
            explosion.className = 'explosion';
            canvas.appendChild(explosion);
            
            setTimeout(() => {
                if (canvas.contains(explosion)) {
                    canvas.removeChild(explosion);
                }
            }, 1000);
        }
    }

    updatePlayersList(players) {
        const playersList = document.getElementById('playersList');
        const playersCount = document.getElementById('playersCount');
        
        if (playersList && playersCount) {
            playersList.innerHTML = '';
            playersCount.textContent = players.length;
            
            players.forEach(player => {
                const playerItem = document.createElement('div');
                playerItem.className = 'player-item';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'player-name';
                nameSpan.textContent = player.name;
                
                const betSpan = document.createElement('span');
                betSpan.className = 'player-bet';
                
                if (player.cashedOut) {
                    betSpan.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
                    betSpan.style.color = '#00b894';
                } else if (player.isBot) {
                    betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
                } else {
                    betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
                }
                
                playerItem.appendChild(nameSpan);
                playerItem.appendChild(betSpan);
                playersList.appendChild(playerItem);
            });
        }
    }

    updateHistory(history) {
        const historyContainer = document.getElementById('historyItems');
        if (historyContainer) {
            historyContainer.innerHTML = '';
            
            history.slice(0, 10).forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
                historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
                historyContainer.appendChild(historyItem);
            });
        }
    }

    updateButtons() {
        const betButton = document.getElementById('placeBetButton');
        const cashoutButton = document.getElementById('cashoutButton');
        
        if (betButton && cashoutButton) {
            if (this.gameStatus === 'counting') {
                betButton.disabled = this.userBet > 0;
                cashoutButton.disabled = true;
            } else if (this.gameStatus === 'flying') {
                betButton.disabled = true;
                cashoutButton.disabled = this.userCashedOut || this.userBet === 0;
            } else {
                betButton.disabled = false;
                cashoutButton.disabled = true;
            }
        }
    }

    resetBettingUI() {
        this.userBet = 0;
        this.userCashedOut = false;
        
        const userBetElement = document.getElementById('userBet');
        const potentialWinElement = document.getElementById('potentialWin');
        
        if (userBetElement) userBetElement.textContent = '0';
        if (potentialWinElement) potentialWinElement.textContent = '0';
        
        this.updateButtons();
    }

    setupEventListeners() {
        // Обработчики для кнопок уже в HTML
    }

    async placeBet() {
        const betAmount = parseFloat(document.getElementById('betAmount').value);
        
        if (betAmount < 0.5 || betAmount > 50) {
            alert('Ставка должна быть от 0.5 до 50 TON');
            return;
        }
        
        try {
            const tg = window.Telegram.WebApp;
            const response = await fetch('/api/rocket/bet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId: tg.initDataUnsafe.user.id,
                    betAmount: betAmount,
                    demoMode: window.rocketDemoMode || false
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Ошибка при размещении ставки');
                return;
            }
            
            const result = await response.json();
            if (result.success) {
                this.userBet = betAmount;
                this.userCashedOut = false;
                
                const userBetElement = document.getElementById('userBet');
                const balanceElement = document.getElementById('balance');
                
                if (userBetElement) userBetElement.textContent = betAmount.toFixed(2);
                if (balanceElement) balanceElement.textContent = result.current_balance.toFixed(2);
                
                this.updateButtons();
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            alert('Ошибка при размещении ставки');
        }
    }

    async cashout() {
        try {
            const tg = window.Telegram.WebApp;
            const response = await fetch('/api/rocket/cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId: tg.initDataUnsafe.user.id
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Ошибка при выводе средств');
                return;
            }
            
            const result = await response.json();
            if (result.success) {
                this.userCashedOut = true;
                
                const balanceElement = document.getElementById('balance');
                if (balanceElement) {
                    balanceElement.textContent = result.current_balance.toFixed(2);
                }
                
                this.updateButtons();
                alert(`Вы успешно вывели ${result.win_amount.toFixed(2)} TON на ${result.multiplier.toFixed(2)}x!`);
            }
        } catch (error) {
            console.error('Error cashing out:', error);
            alert('Ошибка при выводе средств');
        }
    }
}

// Глобальная переменная для доступа к игре
let rocketGameInstance = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    rocketGameInstance = new RocketGame();
    
    // Глобальные функции для кнопок
    window.placeBet = function() {
        if (rocketGameInstance) {
            rocketGameInstance.placeBet();
        }
    };
    
    window.cashout = function() {
        if (rocketGameInstance) {
            rocketGameInstance.cashout();
        }
    };
    
    window.goBack = function() {
        window.location.href = 'index.html';
    };
});