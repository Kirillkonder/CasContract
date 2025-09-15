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
            document.getElementById('demo-badge').style.display = 'none';
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
    
    // Убрали обновление статуса, так как убрали соответствующие элементы
    clearCountdown();
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            break;
            
        case 'counting':
            // ФИКС: Передаем timeLeft, а не endBetTime
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

function startCountdown(timeLeft) {
    clearCountdown();
    
    if (timeLeft <= 0) {
        document.getElementById('placeBetButton').textContent = 'Время вышло';
        document.getElementById('placeBetButton').disabled = true;
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

// Обновленная функция для отображения истории
function updateHistory(history) {
    const historyContainer = document.getElementById('historyItems');
    const containerWidth = historyContainer.parentElement.offsetWidth;
    
    // Очищаем контейнер
    historyContainer.innerHTML = '';
    
    // Определяем, сколько элементов может поместиться в контейнере
    const itemWidth = 80; // Примерная ширина одного элемента
    const maxItems = Math.floor(containerWidth / itemWidth);
    
    // Берем только последние maxItems элементов
    const recentHistory = history.slice(-maxItems);
    
    // Добавляем элементы в контейнер
    recentHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        historyItem.textContent = `${item.multiplier.toFixed(2)}x`;
        historyContainer.appendChild(historyItem);
    });
    
    // Позиционируем контейнер, чтобы показывать самые последние элементы
    const totalWidth = recentHistory.length * itemWidth;
    if (totalWidth > containerWidth) {
        historyContainer.style.transform = `translateX(-${totalWidth - containerWidth}px)`;
    } else {
        historyContainer.style.transform = 'translateX(0)';
    }
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

// rocket.js - исправленная функция cashout
// rocket.js - исправленная функция cashout
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
            
            // 🔥 НЕМЕДЛЕННО обновляем баланс на клиенте
            const winAmount = userBet * rocketGame.multiplier;
            const currentBalance = parseFloat(document.getElementById('balance').textContent);
            const newBalance = currentBalance + winAmount;
            document.getElementById('balance').textContent = newBalance.toFixed(2);
            
            // Также обновляем интерфейс
            document.getElementById('potentialWin').textContent = winAmount.toFixed(2);
            updateBettingUI();
            
            // 🔥 ДОПОЛНИТЕЛЬНО синхронизируем с сервером
            setTimeout(() => {
                loadUserData(); // Запрашиваем актуальный баланс с сервера
            }, 1000);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
    }
}

function updateBettingUI() {
    const betButton = document.getElementById('placeBetButton');
    const cashoutButton = document.getElementById('cashoutButton');
    
    if (rocketGame.status === 'counting') {
        // ФИКС: Используем timeLeft из gameState или вычисляем правильно
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
            // ФИКС: Правильное отображение времени на кнопке
            betButton.textContent = `Поставить (${timeLeft}с)`;
        }
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Полёт...';
        cashoutButton.disabled = userCashedOut || userBet === 0;
        
        if (!userCashedOut && userBet > 0) {
            cashoutButton.textContent = `Забрать ${rocketGame.multiplier.toFixed(2)}x`;
        }
    } else {
        betButton.disabled = rocketGame.status !== 'waiting';
        cashoutButton.disabled = true;
        betButton.textContent = 'Поставить';
        cashoutButton.textContent = 'Забрать выигрыш';
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
    rocketElement.style.bottom = '100px';
    trailElement.style.height = '0px';
}

let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};