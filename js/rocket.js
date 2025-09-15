let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;
const FIXED_BET_AMOUNT = 5; // Фиксированная ставка 5 TON

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
    
    // Обновляем текст кнопки с фиксированной ставкой
    document.getElementById('placeBetButton').textContent = `Поставить ${FIXED_BET_AMOUNT} TON`;
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
            document.getElementById('demo-badge').style.display = isDemoMode ? 'block' : 'none';
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
    
    // Обновляем статус игры
    const statusElement = document.getElementById('gameStatus');
    switch(gameState.status) {
        case 'waiting':
            statusElement.textContent = 'Ожидание';
            statusElement.style.color = '#bdc3c7';
            clearCountdown();
            resetBettingUI();
            break;
            
        case 'counting':
            const timeLeft = gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000));
            statusElement.textContent = `Ожидание (${timeLeft})`;
            statusElement.style.color = '#f39c12';
            startCountdown(timeLeft);
            updateBettingUI();
            break;
            
        case 'flying':
            statusElement.textContent = gameState.multiplier.toFixed(2) + 'x';
            statusElement.style.color = '#00b894';
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            break;
            
        case 'crashed':
            statusElement.textContent = 'Взрыв!';
            statusElement.style.color = '#e74c3c';
            clearCountdown();
            showExplosion();
            break;
    }
    
    document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
    
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
    
    // Обновляем статус с обратным отсчетом
    const updateStatus = () => {
        const statusElement = document.getElementById('gameStatus');
        statusElement.textContent = `Ожидание (${timeLeft})`;
        
        if (timeLeft <= 0) {
            clearCountdown();
            statusElement.textContent = 'Время вышло';
            document.getElementById('placeBetButton').textContent = 'Время вышло';
            document.getElementById('placeBetButton').disabled = true;
        }
        
        timeLeft--;
    };
    
    updateStatus();
    countdownInterval = setInterval(updateStatus, 1000);
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
    
    // Обновляем позицию ракеты
    const newPosition = 100 + (multiplier * 5); // Растет с множителем
    rocketElement.style.bottom = `${Math.min(newPosition, 400)}px`;
    
    // Обновляем след ракеты
    const trailHeight = Math.max(0, multiplier * 15);
    trailElement.style.height = `${trailHeight}px`;
    trailElement.style.bottom = `${Math.min(newPosition, 400)}px`;
    
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
    blastOffText.textContent = 'ВЗРЫВ!';
    canvas.appendChild(blastOffText);
    
    setTimeout(() => {
        if (blastOffText.parentNode) {
            canvas.removeChild(blastOffText);
        }
        rocketElement.classList.remove('blast-off');
        rocketElement.style.bottom = '100px';
        rocketElement.style.opacity = '1';
        rocketElement.style.filter = 'none';
        
        // Сбрасываем след
        const trailElement = document.getElementById('rocketTrail');
        trailElement.style.height = '0px';
        trailElement.style.bottom = '100px';
    }, 2000);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    playersList.innerHTML = '';
    playersCount.textContent = players.length;
    
    // Сортируем игроков: сначала те, кто забрал выигрыш, затем по размеру ставки
    const sortedPlayers = [...players].sort((a, b) => {
        if (a.cashedOut && !b.cashedOut) return -1;
        if (!a.cashedOut && b.cashedOut) return 1;
        return b.betAmount - a.betAmount;
    });
    
    sortedPlayers.forEach(player => {
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
            betSpan.style.color = '#bdc3c7';
        } else {
            betSpan.textContent = `${player.betAmount.toFixed(2)} TON`;
            betSpan.style.color = '#f39c12';
        }
        
        playerItem.appendChild(nameSpan);
        playerItem.appendChild(betSpan);
        playersList.appendChild(playerItem);
    });
}

function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    historyContainer.innerHTML = '';
    
    history.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
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
                betAmount: FIXED_BET_AMOUNT,
                demoMode: isDemoMode
            })
        });
        
        if (!response.ok) {
            hideButtonLoading('placeBetButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = FIXED_BET_AMOUNT;
            document.getElementById('userBet').textContent = FIXED_BET_AMOUNT.toFixed(2) + ' TON';
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
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
                telegramId: currentUser.id
            })
        });
        
        if (!response.ok) {
            hideButtonLoading('cashoutButton');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            
            const winAmount = userBet * rocketGame.multiplier;
            const currentBalance = parseFloat(document.getElementById('balance').textContent);
            const newBalance = currentBalance + winAmount;
            document.getElementById('balance').textContent = newBalance.toFixed(2);
            
            document.getElementById('potentialWin').textContent = winAmount.toFixed(2) + ' TON';
            updateBettingUI();
            
            setTimeout(() => {
                loadUserData();
            }, 1000);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    } finally {
        hideButtonLoading('cashoutButton');
    }
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'counting') {
        const timeLeft = rocketGame.timeLeft || 
                        (rocketGame.endBetTime ? Math.max(0, Math.ceil((rocketGame.endBetTime - Date.now()) / 1000)) : 0);
        
        const canBet = timeLeft > 0;
        
        betButton.disabled = userBet > 0 || !canBet;
        cashoutButton.disabled = true;
        
        if (userBet > 0) {
            betButton.textContent = 'Ставка сделана';
        } else if (!canBet) {
            betButton.textContent = 'Время вышло';
        } else {
            betButton.textContent = `Поставить ${FIXED_BET_AMOUNT} TON`;
        }
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Полёт...';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.textContent = `Забрать ${rocketGame.multiplier.toFixed(2)}x`;
        } else {
            cashoutButton.textContent = 'Забрать выигрыш';
        }
    } else {
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.textContent = `Поставить ${FIXED_BET_AMOUNT} TON`;
        cashoutButton.textContent = 'Забрать выигрыш';
    }
}

function resetBettingUI() {
    userBet = 0;
    userCashedOut = false;
    userPlayer = null;
    document.getElementById('userBet').textContent = '0.00 TON';
    document.getElementById('potentialWin').textContent = '0.00 TON';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = `Поставить ${FIXED_BET_AMOUNT} TON`;
    updateBettingUI();
    
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    rocketElement.style.bottom = '100px';
    trailElement.style.height = '0px';
    trailElement.style.bottom = '100px';
}

let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0,
    players: [],
    history: []
};