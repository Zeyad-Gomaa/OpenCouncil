export function registerActivityRoutes(app, db) {
    app.get('/api/v1/activity/stats', async (req) => {
        const { days } = req.query;
        const nDays = Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365);
        const totals = db
            .prepare(`SELECT
           (SELECT COUNT(*) FROM sessions) AS sessions,
           (SELECT COUNT(*) FROM messages WHERE kind IN ('discussion','synthesis')) AS messages,
           COALESCE(SUM(CASE WHEN status='ok' THEN prompt_tokens END),0) AS promptTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN completion_tokens END),0) AS completionTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN total_tokens END),0) AS totalTokens,
           COALESCE(SUM(cost_usd),0) AS costUsd,
           SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
         FROM usage_events`)
            .get();
        const daily = db
            .prepare(`SELECT substr(created_at, 1, 10) AS day,
                COALESCE(SUM(total_tokens), 0) AS tokens,
                COALESCE(SUM(cost_usd), 0) AS costUsd
         FROM usage_events
         WHERE created_at >= datetime('now', ?)
         GROUP BY day ORDER BY day`)
            .all(`-${nDays} days`);
        function grouped(column) {
            return db
                .prepare(`SELECT COALESCE(${column}, 'unknown') AS name,
                  COALESCE(SUM(total_tokens), 0) AS tokens,
                  COUNT(*) AS messages,
                  COALESCE(SUM(cost_usd), 0) AS costUsd
           FROM usage_events WHERE status = 'ok'
           GROUP BY name ORDER BY tokens DESC LIMIT 20`)
                .all();
        }
        const recentLog = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 100').all();
        const stats = {
            totals: { ...totals, costUsd: Number(totals.costUsd.toFixed(4)) },
            daily,
            byMember: grouped('member_name'),
            byModel: grouped('model_name'),
            byProvider: grouped('provider_name'),
        };
        return { ...stats, recentLog };
    });
}
//# sourceMappingURL=activity.js.map