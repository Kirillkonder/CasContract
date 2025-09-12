// rocket.js - исправленная версия с автоставкой и автовыводом
let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 50;
let countdownInterval = null;
let rocketSpeed = 0.1;
let autoBetEnabled = false;
let autoBetAmount = 1.0;
let autoCashoutEnabled = false;
let autoCashoutMultiplier = 2.0;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
    loadSettings();
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

function loadSettings() {
    const savedAutoBet = localStorage.getItem('rocket_autoBet');
    const savedAutoBetAmount = localStorage.getItem('rocket_autoBetAmount');
    const savedAutoCashout = localStorage.getItem('rocket_autoCashout');
    const savedAutoCashoutMultiplier = localStorage.getItem('rocket_autoCashoutMultiplier');
    
    if (savedAutoBet) autoBetEnabled = savedAutoBet === 'true';
    if (savedAutoBetAmount) autoBetAmount = parseFloat(savedAutoBetAmount);
    if (savedAutoCashout) autoCashoutEnabled = savedAutoCashout === 'true';
    if (savedAutoCashoutMultiplier) autoCashoutMultiplier = parseFloat(savedAutoCashoutMultiplier);
    
    document.getElementById('autoBetToggle').checked = autoBetEnabled;
    document.getElementById('autoBetAmount').value = autoBetAmount;
    document.getElementById('autoCashoutToggle').checked = autoCashoutEnabled;
    document.getElementById('autoCashoutMultiplier').value = autoCashoutMultiplier;
}

function saveSettings() {
    localStorage.setItem('rocket_autoBet', autoBetEnabled);
    localStorage.setItem('rocket_autoBetAmount', autoBetAmount);
    localStorage.setItem('rocket_autoCashout', autoCashoutEnabled);
    localStorage.setItem('rocket_autoCashoutMultiplier', autoCashoutMultiplier);
}

function toggleAutoBet() {
    autoBetEnabled = document.getElementById('autoBetToggle').checked;
    saveSettings();
}

function updateAutoBetAmount() {
    autoBetAmount = parseFloat(document.getElementById('autoBetAmount').value) || 1.0;
    saveSettings();
}

function toggleAutoCashout() {
    autoCashoutEnabled = document.getElementById('autoCashoutToggle').checked;
    saveSettings();
}

function updateAutoCashoutMultiplier() {
    autoCashoutMultiplier = parseFloat(document.getElementById('autoCashoutMultiplier').value) || 2.0;
    saveSettings();
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
    const statusClass = `status-${gameState.status}`;
    
    document.getElementById('gameStatus').className = `game-status ${statusClass}`;
    
    switch(gameState.status) {
        case 'waiting':
            statusElement.textContent = 'Ожидание начала игры...';
            countdownElement.textContent = '';
            clearCountdown();
            resetBettingUI();
            rocketSpeed = 0.1;
            
            // Автоставка при начале нового раунда
            if (autoBetEnabled && userBet === 0) {
                setTimeout(() => {
                    document.getElementById('betAmount').value = autoBetAmount;
                    placeAutoBet();
                }, 1000);
            }
            break;
            
        case 'counting':
            statusElement.textContent = 'Прием ставок: ';
            startCountdown(gameState.endBetTime);
            updateBettingUI();
            break;
            
        case 'flying':
            statusElement.textContent = 'Ракета взлетает!';
            countdownElement.textContent = '';
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            
            // Автовывод при достижении заданного множителя
            if (autoCashoutEnabled && userBet > 0 && !userCashedOut && 
                gameState.multiplier >= autoCashoutMultiplier) {
                setTimeout(cashout, 500);
            }
            break;
            
        case 'crashed':
            statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
            countdownElement.textContent = '';
            clearCountdown();
            showExplosion();
            break;
    }
    
    document.getElementById('multiplierDisplay').textContent = gameState.multiplier.toFixed(2) + 'x';
    
    // Находим нашего игрока
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
        const timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        document.getElementById('countdown').textContent = `${timeLeft}с`;
        
        const betButton = document.getElementById('placeBetButton');
        if (timeLeft > 0) {
            betButton.textContent = `Поставить (${timeLeft}с)`;
        } else {
            betButton.textContent = 'Время вышло';
            betButton.disabled = true;
        }
        
        if (timeLeft <= 0) {
            clearCountdown();
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
    
    rocketSpeed = 0.1 + (multiplier * 0.05);
    const newPosition = 50 + (multiplier * 2);
    rocketElement.style.bottom = `${newPosition}px`;
    trailElement.style.height = `${newPosition - 90}px`;
    rocketElement.style.transition = `bottom ${0.5/rocketSpeed}s linear`;
}

function showExplosion() {
    const canvas = document.getElementById('rocketCanvas');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    canvas.appendChild(explosion);
    
    setTimeout(() => {
        canvas.removeChild(explosion);
    }, 1000);
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

async function placeAutoBet() {
    if (!autoBetEnabled || userBet > 0 || rocketGame.status !== 'counting') return;
    
    const betAmount = autoBetAmount;
    
    if (betAmount < 0.5 || betAmount > 50) return;
    
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) return;
    
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
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                userBet = betAmount;
                document.getElementById('userBet').textContent = betAmount.toFixed(2);
                document.getElementById('balance').textContent = result.new_balance.toFixed(2);
                
                document.getElementById('placeBetButton').disabled = true;
                document.getElementById('placeBetButton').textContent = 'Ставка сделана';
                
                console.log('Автоставка принята!');
            }
        }
    } catch (error) {
        console.error('Error placing auto bet:', error);
    }
}

async function placeBet() {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (betAmount < 0.5 || betAmount > 50) {
        alert('Ставка должна быть от 0.5 до 50 TON');
        return;
    }
    
    if (userBet > 0) {
        alert('Вы уже сделали ставку в этом раунде!');
        return;
    }
    
    if (rocketGame.status !== 'counting') {
        alert('Сейчас нельзя сделать ставку! Дождитесь следующего раунда.');
        return;
    }
    
    const timeLeft = Math.ceil((rocketGame.endBetTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
        alert('Время для ставок закончилось! Дождитесь следующего раунда.');
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
            const error = await response.json();
            alert(error.error || 'Ошибка при размещении ставки');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userBet = betAmount;
            document.getElementById('userBet').textContent = betAmount.toFixed(2);
            document.getElementById('balance').textContent = result.new_balance.toFixed(2);
            
            document.getElementById('placeBetButton').disabled = true;
            document.getElementById('placeBetButton').textContent = 'Ставка сделана';
            
            alert('Ставка принята! Удачи! 🚀');
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        alert('Ошибка при размещении ставки');
    }
}

async function cashout() {
    if (userCashedOut) {
        alert('Вы уже забрали выигрыш!');
        return;
    }
    
    if (userBet === 0) {
        alert('Сначала сделайте ставку!');
        return;
    }
    
    if (rocketGame.status !== 'flying') {
        alert('Нельзя забрать выигрыш сейчас!');
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
            const error = await response.json();
            alert(error.error || 'Ошибка при выводе средств');
            return;
        }
        
        const result = await response.json();
        if (result.success) {
            userCashedOut = true;
            updateBettingUI();
            
            const response = await fetch(`/api/user/balance/${currentUser.id}`);
            if (response.ok) {
                const userData = await response.json();
                const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
                document.getElementById('balance').textContent = balance.toFixed(2);
            }
            
            alert(`🎉 Вы успешно вывели ${result.winAmount.toFixed(2)} TON на ${result.multiplier.toFixed(2)}x!`);
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        alert('Ошибка при выводе средств');
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
        cashoutButton.textContent = 'Забрать выигрыш';
        
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
        cashoutButton.textContent = 'Забрать выигрыш';
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
    document.getElementById('cashoutButton').textContent = 'Забрать выигрыш';
    
    updateBettingUI();
}

// Глобальная переменная для доступа из WebSocket
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    endBetTime: 0
};