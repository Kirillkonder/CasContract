let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let countdownInterval = null;

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: [],
    endBetTime: 0
};

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    // Заглушка для пользователя (в реальном приложении будет данные из Telegram)
    currentUser = {
        id: 123456789,
        username: 'DemoUser',
        firstName: 'Demo',
        lastName: 'User'
    };
    
    // Загрузка данных пользователя
    loadUserData();
    
    // Инициализация UI
    updateBettingUI();
}

async function loadUserData() {
    try {
        // В демо-режиме просто устанавливаем баланс
        document.getElementById('balance').textContent = '100.00';
        isDemoMode = true;
        
        // В реальном приложении здесь будет запрос к API
        /*
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
        }
        */
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function connectWebSocket() {
    // В демо-режиме эмулируем WebSocket соединение
    console.log('Connected to Rocket game server (demo mode)');
    
    // Запускаем демо-игру
    setTimeout(() => {
        simulateGameUpdate({
            type: 'rocket_update',
            game: {
                status: 'counting',
                multiplier: 1.00,
                players: [
                    {userId: 1, name: 'Даня', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                    {userId: 2, name: 'Кирилл', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                    {userId: 3, name: 'Наиль', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                    {userId: 4, name: 'Миша', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                    {userId: 5, name: 'Ваня', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0}
                ],
                history: [1.78, 2.78, 12.1, 7.51, 4.33],
                endBetTime: Date.now() + 5000
            }
        });
    }, 2000);
}

function simulateGameUpdate(data) {
    updateGameState(data.game);
}

function updateGameState(gameState) {
    rocketGame = gameState;
    
    clearCountdown();
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            document.getElementById('currentMultiplier').textContent = 'Ожидание';
            document.getElementById('currentMultiplier').className = 'coeff-item active';
            document.getElementById('timer').textContent = '0:00';
            break;
            
        case 'counting':
            const timeLeft = Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000));
            startCountdown(timeLeft);
            updateBettingUI();
            document.getElementById('currentMultiplier').textContent = 'Ставки: ' + timeLeft + 'с';
            document.getElementById('currentMultiplier').className = 'coeff-item active';
            break;
            
        case 'flying':
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            document.getElementById('currentMultiplier').textContent = gameState.multiplier.toFixed(2) + 'x';
            document.getElementById('currentMultiplier').className = 'coeff-item active';
            document.getElementById('timer').textContent = 'Полет!';
            break;
            
        case 'crashed':
            clearCountdown();
            showExplosion();
            document.getElementById('currentMultiplier').textContent = 'Крах: ' + gameState.multiplier.toFixed(2) + 'x';
            document.getElementById('currentMultiplier').className = 'coeff-item';
            document.getElementById('timer').textContent = 'Крах!';
            break;
    }
    
    userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
    }
    
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    
    updateBettingUI();
}

function startCountdown(timeLeft) {
    clearCountdown();
    
    if (timeLeft <= 0) {
        document.getElementById('placeBetButton').textContent = 'Время вышло';
        document.getElementById('placeBetButton').disabled = true;
        return;
    }
    
    // Обновляем таймер сразу
    updateTimerDisplay(timeLeft);
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);
        
        if (timeLeft <= 0) {
            clearCountdown();
            document.getElementById('placeBetButton').textContent = 'Время вышло';
            document.getElementById('placeBetButton').disabled = true;
            
            // Запускаем полет ракеты
            setTimeout(() => {
                simulateGameUpdate({
                    type: 'rocket_update',
                    game: {
                        status: 'flying',
                        multiplier: 1.00,
                        players: rocketGame.players,
                        history: rocketGame.history,
                        endBetTime: 0
                    }
                });
                
                // Эмулируем рост множителя
                let multiplier = 1.00;
                const flightInterval = setInterval(() => {
                    multiplier += 0.1;
                    document.getElementById('currentMultiplier').textContent = multiplier.toFixed(2) + 'x';
                    
                    if (multiplier >= 5.00) {
                        clearInterval(flightInterval);
                        
                        // Завершаем полет
                        setTimeout(() => {
                            simulateGameUpdate({
                                type: 'rocket_update',
                                game: {
                                    status: 'crashed',
                                    multiplier: multiplier,
                                    players: rocketGame.players.map(player => {
                                        if (!player.cashedOut && !player.isBot) {
                                            return {...player, cashedOut: true, winAmount: player.betAmount * multiplier, cashoutMultiplier: multiplier};
                                        }
                                        return player;
                                    }),
                                    history: [multiplier, ...rocketGame.history].slice(0, 6),
                                    endBetTime: 0
                                }
                            });
                        }, 1000);
                    }
                }, 200);
            }, 1000);
        }
    }, 1000);
}

function updateTimerDisplay(seconds) {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = `0:${seconds.toString().padStart(2, '0')}`;
    
    // Обновляем текст в коэффициенте
    if (rocketGame.status === 'counting') {
        document.getElementById('currentMultiplier').textContent = 'Ставки: ' + seconds + 'с';
    }
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function updateRocketPosition(multiplier) {
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    
    const trailHeight = Math.max(0, multiplier * 10);
    trailElement.style.height = `${trailHeight}px`;
    
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
    const rocketElement = document.getElementById('rocket');
    
    rocketElement.classList.remove('pulsating');
    rocketElement.classList.add('blast-off');
    
    setTimeout(() => {
        rocketElement.classList.remove('blast-off');
    }, 2000);
}

function updatePlayersList(players) {
    const playersListContainer = document.getElementById('playersListContainer');
    playersListContainer.innerHTML = '';
    
    players.forEach((player, index) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        
        const playerDetails = document.createElement('div');
        playerDetails.className = 'player-details';
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.name;
        
        const betSpan = document.createElement('div');
        betSpan.className = 'player-bet';
        
        if (player.cashedOut) {
            betSpan.innerHTML = `<i class="bi bi-currency-bitcoin"></i>
                                <span>${player.betAmount.toFixed(2)}</span>
                                <span class="win-amount">+${player.winAmount.toFixed(2)}</span>`;
        } else {
            betSpan.innerHTML = `<i class="bi bi-currency-bitcoin"></i>
                                <span>${player.betAmount.toFixed(2)}</span>`;
        }
        
        playerDetails.appendChild(nameSpan);
        playerDetails.appendChild(betSpan);
        
        playerInfo.appendChild(avatar);
        playerInfo.appendChild(playerDetails);
        
        const playerStats = document.createElement('div');
        playerStats.className = 'player-stats';
        
        if (player.cashedOut) {
            playerStats.innerHTML = `<i class="bi bi-diamond-fill"></i>
                                    <span>${player.cashoutMultiplier.toFixed(2)}</span>
                                    <div class="player-icon">💰</div>`;
        } else if (player.userId === currentUser.id && userBet > 0) {
            playerStats.innerHTML = `<i class="bi bi-diamond-fill"></i>
                                    <span>${rocketGame.multiplier.toFixed(2)}</span>
                                    <div class="player-icon">🎯</div>`;
        } else {
            playerStats.innerHTML = `<i class="bi bi-diamond-fill"></i>
                                    <span>0.00</span>
                                    <div class="player-icon">🌱</div>`;
        }
        
        playerItem.appendChild(playerInfo);
        playerItem.appendChild(playerStats);
        playersListContainer.appendChild(playerItem);
    });
}

function updateHistory(history) {
    const historyContainer = document.getElementById('historyContainer');
    historyContainer.innerHTML = '';
    
    history.slice(0, 6).forEach((multiplier, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = `coeff-item ${index === 0 ? 'active' : ''}`;
        historyItem.textContent = multiplier.toFixed(2);
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
    // Фиксированная ставка 5 TON
    const betAmount = 5;
    
    if (userBet > 0) {
        return;
    }
    
    if (rocketGame.status !== 'counting') {
        return;
    }
    
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        return;
    }
    
    // В демо-режиме просто обновляем UI
    userBet = betAmount;
    
    // Обновляем баланс
    const currentBalance = parseFloat(document.getElementById('balance').textContent);
    document.getElementById('balance').textContent = (currentBalance - betAmount).toFixed(2);
    
    // Добавляем игрока в список
    const newPlayer = {
        userId: currentUser.id,
        name: currentUser.firstName,
        betAmount: betAmount,
        cashedOut: false,
        isBot: false,
        cashoutMultiplier: 0
    };
    
    rocketGame.players.push(newPlayer);
    updatePlayersList(rocketGame.players);
    
    document.getElementById('placeBetButton').disabled = true;
    document.getElementById('placeBetButton').textContent = 'Ставка сделана';
}

function resetBettingUI() {
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Сделать ставку';
    
    userBet = 0;
    userCashedOut = false;
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    
    if (rocketGame.status === 'waiting') {
        betButton.disabled = false;
        betButton.textContent = 'Сделать ставку';
    } else if (rocketGame.status === 'counting') {
        if (userBet > 0) {
            betButton.disabled = true;
            betButton.textContent = 'Ставка сделана';
        } else {
            betButton.disabled = false;
            betButton.textContent = 'Сделать ставку';
        }
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Игра идет';
    } else if (rocketGame.status === 'crashed') {
        betButton.disabled = true;
        betButton.textContent = 'Раунд завершен';
        
        // Через 3 секунды запускаем новый раунд
        setTimeout(() => {
            simulateGameUpdate({
                type: 'rocket_update',
                game: {
                    status: 'waiting',
                    multiplier: 1.00,
                    players: [
                        {userId: 1, name: 'Даня', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                        {userId: 2, name: 'Кирилл', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                        {userId: 3, name: 'Наиль', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                        {userId: 4, name: 'Миша', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0},
                        {userId: 5, name: 'Ваня', betAmount: 1.00, cashedOut: false, isBot: true, cashoutMultiplier: 0}
                    ],
                    history: rocketGame.history,
                    endBetTime: 0
                }
            });
        }, 3000);
    }
}

// Анимация ракеты в режиме ожидания
function animateRocket() {
    const rocket = document.getElementById('rocket');
    if (rocket && rocketGame.status === 'waiting') {
        rocket.style.transform = 'translate(-50%, -10px)';
        setTimeout(() => {
            rocket.style.transform = 'translate(-50%, 0px)';
        }, 1000);
    }
}

// Запуск анимации каждые 3 секунды
setInterval(animateRocket, 3000);

// Добавляем стили для анимаций
const style = document.createElement('style');
style.textContent = `
    .pulsating {
        animation: pulse var(--pulse-speed, 1.2s) infinite alternate;
    }
    
    @keyframes pulse {
        from { transform: translate(-50%, 0) scale(1); }
        to { transform: translate(-50%, -5px) scale(1.05); }
    }
    
    .blast-off {
        animation: blastOff 2s forwards;
    }
    
    @keyframes blastOff {
        0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        50% { transform: translate(-50%, -100px) scale(1.2); opacity: 0.8; }
        100% { transform: translate(-50%, -200px) scale(0.5); opacity: 0; }
    }
`;
document.head.appendChild(style);