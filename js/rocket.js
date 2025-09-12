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

// ===== НОВЫЕ ФУНКЦИИ ДЛЯ АНИМАЦИИ =====

// Функция для создания маркеров множителей на траектории
function createMultiplierMarkers() {
    const trajectoryMultipliers = document.getElementById('trajectoryMultipliers');
    if (!trajectoryMultipliers) return;
    
    trajectoryMultipliers.innerHTML = '';
    
    const multipliers = [1.5, 2, 3, 5, 10, 20, 50];
    const canvasHeight = document.querySelector('.rocket-canvas').offsetHeight;
    
    multipliers.forEach(multiplier => {
        const marker = document.createElement('div');
        marker.className = 'multiplier-marker';
        marker.textContent = multiplier + 'x';
        marker.style.top = `${(1 - (Math.log(multiplier) / Math.log(50))) * (canvasHeight - 100) + 50}px`;
        trajectoryMultipliers.appendChild(marker);
    });
}

// Функция для запуска анимации полета ракеты
function startRocketAnimation() {
    const rocketContainer = document.getElementById('rocketContainer');
    const rocketFire = document.getElementById('rocketFire');
    
    if (!rocketContainer || !rocketFire) return;
    
    // Сбрасываем позицию ракеты
    rocketContainer.style.transform = 'translateX(0)';
    rocketContainer.style.bottom = '50px';
    rocketContainer.style.display = 'block';
    rocketFire.style.display = 'block';
    
    // Запускаем анимацию полета
    rocketContainer.style.transition = 'transform 5s linear, bottom 5s ease-in-out';
    rocketContainer.style.transform = 'translateX(calc(100% - 80px))';
    rocketContainer.style.bottom = 'calc(50% - 40px)';
}

// Функция для остановки анимации ракеты (взрыв)
function explodeRocket() {
    const rocketContainer = document.getElementById('rocketContainer');
    const rocketFire = document.getElementById('rocketFire');
    const explosion = document.getElementById('explosion');
    
    if (!rocketContainer || !rocketFire || !explosion) return;
    
    // Прячем ракету и огонь
    rocketContainer.style.display = 'none';
    rocketFire.style.display = 'none';
    
    // Показываем взрыв
    explosion.style.display = 'block';
    explosion.style.left = rocketContainer.style.left;
    explosion.style.bottom = rocketContainer.style.bottom;
    
    // Анимация взрыва
    const particles = explosion.querySelectorAll('.explosion-particle');
    particles.forEach((particle, index) => {
        const angle = (index / particles.length) * Math.PI * 2;
        const distance = 50 + Math.random() * 50;
        particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    });
    
    // Через секунду скрываем взрыв
    setTimeout(() => {
        explosion.style.display = 'none';
    }, 1000);
}

// Функция для обновления позиции ракеты во время полета
function updateRocketPosition(multiplier) {
    const rocketContainer = document.getElementById('rocketContainer');
    if (!rocketContainer) return;
    
    const canvasWidth = document.querySelector('.rocket-canvas').offsetWidth;
    const progress = Math.min(multiplier / 50, 1);
    const currentX = progress * (canvasWidth - 100);
    
    rocketContainer.style.transform = `translateX(${currentX}px)`;
    rocketContainer.style.bottom = `${50 + (progress * 100)}px`;
}

// ===== СУЩЕСТВУЮЩАЯ ЛОГИКА (сохраняем без изменений) =====

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    connectWebSocket();
    loadSettings();
    createMultiplierMarkers(); // Добавляем создание маркеров
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
            
            // Сбрасываем позицию ракеты
            const rocketContainer = document.getElementById('rocketContainer');
            if (rocketContainer) {
                rocketContainer.style.transform = 'translateX(0)';
                rocketContainer.style.bottom = '50px';
            }
            
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
            
            // Запускаем анимацию полета
            startRocketAnimation();
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
            
            // Показываем взрыв
            explodeRocket();
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