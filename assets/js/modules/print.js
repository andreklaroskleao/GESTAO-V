import { showToast } from './ui.js';

export function createPrintModule(ctx) {
  const { state } = ctx;
  const UNIDENTIFIED_CUSTOMER = 'Cliente não identificado';

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function getPrintSettings() {
    return {
      thermalWidth: state.settings?.thermalWidth || '80mm',
      compactMode: Boolean(state.settings?.thermalCompactMode),
      autoPrint: Boolean(state.settings?.thermalAutoPrint)
    };
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatAnyDateTime(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
      return value;
    }

    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) return value.toLocaleString('pt-BR');
      return '';
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
      return '';
    }

    if (typeof value === 'object' && value.seconds != null) {
      const parsed = new Date(Number(value.seconds) * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
      return '';
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
    return '';
  }

  function normalizeCustomerName(value) {
    const name = String(value || '').trim();
    return name || UNIDENTIFIED_CUSTOMER;
  }

  function normalizeCustomerCpf(value) {
    const cpf = String(value || '').trim();
    return cpf || 'Não informado';
  }

  function normalizeUpper(value) {
    return String(value || '').trim().toUpperCase();
  }

  function buildItemsHtml(sale, options = {}) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const is58mm = Boolean(options.is58mm);

    if (!items.length) {
      return `<div class="empty-items">SEM ITENS LANÇADOS</div>`;
    }

    return `
      <div class="items-list">
        <div class="items-columns-header">
          <div class="col-qty">QTD</div>
          <div class="col-unit">UNIT.</div>
          <div class="col-total">TOTAL</div>
        </div>

        ${items.map((item) => `
          <div class="receipt-item">
            <div class="item-name">${escapeHtml(normalizeUpper(item.name || '-'))}</div>
            <div class="item-values-row">
              <div class="col-qty">${Number(item.quantity || 0)}</div>
              <div class="col-unit">${escapeHtml(formatMoney(item.unitPrice || 0))}</div>
              <div class="col-total">${escapeHtml(formatMoney(item.total || 0))}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildReceiptHtml(sale = {}) {
    const { thermalWidth, compactMode } = getPrintSettings();
    const is58mm = thermalWidth === '58mm';

    const widthPx = is58mm ? 240 : 340;
    const padding = is58mm ? 10 : 12;
    const baseFontSize = compactMode ? (is58mm ? 10 : 11) : (is58mm ? 11 : 12);
    const headerFontSize = compactMode ? (is58mm ? 13 : 14) : (is58mm ? 15 : 17);
    const titleFontSize = compactMode ? (is58mm ? 15 : 17) : (is58mm ? 17 : 20);

    const storeName = normalizeUpper(state.settings?.storeName || 'Gestão III');
    const address = normalizeUpper(state.settings?.address || '');
    const phone = String(state.settings?.phone || state.settings?.storePhone || '').trim();
    const warrantyText = String(state.settings?.warrantyText || '').trim();

    const saleDateTime =
      String(sale.saleDateTimeLabel || '').trim() ||
      formatAnyDateTime(sale.createdAt) ||
      '-';

    const customerName = normalizeCustomerName(sale.customerName);
    const customerCpf = normalizeCustomerCpf(sale.customerCpf);

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Cupom não fiscal</title>
          <style>
            :root {
              --text: #111111;
              --muted: #4f4f4f;
              --line: #111111;
              --bg: #ffffff;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: var(--bg);
              color: var(--text);
              font-family: "Courier New", Courier, monospace;
            }

            body {
              width: 100%;
              display: flex;
              justify-content: center;
              padding: 8px;
            }

            .receipt {
              width: 100%;
              max-width: ${widthPx}px;
              padding: ${padding}px;
              font-size: ${baseFontSize}px;
              line-height: 1.35;
              font-variant-numeric: tabular-nums;
              font-feature-settings: "tnum" 1;
            }

            .center {
              text-align: center;
            }

            .store-name {
              font-size: ${titleFontSize}px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              line-height: 1.2;
            }

            .store-meta {
              margin-top: 3px;
              font-size: ${headerFontSize}px;
              font-weight: 700;
              text-transform: uppercase;
              word-break: break-word;
            }

            .receipt-title {
              margin-top: 10px;
              font-size: ${headerFontSize + 1}px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }

            .line {
              border-top: 1px solid var(--line);
              margin: 10px 0;
            }

            .line.dashed {
              border-top-style: dashed;
            }

            .info-block {
              text-align: center;
            }

            .info-line {
              margin: 4px 0;
              text-transform: uppercase;
              font-weight: 700;
              word-break: break-word;
            }

            .section-title {
              text-align: center;
              font-weight: 900;
              text-transform: uppercase;
              margin: 4px 0 8px;
            }

            .items-list {
              width: 100%;
            }

            .items-columns-header {
              display: grid;
              grid-template-columns: 0.7fr 1.2fr 1.2fr;
              column-gap: 8px;
              align-items: center;
              text-transform: uppercase;
              font-weight: 900;
              border-top: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
              padding: 6px 0;
              margin-bottom: 6px;
            }

            .receipt-item {
              padding: 6px 0;
              border-bottom: 1px dotted #777777;
            }

            .receipt-item:last-child {
              border-bottom: none;
            }

            .item-name {
              text-transform: uppercase;
              font-weight: 700;
              text-align: left;
              word-break: break-word;
              overflow-wrap: anywhere;
              margin-bottom: 5px;
            }

            .item-values-row {
              display: grid;
              grid-template-columns: 0.7fr 1.2fr 1.2fr;
              column-gap: 8px;
              align-items: center;
            }

            .col-qty,
            .col-unit,
            .col-total {
              text-align: right;
              white-space: nowrap;
              font-weight: 700;
            }

            .empty-items {
              text-align: center;
              text-transform: uppercase;
              color: var(--muted);
              padding: 8px 0;
              border-top: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
            }

            .totals-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            .totals-table td {
              padding: 3px 0;
              vertical-align: top;
            }

            .totals-table td.label {
              width: 65%;
              text-transform: uppercase;
              font-weight: 700;
            }

            .totals-table td.value {
              width: 35%;
              text-align: right;
              white-space: nowrap;
              font-weight: 700;
            }

            .totals-table tr.total-row td {
              border-top: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
              padding-top: 6px;
              padding-bottom: 6px;
              font-size: ${baseFontSize + 1}px;
              font-weight: 900;
            }

            .warranty-block,
            .notes-block {
              text-align: center;
            }

            .warranty-title,
            .notes-title {
              font-weight: 900;
              text-transform: uppercase;
              margin-bottom: 6px;
            }

            .warranty-text,
            .notes-text {
              text-transform: uppercase;
              white-space: pre-wrap;
              word-break: break-word;
              line-height: 1.45;
            }

            .footer-message {
              text-align: center;
              text-transform: uppercase;
              font-weight: 900;
              margin-top: 4px;
            }

            @page {
              margin: 0;
              size: auto;
            }

            @media print {
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
              }

              body {
                display: block;
              }

              .receipt {
                max-width: none;
                width: 100%;
                padding: ${padding}px;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="store-name">${escapeHtml(storeName)}</div>
              ${address ? `<div class="store-meta">${escapeHtml(address)}</div>` : ''}
              ${phone ? `<div class="store-meta">TELEFONE: ${escapeHtml(phone)}</div>` : ''}
              <div class="receipt-title">CUPOM NÃO FISCAL</div>
            </div>

            <div class="line"></div>

            <div class="info-block">
              <div class="info-line">DATA/HORA: ${escapeHtml(normalizeUpper(saleDateTime))}</div>
              <div class="info-line">CLIENTE: ${escapeHtml(normalizeUpper(customerName))}</div>
              <div class="info-line">CPF: ${escapeHtml(normalizeUpper(customerCpf))}</div>
              <div class="info-line">PAGAMENTO: ${escapeHtml(normalizeUpper(sale.paymentMethod || '-'))}</div>
            </div>

            <div class="line dashed"></div>

            <div class="section-title">ITENS</div>

            ${buildItemsHtml(sale, { is58mm })}

            <div class="line dashed"></div>

            <table class="totals-table">
              <tr>
                <td class="label">SUBTOTAL</td>
                <td class="value">${escapeHtml(formatMoney(sale.subtotal || 0))}</td>
              </tr>
              <tr>
                <td class="label">DESCONTO</td>
                <td class="value">${escapeHtml(formatMoney(sale.discount || 0))}</td>
              </tr>
              <tr class="total-row">
                <td class="label">TOTAL</td>
                <td class="value">${escapeHtml(formatMoney(sale.total || 0))}</td>
              </tr>
              <tr>
                <td class="label">VALOR PAGO</td>
                <td class="value">${escapeHtml(formatMoney(sale.amountPaid || 0))}</td>
              </tr>
              <tr>
                <td class="label">TROCO</td>
                <td class="value">${escapeHtml(formatMoney(sale.change || 0))}</td>
              </tr>
            </table>

            ${warrantyText ? `
              <div class="line dashed"></div>
              <div class="warranty-block">
                <div class="warranty-title">GARANTIA</div>
                <div class="warranty-text">${escapeHtml(normalizeUpper(warrantyText))}</div>
              </div>
            ` : ''}

            ${sale.notes ? `
              <div class="line dashed"></div>
              <div class="notes-block">
                <div class="notes-title">OBSERVAÇÕES</div>
                <div class="notes-text">${escapeHtml(normalizeUpper(sale.notes))}</div>
              </div>
            ` : ''}

            <div class="line"></div>
            <div class="footer-message">OBRIGADO PELA PREFERÊNCIA!</div>
          </div>
        </body>
      </html>
    `;
  }

  function printSaleReceipt(sale) {
    const html = buildReceiptHtml(sale);
    const win = window.open('', '_blank', 'width=520,height=900');

    if (!win) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();

    if (getPrintSettings().autoPrint) {
      setTimeout(() => {
        try {
          win.print();
        } catch (error) {
          console.error(error);
        }
      }, 250);
    }
  }

  return {
    buildReceiptHtml,
    printSaleReceipt,
    getPrintSettings
  };
}