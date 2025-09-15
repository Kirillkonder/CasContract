let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;
let gameCountdownInterval = null;
let currentGameState = 'waiting';

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: [2.43, 1.89, 5.67, 1.23, 8.91, 2.15]
};

function showButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.classList.add('loading');
        button.disabled = true;
    }
}

function hideButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.classList.remove('loading');
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
    // Запуск демо-режима если нет Telegram
    if (!window.Telegram?.WebApp?.initDataUnsafe?.user) {
        startDemoMode();
    }
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    } else {
        // Демо пользователь
        currentUser = {
            id: 'demo_user',
            username: 'DemoUser',
            firstName: 'Demo',
            lastName: 'User'
        };
        isDemoMode = true;
        document.getElementById('balance').textContent = '100.00';
    }
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback к демо режиму
        isDemoMode = true;
        document.getElementById('balance').textContent = '100.00';
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('Connected to Rocket game server');
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            if (data.type === 'rocket_update') {
                updateGameState(data.game);
            }
        };
        
        ws.onclose = function() {
            console.log('Disconnected from Rocket game server');
            setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('WebSocket connection failed:', error);
    }
}

function startDemoMode() {
    console.log('Starting demo mode');
    
    // Создаем демо-игроков
    const demoPlayers = [
        { name: 'Даня', betAmount: Math.random() * 10 + 1, userId: 'bot1', isBot: true, cashedOut: false },
        { name: 'Кирилл', betAmount: Math.random() * 10 + 1, userId: 'bot2', isBot: true, cashedOut: false },
        { name: 'Наиль', betAmount: Math.random() * 10 + 1, userId: 'bot3', isBot: true, cashedOut: false },
        { name: 'Миша', betAmount: Math.random() * 10 + 1, userId: 'bot4', isBot: true, cashedOut: false },
        { name: 'Ваня', betAmount: Math.random() * 10 + 1, userId: 'bot5', isBot: true, cashedOut: false }
    ];
    
    rocketGame.players = demoPlayers;
    updatePlayersList(rocketGame.players);
    updateHistory(rocketGame.history);
    
    // Запуск демо-игры
    startDemoGame();
}

function startDemoGame() {
    resetBettingUI();
    rocketGame.status = 'counting';
    currentGameState = 'counting';
    
    // 5-секундный таймер
    let countdown = 5;
    updateCountdownDisplay(countdown);
    
    gameCountdownInterval = setInterval(() => {
        countdown--;
        updateCountdownDisplay(countdown);
        
        if (countdown <= 0) {
            clearInterval(gameCountdownInterval);
            startRocketFlight();
        }
    }, 1000);
}

function updateCountdownDisplay(seconds) {
    const countdownElement = document.getElementById('countdown-timer');
    if (countdownElement) {
        countdownElement.textContent = `Время на ставку: ${seconds}`;
        countdownElement.classList.add('active');
    }
}

function startRocketFlight() {
    rocketGame.status = 'flying';
    currentGameState = 'flying';
    
    const countdownElement = document.getElementById('countdown-timer');
    if (countdownElement) {
        countdownElement.classList.remove('active');
        countdownElement.classList.add('current-multiplier');
    }
    
    updateBettingUI();
    
    // Симуляция полета ракеты
    let multiplier = 1.00;
    const increment = 0.01;
    const maxMultiplier = Math.random() * 10 + 1.5; // Случайный множитель краха
    
    const flightInterval = setInterval(() => {
        multiplier += increment * (1 + multiplier * 0.02);
        rocketGame.multiplier = multiplier;
        
        // Обновляем отображение множителя
        if (countdownElement) {
            countdownElement.textContent = `${multiplier.toFixed(2)}x`;
        }
        
        updateRocketPosition(multiplier);
        
        // Потенциальный выигрыш для пользователя
        if (userBet > 0 && !userCashedOut) {
            const potentialWin = userBet * multiplier;
            // Можно добавить отображение потенциального выигрыша
        }
        
        // Боты случайно выходят
        rocketGame.players.forEach(player => {
            if (player.isBot && !player.cashedOut && Math.random() < 0.02) {
                player.cashedOut = true;
                player.cashoutMultiplier = multiplier;
                player.winAmount = player.betAmount * multiplier;
            }
        });
        
        updatePlayersList(rocketGame.players);
        
        // Проверка краха
        if (multiplier >= maxMultiplier) {
            clearInterval(flightInterval);
            crashRocket(multiplier);
        }
    }, 100);
}

function crashRocket(finalMultiplier) {
    rocketGame.status = 'crashed';
    currentGameState = 'crashed';
    
    // Добавляем в историю
    rocketGame.history.unshift(finalMultiplier);
    if (rocketGame.history.length > 6) {
        rocketGame.history.pop();
    }
    
    showExplosion();
    updateHistory(rocketGame.history);
    
    // Сбрасываем множитель
    const countdownElement = document.getElementById('countdown-timer');
    if (countdownElement) {
        countdownElement.classList.remove('current-multiplier');
        countdownElement.textContent = 'Улетел!';
    }
    
    // Обновляем балансы для тех, кто не вышел
    if (userBet > 0 && !userCashedOut) {
        // Пользователь проиграл
        console.log('User lost bet:', userBet);
    }
    
    updatePlayersList(rocketGame.players);
    updateBettingUI();
    
    // Запускаем новую игру через 3 секунды
    setTimeout(() => {
        resetForNewGame();
        startDemoGame();
    }, 3000);
}

function resetForNewGame() {
    userBet = 0;
    userCashedOut = false;
    rocketGame.multiplier = 1.00;
    rocketGame.players = [];
    
    // Создаем новых демо-игроков
    const demoPlayers = [
        { name: 'Даня', betAmount: Math.random() * 10 + 1, userId: 'bot1', isBot: true, cashedOut: false },
        { name: 'Кирилл', betAmount: Math.random() * 10 + 1, userId: 'bot2', isBot: true, cashedOut: false },
        { name: 'Наиль', betAmount: Math.random() * 10 + 1, userId: 'bot3', isBot: true, cashedOut: false },
        { name: 'Миша', betAmount: Math.random() * 10 + 1, userId: 'bot4', isBot: true, cashedOut: false },
        { name: 'Ваня', betAmount: Math.random() * 10 + 1, userId: 'bot5', isBot: true, cashedOut: false }
    ];
    
    rocketGame.players = demoPlayers;
    
    const countdownElement = document.getElementById('countdown-timer');
    if (countdownElement) {
        countdownElement.classList.remove('current-multiplier');
        countdownElement.textContent = 'Ожидание';
        countdownElement.classList.add('active');
    }
    
    // Сброс ракеты
    const rocket = document.getElementById('rocket');
    if (rocket) {
        rocket.classList.remove('pulsating', 'blast-off');
        rocket.style.bottom = '';
        rocket.style.opacity = '';
        rocket.style.filter = '';
    }
}

function updateGameState(gameState) {
    rocketGame = gameState;
    
    clearCountdown();
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            break;
            
        case 'counting':
            startCountdown(gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000)));
            updateBettingUI();
            break;
            
        case 'flying':
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            break;
            
        case 'crashed':
            clearCountdown();
            showExplosion();
            break;
    }
    
    userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
        
        if (userCashedOut) {
            // Обновляем баланс при выигрыше
            const currentBalance = parseFloat(document.getElementById('balance').textContent);
            document.getElementById('balance').textContent = (currentBalance + userPlayer.winAmount).toFixed(2);
        }
    }
    
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    
    updateBettingUI();
}

function startCountdown(timeLeft) {
    clearCountdown();
    
    const countdownElement = document.getElementById('countdown-timer');
    
    countdownInterval = setInterval(() => {
        if (countdownElement) {
            countdownElement.textContent = `Время на ставку: ${timeLeft}`;
        }
        
        timeLeft--;
        
        if (timeLeft < 0) {
            clearCountdown();
            if (countdownElement) {
                countdownElement.textContent = 'Время вышло';
            }
            document.getElementById('bet-button').disabled = true;
        }
    }, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (gameCountdownInterval) {
        clearInterval(gameCountdownInterval);
        gameCountdownInterval = null;
    }
}

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    
    if (multiplier > 1.00) {
        rocketElement.classList.add('pulsating');
        
        if (multiplier >= 3) {
            const speedIntensity = Math.min(0.7, (multiplier - 3) / 10);
            const pulseSpeed = Math.max(0.3, 1.2 - speedIntensity);
            document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
        } else {
            document.documentElement.style.setProperty('--pulse-speed', '1.2s');
        }
    } else {
        rocketElement.classList.remove('pulsating');
        document.documentElement.style.setProperty('--pulse-speed', '1.2s');
    }
}

function showExplosion() {
    const rocket = document.getElementById('rocket');
    const gameField = document.querySelector('.game-field');
    
    rocket.classList.remove('pulsating');
    rocket.classList.add('blast-off');
    
    const blastOffText = document.createElement('div');
    blastOffText.className = 'blast-off-text';
    blastOffText.textContent = 'УЛЕТЕЛ!';
    gameField.appendChild(blastOffText);
    
    setTimeout(() => {
        if (blastOffText.parentNode) {
            gameField.removeChild(blastOffText);
        }
        rocket.classList.remove('blast-off');
        rocket.style.bottom = '';
        rocket.style.opacity = '';
        rocket.style.filter = '';
    }, 2000);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('players-list');
    
    playersList.innerHTML = '';
    
    const playerIcons = ['🔥', '🌱', '💜', '🎮', '🎯', '⚡', '🚀', '💎', '🌟', '🎲'];
    
    players.forEach((player, index) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        
        const playerDetails = document.createElement('div');
        playerDetails.className = 'player-details';
        
        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = player.name;
        
        const playerBet = document.createElement('div');
        playerBet.className = 'player-bet';
        
        const betIcon = document.createElement('i');
        betIcon.className = 'bi bi-currency-bitcoin';
        
        const betAmount = document.createElement('span');
        betAmount.textContent = player.betAmount.toFixed(2);
        
        playerBet.appendChild(betIcon);
        playerBet.appendChild(betAmount);
        
        if (player.cashedOut) {
            const winAmount = document.createElement('span');
            winAmount.className = 'win-amount';
            winAmount.textContent = `+${player.winAmount.toFixed(2)}`;
            playerBet.appendChild(winAmount);
        }
        
        playerDetails.appendChild(playerName);
        playerDetails.appendChild(playerBet);
        
        playerInfo.appendChild(avatar);
        playerInfo.appendChild(playerDetails);
        
        const playerStats = document.createElement('div');
        playerStats.className = 'player-stats';
        
        const statsIcon = document.createElement('i');
        statsIcon.className = 'bi bi-diamond-fill';
        
        const statsValue = document.createElement('span');
        if (player.cashedOut) {
            statsValue.textContent = player.cashoutMultiplier.toFixed(2);
        } else {
            statsValue.textContent = rocketGame.multiplier.toFixed(2);
        }
        
        const playerIcon = document.createElement('div');
        playerIcon.className = 'player-icon';
        playerIcon.textContent = playerIcons[index % playerIcons.length];
        
        playerStats.appendChild(statsIcon);
        playerStats.appendChild(statsValue);
        playerStats.appendChild(playerIcon);
        
        playerItem.appendChild(playerInfo);
        playerItem.appendChild(playerStats);
        
        playersList.appendChild(playerItem);
    });
}

function updateHistory(history) {
    // Обновляем историю в коэффициентах (кроме первого элемента)
    history.slice(0, 6).forEach((multiplier, index) => {
        const historyElement = document.getElementById(`history-${index + 1}`);
        if (historyElement) {
            historyElement.textContent = multiplier.toFixed(2);
            historyElement.classList.remove('history-win', 'history-loss');
            if (multiplier >= 2) {
                historyElement.classList.add('history-win');
            } else {
                historyElement.classList.add('history-loss');
            }
        }
    });
}

function handleBetAction() {
    if (currentGameState === 'counting' && userBet === 0) {
        placeBet();
    } else if (currentGameState === 'flying' && userBet > 0 && !userCashedOut) {
        cashout();
    }
}

async function placeBet() {
    const betAmount = 5.0; // Фиксированная ставка 5 TON
    
    if (userBet > 0) {
        return;
    }
    
    if (currentGameState !== 'counting') {
        return;
    }
    
    showButtonLoading('bet-button');
    
    try {
        // В демо режиме симулируем ставку
        if (isDemoMode || !ws) {
            const currentBalance = parseFloat(document.getElementById('balance').textContent);
            if (currentBalance >= betAmount) {
                userBet = betAmount;
                document.getElementById('balance').textContent = (currentBalance - betAmount).toFixed(2);
                
                // Добавляем пользователя в список игроков
                const userPlayer = {
                    name: currentUser.firstName || 'Вы',
                    betAmount: betAmount,
                    userId: currentUser.id,
                    isBot: false,
                    cashedOut: false
                };
                
                rocketGame.players.push(userPlayer);
                updatePlayersList(rocketGame.players);
                updateBettingUI();
            }
        } else {
            // Реальная ставка через API
            const response = await fetch('/api/rocket/bet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId: currentUser.id,
                    betAmount: betAmount,
                    demoMode: isDemoMode
                })
            });
            
            if (!response.ok) {
                hideButtonLoading('bet-button');
                return;
            }
            
            const result = await response.json();
            if (result.success) {
                userBet = betAmount;
                document.getElementById('balance').textContent = result.new_balance.toFixed(2);
                updateBettingUI();
            }
        }
    } catch (error) {
        console.error('Error placing bet:', error);
    } finally {
        hideButtonLoading('bet-button');
    }
}

async function cashout() {
    if (userCashedOut) {
        return;
    }
    
    if (userBet === 0) {
        return;
    }
    
    if (currentGameState !== 'flying') {
        return;
    }
    
    showButtonLoading('bet-button');
    
    try {
        // В демо режиме симулируем выплату
        if (isDemoMode || !ws) {
            const winAmount = userBet * rocketGame.multiplier;
            const currentBalance = parseFloat(document.getElementById('balance').textContent);
            
            userCashedOut = true;
            document.getElementById('balance').textContent = (currentBalance + winAmount).toFixed(2);
            
            // Обновляем игрока в списке
            const userPlayerIndex = rocketGame.players.findIndex(p => p.userId === currentUser.id);
            if (userPlayerIndex !== -1) {
                rocketGame.players[userPlayerIndex].cashedOut = true;
                rocketGame.players[userPlayerIndex].cashoutMultiplier = rocketGame.multiplier;
                rocketGame.players[userPlayerIndex].winAmount = winAmount;
            }
            
            updatePlayersList(rocketGame.players);
            updateBettingUI();
        } else {
            // Реальная выплата через API
            const response = await fetch('/api/rocket/cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telegramId: currentUser.id,
                    demoMode: isDemoMode
                })
            });
            
            if (!response.ok) {
                hideButtonLoading('bet-button');
                return;
            }
            
            const result = await response.json();
            if (result.success) {
                userCashedOut = true;
                document.getElementById('balance').textContent = result.new_balance.toFixed(2);
                updateBettingUI();
            }
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    } finally {
        hideButtonLoading('bet-button');
    }
}

function resetBettingUI() {
    const betButton = document.getElementById('bet-button');
    betButton.disabled = false;
    betButton.textContent = 'Сделать ставку';
    betButton.classList.remove('cashout');
    
    userBet = 0;
    userCashedOut = false;
}

function updateBettingUI() {
    const betButton = document.getElementById('bet-button');
    
    if (currentGameState === 'waiting') {
        betButton.disabled = false;
        betButton.textContent = 'Сделать ставку';
        betButton.classList.remove('cashout');
    } else if (currentGameState === 'counting') {
        if (userBet > 0) {
            betButton.disabled = true;
            betButton.textContent = 'Ставка сделана';
            betButton.classList.remove('cashout');
        } else {
            betButton.disabled = false;
            betButton.textContent = 'Сделать ставку';
            betButton.classList.remove('cashout');
        }
    } else if (currentGameState === 'flying') {
        if (userBet > 0 && !userCashedOut) {
            betButton.disabled = false;
            betButton.textContent = 'Забрать выигрыш';
            betButton.classList.add('cashout');
        } else {
            betButton.disabled = true;
            betButton.textContent = userCashedOut ? 'Выплачено' : 'Игра идет';
            if (userCashedOut) {
                betButton.classList.add('cashout');
            }
        }
    } else if (currentGameState === 'crashed') {
        betButton.disabled = true;
        betButton.textContent = 'Раунд завершен';
        betButton.classList.remove('cashout');
    }
}