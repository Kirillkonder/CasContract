let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;

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
}

async function loadUserData() {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            isDemoMode = userData.demo_mode;
            document.getElementById('demo-badge').textContent = isDemoMode ? 'TESTNET' : 'MAINNET';
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
    
    const statusElement = document.getElementById('statusText');
    const countdownElement = document.getElementById('countdown');
    const statusIcon = document.getElementById('statusIcon');
    const gameStatusElement = document.getElementById('gameStatus');
    
    // Remove all status classes
    gameStatusElement.className = 'game-status';
    
    switch(gameState.status) {
        case 'waiting':
            statusElement.textContent = 'Ожидание начала игры...';
            statusIcon.textContent = '⏱️';
            countdownElement.textContent = '';
            gameStatusElement.classList.add('status-waiting');
            clearCountdown();
            resetBettingUI();
            break;
            
        case 'counting':
            statusElement.textContent = 'Прием ставок: ';
            statusIcon.textContent = '💰';
            gameStatusElement.classList.add('status-counting');
            startCountdown(gameState.endBetTime);
            updateBettingUI();
            break;
            
        case 'flying':
            statusElement.textContent = 'Ракета взлетает!';
            statusIcon.textContent = '🚀';
            countdownElement.textContent = '';
            gameStatusElement.classList.add('status-flying');
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            break;
            
        case 'crashed':
            statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
            statusIcon.textContent = '💥';
            countdownElement.textContent = '';
            gameStatusElement.classList.add('status-crashed');
            clearCountdown();
            showExplosion();
            break;
    }
    
    document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
    
    userPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
    
    if (userPlayer) {
        userBet = userPlayer.betAmount;
        userCashedOut = userPlayer.cashedOut;
        document.getElementById('userBet').textContent = userBet.toFixed(2);
        
        if (userCashedOut) {
            document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2);
        }
    }
    
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
    }
    
    updateBettingUI();
}

function startCountdown(endTime) {
    clearCountdown();
    
    function updateCountdown() {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.ceil((endTime - now) / 1000));
        
        document.getElementById('statusText').textContent = `Прием ставок: ${timeLeft}с`;
        document.getElementById('placeBetButton').textContent = timeLeft > 0 ? `Поставить (${timeLeft}с)` : 'Время вышло';
        
        if (timeLeft <= 0) {
            clearCountdown();
            document.getElementById('statusText').textContent = 'Время ставок закончилось';
            document.getElementById('placeBetButton').textContent = 'Время вышло';
            document.getElementById('placeBetButton').disabled = true;
            updateBettingUI();
        }
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
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
    if (trailElement) {
        trailElement.style.height = `${trailHeight}px`;
    }
    
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
        rocketElement.style.bottom = '120px';
        rocketElement.style.opacity = '1';
        rocketElement.style.filter = 'none';
    }, 2500);
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
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
            betSpan.style.color = '#00d4aa';
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

function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    historyContainer.innerHTML = '';
    
    history.slice(0, 12).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
        historyContainer.appendChild(historyItem);
    });
}

async function placeBet() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
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
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2);
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
        }
    } catch (error) {
        console.error('Error placing bet:', error);
    }
}

// Функция показа уведомления о выигрыше
function showWinNotification(winAmount) {
    const notification = document.getElementById('winNotification');
    const winAmountElement = document.getElementById('winAmount');
    
    winAmountElement.textContent = `+${winAmount.toFixed(2)} TON`;
    
    // Показываем уведомление
    notification.classList.add('show');
    
    // Скрываем через 4 секунды
    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
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
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            
            // Показываем уведомление о выигрыше
            const winAmount = userBet * rocketGame.multiplier;
            showWinNotification(winAmount);
            
            updateBettingUI();
            
            const balanceResponse = await fetch(`/api/user/balance/${currentUser.id}`);
            if (balanceResponse.ok) {
                const userData = await balanceResponse.json();
                const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
                document.getElementById('balance').textContent = balance.toFixed(2);
            }
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    }
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'counting') {
        const timeLeft = rocketGame.endBetTime ? Math.ceil((rocketGame.endBetTime - Date.now()) / 1000) : 0;
        const canBet = timeLeft > 0;
        
        betButton.disabled = userBet > 0 || !canBet;
        cashoutButton.disabled = true;
        
        if (userBet > 0) {
            betButton.textContent = 'Ставка сделана';
        } else if (!canBet) {
            betButton.textContent = 'Время вышло';
        } else {
            betButton.textContent = `Поставить (${timeLeft}с)`;
        }
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Полёт...';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.innerHTML = `<span class="cashout-multiplier">Забрать ${rocketGame.multiplier.toFixed(2)}x</span>`;
        }
    } else {
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.textContent = 'Поставить';
        cashoutButton.innerHTML = '<span class="cashout-multiplier">Забрать 1.00x</span>';
    }
}

function resetBettingUI() {
    userBet = 0;
    userCashedOut = false;
    userPlayer = null;
    document.getElementById('userBet').textContent = '0';
    document.getElementById('potentialWin').textContent = '0';
    document.getElementById('placeBetButton').disabled = false;
    document.getElementById('placeBetButton').textContent = 'Поставить';
    updateBettingUI();
    
    const rocketElement = document.getElementById('rocket');
    const trailElement = document.getElementById('rocketTrail');
    rocketElement.style.bottom = '80px';
    if (trailElement) {
        trailElement.style.height = '0px';
    }
}

let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};