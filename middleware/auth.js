function isAdmin(req, res, next) {
    const telegramId = parseInt(req.params.telegramId || req.body.telegramId);
    
    if (telegramId !== parseInt(process.env.OWNER_TELEGRAM_ID)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    next();
}

function isOwner(telegramId) {
    return parseInt(telegramId) === parseInt(process.env.OWNER_TELEGRAM_ID);
}

module.exports = {
    isAdmin,
    isOwner
};