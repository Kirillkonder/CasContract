let ws = null;
    let currentUser = null;
    let isDemoMode = false;
    let userBet = 0;
    let userCashedOut = false;
    let userPlayer = null;
    let rocketPosition = 50;
    let countdownInterval = null;

    // Инициализация
    document.addEventListener('DOMContentLoaded', function() {
        initializeGame();
        connectWebSocket();
        createMultiplierScale();
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

    // Создаем шкалу множителей
    function createMultiplierScale() {
        const sidebar = document.getElementById('multiplierSidebar');
        sidebar.innerHTML = '<div class="current-multiplier-indicator" id="currentMultiplierIndicator" style="bottom: 0%;"></div>';
        
        // Создаем отметки множителей
        const multipliers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50];
        
        multipliers.forEach(mult => {
            const mark = document.createElement('div');
            mark.className = 'multiplier-mark';
            mark.textContent = mult + 'x';
            mark.id = `multiplier-${mult}`;
            mark.style.height = `${100 / multipliers.length}%`;
            sidebar.appendChild(mark);
        });
    }

    // Обновляем индикатор текущего множителя на шкале
    function updateMultiplierIndicator(multiplier) {
        const indicator = document.getElementById('currentMultiplierIndicator');
        const maxMultiplier = 50; // Максимальный множитель на шкале
        
        // Вычисляем позицию индикатора (в процентах от нижней части)
        let position = Math.min(100, (multiplier / maxMultiplier) * 100);
        indicator.style.bottom = `${position}%`;
        
        // Подсвечиваем достигнутые множители
        document.querySelectorAll('.multiplier-mark').forEach(mark => {
            const markValue = parseFloat(mark.textContent);
            mark.classList.remove('active', 'reached');
            
            if (markValue <= multiplier) {
                mark.classList.add('reached');
            }
            
            if (Math.abs(markValue - multiplier) < 0.5) {
                mark.classList.add('active');
            }
        });
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
        // Обновляем глобальную переменную игры
        rocketGame = gameState;
        
        // Обновляем статус игры
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
                updateMultiplierIndicator(gameState.multiplier);
                break;
                
            case 'crashed':
                statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
                countdownElement.textContent = '';
                clearCountdown();
                showExplosion();
                setTimeout(() => {
                    updateHistory(gameState.history);
                }, 2000);
                break;
        }
        
        // Обновляем список игроков
        updatePlayersList(gameState.players);
    }

    function startCountdown(endTime) {
        clearCountdown();
        
        function update() {
            const now = Date.now();
            const timeLeft = Math.max(0, endTime - now);
            
            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdown').textContent = '';
            } else {
                document.getElementById('countdown').textContent = ` (${(timeLeft / 1000).toFixed(1)} сек)`;
            }
        }
        
        update();
        countdownInterval = setInterval(update, 100);
    }

    function clearCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function updateRocketPosition(multiplier) {
        // Обновляем отображение множителя
        document.getElementById('multiplierDisplay').textContent = multiplier.toFixed(2) + 'x';
        
        // Обновляем позицию ракеты (высота)
        const maxMultiplier = 50; // Максимальный множитель для визуализации
        const rocketElement = document.getElementById('rocket');
        const canvasHeight = document.getElementById('rocketCanvas').offsetHeight;
        const rocketHeight = rocketElement.offsetHeight;
        
        // Вычисляем новую позицию ракеты
        const positionPercentage = Math.min(100, (multiplier / maxMultiplier) * 100);
        const newBottom = 50 + (positionPercentage * (canvasHeight - rocketHeight - 50) / 100);
        
        rocketElement.style.bottom = `${newBottom}px`;
        
        // Обновляем шлейф ракеты
        updateRocketTrail(newBottom);
    }

    function updateRocketTrail(rocketBottom) {
        const trailElement = document.getElementById('rocketTrail');
        const canvasHeight = document.getElementById('rocketCanvas').offsetHeight;
        
        trailElement.style.height = `${rocketBottom - 90}px`;
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
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = player.username;
            
            const playerBet = document.createElement('span');
            playerBet.className = 'player-bet';
            playerBet.textContent = `${player.betAmount} TON`;
            
            playerItem.appendChild(playerName);
            playerItem.appendChild(playerBet);
            playersList.appendChild(playerItem);
        });
    }

    function updateHistory(history) {
        const historyContainer = document.getElementById('historyItems');
        historyContainer.innerHTML = '';
        
        history.slice(-10).forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = item.crashed ? 'history-item history-loss' : 'history-item history-win';
            historyItem.textContent = item.crashed ? `${item.multiplier.toFixed(2)}x` : 'Вылет';
            historyContainer.appendChild(historyItem);
        });
    }

    function resetBettingUI() {
        document.getElementById('placeBetButton').disabled = false;
        document.getElementById('cashoutButton').disabled = true;
        document.getElementById('userBet').textContent = '0';
        document.getElementById('potentialWin').textContent = '0';
        
        userBet = 0;
        userCashedOut = false;
        userPlayer = null;
    }

    function updateBettingUI() {
        document.getElementById('placeBetButton').disabled = rocketGame.status !== 'counting';
        
        if (userPlayer) {
            document.getElementById('cashoutButton').disabled = rocketGame.status !== 'flying' || userCashedOut;
            document.getElementById('userBet').textContent = userPlayer.betAmount.toFixed(2);
            
            if (rocketGame.status === 'flying') {
                const potentialWin = userPlayer.betAmount * rocketGame.multiplier;
                document.getElementById('potentialWin').textContent = potentialWin.toFixed(2);
            }
        }
    }

    async function placeBet() {
        const betAmount = parseFloat(document.getElementById('betAmount').value);
        
        if (isNaN(betAmount) || betAmount <= 0) {
            alert('Введите корректную сумму ставки');
            return;
        }
        
        try {
            const response = await fetch('/api/rocket/bet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    betAmount: betAmount,
                    isDemo: isDemoMode
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    userBet = betAmount;
                    userPlayer = {
                        id: currentUser.id,
                        username: currentUser.username,
                        betAmount: betAmount
                    };
                    
                    document.getElementById('placeBetButton').disabled = true;
                    document.getElementById('cashoutButton').disabled = false;
                    document.getElementById('userBet').textContent = betAmount.toFixed(2);
                    
                    // Обновляем баланс
                    document.getElementById('balance').textContent = result.newBalance.toFixed(2);
                } else {
                    alert(result.message || 'Ошибка при размещении ставки');
                }
            } else {
                alert('Ошибка соединения с сервером');
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            alert('Ошибка при размещении ставки');
        }
    }

    async function cashout() {
        if (userCashedOut || !userPlayer) {
            return;
        }
        
        try {
            const response = await fetch('/api/rocket/cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    isDemo: isDemoMode,
                    multiplier: rocketGame.multiplier
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    userCashedOut = true;
                    document.getElementById('cashoutButton').disabled = true;
                    
                    // Обновляем баланс
                    document.getElementById('balance').textContent = result.newBalance.toFixed(2);
                    
                    alert(`Вы успешно забрали ${result.winAmount.toFixed(2)} TON!`);
                } else {
                    alert(result.message || 'Ошибка при выводе средств');
                }
            } else {
                alert('Ошибка соединения с сервером');
            }
        } catch (error) {
            console.error('Error cashing out:', error);
            alert('Ошибка при выводе средств');
        }
    }

    // Инициализация игры (заглушка для демонстрации)
    let rocketGame = {
        status: 'waiting',
        multiplier: 1.0,
        players: [],
        history: []
    };