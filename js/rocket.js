let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: []
};

function showButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.add('loading');
    button.disabled = true;
}

function hideButtonLoading(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.remove('loading');
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
});

function goBack() {
    window.location.href = 'index.html';
}

function initializeGame() {
    const tg = window.Telegram.WebApp;
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = {
            id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || `User_${tg.initDataUnsafe.user.id}`,
            firstName: tg.initDataUnsafe.user.first_name,
            lastName: tg.initDataUnsafe.user.last_name
        };
        loadUserData();
    }
    
    // Инициализация UI
    updateBettingUI();
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
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
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
}

function updateGameState(gameState) {
    rocketGame = gameState;
    
    clearCountdown();
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            document.getElementById('currentMultiplier').textContent = 'Ожидание';
            document.getElementById('currentMultiplier').className = 'coeff-item';
            document.getElementById('timer').textContent = '0:00';
            break;
            
        case 'counting':
            const timeLeft = gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000));
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
        document.getElementById('userBet').textContent = userBet.toFixed(2) + ' TON';
        
        if (userCashedOut) {
            document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2) + ' TON';
        }
    }
    
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2) + ' TON';
    }
    
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
        }
    }, 1000);
}

function updateTimerDisplay(seconds) {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    
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
    const canvasElement = document.getElementById('rocketCanvas');
    
    const trailHeight = Math.max(0, multiplier * 10);
    trailElement.style.height = `${trailHeight}px`;
    
    if (multiplier > 1.00) {
        rocketElement.classList.add('pulsating');
        canvasElement.classList.add('pulsating');
        
        if (multiplier >= 3) {
            const speedIntensity = Math.min(0.7, (multiplier - 3) / 10);
            const pulseSpeed = Math.max(0.3, 1.2 - speedIntensity);
            document.documentElement.style.setProperty('--pulse-speed', `${pulseSpeed}s`);
        } else {
            document.documentElement.style.setProperty('--pulse-speed', '1.2s');
        }
        
        if (multiplier > 5) {
            const redIntensity = Math.min(0.3, (multiplier - 5) / 15);
            canvasElement.style.backgroundColor = `rgba(255, 50, 50, ${redIntensity})`;
        } else {
            canvasElement.style.backgroundColor = '';
        }
    } else {
        rocketElement.classList.remove('pulsating');
        canvasElement.classList.remove('pulsating');
        canvasElement.style.backgroundColor = '';
        document.documentElement.style.setProperty('--pulse-speed', '1.2s');
    }
}

function showExplosion() {
    const canvas = document.getElementById('rocketCanvas');
    const rocketElement = document.getElementById('rocket');
    
    rocketElement.classList.remove('pulsating');
    canvas.classList.remove('pulsating');
    canvas.style.backgroundColor = '';
    
    rocketElement.classList.add('blast-off');
    
    const blastOffText = document.createElement('div');
    blastOffText.className = 'blast-off-text';
    blastOffText.textContent = 'УЛЕТЕЛ!';
    canvas.appendChild(blastOffText);
    
    setTimeout(() => {
        if (blastOffText.parentNode) {
            canvas.removeChild(blastOffText);
        }
        rocketElement.classList.remove('blast-off');
        rocketElement.style.bottom = '110px';
        rocketElement.style.opacity = '1';
        rocketElement.style.filter = 'none';
    }, 2000);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    players.forEach(player => {
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
        } else if (!player.isBot && userBet > 0) {
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
        playersList.appendChild(playerItem);
    });
}

function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    historyContainer.innerHTML = '';
    
    history.slice(0, 6).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `coeff-item ${item.multiplier >= 2 ? 'active' : ''}`;
        historyItem.textContent = item.multiplier.toFixed(2) + 'x';
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
    // Фиксированная ставка 5 TON
    const betAmount = 5;
    
    if (betAmount < 0.5 || betAmount > 50) {
        return;
    }
    
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
    
    showButtonLoading('placeBetButton');
    
    try {
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
            hideButtonLoading('placeBetButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            // Показываем кнопку "Забрать выигрыш"
            document.getElementById('placeBetButton').style.display = 'none';
            document.getElementById('cashoutButton').style.display = 'block';
        }
    } catch (error) {
        console.error('Error placing bet:', error);
    } finally {
        hideButtonLoading('placeBetButton');
    }
}

async function cashout() {
    if (userCashedOut) {
        return;
    }
    
    if (userBet === 0) {
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        return;
    }
    
    showButtonLoading('cashoutButton');
    
    try {
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
            hideButtonLoading('cashoutButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            document.getElementById('potentialWin').textContent = result.winAmount.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('cashoutButton').disabled = true;
            document.getElementById('cashoutButton').textContent = 'Выплачено';
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    } finally {
        hideButtonLoading('cashoutButton');
    }
}

function resetBettingUI() {
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Сделать ставку';
    document.getElementById('placeBetButton').style.display = 'block';
    
    document.getElementById('cashoutButton').disabled = true;
    document.getElementById('cashoutButton').textContent = 'Забрать выигрыш';
    document.getElementById('cashoutButton').style.display = 'none';
    
    userBet = 0;
    userCashedOut = false;
    
    document.getElementById('userBet').textContent = '0 TON';
    document.getElementById('potentialWin').textContent = '0 TON';
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'waiting') {
        betButton.disabled = false;
        betButton.textContent = 'Сделать ставку';
        betButton.style.display = 'block';
        cashoutButton.style.display = 'none';
    } else if (rocketGame.status === 'counting') {
        if (userBet > 0) {
            betButton.disabled = true;
            betButton.textContent = 'Ставка сделана';
            betButton.style.display = 'block';
            cashoutButton.style.display = 'none';
        } else {
            betButton.disabled = false;
            betButton.textContent = 'Сделать ставку';
            betButton.style.display = 'block';
            cashoutButton.style.display = 'none';
        }
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Игра идет';
        betButton.style.display = 'none';
        
        if (userBet > 0 && !userCashedOut) {
            cashoutButton.disabled = false;
            cashoutButton.style.display = 'block';
        } else {
            cashoutButton.style.display = 'none';
        }
    } else if (rocketGame.status === 'crashed') {
        betButton.disabled = true;
        betButton.textContent = 'Раунд завершен';
        betButton.style.display = 'block';
        cashoutButton.style.display = 'none';
    }
}

// Анимация ракеты
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