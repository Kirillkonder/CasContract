let ws = null;
let currentMultiplier = 1.00;
let userBet = null;
let activeBets = [];
let roundTimer = 10;
let gameActive = false;
let isRoundPreparing = true;

document.addEventListener('DOMContentLoaded', function() {
    connectWebSocket();
    setupEventListeners();
});

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
        // Аутентифицируемся
        const tg = window.Telegram.WebApp;
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            ws.send(JSON.stringify({
                type: 'auth',
                telegramId: tg.initDataUnsafe.user.id
            }));
        }
    };
    
    ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected');
        // Пытаемся переподключиться через 3 секунды
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'game_state':
            updateGameState(message.state);
            break;
        case 'multiplier_update':
            updateMultiplier(message.multiplier);
            break;
        case 'bet_placed':
            handleBetPlaced(message);
            break;
        case 'bet_added':
            addBetToUI(message.bet);
            break;
        case 'cashout_success':
            handleCashoutSuccess(message);
            break;
        case 'cashout_processed':
            updateCashoutUI(message);
            break;
        case 'game_crashed':
            handleGameCrashed(message.multiplier);
            break;
        case 'new_round_starting':
            startNewRound(message.timer);
            break;
        case 'bet_error':
        case 'cashout_error':
            alert(message.error);
            break;
    }
}

function updateGameState(state) {
    isRoundPreparing = state.isRoundPreparing;
    roundTimer = state.roundTimer;
    gameActive = state.gameActive;
    currentMultiplier = state.currentMultiplier;
    
    updateRoundTimer();
    updateMultiplierDisplay();
    
    // Очищаем список ставок
    document.getElementById('betsContainer').innerHTML = '';
    activeBets = [];
    
    // Добавляем текущие ставки
    state.bets.forEach(bet => {
        addBetToUI(bet);
    });
}

function updateMultiplier(multiplier) {
    currentMultiplier = multiplier;
    updateMultiplierDisplay();
    
    // Обновляем позицию ракеты
    const rocket = document.getElementById('rocket');
    const maxHeight = 250;
    const progress = Math.min(currentMultiplier / 10, 1); // Максимум 10x для анимации
    rocket.style.bottom = (50 + progress * maxHeight) + 'px';
    
    // Создаем след
    createRocketTrail();
}

function placeBet() {
    if (!isRoundPreparing) {
        alert('Идет подготовка к раунду! Подождите ' + roundTimer + ' секунд');
        return;
    }

    const betAmount = parseFloat(document.getElementById('betAmount').value);
    
    if (betAmount < 1 || betAmount > 50) {
        alert('Ставка должна быть от 1 до 50 TON');
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'place_bet',
            betAmount: betAmount,
            autoCashout: null // Можно добавить автокэшаут позже
        }));
    } else {
        alert('Нет соединения с сервером');
    }
}

function cashout() {
    if (!userBet) {
        alert('Нет активной ставки');
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'cashout',
            betId: userBet.betId
        }));
    } else {
        alert('Нет соединения с сервером');
    }
}

function handleBetPlaced(message) {
    userBet = {
        betId: message.betId,
        amount: parseFloat(document.getElementById('betAmount').value)
    };
    
    document.getElementById('yourBet').textContent = userBet.amount + ' TON';
    document.getElementById('placeBetBtn').disabled = true;
    document.getElementById('cashoutBtn').disabled = false;
    
    // Обновляем баланс
    document.getElementById('balance').textContent = message.newBalance.toFixed(2);
}

function addBetToUI(bet) {
    const betsContainer = document.getElementById('betsContainer');
    const noBets = betsContainer.querySelector('.no-bets');
    if (noBets) noBets.remove();
    
    const betItem = document.createElement('div');
    betItem.className = 'bet-item';
    if (bet.telegramId === window.Telegram.WebApp.initDataUnsafe.user.id) {
        betItem.classList.add('user-bet');
        betItem.id = 'user-bet';
    } else {
        betItem.id = 'bet-' + bet.betId;
    }
    
    betItem.innerHTML = `
        <span>${bet.demoMode ? '🤖' : '👤'} ${bet.username}</span>
        <span>${bet.betAmount} TON</span>
    `;
    
    betsContainer.appendChild(betItem);
    updateBetsCount();
}

function handleCashoutSuccess(message) {
    const winAmount = userBet.amount * message.multiplier;
    alert(`Вы успешно забрали ${winAmount.toFixed(2)} TON (${message.multiplier.toFixed(2)}x)`);
    
    // Обновляем баланс
    document.getElementById('balance').textContent = message.newBalance.toFixed(2);
    
    // Обновляем отображение ставки
    const userBetElement = document.getElementById('user-bet');
    if (userBetElement) {
        userBetElement.innerHTML = `
            <span>👤 Вы</span>
            <span style="color: #00b894;">+${winAmount.toFixed(2)} TON (${message.multiplier.toFixed(2)}x)</span>
        `;
        
        // Удаляем через 2 секунды
        setTimeout(() => {
            if (userBetElement.parentNode) {
                userBetElement.parentNode.removeChild(userBetElement);
            }
            updateBetsCount();
        }, 2000);
    }
    
    resetUserBet();
}

function updateCashoutUI(message) {
    const betElement = document.getElementById('bet-' + message.betId);
    if (betElement) {
        betElement.innerHTML = `
            <span>👤 Игрок</span>
            <span style="color: #00b894;">+${message.winAmount.toFixed(2)} TON (${message.multiplier.toFixed(2)}x)</span>
        `;
        
        setTimeout(() => {
            if (betElement.parentNode) {
                betElement.parentNode.removeChild(betElement);
            }
            updateBetsCount();
        }, 2000);
    }
}

function handleGameCrashed(multiplier) {
    createExplosion();
    
    if (userBet) {
        const userBetElement = document.getElementById('user-bet');
        if (userBetElement) {
            userBetElement.innerHTML = `
                <span>👤 Вы</span>
                <span style="color: #ff7675;">0 TON (${multiplier.toFixed(2)}x)</span>
            `;
            
            setTimeout(() => {
                if (userBetElement.parentNode) {
                    userBetElement.parentNode.removeChild(userBetElement);
                }
                updateBetsCount();
            }, 2000);
        }
        
        resetUserBet();
    }
}

function resetUserBet() {
    userBet = null;
    document.getElementById('yourBet').textContent = '0 TON';
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('cashoutBtn').disabled = true;
}

function updateBetsCount() {
    const betsCount = document.getElementById('betsContainer').children.length;
    document.getElementById('betsCount').textContent = betsCount;
    
    if (betsCount === 0) {
        const noBets = document.createElement('div');
        noBets.className = 'no-bets';
        noBets.textContent = 'Ставок пока нет';
        document.getElementById('betsContainer').appendChild(noBets);
    }
}

function createRocketTrail() {
    const rocket = document.getElementById('rocket');
    const trail = document.createElement('div');
    trail.className = 'rocket-trail';
    trail.style.left = rocket.offsetLeft + 'px';
    trail.style.bottom = rocket.offsetBottom + 'px';
    document.getElementById('rocketContainer').appendChild(trail);
    
    setTimeout(() => {
        trail.remove();
    }, 1000);
}

function createExplosion() {
    const rocket = document.getElementById('rocket');
    const explosion = document.createElement('div');
    explosion.className = 'explosion';
    explosion.style.left = rocket.offsetLeft + 'px';
    explosion.style.bottom = rocket.offsetBottom + 'px';
    document.getElementById('rocketContainer').appendChild(explosion);
    
    setTimeout(() => {
        explosion.remove();
    }, 1000);
}

function setupEventListeners() {
    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
    document.getElementById('cashoutBtn').addEventListener('click', cashout);
    
    // Кнопки быстрой ставки
    document.querySelectorAll('.quick-bet').forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = parseFloat(this.getAttribute('data-amount'));
            document.getElementById('betAmount').value = amount;
        });
    });
}

