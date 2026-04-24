import { escapeHtml } from './ui.js';

export function createNotificationsModule(ctx) {
  const { state } = ctx;

  let filters = {
    category: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  };

  const READ_ALERTS_KEY = 'gestao-read-alerts-v1';

  function getReadKeys() {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_ALERTS_KEY) || '[]'));
    } catch (error) {
      return new Set();
    }
  }

  function saveReadKeys(keys) {
    localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...keys]));
  }

  function normalizeDateKey(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
      return value.slice(0, 10);
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    return '';
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isOverdue(dateValue) {
    const key = normalizeDateKey(dateValue);
    return key && key < todayKey();
  }

  function isDueToday(dateValue) {
    const key = normalizeDateKey(dateValue);
    return key && key === todayKey();
  }

  function isRead(alert) {
    return getReadKeys().has(alert.sourceKey);
  }

  function getCalculatedAlerts() {
    const alerts = [];
    const lowStockThreshold = Number(state.settings?.lowStockThreshold || 5);

    (state.products || []).forEach((item) => {
      if (item.deleted === true || item.status === 'inativo') return;

      const quantity = Number(item.quantity || 0);

      if (quantity <= lowStockThreshold) {
        alerts.push({
          sourceKey: `low_stock_${item.id}_${quantity}`,
          category: 'estoque',
          type: 'low_stock',
          title: 'Estoque baixo',
          message: `${item.name || 'Produto'} com estoque em ${quantity}.`,
          eventDate: normalizeDateKey(item.updatedAt || item.createdAt),
          createdAt: item.updatedAt || item.createdAt || new Date()
        });
      }
    });

    (state.deliveries || []).forEach((item) => {
      if (item.deleted === true) return;

      const status = String(item.status || '').toLowerCase();

      if (status.includes('pendente')) {
        alerts.push({
          sourceKey: `delivery_pending_${item.id}_${item.status || ''}`,
          category: 'tele_entrega',
          type: 'delivery_pending',
          title: 'Tele-entrega pendente',
          message: `Entrega de ${item.customerName || 'cliente'} aguardando ação.`,
          eventDate: normalizeDateKey(item.scheduledAt),
          createdAt: item.scheduledAt || item.createdAt || new Date()
        });
      }
    });

    (state.accountsReceivable || []).forEach((item) => {
      if (item.deleted === true || Number(item.openAmount || 0) <= 0 || !item.dueDate) return;

      if (isOverdue(item.dueDate) || isDueToday(item.dueDate)) {
        alerts.push({
          sourceKey: `receivable_due_${item.id}_${item.dueDate}`,
          category: 'contas',
          type: 'receivable_due',
          title: isOverdue(item.dueDate) ? 'Conta a receber vencida' : 'Conta a receber vence hoje',
          message: `${item.clientName || 'Cliente'} · vencimento ${item.dueDate}.`,
          eventDate: item.dueDate,
          createdAt: item.dueDate
        });
      }
    });

    (state.accountsPayable || []).forEach((item) => {
      if (item.deleted === true || Number(item.openAmount || 0) <= 0 || !item.dueDate) return;

      if (isOverdue(item.dueDate) || isDueToday(item.dueDate)) {
        alerts.push({
          sourceKey: `payable_due_${item.id}_${item.dueDate}`,
          category: 'contas',
          type: 'payable_due',
          title: isOverdue(item.dueDate) ? 'Conta a pagar vencida' : 'Conta a pagar vence hoje',
          message: `${item.supplierName || 'Fornecedor'} · vencimento ${item.dueDate}.`,
          eventDate: item.dueDate,
          createdAt: item.dueDate
        });
      }
    });

    return alerts.sort((a, b) => {
      const aRead = isRead(a) ? 1 : 0;
      const bRead = isRead(b) ? 1 : 0;

      if (aRead !== bRead) return aRead - bRead;

      return String(b.eventDate || '').localeCompare(String(a.eventDate || ''));
    });
  }

  function getUnreadAlerts() {
    return getCalculatedAlerts().filter((alert) => !isRead(alert));
  }

  function getFilteredAlerts() {
    return getCalculatedAlerts().filter((alert) => {
      const createdKey = normalizeDateKey(alert.createdAt || alert.eventDate);
      const rowStatus = isRead(alert) ? 'read' : 'unread';

      return (!filters.category || String(alert.category || '') === filters.category)
        && (!filters.status || rowStatus === filters.status)
        && (!filters.dateFrom || !createdKey || createdKey >= filters.dateFrom)
        && (!filters.dateTo || !createdKey || createdKey <= filters.dateTo);
    });
  }

  function markAsRead(sourceKey) {
    const keys = getReadKeys();
    keys.add(sourceKey);
    saveReadKeys(keys);
    updateBellBadge();
  }

  function markAllAsRead() {
    const keys = getReadKeys();

    getCalculatedAlerts().forEach((alert) => {
      keys.add(alert.sourceKey);
    });

    saveReadKeys(keys);
    updateBellBadge();
  }

  function updateBellBadge() {
    const badge = document.getElementById('notifications-badge');
    if (!badge) return;

    badge.textContent = String(getUnreadAlerts().length);
  }

  function formatNotificationDate(value) {
    if (!value) return '-';

    if (value?.toDate && typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('pt-BR');
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('pt-BR');
    }

    return String(value);
  }

  function renderList(rows) {
    if (!rows.length) {
      return `
        <div class="empty-state">
          <strong>Sem alertas</strong>
          <span>Nenhum alerta encontrado para os filtros aplicados.</span>
        </div>
      `;
    }

    return `
      <div class="stack-list">
        ${rows.map((item) => `
          <div class="list-item notification-row ${isRead(item) ? 'is-read' : 'is-unread'}">
            <div class="notification-row-top">
              <strong>${escapeHtml(item.title || '-')}</strong>
              <span class="tag ${isRead(item) ? 'info' : 'warning'}">${isRead(item) ? 'Lido' : 'Novo'}</span>
            </div>

            <span>${escapeHtml(item.message || '-')}</span>
            <span>${escapeHtml(item.category || '-')} · ${escapeHtml(formatNotificationDate(item.eventDate || item.createdAt))}</span>

            <div class="form-actions">
              ${isRead(item) ? '' : `<button class="btn btn-secondary" type="button" data-alert-read="${escapeHtml(item.sourceKey)}">Marcar como lido</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function openNotificationsModal() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const rows = getFilteredAlerts();

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="notifications-modal-backdrop">
        <div class="modal-card notifications-modal-card">
          <div class="section-header">
            <h2>Alertas</h2>

            <div class="form-actions">
              <button class="btn btn-secondary" type="button" id="notifications-mark-all-btn">Marcar todos como lidos</button>
              <button class="btn btn-secondary" type="button" id="notifications-close-btn">Fechar</button>
            </div>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <select id="notifications-filter-category">
              <option value="">Todas as categorias</option>
              <option value="tele_entrega" ${filters.category === 'tele_entrega' ? 'selected' : ''}>Tele-entrega</option>
              <option value="estoque" ${filters.category === 'estoque' ? 'selected' : ''}>Estoque</option>
              <option value="contas" ${filters.category === 'contas' ? 'selected' : ''}>Contas</option>
            </select>

            <select id="notifications-filter-status">
              <option value="">Todos</option>
              <option value="unread" ${filters.status === 'unread' ? 'selected' : ''}>Novos</option>
              <option value="read" ${filters.status === 'read' ? 'selected' : ''}>Lidos</option>
            </select>

            <input id="notifications-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="notifications-filter-date-to" type="date" value="${filters.dateTo}" />

            <button class="btn btn-secondary" type="button" id="notifications-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="notifications-filter-clear">Limpar</button>
          </div>

          <div class="settings-audit-scroll">
            ${renderList(rows)}
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#notifications-close-btn')?.addEventListener('click', closeModal);

    modalRoot.querySelector('#notifications-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'notifications-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#notifications-mark-all-btn')?.addEventListener('click', () => {
      markAllAsRead();
      openNotificationsModal();
    });

    modalRoot.querySelector('#notifications-filter-apply')?.addEventListener('click', () => {
      filters.category = modalRoot.querySelector('#notifications-filter-category')?.value || '';
      filters.status = modalRoot.querySelector('#notifications-filter-status')?.value || '';
      filters.dateFrom = modalRoot.querySelector('#notifications-filter-date-from')?.value || '';
      filters.dateTo = modalRoot.querySelector('#notifications-filter-date-to')?.value || '';

      openNotificationsModal();
    });

    modalRoot.querySelector('#notifications-filter-clear')?.addEventListener('click', () => {
      filters = {
        category: '',
        status: '',
        dateFrom: '',
        dateTo: ''
      };

      openNotificationsModal();
    });

    modalRoot.querySelectorAll('[data-alert-read]').forEach((btn) => {
      btn.addEventListener('click', () => {
        markAsRead(btn.dataset.alertRead);
        openNotificationsModal();
      });
    });
  }

  function bindBell() {
    const bellBtn = document.getElementById('notifications-bell-btn');
    if (!bellBtn || bellBtn.dataset.bound === 'true') return;

    bellBtn.dataset.bound = 'true';

    bellBtn.addEventListener('click', () => {
      openNotificationsModal();
    });
  }

  async function generateSystemNotifications() {
    updateBellBadge();
  }

  return {
    bindBell,
    updateBellBadge,
    openNotificationsModal,
    generateSystemNotifications
  };
}
