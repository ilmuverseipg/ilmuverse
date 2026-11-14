// Klien Telegram ringkas guna fetch (tiada pakej tambahan).
// - Di Render: guna WEBHOOK (Telegram hantar update ke server, juga
//   "mengejutkan" server yang sedang tidur).
// - Di laptop (tiada URL awam): guna POLLING (getUpdates).
const crypto = require('crypto');

function klien(token) {
  async function call(method, params = {}) {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || `Telegram ${method} gagal`);
    return j.result;
  }
  const rahsia = crypto.createHash('sha256').update('prebook:' + token).digest('hex').slice(0, 40);
  return { call, rahsia };
}

function mulaPolling(tg, onUpdate, label) {
  let offset = 0;
  let henti = false;
  (async function gelung() {
    try {
      await tg.call('deleteWebhook');
    } catch {}
    while (!henti) {
      try {
        const updates = await tg.call('getUpdates', { offset, timeout: 50 });
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            await onUpdate(u);
          } catch (e) {
            console.error(`[PREBOOK ${label}] update:`, e.message);
          }
        }
      } catch (e) {
        console.error(`[PREBOOK ${label}] polling:`, e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  return () => (henti = true);
}

module.exports = { klien, mulaPolling };
