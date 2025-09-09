// Управление модальными окнами
function openDepositModal() {
    document.getElementById('deposit-modal').style.display = 'block';
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-amount').focus();
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
}

function openWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'block';
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-address').value = '';
    document.getElementById('withdraw-amount').focus();
}

function closeWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'none';
}

// Закрытие модальных окон при клике вне их
window.onclick = function(event) {
    const depositModal = document.getElementById('deposit-modal');
    const withdrawModal = document.getElementById('withdraw-modal');
    
    if (event.target === depositModal) {
        closeDepositModal();
    }
    if (event.target === withdrawModal) {
        closeWithdrawModal();
    }
}