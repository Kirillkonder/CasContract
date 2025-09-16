let ws = null;
let currentUser = null;
let isDemoMode = false;
let userBet = 0;
let userCashedOut = false;
let userPlayer = null;
let rocketPosition = 80;
let countdownInterval = null;

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
    
    switch(gameState.status) {
        case 'waiting':
            clearCountdown();
            resetBettingUI();
            updateTimerDisplay('Ожидание');
            break;
            
        case 'counting':
            startCountdown(gameState.timeLeft || Math.max(0, Math.ceil((gameState.endBetTime - Date.now()) / 1000)));
            break;
            
        case 'flying':
            clearCountdown();
            updateRocketPosition(gameState.multiplier);
            updateTimerDisplay(gameState.multiplier.toFixed(2) + 'x');
            break;
            
        case 'crashed':
            clearCountdown();
            showExplosion();
            updateTimerDisplay(gameState.multiplier.toFixed(2) + 'x');
            break;
    }
    
    // Обновляем данные игрока и баланс в реальном времени
    if (currentUser) {
        const updatedPlayer = gameState.players.find(p => p.userId == currentUser.id && !p.isBot);
        if (updatedPlayer) {
            const oldUserBet = userBet;
            const oldCashedOut = userCashedOut;
            
            userPlayer = updatedPlayer;
            userBet = userPlayer.betAmount;
            userCashedOut = userPlayer.cashedOut;
            
            document.getElementById('userBet').textContent = userBet.toFixed(2) + ' TON';
            
            // Обновляем баланс из данных игрока (если сервер передает новый баланс)
            if (userPlayer.newBalance !== undefined) {
                const balanceElement = document.getElementById('balance');
                const oldBalance = parseFloat(balanceElement.textContent);
                const newBalance = userPlayer.newBalance;
                
                if (newBalance !== oldBalance) {
                    balanceElement.textContent = newBalance.toFixed(2);
                    
                    // Анимация обновления баланса
                    if (newBalance > oldBalance) {
                        balanceElement.classList.add('balance-updated');
                        setTimeout(() => {
                            balanceElement.classList.remove('balance-updated');
                        }, 1000);
                    }
                }
            }
            
            if (userCashedOut && !oldCashedOut) {
                document.getElementById('potentialWin').textContent = userPlayer.winAmount.toFixed(2) + ' TON';
            }
        }
    }
    
    // Обновляем список игроков
    updatePlayersList(gameState.players);
    updateHistory(gameState.history);
    
    if (userBet > 0 && !userCashedOut && gameState.status === 'flying') {
        const potentialWin = userBet * gameState.multiplier;
        document.getElementById('potentialWin').textContent = potentialWin.toFixed(2) + ' TON';
    }
    
    updateBettingUI();
}

function updateTimerDisplay(text) {
    const timerDisplay = document.getElementById('timerDisplay');
    timerDisplay.textContent = text;
    
    if (text === 'Ожидание') {
        timerDisplay.className = 'coeff-item active';
    } else if (text.includes('КРАШ')) {
        timerDisplay.className = 'coeff-item history-loss';
    } else {
        timerDisplay.className = 'coeff-item';
    }
}

function startCountdown(timeLeft) {
    clearCountdown();
    
    const timerElement = document.getElementById('timer');
    const timerDisplay = document.getElementById('timerDisplay');
    
    timerDisplay.textContent = timeLeft + 's';
    timerElement.textContent = timeLeft + 's';
    
    if (timeLeft <= 0) {
        document.getElementById('placeBetButton').textContent = 'Время вышло';
        document.getElementById('placeBetButton').disabled = true;
        return;
    }
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft + 's';
        timerElement.textContent = timeLeft + 's';
        
        if (timeLeft <= 0) {
            clearCountdown();
            document.getElementById('placeBetButton').textContent = 'Время вышло';
            document.getElementById('placeBetButton').disabled = true;
        }
    }, 1000);
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    document.getElementById('timer').textContent = '0:00';
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

async function updateUserBalance(winAmount = 0) {
    try {
        const response = await fetch(`/api/user/balance/${currentUser.id}`);
        if (response.ok) {
            const userData = await response.json();
            const balance = userData.demo_mode ? userData.demo_balance : userData.main_balance;
            document.getElementById('balance').textContent = balance.toFixed(2);
            
            // Если есть выигрыш, показываем обновление
            if (winAmount > 0) {
                const balanceElement = document.getElementById('balance');
                balanceElement.classList.add('balance-updated');
                setTimeout(() => {
                    balanceElement.classList.remove('balance-updated');
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Error updating balance:', error);
    }
}

function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    
    // Показываем всех активных игроков (включая с нулевыми ставками для корректного отображения)
    const activePlayers = players.filter(player => 
        player.betAmount >= 0 && (player.name || player.userId)
    );
    playersCount.textContent = activePlayers.length;
    
    // Получаем существующие элементы игроков для сохранения анимации
    const existingPlayers = Array.from(playersList.children);
    const playerIds = new Set();
    
    // Обновляем существующих игроков и добавляем новых
    activePlayers.forEach((player, index) => {
        const playerId = player.userId || player.name;
        playerIds.add(playerId);
        
        // Ищем существующий элемент игрока
        let playerItem = existingPlayers.find(item => 
            item.dataset.playerId === playerId
        );
        
        if (!playerItem) {
            // Создаем новый элемент игрока
            playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.dataset.playerId = playerId;
            
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            
            const playerDetails = document.createElement('div');
            playerDetails.className = 'player-details';
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = player.name;
            
            const playerBet = document.createElement('span');
            playerBet.className = 'player-bet';
            
            playerDetails.appendChild(playerName);
            playerDetails.appendChild(playerBet);
            
            playerInfo.appendChild(avatar);
            playerInfo.appendChild(playerDetails);
            
            playerItem.appendChild(playerInfo);
            
            // Добавляем в список
            playersList.appendChild(playerItem);
            
            // Анимация появления с задержкой
            setTimeout(() => {
                playerItem.classList.add('show');
            }, index * 50);
        }
        
        // Обновляем информацию о ставке
        const playerBetElement = playerItem.querySelector('.player-bet');
        if (player.cashedOut && player.winAmount > 0) {
            playerBetElement.innerHTML = `<i class="bi bi-cash-coin"></i> +${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
            playerBetElement.style.color = '#00b894';
            playerItem.classList.add('cashed-out');
        } else if (player.betAmount > 0) {
            playerBetElement.innerHTML = `<i class="bi bi-currency-bitcoin"></i> ${player.betAmount.toFixed(2)} TON`;
            playerBetElement.style.color = '#fff';
            playerItem.classList.remove('cashed-out');
        } else {
            playerBetElement.innerHTML = `<i class="bi bi-hourglass"></i> Ожидает...`;
            playerBetElement.style.color = '#999';
            playerItem.classList.remove('cashed-out');
        }
    });
    
    // Удаляем игроков, которых больше нет в списке
    existingPlayers.forEach(item => {
        if (!playerIds.has(item.dataset.playerId)) {
            item.classList.add('fade-out');
            setTimeout(() => {
                if (item.parentNode) {
                    item.parentNode.removeChild(item);
                }
            }, 300);
        }
    });
}

function updateHistory(history) {
    // Обновляем историю в коэффициентах
    for (let i = 0; i < 5; i++) {
        const historyItem = document.getElementById('historyItem' + (i + 1));
        if (history[i]) {
            historyItem.textContent = history[i].multiplier.toFixed(2) + 'x';
            historyItem.className = `coeff-item ${history[i].multiplier >= 2 ? 'history-win' : 'history-loss'}`;
        } else {
            historyItem.textContent = '1.00';
            historyItem.className = 'coeff-item';
        }
    }
}

async function placeBet() {
    const betAmount = 5; // Фиксированная ставка 5 TON
    
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
            
            // Обновляем баланс из ответа сервера
            if (result.new_balance !== undefined) {
                document.getElementById('balance').textContent = result.new_balance.toFixed(2);
                
                // Анимация обновления баланса
                const balanceElement = document.getElementById('balance');
                balanceElement.classList.add('balance-updated');
                setTimeout(() => {
                    balanceElement.classList.remove('balance-updated');
                }, 1000);
            } else {
                // Если сервер не вернул новый баланс, принудительно загружаем данные пользователя
                console.log('Сервер не вернул новый баланс, обновляем принудительно');
                await loadUserData();
                
                // Анимация обновления баланса
                const balanceElement = document.getElementById('balance');
                balanceElement.classList.add('balance-updated');
                setTimeout(() => {
                    balanceElement.classList.remove('balance-updated');
                }, 1000);
            }
            
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
    document.getElementById('placeBetButton').textContent = 'Поставить 5 TON';
    document.getElementById('cashoutButton').disabled = true;
    document.getElementById('cashoutButton').textContent = 'Забрать выигрыш';
    
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
        betButton.textContent = 'Поставить 5 TON';
        cashoutButton.disabled = true;
    } else if (rocketGame.status === 'counting') {
        if (userBet > 0) {
            betButton.disabled = true;
            betButton.textContent = 'Ставка сделана';
        } else {
            betButton.disabled = false;
            betButton.textContent = 'Поставить 5 TON';
        }
        cashoutButton.disabled = true;
    } else if (rocketGame.status === 'flying') {
        betButton.disabled = true;
        betButton.textContent = 'Игра идет';
        
        if (userBet > 0 && !userCashedOut) {
            cashoutButton.disabled = false;
        } else {
            cashoutButton.disabled = true;
        }
    } else if (rocketGame.status === 'crashed') {
        betButton.disabled = true;
        betButton.textContent = 'Раунд завершен';
        cashoutButton.disabled = true;
    }
}

// Инициализация глобальной переменной для состояния игры
let rocketGame = {
    status: 'waiting',
    multiplier: 1.00,
    players: [],
    history: []
};