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
        createMultiplierMarkers();
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

    function createMultiplierMarkers() {
        const markersContainer = document.getElementById('multiplierMarkers');
        markersContainer.innerHTML = '';
        
        // Создаем маркеры множителей от 1x до 20x
        const multipliers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20];
        
        multipliers.forEach(multiplier => {
            const marker = document.createElement('div');
            marker.className = 'multiplier-marker';
            marker.textContent = multiplier + 'x';
            marker.id = `marker-${multiplier}`;
            markersContainer.appendChild(marker);
        });
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
                hideMultiplierLine();
                resetRocketPosition();
                break;
                
            case 'counting':
                statusElement.textContent = 'Прием ставок: ';
                startCountdown(gameState.endBetTime);
                updateBettingUI();
                hideMultiplierLine();
                resetRocketPosition();
                break;
                
            case 'flying':
                statusElement.textContent = 'Ракета взлетает!';
                countdownElement.textContent = '';
                clearCountdown();
                updateRocketPosition(gameState.multiplier);
                updateMultiplierLine(gameState.multiplier);
                break;
                
            case 'crashed':
                statusElement.textContent = `Ракета взорвалась на ${gameState.crashPoint.toFixed(2)}x!`;
                countdownElement.textContent = '';
                clearCountdown();
                showExplosion();
                hideMultiplierLine();
                break;
        }
        
        // Обновляем множитель
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
        
        // Обновляем список игроков
        updatePlayersList(gameState.players);
        
        // Обновляем историю
        updateHistory(gameState.history);
        
        // Обновляем потенциальный выигрыш
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

    function resetRocketPosition() {
        const rocketElement = document.getElementById('rocket');
        rocketElement.style.bottom = '50px';
    }

    function updateRocketPosition(multiplier) {
        const rocketElement = document.getElementById('rocket');
        const canvasHeight = 600; // Новая высота canvas
        
        // Вычисляем новую позицию ракеты (от 50px до 550px)
        const maxMultiplier = 20;
        const normalizedMultiplier = Math.min(multiplier, maxMultiplier);
        const positionPercentage = (normalizedMultiplier - 1) / (maxMultiplier - 1);
        const newPosition = 50 + (positionPercentage * 500);
        
        rocketElement.style.bottom = `${newPosition}px`;
    }

    function updateMultiplierLine(multiplier) {
        const lineElement = document.getElementById('currentMultiplierLine');
        const canvasHeight = 600;
        
        // Показываем линию
        lineElement.style.display = 'block';
        
        // Вычисляем позицию линии
        const maxMultiplier = 20;
        const normalizedMultiplier = Math.min(multiplier, maxMultiplier);
        const positionPercentage = (normalizedMultiplier - 1) / (maxMultiplier - 1);
        const linePosition = 50 + (positionPercentage * 500);
        
        lineElement.style.top = `${canvasHeight - linePosition}px`;
        
        // Обновляем активные маркеры
        updateActiveMarkers(multiplier);
    }

    function updateActiveMarkers(multiplier) {
        // Сбрасываем все маркеры
        document.querySelectorAll('.multiplier-marker').forEach(marker => {
            marker.classList.remove('active');
        });
        
        // Активируем маркеры, которые меньше текущего множителя
        document.querySelectorAll('.multiplier-marker').forEach(marker => {
            const markerValue = parseFloat(marker.textContent);
            if (markerValue <= multiplier) {
                marker.classList.add('active');
            }
        });
    }

    function hideMultiplierLine() {
        document.getElementById('currentMultiplierLine').style.display = 'none';
        
        // Сбрасываем активные маркеры
        document.querySelectorAll('.multiplier-marker').forEach(marker => {
            marker.classList.remove('active');
        });
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

    function updateBettingUI() {
        const betButton = document.getElementById('placeBetButton');
        const cashoutButton = document.getElementById('cashoutButton');
        
        if (rocketGame && rocketGame.status === 'counting') {
            betButton.disabled = false;
            cashoutButton.disabled = true;
        } else if (rocketGame && rocketGame.status === 'flying' && userBet > 0 && !userCashedOut) {
            betButton.disabled = true;
            cashoutButton.disabled = false;
        } else {
            betButton.disabled = true;
            cashoutButton.disabled = true;
        }
    }

    function resetBettingUI() {
        userBet = 0;
        userCashedOut = false;
        document.getElementById('userBet').textContent = '0';
        document.getElementById('potentialWin').textContent = '0';
        document.getElementById('betAmount').value = '1.0';
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
            playerName.textContent = player.isBot ? `🤖 ${player.username}` : player.username;
            
            const playerBet = document.createElement('span');
            playerBet.className = 'player-bet';
            
            if (player.cashedOut) {
                playerBet.textContent = `+${player.winAmount.toFixed(2)} TON (${player.cashoutMultiplier.toFixed(2)}x)`;
            } else if (rocketGame.status === 'crashed') {
                playerBet.textContent = `-${player.betAmount.toFixed(2)} TON`;
            } else {
                playerBet.textContent = `${player.betAmount.toFixed(2)} TON`;
            }
            
            playerItem.appendChild(playerName);
            playerItem.appendChild(playerBet);
            playersList.appendChild(playerItem);
        });
    }

    function updateHistory(history) {
        const historyContainer = document.getElementById('historyItems');
        historyContainer.innerHTML = '';
        
        history.slice(-10).reverse().forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item ${item.crashed ? 'history-loss' : 'history-win'}`;
            historyItem.textContent = item.crashed ? `💥 ${item.multiplier.toFixed(2)}x` : `✓ ${item.multiplier.toFixed(2)}x`;
            historyContainer.appendChild(historyItem);
        });
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
                    'Content-Type': 'application/json',
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
                    loadUserData(); // Обновляем баланс
                } else {
                    alert(result.message || 'Ошибка при размещении ставки');
                }
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            alert('Ошибка при размещении ставки');
        }
    }

    async function cashout() {
        try {
            const response = await fetch('/api/rocket/cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: currentUser.id,
                    isDemo: isDemoMode
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    loadUserData(); // Обновляем баланс
                    document.getElementById('cashoutButton').disabled = true;
                } else {
                    alert(result.message || 'Ошибка при выводе средств');
                }
            }
        } catch (error) {
            console.error('Error cashing out:', error);
            alert('Ошибка при выводе средств');
        }
    }

    // Глобальная переменная для хранения состояния игры
    let rocketGame = null;