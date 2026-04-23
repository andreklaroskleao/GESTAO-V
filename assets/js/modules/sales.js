import { escapeHtml, showToast, bindAsyncButton } from './ui.js';

export function createSalesModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    tabEls,
    currency,
    toNumber,
    formatDateTime,
    paymentMethods,
    clientsModule,
    printModule,
    auditModule
  } = ctx;

  const UNIDENTIFIED_CUSTOMER = 'Cliente não identificado';

  let saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
  let keyboardBound = false;
  let isFinishingSale = false;
  let searchTerm = '';

  function focusSearchInput() {
    const input = tabEls.sales?.querySelector('#sale-product-search');
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function getActiveProducts() {
    return (state.products || []).filter(
      (item) => item.deleted !== true && item.status !== 'inativo'
    );
  }

  function getProductById(productId) {
    return getActiveProducts().find((item) => item.id === productId) || null;
  }

  function getProductByBarcode(barcode) {
    const value = String(barcode || '').trim();
    if (!value) return null;
    return (
      getActiveProducts().find((item) => String(item.barcode || '').trim() === value) || null
    );
  }

  function getAvailableStock(productId) {
    const product = getProductById(productId);
    return Number(product?.quantity || 0);
  }

  function getCartRow(productId) {
    return (state.cart || []).find((item) => item.id === productId) || null;
  }

  function clearCartWithFeedback() {
    state.cart = [];
    render();
    showToast('Carrinho limpo.', 'info');
  }

  function calculateCartTotal() {
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const paidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');

    const subtotal = (state.cart || []).reduce((sum, item) => {
      return sum + Number(item.salePrice || 0) * Number(item.quantity || 0);
    }, 0);

    const discount = toNumber(discountInput?.value || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(paidInput?.value || 0);
    const change = Math.max(0, amountPaid - total);

    return { subtotal, discount, total, amountPaid, change };
  }

  function updateSaleSummary() {
    const { subtotal, discount, total, change } = calculateCartTotal();

    tabEls.sales.querySelector('#sale-subtotal').textContent = currency(subtotal);
    tabEls.sales.querySelector('#sale-discount-view').textContent = currency(discount);
    tabEls.sales.querySelector('#sale-total').textContent = currency(total);
    tabEls.sales.querySelector('#sale-change').textContent = currency(change);
    tabEls.sales.querySelector('#sale-items-count').textContent = String((state.cart || []).length);
  }

  function normalizeCustomerName(value) {
    const name = String(value || '').trim();
    return name || UNIDENTIFIED_CUSTOMER;
  }

  function normalizeCustomerCpf(value) {
    return String(value || '').trim();
  }

  function getClientCpf(client) {
    return String(
      client?.cpf ||
      client?.document ||
      client?.documentNumber ||
      client?.taxId ||
      ''
    ).trim();
  }

  function normalizeSaleItemsForEdition(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      id: item.productId || item.id || '',
      productId: item.productId || item.id || '',
      name: item.name || '',
      salePrice: Number(item.unitPrice || item.salePrice || 0),
      quantity: Number(item.quantity || 0),
      barcode: item.barcode || ''
    })).filter((item) => item.id && item.quantity > 0);
  }

  function normalizeSaleForPrint(sale) {
    return {
      customerName: normalizeCustomerName(sale.customerName),
      customerCpf: normalizeCustomerCpf(sale.customerCpf),
      paymentMethod: sale.paymentMethod || '',
      createdAt: sale.createdAt || null,
      saleDateTimeLabel: sale.saleDateTimeLabel || formatDateTime(sale.createdAt),
      subtotal: Number(sale.subtotal || 0),
      discount: Number(sale.discount || 0),
      total: Number(sale.total || 0),
      amountPaid: Number(sale.amountPaid || 0),
      change: Number(sale.change || 0),
      notes: sale.notes || '',
      items: Array.isArray(sale.items)
        ? sale.items.map((item) => ({
            productId: item.productId || '',
            name: item.name || '',
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: Number(item.total || 0)
          }))
        : []
    };
  }

  function addProductToCart(productId) {
    const product = getProductById(productId);
    if (!product) return;

    const existing = getCartRow(productId);
    const currentQty = Number(existing?.quantity || 0);
    const stockQty = getAvailableStock(productId);

    if (currentQty + 1 > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        salePrice: Number(product.salePrice || 0),
        quantity: 1,
        barcode: product.barcode
      });
    }

    render();
    showToast('Produto adicionado à venda.', 'success');
  }

  function changeCartQuantity(productId, delta) {
    const row = getCartRow(productId);
    const stockQty = getAvailableStock(productId);
    if (!row) return;

    const nextQty = Number(row.quantity || 0) + Number(delta || 0);

    if (nextQty <= 0) {
      state.cart = (state.cart || []).filter((item) => item.id !== productId);
      render();
      return;
    }

    if (nextQty > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    row.quantity = nextQty;
    render();
  }

  function tryAddProductByBarcode(barcode, showWarning = true) {
    const product = getProductByBarcode(barcode);
    if (!product) {
      if (showWarning) showToast('Produto não cadastrado.', 'error');
      return false;
    }

    addProductToCart(product.id);

    const input = tabEls.sales.querySelector('#sale-product-search');
    if (input) {
      input.value = '';
      searchTerm = '';
      input.focus();
    }

    return true;
  }

  function renderSearchResults() {
    const resultsEl = tabEls.sales.querySelector('#sale-search-results');
    if (!resultsEl) return;

    const term = String(searchTerm || '').trim().toLowerCase();

    if (!term) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <strong>Pesquise um produto</strong>
          <span>Digite nome ou código de barras para listar resultados.</span>
        </div>
      `;
      return;
    }

    const results = getActiveProducts()
      .filter((product) =>
        [product.name, product.barcode, product.brand, product.supplier]
          .join(' ')
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);

    resultsEl.innerHTML =
      results
        .map(
          (product) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                <div class="muted">${escapeHtml(product.barcode || 'Sem código')} · Estoque: ${Number(product.quantity || 0)} · ${currency(product.salePrice || 0)}</div>
              </div>
              <button class="btn btn-secondary" type="button" data-add-product="${escapeHtml(product.id)}">Adicionar</button>
            </div>
          `
        )
        .join('') ||
      `
        <div class="empty-state">
          <strong>Nenhum produto encontrado</strong>
          <span>Refine sua pesquisa.</span>
        </div>
      `;

    resultsEl.querySelectorAll('[data-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => addProductToCart(btn.dataset.addProduct));
    });
  }

  function renderCart() {
    const cartEl = tabEls.sales.querySelector('#sale-cart-items');
    if (!cartEl) return;

    if (!(state.cart || []).length) {
      cartEl.innerHTML = `
        <div class="empty-state">
          <strong>Carrinho vazio</strong>
          <span>Pesquise um produto para adicionar.</span>
        </div>
      `;
      return;
    }

    cartEl.innerHTML = state.cart
      .map(
        (item) => `
          <div class="list-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <div class="muted">${currency(Number(item.salePrice || 0))}</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn btn-secondary" type="button" data-cart-decrease="${escapeHtml(item.id)}">−</button>
              <strong>${Number(item.quantity || 0)}</strong>
              <button class="btn btn-secondary" type="button" data-cart-increase="${escapeHtml(item.id)}">+</button>
              <button class="btn btn-danger" type="button" data-cart-remove="${escapeHtml(item.id)}">Remover</button>
            </div>
          </div>
        `
      )
      .join('');

    cartEl.querySelectorAll('[data-cart-decrease]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartDecrease, -1));
    });

    cartEl.querySelectorAll('[data-cart-increase]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartIncrease, 1));
    });

    cartEl.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cart = state.cart.filter((item) => item.id !== btn.dataset.cartRemove);
        render();
      });
    });
  }

  function buildItemMap(items = []) {
    const map = new Map();
    items.forEach((item) => {
      const key = String(item.productId || item.id || '').trim();
      if (!key) return;
      map.set(key, Number(item.quantity || 0));
    });
    return map;
  }

  function setLocalProductQuantity(productId, quantity) {
    const product = (state.products || []).find((item) => item.id === productId);
    if (product) {
      product.quantity = Number(quantity || 0);
    }
  }

  async function registerInventoryMovement({
    product,
    type,
    quantity,
    previousQuantity,
    newQuantity,
    reason,
    notes,
    saleId,
    saleLabel
  }) {
    if (!refs.inventoryMovements) return;

    await createDoc(refs.inventoryMovements, {
      productId: product.id,
      productName: product.name,
      type,
      quantity,
      previousQuantity,
      newQuantity,
      reason: reason || '',
      notes: notes || '',
      saleId: saleId || '',
      saleLabel: saleLabel || '',
      userId: state.currentUser?.uid || '',
      userName: state.currentUser?.fullName || '',
      createdAt: new Date()
    });
  }

  async function applyStockDelta({ productId, delta, reason, notes, saleId, saleLabel }) {
    const product = getProductById(productId);
    if (!product) {
      throw new Error('Produto não encontrado para ajustar estoque.');
    }

    const numericDelta = Number(delta || 0);
    if (!numericDelta) return;

    const previousQuantity = Number(product.quantity || 0);
    const newQuantity = previousQuantity + numericDelta;

    if (newQuantity < 0) {
      throw new Error(`Estoque insuficiente para o produto "${product.name}".`);
    }

    await updateByPath('products', productId, {
      quantity: newQuantity
    });

    setLocalProductQuantity(productId, newQuantity);

    await registerInventoryMovement({
      product,
      type: numericDelta >= 0 ? 'entrada' : 'saida',
      quantity: Math.abs(numericDelta),
      previousQuantity,
      newQuantity,
      reason,
      notes,
      saleId,
      saleLabel
    });
  }

  async function reconcileStockForSale({
    originalItems = [],
    nextItems = [],
    reason,
    saleId,
    saleLabel
  }) {
    const originalMap = buildItemMap(originalItems);
    const nextMap = buildItemMap(nextItems);
    const productIds = new Set([...originalMap.keys(), ...nextMap.keys()]);

    for (const productId of productIds) {
      const oldQty = Number(originalMap.get(productId) || 0);
      const newQty = Number(nextMap.get(productId) || 0);

      const stockDelta = oldQty - newQty;
      if (!stockDelta) continue;

      await applyStockDelta({
        productId,
        delta: stockDelta,
        reason,
        notes: `Venda ${saleId || ''}`.trim(),
        saleId,
        saleLabel
      });
    }
  }

  function validateStockForEditedItems(originalItems = [], nextItems = []) {
    const originalMap = buildItemMap(originalItems);

    for (const item of nextItems) {
      const product = getProductById(item.productId);
      if (!product) {
        throw new Error(`Produto "${item.name || item.productId}" não encontrado.`);
      }

      const available = Number(product.quantity || 0) + Number(originalMap.get(item.productId) || 0);
      const requested = Number(item.quantity || 0);

      if (requested <= 0) {
        throw new Error(`Quantidade inválida para "${product.name}".`);
      }

      if (requested > available) {
        throw new Error(`Estoque insuficiente para "${product.name}". Disponível para edição: ${available}.`);
      }
    }
  }

  function buildSaleItemsPayload(items = []) {
    return items.map((item) => ({
      productId: item.id || item.productId || '',
      name: item.name || '',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.salePrice || item.unitPrice || 0),
      total: Number(item.quantity || 0) * Number(item.salePrice || item.unitPrice || 0)
    }));
  }

  async function logSaleAudit({
    action,
    sale,
    reason,
    previousSale,
    nextSale
  }) {
    if (!auditModule?.log) return;

    const metadata = {
      reason: reason || '',
      saleId: sale?.id || '',
      customerName: sale?.customerName || '',
      total: Number(sale?.total || 0)
    };

    if (previousSale || nextSale) {
      metadata.previous = previousSale || null;
      metadata.next = nextSale || null;
    }

    await auditModule.log({
      module: 'sales',
      action,
      entityType: 'sale',
      entityId: sale?.id || '',
      entityLabel: sale?.customerName || sale?.id || 'Venda',
      description:
        action === 'delete'
          ? 'Venda excluída.'
          : action === 'update'
            ? 'Venda editada.'
            : 'Venda criada.',
      metadata
    });
  }

  function resetSaleForm() {
    state.cart = [];
    searchTerm = '';

    const searchInput = tabEls.sales.querySelector('#sale-product-search');
    if (searchInput) searchInput.value = '';

    const customerInput = tabEls.sales.querySelector('#sale-customer-name');
    const paymentInput = tabEls.sales.querySelector('#sale-payment-method');
    const discountInput = tabEls.sales.querySelector('input[name="discount"]');
    const amountPaidInput = tabEls.sales.querySelector('input[name="amountPaid"]');
    const notesInput = tabEls.sales.querySelector('textarea[name="notes"]');
    const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
    const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');

    if (customerInput) customerInput.value = '';
    if (paymentInput) paymentInput.value = paymentMethods?.[0] || 'Dinheiro';
    if (discountInput) discountInput.value = '0';
    if (amountPaidInput) amountPaidInput.value = '0';
    if (notesInput) notesInput.value = '';
    if (cpfCheck) cpfCheck.checked = false;
    if (cpfInput) cpfInput.value = '';

    render();
    focusSearchInput();
  }

  async function finishSale() {
    if (isFinishingSale) return;
    isFinishingSale = true;

    try {
      if (!(state.cart || []).length) {
        alert('Adicione pelo menos um produto à venda.');
        return;
      }

      const paymentMethod =
        tabEls.sales.querySelector('#sale-payment-method')?.value || 'Dinheiro';
      const notes = tabEls.sales.querySelector('textarea[name="notes"]')?.value || '';
      const customerNameRaw = tabEls.sales.querySelector('#sale-customer-name')?.value || '';
      const includeCpf = Boolean(tabEls.sales.querySelector('#sale-include-cpf')?.checked);
      const customerCpfRaw = tabEls.sales.querySelector('#sale-customer-cpf')?.value || '';

      const customerName = normalizeCustomerName(customerNameRaw);
      const customerCpf = includeCpf ? normalizeCustomerCpf(customerCpfRaw) : '';

      const { subtotal, discount, total, amountPaid, change } = calculateCartTotal();

      if (amountPaid < total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      const items = buildSaleItemsPayload(state.cart);

      const saleCreatedAt = new Date();
      const saleDateTimeLabel = saleCreatedAt.toLocaleString('pt-BR');

      const payload = {
        customerName,
        customerCpf,
        paymentMethod,
        subtotal,
        discount,
        total,
        amountPaid,
        change,
        notes,
        items,
        cashierName: state.currentUser?.fullName || '',
        deleted: false,
        createdAt: saleCreatedAt,
        saleDateTimeLabel,
        editCount: 0
      };

      const saleId = await createDoc(refs.sales, payload);

      await reconcileStockForSale({
        originalItems: [],
        nextItems: items,
        reason: 'Baixa por venda finalizada',
        saleId,
        saleLabel: customerName
      });

      await logSaleAudit({
        action: 'create',
        sale: { ...payload, id: saleId },
        reason: 'Venda finalizada'
      });

      printModule.printSaleReceipt({
        ...payload,
        id: saleId
      });

      resetSaleForm();
      showToast('Venda finalizada com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao finalizar venda.');
    } finally {
      isFinishingSale = false;
    }
  }

  function bindKeyboardShortcuts() {
    if (keyboardBound) return;
    keyboardBound = true;

    document.addEventListener('keydown', (event) => {
      if (!tabEls.sales?.classList.contains('active')) return;

      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput();
      }
    });
  }

  function openClientPicker({ onSelect } = {}) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-client-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Selecionar cliente</h2>
            <button class="btn btn-secondary" type="button" id="sale-client-modal-close">Fechar</button>
          </div>
          <div id="sale-client-picker-host"></div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-client-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-client-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-client-modal-backdrop') closeModal();
    });

    clientsModule.renderClientPicker?.({
      target: '#sale-client-picker-host',
      onSelect: (client) => {
        onSelect?.(client);
        closeModal();
      }
    });
  }

  function openReasonModal({
    title,
    confirmLabel = 'Confirmar',
    buttonClass = 'btn btn-primary',
    placeholder = 'Informe o motivo',
    onConfirm
  }) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-reason-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>${escapeHtml(title || 'Motivo')}</h2>
            <button class="btn btn-secondary" type="button" id="sale-reason-modal-close">Fechar</button>
          </div>
          <label>
            Motivo
            <textarea id="sale-reason-modal-text" rows="5" placeholder="${escapeHtml(placeholder)}"></textarea>
          </label>
          <div class="form-actions" style="margin-top:14px;">
            <button class="${escapeHtml(buttonClass)}" type="button" id="sale-reason-modal-confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-reason-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-reason-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-reason-modal-backdrop') closeModal();
    });

    bindAsyncButton(
      modalRoot.querySelector('#sale-reason-modal-confirm'),
      async () => {
        const reason = modalRoot.querySelector('#sale-reason-modal-text')?.value || '';
        if (!String(reason || '').trim()) {
          alert('Informe o motivo.');
          return;
        }

        await onConfirm?.(String(reason).trim());
        closeModal();
      },
      { busyLabel: 'Salvando...' }
    );
  }

  async function deleteSale(saleId, reason) {
    const sale = (state.sales || []).find((item) => item.id === saleId);
    if (!sale) {
      alert('Venda não encontrada.');
      return;
    }

    if (sale.deleted === true) {
      alert('Esta venda já foi excluída.');
      return;
    }

    const saleItems = Array.isArray(sale.items) ? sale.items : [];

    await reconcileStockForSale({
      originalItems: saleItems,
      nextItems: [],
      reason: `Estorno por exclusão de venda. Motivo: ${reason}`,
      saleId: sale.id,
      saleLabel: sale.customerName || sale.id
    });

    const payload = {
      deleted: true,
      deletionReason: reason,
      deletedAt: new Date(),
      deletedById: state.currentUser?.uid || '',
      deletedByName: state.currentUser?.fullName || ''
    };

    await updateByPath('sales', sale.id, payload);

    await logSaleAudit({
      action: 'delete',
      sale: sale,
      reason
    });

    showToast('Venda excluída com sucesso.', 'success');
    renderHistory();
  }

  function calculateDraftTotals(draft, formData) {
    const subtotal = (draft.items || []).reduce((sum, item) => {
      return sum + Number(item.salePrice || 0) * Number(item.quantity || 0);
    }, 0);

    const discount = toNumber(formData.discount || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(formData.amountPaid || 0);
    const change = Math.max(0, amountPaid - total);

    return { subtotal, discount, total, amountPaid, change };
  }

  function renderEditSaleModal(sale) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const originalItems = Array.isArray(sale.items) ? sale.items : [];
    const originalMap = buildItemMap(originalItems);

    const draft = {
      customerName: String(sale.customerName || '').trim() === UNIDENTIFIED_CUSTOMER ? '' : String(sale.customerName || '').trim(),
      includeCpf: Boolean(String(sale.customerCpf || '').trim()),
      customerCpf: String(sale.customerCpf || '').trim(),
      paymentMethod: sale.paymentMethod || paymentMethods?.[0] || 'Dinheiro',
      discount: Number(sale.discount || 0),
      amountPaid: Number(sale.amountPaid || 0),
      notes: sale.notes || '',
      items: normalizeSaleItemsForEdition(originalItems)
    };

    let editSearchTerm = '';

    function closeModal() {
      modalRoot.innerHTML = '';
    }

    function getEditableAvailableStock(productId) {
      return Number(getAvailableStock(productId) || 0) + Number(originalMap.get(productId) || 0);
    }

    function getDraftItem(productId) {
      return draft.items.find((item) => item.id === productId) || null;
    }

    function addProductToDraft(productId) {
      const product = getProductById(productId);
      if (!product) return;

      const existing = getDraftItem(productId);
      const currentQty = Number(existing?.quantity || 0);
      const allowed = getEditableAvailableStock(productId);

      if (currentQty + 1 > allowed) {
        showToast('Quantidade maior que o estoque disponível para edição.', 'error');
        return;
      }

      if (existing) {
        existing.quantity += 1;
      } else {
        draft.items.push({
          id: product.id,
          name: product.name,
          salePrice: Number(product.salePrice || 0),
          quantity: 1,
          barcode: product.barcode
        });
      }

      renderDraftItems();
      renderDraftSummary();
      renderEditSearchResults();
    }

    function changeDraftQuantity(productId, delta) {
      const row = getDraftItem(productId);
      if (!row) return;

      const nextQty = Number(row.quantity || 0) + Number(delta || 0);

      if (nextQty <= 0) {
        draft.items = draft.items.filter((item) => item.id !== productId);
        renderDraftItems();
        renderDraftSummary();
        renderEditSearchResults();
        return;
      }

      if (nextQty > getEditableAvailableStock(productId)) {
        showToast('Quantidade maior que o estoque disponível para edição.', 'error');
        return;
      }

      row.quantity = nextQty;
      renderDraftItems();
      renderDraftSummary();
      renderEditSearchResults();
    }

    function renderDraftItems() {
      const host = modalRoot.querySelector('#sale-edit-items');
      if (!host) return;

      if (!draft.items.length) {
        host.innerHTML = `
          <div class="empty-state">
            <strong>Nenhum item</strong>
            <span>Adicione produtos à venda editada.</span>
          </div>
        `;
        return;
      }

      host.innerHTML = draft.items
        .map((item) => `
          <div class="list-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <div class="muted">
                ${currency(item.salePrice || 0)} · Disponível para edição: ${getEditableAvailableStock(item.id)}
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn btn-secondary" type="button" data-edit-cart-decrease="${escapeHtml(item.id)}">−</button>
              <strong>${Number(item.quantity || 0)}</strong>
              <button class="btn btn-secondary" type="button" data-edit-cart-increase="${escapeHtml(item.id)}">+</button>
              <button class="btn btn-danger" type="button" data-edit-cart-remove="${escapeHtml(item.id)}">Remover</button>
            </div>
          </div>
        `)
        .join('');

      host.querySelectorAll('[data-edit-cart-decrease]').forEach((btn) => {
        btn.addEventListener('click', () => changeDraftQuantity(btn.dataset.editCartDecrease, -1));
      });

      host.querySelectorAll('[data-edit-cart-increase]').forEach((btn) => {
        btn.addEventListener('click', () => changeDraftQuantity(btn.dataset.editCartIncrease, 1));
      });

      host.querySelectorAll('[data-edit-cart-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draft.items = draft.items.filter((item) => item.id !== btn.dataset.editCartRemove);
          renderDraftItems();
          renderDraftSummary();
          renderEditSearchResults();
        });
      });
    }

    function renderEditSearchResults() {
      const host = modalRoot.querySelector('#sale-edit-search-results');
      if (!host) return;

      const term = String(editSearchTerm || '').trim().toLowerCase();

      if (!term) {
        host.innerHTML = `
          <div class="empty-state">
            <strong>Pesquisar produto</strong>
            <span>Digite nome ou código de barras para adicionar itens.</span>
          </div>
        `;
        return;
      }

      const results = getActiveProducts()
        .filter((product) =>
          [product.name, product.barcode, product.brand, product.supplier]
            .join(' ')
            .toLowerCase()
            .includes(term)
        )
        .slice(0, 8);

      host.innerHTML =
        results
          .map((product) => {
            const currentQty = Number(getDraftItem(product.id)?.quantity || 0);
            const allowed = getEditableAvailableStock(product.id);
            return `
              <div class="list-row">
                <div>
                  <strong>${escapeHtml(product.name)}</strong>
                  <div class="muted">
                    ${escapeHtml(product.barcode || 'Sem código')} · Estoque atual: ${Number(product.quantity || 0)} · Disponível para edição: ${allowed} · Já na venda: ${currentQty}
                  </div>
                </div>
                <button class="btn btn-secondary" type="button" data-edit-add-product="${escapeHtml(product.id)}">Adicionar</button>
              </div>
            `;
          })
          .join('') ||
        `
          <div class="empty-state">
            <strong>Nenhum produto encontrado</strong>
            <span>Refine sua pesquisa.</span>
          </div>
        `;

      host.querySelectorAll('[data-edit-add-product]').forEach((btn) => {
        btn.addEventListener('click', () => addProductToDraft(btn.dataset.editAddProduct));
      });
    }

    function renderDraftSummary() {
      const totals = calculateDraftTotals(draft, {
        discount: modalRoot.querySelector('#sale-edit-discount')?.value || draft.discount,
        amountPaid: modalRoot.querySelector('#sale-edit-amount-paid')?.value || draft.amountPaid
      });

      const subtotalEl = modalRoot.querySelector('#sale-edit-subtotal');
      const discountEl = modalRoot.querySelector('#sale-edit-discount-view');
      const totalEl = modalRoot.querySelector('#sale-edit-total');
      const changeEl = modalRoot.querySelector('#sale-edit-change');

      if (subtotalEl) subtotalEl.textContent = currency(totals.subtotal);
      if (discountEl) discountEl.textContent = currency(totals.discount);
      if (totalEl) totalEl.textContent = currency(totals.total);
      if (changeEl) changeEl.textContent = currency(totals.change);
    }

    async function saveEditedSale() {
      if (!draft.items.length) {
        alert('A venda precisa ter pelo menos um item.');
        return;
      }

      const reason = String(modalRoot.querySelector('#sale-edit-reason')?.value || '').trim();
      if (!reason) {
        alert('Informe o motivo da edição.');
        return;
      }

      const includeCpf = Boolean(modalRoot.querySelector('#sale-edit-include-cpf')?.checked);
      const customerName = normalizeCustomerName(
        modalRoot.querySelector('#sale-edit-customer-name')?.value || ''
      );
      const customerCpf = includeCpf
        ? normalizeCustomerCpf(modalRoot.querySelector('#sale-edit-customer-cpf')?.value || '')
        : '';

      const paymentMethod =
        modalRoot.querySelector('#sale-edit-payment-method')?.value || 'Dinheiro';
      const notes = modalRoot.querySelector('#sale-edit-notes')?.value || '';
      const discount = toNumber(modalRoot.querySelector('#sale-edit-discount')?.value || 0);
      const amountPaid = toNumber(modalRoot.querySelector('#sale-edit-amount-paid')?.value || 0);

      const nextItems = buildSaleItemsPayload(draft.items);
      validateStockForEditedItems(originalItems, nextItems);

      const totals = calculateDraftTotals(draft, { discount, amountPaid });

      if (totals.amountPaid < totals.total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      await reconcileStockForSale({
        originalItems,
        nextItems,
        reason: `Ajuste por edição de venda. Motivo: ${reason}`,
        saleId: sale.id,
        saleLabel: customerName
      });

      const payload = {
        customerName,
        customerCpf,
        paymentMethod,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        amountPaid: totals.amountPaid,
        change: totals.change,
        notes,
        items: nextItems,
        editedAt: new Date(),
        editedById: state.currentUser?.uid || '',
        editedByName: state.currentUser?.fullName || '',
        lastEditReason: reason,
        editCount: Number(sale.editCount || 0) + 1
      };

      await updateByPath('sales', sale.id, payload);

      await logSaleAudit({
        action: 'update',
        sale: { ...sale, ...payload },
        reason,
        previousSale: sale,
        nextSale: { ...sale, ...payload }
      });

      closeModal();
      showToast('Venda atualizada com sucesso.', 'success');
      renderHistory();
    }

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-edit-modal-backdrop">
        <div class="modal-card" style="max-width:980px; width:min(980px, calc(100vw - 24px));">
          <div class="section-header">
            <h2>Editar venda</h2>
            <button class="btn btn-secondary" type="button" id="sale-edit-modal-close">Fechar</button>
          </div>

          <div class="section-stack">
            <div class="panel">
              <div class="section-header">
                <h3>Cliente</h3>
                <span class="muted">Atualize cliente e CPF do cupom</span>
              </div>

              <div class="sales-search-toolbar" style="margin-bottom:14px;">
                <div class="sales-search-main">
                  <input
                    id="sale-edit-product-search"
                    type="text"
                    placeholder="Digite nome do produto ou código de barras"
                    autocomplete="off"
                  />
                </div>
                <div class="sales-search-actions">
                  <button class="btn btn-secondary" type="button" id="sale-edit-select-client-btn">Selecionar cliente</button>
                  <button class="btn btn-secondary" type="button" id="sale-edit-clear-client-btn">Limpar cliente</button>
                </div>
              </div>

              <div class="form-grid" style="margin-bottom:14px;">
                <label style="grid-column:1 / -1;">
                  Cliente
                  <input id="sale-edit-customer-name" type="text" value="${escapeHtml(draft.customerName)}" placeholder="Deixe em branco para cliente não identificado" />
                </label>

                <label style="grid-column:1 / -1; display:flex; align-items:center; gap:8px;">
                  <input id="sale-edit-include-cpf" type="checkbox" style="width:auto;" ${draft.includeCpf ? 'checked' : ''} />
                  <span>Inserir CPF no cupom</span>
                </label>

                <label id="sale-edit-cpf-wrap" style="grid-column:1 / -1; ${draft.includeCpf ? '' : 'display:none;'}">
                  CPF
                  <input id="sale-edit-customer-cpf" type="text" value="${escapeHtml(draft.customerCpf)}" placeholder="Digite o CPF do cliente" />
                </label>
              </div>

              <div id="sale-edit-search-results"></div>
            </div>

            <div class="panel">
              <div class="section-header">
                <h3>Itens da venda</h3>
                <span class="muted">${draft.items.length} item(ns)</span>
              </div>

              <div id="sale-edit-items"></div>

              <div class="form-grid" style="margin-top:14px;">
                <label>
                  Forma de pagamento
                  <select id="sale-edit-payment-method">
                    ${paymentMethods.map((method) => `
                      <option value="${escapeHtml(method)}" ${draft.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>
                    `).join('')}
                  </select>
                </label>

                <label>
                  Desconto
                  <input id="sale-edit-discount" type="number" step="0.01" min="0" value="${Number(draft.discount || 0)}" />
                </label>

                <label>
                  Valor pago
                  <input id="sale-edit-amount-paid" type="number" step="0.01" min="0" value="${Number(draft.amountPaid || 0)}" />
                </label>

                <label style="grid-column:1 / -1;">
                  Observações
                  <textarea id="sale-edit-notes">${escapeHtml(draft.notes || '')}</textarea>
                </label>

                <label style="grid-column:1 / -1;">
                  Motivo da edição
                  <textarea id="sale-edit-reason" placeholder="Descreva o motivo da edição" required></textarea>
                </label>
              </div>

              <div class="summary-box" style="margin-top:14px;">
                <div class="summary-line"><span>Subtotal</span><strong id="sale-edit-subtotal">${currency(Number(sale.subtotal || 0))}</strong></div>
                <div class="summary-line"><span>Desconto</span><strong id="sale-edit-discount-view">${currency(Number(sale.discount || 0))}</strong></div>
                <div class="summary-line total"><span>Total</span><strong id="sale-edit-total">${currency(Number(sale.total || 0))}</strong></div>
                <div class="summary-line"><span>Troco</span><strong id="sale-edit-change">${currency(Number(sale.change || 0))}</strong></div>
              </div>

              <div class="form-actions" style="margin-top:14px;">
                <button class="btn btn-primary" type="button" id="sale-edit-save-btn">Salvar alterações</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    modalRoot.querySelector('#sale-edit-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-edit-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-edit-modal-backdrop') closeModal();
    });

    modalRoot.querySelector('#sale-edit-product-search')?.addEventListener('input', (event) => {
      editSearchTerm = event.currentTarget.value || '';
      renderEditSearchResults();
    });

    modalRoot.querySelector('#sale-edit-product-search')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      const product = getProductByBarcode(event.currentTarget.value || '');
      if (!product) {
        showToast('Produto não cadastrado.', 'error');
        return;
      }

      addProductToDraft(product.id);
      event.currentTarget.value = '';
      editSearchTerm = '';
      renderEditSearchResults();
    });

    const bindEditCpfToggle = () => {
      const checkbox = modalRoot.querySelector('#sale-edit-include-cpf');
      const wrap = modalRoot.querySelector('#sale-edit-cpf-wrap');
      const input = modalRoot.querySelector('#sale-edit-customer-cpf');

      if (!checkbox || !wrap || !input) return;

      const sync = () => {
        const checked = checkbox.checked;
        wrap.style.display = checked ? '' : 'none';
        if (!checked) input.value = '';
      };

      checkbox.addEventListener('change', sync);
      sync();
    };

    bindAsyncButton(
      modalRoot.querySelector('#sale-edit-select-client-btn'),
      async () => {
        openClientPicker({
          onSelect: (client) => {
            const nameInput = modalRoot.querySelector('#sale-edit-customer-name');
            const cpfCheck = modalRoot.querySelector('#sale-edit-include-cpf');
            const cpfInput = modalRoot.querySelector('#sale-edit-customer-cpf');
            const clientCpf = getClientCpf(client);

            if (nameInput) nameInput.value = client?.name || '';
            if (clientCpf) {
              if (cpfCheck) cpfCheck.checked = true;
              if (cpfInput) cpfInput.value = clientCpf;
            }

            bindEditCpfToggle();
          }
        });
      },
      { busyLabel: 'Abrindo...' }
    );

    bindAsyncButton(
      modalRoot.querySelector('#sale-edit-clear-client-btn'),
      async () => {
        const nameInput = modalRoot.querySelector('#sale-edit-customer-name');
        const cpfCheck = modalRoot.querySelector('#sale-edit-include-cpf');
        const cpfInput = modalRoot.querySelector('#sale-edit-customer-cpf');

        if (nameInput) nameInput.value = '';
        if (cpfCheck) cpfCheck.checked = false;
        if (cpfInput) cpfInput.value = '';

        bindEditCpfToggle();
        showToast('Cliente limpo.', 'info');
      },
      { busyLabel: 'Limpando...' }
    );

    modalRoot.querySelector('#sale-edit-discount')?.addEventListener('input', renderDraftSummary);
    modalRoot.querySelector('#sale-edit-amount-paid')?.addEventListener('input', renderDraftSummary);

    bindAsyncButton(
      modalRoot.querySelector('#sale-edit-save-btn'),
      async () => {
        await saveEditedSale();
      },
      { busyLabel: 'Salvando...' }
    );

    bindEditCpfToggle();
    renderDraftItems();
    renderEditSearchResults();
    renderDraftSummary();
  }

  function renderHistory() {
    const historyEl = tabEls.sales.querySelector('#sales-history-table');
    if (!historyEl) return;

    const rows = (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;

      const customer = String(sale.customerName || '').toLowerCase();
      const paymentMethod = String(sale.paymentMethod || '');
      const created = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || 0);
      const createdKey = Number.isNaN(created.getTime())
        ? ''
        : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

      return (
        (!saleFilters.customer || customer.includes(saleFilters.customer.toLowerCase())) &&
        (!saleFilters.paymentMethod || paymentMethod === saleFilters.paymentMethod) &&
        (!saleFilters.dateFrom || !createdKey || createdKey >= saleFilters.dateFrom) &&
        (!saleFilters.dateTo || !createdKey || createdKey <= saleFilters.dateTo)
      );
    });

    historyEl.innerHTML =
      rows
        .map(
          (sale) => `
            <tr>
              <td>${escapeHtml(formatDateTime(sale.createdAt))}</td>
              <td>${escapeHtml(normalizeCustomerName(sale.customerName))}</td>
              <td>${escapeHtml(sale.paymentMethod || '-')}</td>
              <td>${currency(sale.total || 0)}</td>
              <td>${Array.isArray(sale.items) ? sale.items.length : 0}</td>
              <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button class="btn btn-secondary" type="button" data-print-sale="${escapeHtml(sale.id)}">Imprimir</button>
                  <button class="btn btn-secondary" type="button" data-edit-sale="${escapeHtml(sale.id)}">Editar</button>
                  <button class="btn btn-danger" type="button" data-delete-sale="${escapeHtml(sale.id)}">Excluir</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('') || '<tr><td colspan="6">Nenhuma venda encontrada.</td></tr>';

    historyEl.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.printSale);
        if (!sale) return;
        printModule.printSaleReceipt(normalizeSaleForPrint(sale));
      });
    });

    historyEl.querySelectorAll('[data-edit-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.editSale);
        if (!sale) return;
        renderEditSaleModal(sale);
      });
    });

    historyEl.querySelectorAll('[data-delete-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.deleteSale);
        if (!sale) return;

        openReasonModal({
          title: 'Excluir venda',
          confirmLabel: 'Excluir venda',
          buttonClass: 'btn btn-danger',
          placeholder: 'Descreva o motivo da exclusão',
          onConfirm: async (reason) => {
            await deleteSale(sale.id, reason);
          }
        });
      });
    });
  }

  function bindCpfToggle() {
    const checkbox = tabEls.sales.querySelector('#sale-include-cpf');
    const wrap = tabEls.sales.querySelector('#sale-cpf-wrap');
    const input = tabEls.sales.querySelector('#sale-customer-cpf');

    if (!checkbox || !wrap || !input) return;

    const sync = () => {
      const checked = checkbox.checked;
      wrap.style.display = checked ? '' : 'none';
      if (!checked) input.value = '';
    };

    checkbox.addEventListener('change', sync);
    sync();
  }

  function render() {
    const { subtotal, discount, total, change } = calculateCartTotal();

    tabEls.sales.innerHTML = `
      <div class="section-stack">
        <div class="sales-layout">
          <div class="panel">
            <div class="section-header">
              <h2>Venda</h2>
              <span class="muted">Pesquisa de produto e código de barras</span>
            </div>

            <div class="sales-search-toolbar" style="margin-bottom:14px;">
              <div class="sales-search-main">
                <input
                  id="sale-product-search"
                  type="text"
                  placeholder="Digite nome do produto ou código de barras"
                  autocomplete="off"
                  value="${escapeHtml(searchTerm)}"
                />
              </div>

              <div class="sales-search-actions">
                <button class="btn btn-secondary" type="button" id="sale-select-client-btn">Selecionar cliente</button>
                <button class="btn btn-secondary" type="button" id="sale-clear-client-btn">Limpar cliente</button>
              </div>
            </div>

            <div class="form-grid" style="margin-bottom:14px;">
              <label style="grid-column:1 / -1;">
                Cliente
                <input id="sale-customer-name" type="text" value="" placeholder="Deixe em branco para cliente não identificado" />
              </label>

              <label style="grid-column:1 / -1; display:flex; align-items:center; gap:8px;">
                <input id="sale-include-cpf" type="checkbox" style="width:auto;" />
                <span>Inserir CPF no cupom</span>
              </label>

              <label id="sale-cpf-wrap" style="grid-column:1 / -1; display:none;">
                CPF
                <input id="sale-customer-cpf" type="text" placeholder="Digite o CPF do cliente" />
              </label>
            </div>

            <div id="sale-search-results"></div>
          </div>

          <div class="panel">
            <div class="section-header">
              <h2>Carrinho</h2>
              <span class="muted"><span id="sale-items-count">${state.cart.length}</span> item(ns)</span>
            </div>

            <div id="sale-cart-items"></div>

            <div class="form-grid" style="margin-top:14px;">
              <label>
                Forma de pagamento
                <select id="sale-payment-method">
                  ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('')}
                </select>
              </label>

              <label>
                Desconto
                <input name="discount" type="number" step="0.01" min="0" value="0" />
              </label>

              <label>
                Valor pago
                <input name="amountPaid" type="number" step="0.01" min="0" value="0" />
              </label>

              <label style="grid-column:1 / -1;">
                Observações
                <textarea name="notes"></textarea>
              </label>
            </div>

            <div class="summary-box" style="margin-top:14px;">
              <div class="summary-line"><span>Subtotal</span><strong id="sale-subtotal">${currency(subtotal)}</strong></div>
              <div class="summary-line"><span>Desconto</span><strong id="sale-discount-view">${currency(discount)}</strong></div>
              <div class="summary-line total"><span>Total</span><strong id="sale-total">${currency(total)}</strong></div>
              <div class="summary-line"><span>Troco</span><strong id="sale-change">${currency(change)}</strong></div>
            </div>

            <div class="form-actions" style="margin-top:14px;">
              <button class="btn btn-primary" type="button" id="finish-sale-btn">Finalizar venda</button>
              <button class="btn btn-secondary" type="button" id="clear-cart-btn">Limpar carrinho</button>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Histórico de vendas</h2>
          </div>

          <div class="search-row sales-history-filters" style="margin-bottom:14px;">
            <input id="sales-filter-customer" placeholder="Cliente" value="${escapeHtml(saleFilters.customer)}" />
            <select id="sales-filter-payment">
              <option value="">Todas as formas</option>
              ${paymentMethods.map((method) => `<option value="${escapeHtml(method)}" ${saleFilters.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}
            </select>
            <input id="sales-filter-date-from" type="date" value="${saleFilters.dateFrom}" />
            <input id="sales-filter-date-to" type="date" value="${saleFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap scroll-dual">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                  <th>Itens</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="sales-history-table"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const searchInput = tabEls.sales.querySelector('#sale-product-search');

    searchInput?.addEventListener('input', (event) => {
      searchTerm = event.currentTarget.value || '';
      renderSearchResults();
    });

    searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        tryAddProductByBarcode(event.currentTarget.value || '', true);
      }
    });

    bindAsyncButton(
      tabEls.sales.querySelector('#sale-select-client-btn'),
      async () => {
        openClientPicker({
          onSelect: (client) => {
            const input = tabEls.sales.querySelector('#sale-customer-name');
            const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
            const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');
            const clientCpf = getClientCpf(client);

            if (input) input.value = client?.name || '';
            if (clientCpf) {
              if (cpfCheck) cpfCheck.checked = true;
              if (cpfInput) cpfInput.value = clientCpf;
            }

            bindCpfToggle();
          }
        });
      },
      { busyLabel: 'Abrindo...' }
    );

    bindAsyncButton(
      tabEls.sales.querySelector('#sale-clear-client-btn'),
      async () => {
        const clientInput = tabEls.sales.querySelector('#sale-customer-name');
        const cpfCheck = tabEls.sales.querySelector('#sale-include-cpf');
        const cpfInput = tabEls.sales.querySelector('#sale-customer-cpf');

        if (clientInput) clientInput.value = '';
        if (cpfCheck) cpfCheck.checked = false;
        if (cpfInput) cpfInput.value = '';

        bindCpfToggle();
        showToast('Cliente limpo.', 'info');
      },
      { busyLabel: 'Limpando...' }
    );

    tabEls.sales.querySelector('#sale-payment-method')?.addEventListener('change', updateSaleSummary);
    tabEls.sales.querySelector('input[name="discount"]')?.addEventListener('input', updateSaleSummary);
    tabEls.sales.querySelector('input[name="amountPaid"]')?.addEventListener('input', updateSaleSummary);

    bindAsyncButton(
      tabEls.sales.querySelector('#finish-sale-btn'),
      async () => {
        await finishSale();
      },
      { busyLabel: 'Finalizando...' }
    );

    bindAsyncButton(
      tabEls.sales.querySelector('#clear-cart-btn'),
      async () => {
        clearCartWithFeedback();
      },
      { busyLabel: 'Limpando...' }
    );

    tabEls.sales.querySelector('#sales-filter-apply')?.addEventListener('click', () => {
      saleFilters.customer = tabEls.sales.querySelector('#sales-filter-customer')?.value || '';
      saleFilters.paymentMethod = tabEls.sales.querySelector('#sales-filter-payment')?.value || '';
      saleFilters.dateFrom = tabEls.sales.querySelector('#sales-filter-date-from')?.value || '';
      saleFilters.dateTo = tabEls.sales.querySelector('#sales-filter-date-to')?.value || '';
      renderHistory();
    });

    bindAsyncButton(
      tabEls.sales.querySelector('#sales-filter-clear'),
      async () => {
        saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
        render();
      },
      { busyLabel: 'Limpando...' }
    );

    renderSearchResults();
    renderCart();
    renderHistory();
    updateSaleSummary();
    bindCpfToggle();
    bindKeyboardShortcuts();
  }

  return {
    render
  };
}