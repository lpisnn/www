(function () {
    'use strict';

    const STORAGE_KEY = 'localFlipLedger.v1';
    const $ = id => document.getElementById(id);
    let flips = [];
    let activeUserKey = '';
    let busy = false;

    function accountKey(token) {
        // Account separation only; this hash is not encryption and never contains the token itself.
        let hash = 2166136261;
        for (let i = 0; i < token.length; i += 1) {
            hash ^= token.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `pocket-${(hash >>> 0).toString(36)}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function getStore() {
        const cache = window.desktop?.appCache;
        const value = cache?.getCacheValueSync(STORAGE_KEY, { accounts: {} });
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : { accounts: {} };
    }

    function getTransactions() {
        const store = getStore();
        const items = store.accounts?.[activeUserKey];
        return Array.isArray(items) ? items : [];
    }

    function saveTransactions(items) {
        const store = getStore();
        store.accounts = store.accounts && typeof store.accounts === 'object' ? store.accounts : {};
        store.accounts[activeUserKey] = items;
        window.desktop.appCache.setCacheValueSync(STORAGE_KEY, store);
    }

    function money(value) {
        return Number(value || 0).toLocaleString('zh-CN');
    }

    function setStatus(message, isError = false) {
        const status = $('local-ledger-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#cf222e' : 'var(--text-sub, #667085)';
    }

    function ensureModal() {
        if ($('local-flip-ledger-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'local-flip-ledger-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.48);align-items:center;justify-content:center;padding:16px;';
        modal.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="local-ledger-title" style="width:min(920px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--text,#222);border-radius:14px;padding:20px;box-shadow:0 12px 45px #0003">
            <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">
              <div><h2 id="local-ledger-title" style="margin:0">翻牌与鸡腿本地账本</h2><p style="margin:4px 0 0;color:var(--text-sub,#667085);font-size:12px">账本保存于本机，不会随翻牌同步上传。</p></div>
              <button type="button" class="btn btn-secondary" id="local-ledger-close">关闭</button>
            </header>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
              <button type="button" class="btn btn-primary" id="local-ledger-sync">读取我的翻牌历史</button>
              <button type="button" class="btn btn-secondary" id="local-ledger-export">导出账本 JSON</button>
              <label class="btn btn-secondary" style="cursor:pointer">导入账本 JSON<input id="local-ledger-import" type="file" accept="application/json,.json" hidden></label>
            </div>
            <p id="local-ledger-status" role="status" style="font-size:12px">翻牌历史只在点击读取时向口袋48请求；本地账本操作不会请求网络。</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0">
              <div class="Box-row"><small>读取到的翻牌条数</small><div id="local-ledger-flip-count" style="font-size:22px;font-weight:bold">0</div></div>
              <div class="Box-row"><small>翻牌鸡腿消耗</small><div id="local-ledger-flip-cost" style="font-size:22px;font-weight:bold">0</div></div>
              <div class="Box-row"><small>手动获得</small><div id="local-ledger-gain" style="font-size:22px;font-weight:bold">0</div></div>
              <div class="Box-row"><small>手动消耗</small><div id="local-ledger-spend" style="font-size:22px;font-weight:bold">0</div></div>
              <div class="Box-row"><small>手动净额</small><div id="local-ledger-net" style="font-size:22px;font-weight:bold">0</div></div>
            </div>
            <form id="local-ledger-form" class="Box-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;align-items:end">
              <label>日期<input id="local-ledger-date" type="date" required style="display:block;width:100%"></label>
              <label>收支类型<select id="local-ledger-type" style="display:block;width:100%"><option value="gain">获得鸡腿</option><option value="spend">其他消耗</option></select></label>
              <label>数量<input id="local-ledger-amount" type="number" min="1" step="1" required style="display:block;width:100%"></label>
              <label>成员/��源<input id="local-ledger-member" type="text" maxlength="80" style="display:block;width:100%"></label>
              <label style="grid-column:span 2">备注<input id="local-ledger-note" type="text" maxlength="300" style="display:block;width:100%"></label>
              <button type="submit" class="btn btn-primary">记一笔</button>
            </form>
            <h3 style="margin:18px 0 8px">手动收支记录</h3>
            <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:560px"><thead><tr><th>日期</th><th>类型</th><th>数量</th><th>成员/来源</th><th>备注</th><th>操作</th></tr></thead><tbody id="local-ledger-rows"></tbody></table></div>
            <p style="font-size:11px;color:var(--text-sub,#667085);margin:12px 0 0">隐私提示：数据写入本机 Electron 用户数据缓存，不上传；本地缓存未加密，账号隔离使用 Token 的非加密哈希���识。不要在共享设备使用。读取翻牌时，口袋48会收到该 API 请求及相应账号凭据。</p>
          </section>`;
        document.body.appendChild(modal);
        $('local-ledger-close').addEventListener('click', closeModal);
        modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
        $('local-ledger-sync').addEventListener('click', syncFlipHistory);
        $('local-ledger-form').addEventListener('submit', addTransaction);
        $('local-ledger-rows').addEventListener('click', deleteTransaction);
        $('local-ledger-export').addEventListener('click', exportLedger);
        $('local-ledger-import').addEventListener('change', importLedger);
    }

    function openModal() {
        if (!window.desktop || window.desktop.platform === 'web') {
            alert('本地账本仅在桌面软件中可用。');
            return;
        }
        const token = String(window.getAppToken?.() || window.desktop.appSettings?.getTokenSync?.() || '').trim();
        if (!token) {
            alert('请先在桌面软件的“账号设置”登录。');
            return;
        }
        activeUserKey = accountKey(token);
        flips = [];
        ensureModal();
        $('local-ledger-date').value = new Date().toISOString().slice(0, 10);
        $('local-flip-ledger-modal').style.display = 'flex';
        render();
    }

    function closeModal() {
        const modal = $('local-flip-ledger-modal');
        if (modal) modal.style.display = 'none';
        flips = [];
    }

    async function syncFlipHistory() {
        if (busy) return;
        const token = String(window.getAppToken?.() || window.desktop?.appSettings?.getTokenSync?.() || '').trim();
        if (!token) { setStatus('请先登录账号。', true); return; }
        const currentKey = accountKey(token);
        if (activeUserKey && activeUserKey !== currentKey) {
            setStatus('当前账号已切换，请关闭并重新打开本地账本。', true);
            return;
        }
        activeUserKey = currentKey;
        busy = true;
        const button = $('local-ledger-sync');
        button.disabled = true;
        setStatus('正在向口袋48读取当前账号翻牌历史；不会把记录发送到本地账本服务器。');
        const all = [];
        let offset = 0;
        try {
            for (let page = 0; page < 500; page += 1) {
                const result = await window.ipcRenderer.invoke('fetch-flip-list', {
                    token,
                    pa: window.getPA?.() || '',
                    beginLimit: offset,
                    limit: 20
                });
                if (!result?.success) throw new Error(result?.msg || '读取翻牌历史失败');
                const list = Array.isArray(result.content) ? result.content : [];
                if (!list.length) break;
                all.push(...list);
                offset += list.length;
                if (list.length < 20) break;
                await new Promise(resolve => setTimeout(resolve, 120));
            }
            flips = all;
            setStatus(`读取完成：${all.length} 条。该列表仅在内存中用于统计，不写入本地账本。`);
            render();
        } catch (error) {
            setStatus(`读取失败：${error.message || error}`, true);
        } finally {
            busy = false;
            button.disabled = false;
        }
    }

    function render() {
        const transactions = getTransactions();
        const gain = transactions.filter(item => item.type === 'gain').reduce((n, item) => n + item.amount, 0);
        const spend = transactions.filter(item => item.type === 'spend').reduce((n, item) => n + item.amount, 0);
        const flipCost = flips.reduce((n, item) => n + (Number(item.cost) || 0), 0);
        $('local-ledger-flip-count').textContent = money(flips.length);
        $('local-ledger-flip-cost').textContent = money(flipCost);
        $('local-ledger-gain').textContent = money(gain);
        $('local-ledger-spend').textContent = money(spend);
        $('local-ledger-net').textContent = money(gain - spend);
        const sorted = [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        $('local-ledger-rows').innerHTML = sorted.length ? sorted.map(item => `<tr>
          <td>${escapeHtml(item.date)}</td><td>${item.type === 'gain' ? '获得' : '消耗'}</td>
          <td>${item.type === 'gain' ? '+' : '−'}${money(item.amount)}</td>
          <td>${escapeHtml(item.member || '—')}</td><td>${escapeHtml(item.note || '—')}</td>
          <td><button class="btn btn-secondary" type="button" data-delete-ledger="${escapeHtml(item.id)}">删除</button></td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-sub,#667085)">暂无手动收支记录</td></tr>';
    }

    function addTransaction(event) {
        event.preventDefault();
        const amount = Number($('local-ledger-amount').value);
        if (!Number.isSafeInteger(amount) || amount <= 0) { setStatus('数量请输入大于 0 的整数。', true); return; }
        const items = getTransactions();
        items.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            date: $('local-ledger-date').value,
            type: $('local-ledger-type').value === 'spend' ? 'spend' : 'gain',
            amount,
            member: $('local-ledger-member').value.trim(),
            note: $('local-ledger-note').value.trim(),
            createdAt: new Date().toISOString()
        });
        saveTransactions(items);
        $('local-ledger-form').reset();
        $('local-ledger-date').value = new Date().toISOString().slice(0, 10);
        setStatus('已保存在本机。');
        render();
    }

    function deleteTransaction(event) {
        const button = event.target.closest('[data-delete-ledger]');
        if (!button || !confirm('确定删除这条本地记录吗？')) return;
        saveTransactions(getTransactions().filter(item => item.id !== button.dataset.deleteLedger));
        render();
    }

    function exportLedger() {
        const payload = { version: 1, transactions: getTransactions() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `鸡腿本地账本-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importLedger(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (!Array.isArray(parsed.transactions)) throw new Error('缺少 transactions 列表');
            const transactions = parsed.transactions.map(item => {
                const amount = Number(item.amount);
                if (!Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) {
                    throw new Error('记录字段不合法');
                }
                return {
                    id: String(item.id || `${Date.now()}-${Math.random()}`),
                    date: String(item.date),
                    type: item.type === 'spend' ? 'spend' : 'gain',
                    amount,
                    member: String(item.member || '').slice(0, 80),
                    note: String(item.note || '').slice(0, 300),
                    createdAt: String(item.createdAt || new Date().toISOString())
                };
            });
            if (!confirm('导入将替换当前账号的本地收支记录，继续吗？')) return;
            saveTransactions(transactions);
            render();
            setStatus('账本已从本机文件导入。');
        } catch (error) {
            setStatus(`导入失败：${error.message || error}`, true);
        } finally {
            event.target.value = '';
        }
    }

    function addOpenButton() {
        const flipView = $('view-flip');
        if (!flipView || $('open-local-flip-ledger')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'open-local-flip-ledger';
        button.className = 'btn btn-secondary';
        button.textContent = '本地鸡腿账本';
        button.style.cssText = 'position:sticky;top:8px;z-index:20;margin:8px 0 12px 8px';
        button.addEventListener('click', openModal);
        flipView.prepend(button);
    }

    function boot() {
        addOpenButton();
        const observer = new MutationObserver(addOpenButton);
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && $('local-flip-ledger-modal')?.style.display === 'flex') closeModal();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
