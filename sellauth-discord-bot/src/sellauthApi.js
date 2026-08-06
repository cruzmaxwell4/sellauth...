// Thin wrapper around the SellAuth REST API (https://docs.sellauth.com/api-documentation).
// Every function returns the raw parsed JSON from SellAuth, or throws an
// Error whose .message is a human-readable summary (status + API message)
// so command files can show it straight to the user for easy debugging.

const axios = require('axios');
const runtimeConfig = require('./runtimeConfig');

const BASE_URL = 'https://api.sellauth.com/v1';

function client() {
  const apiKey = runtimeConfig.getApiKey();
  const shopId = runtimeConfig.getShopId();

  if (!apiKey || !shopId) {
    throw new Error(
      'Missing SellAuth credentials. Set SELLAUTH_API and SELLAUTH_SHOP_ID (or run /sellauthapishopid).'
    );
  }

  const instance = axios.create({
    baseURL: `${BASE_URL}/shops/${shopId}`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  return instance;
}

function rootClient() {
  const apiKey = runtimeConfig.getApiKey();
  if (!apiKey) {
    throw new Error('Missing SELLAUTH_API key.');
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

function friendlyError(err, context) {
  if (err.response) {
    const status = err.response.status;
    const data = err.response.data;
    const message =
      (data && (data.message || JSON.stringify(data.errors) || JSON.stringify(data))) ||
      err.message;
    return new Error(`${context} failed (HTTP ${status}): ${message}`);
  }
  return new Error(`${context} failed: ${err.message}`);
}

async function request(context, fn) {
  try {
    const res = await fn(client());
    return res.data;
  } catch (err) {
    throw friendlyError(err, context);
  }
}

async function requestRoot(context, fn) {
  try {
    const res = await fn(rootClient());
    return res.data;
  } catch (err) {
    throw friendlyError(err, context);
  }
}

// Stock items don't have a dedicated /stock endpoint. Instead, they're
// undelivered invoices. This function tries to fetch invoices for the
// variant and return the first undelivered item.
async function getNextStockItem(variantId) {
  const api = client();
  const errors = [];

  // Try to fetch invoices for this variant
  const attempts = [
    {
      label: 'GET /invoices?variant_id=',
      run: () => api.get('/invoices', { params: { variant_id: variantId } }),
    },
    {
      label: 'GET /invoices?product_variant_id=',
      run: () => api.get('/invoices', { params: { product_variant_id: variantId } }),
    },
    {
      label: 'GET /invoices (unfiltered)',
      run: () => api.get('/invoices'),
    },
  ];

  for (const attempt of attempts) {
    try {
      console.log(`[sellauthApi] getNextStockItem: trying ${attempt.label} (variant_id=${variantId})`);
      const res = await attempt.run();
      console.log(
        `[sellauthApi] getNextStockItem: ${attempt.label} succeeded, response keys ->`,
        JSON.stringify(Object.keys(res.data || {}))
      );

      // Extract invoice list
      let invoices = [];
      if (Array.isArray(res.data)) {
        invoices = res.data;
      } else if (res.data?.data && Array.isArray(res.data.data)) {
        invoices = res.data.data;
      } else if (res.data?.invoices && Array.isArray(res.data.invoices)) {
        invoices = res.data.invoices;
      }

      console.log(`[sellauthApi] getNextStockItem: found ${invoices.length} invoice(s)`);

      // Find first undelivered invoice
      for (const invoice of invoices) {
        // Check if this invoice's items match the variant
        const items = invoice.items || [];
        for (const item of items) {
          const itemVariantId =
            item.variant_id || item.variantId || item.product_variant_id || item.variant?.id;
          const isUndelivered =
            !invoice.delivered &&
            !invoice.delivery_status ||
            invoice.delivery_status === 'pending' ||
            invoice.delivery_status === 'undelivered';

          console.log(
            `[sellauthApi] getNextStockItem: checking invoice ${invoice.id}, item variant=${itemVariantId}, delivered=${invoice.delivered}, delivery_status=${invoice.delivery_status}`
          );

          if (String(itemVariantId) === String(variantId)) {
            console.log(
              `[sellauthApi] getNextStockItem: found matching item in invoice ${invoice.id} ->`,
              JSON.stringify(item)
            );
            return { item, invoice, endpoint: attempt.label };
          }
        }
      }

      console.log(
        `[sellauthApi] getNextStockItem: ${attempt.label} returned invoices but none had items for variant ${variantId}`
      );
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;
      console.log(`[sellauthApi] getNextStockItem: ${attempt.label} failed (HTTP ${status}): ${message}`);
      errors.push(`${attempt.label} -> HTTP ${status}: ${message}`);
    }
  }

  throw new Error(
    `Could not find a stock item for variant ${variantId}. Attempts:\\n${errors.join('\\n')}`
  );
}

module.exports = {
  // -- Shop / connectivity --------------------------------------------
  getShops: () => requestRoot('Get shops', (api) => api.get('/shops')),
  getAnalytics: (params) => request('Get analytics', (api) => api.get('/analytics', { params })),

  // -- Invoices ----------------------------------------------------------
  getInvoice: (invoiceId) => request('Get invoice', (api) => api.get(`/invoices/${invoiceId}`)),
  listInvoices: (params) => request('List invoices', (api) => api.get('/invoices', { params })),
  processInvoice: (invoiceId) =>
    request('Process invoice', (api) => api.post(`/invoices/${invoiceId}/process`)),

  // -- Domains -------------------------------------------------------------
  listDomains: () => request('List domains', (api) => api.get('/domains')),
  addDomain: (domain) => request('Add domain', (api) => api.post('/domains', { domain })),
  deleteDomain: (domainId) =>
    request('Delete domain', (api) => api.delete(`/domains/${domainId}`)),

  // -- Coupons ---------------------------------------------------------------
  createCoupon: (body) => request('Create coupon', (api) => api.post('/coupons', body)),
  listCoupons: () => request('List coupons', (api) => api.get('/coupons')),

  // -- Customers ---------------------------------------------------------------
  listCustomers: (params) =>
    request('List customers', (api) => api.get('/customers', { params })),
  getCustomerBalanceTransactions: (customerId) =>
    request('Get customer balance transactions', (api) =>
      api.get(`/customers/${customerId}/balance-transactions`)
    ),

  // -- Products --------------------------------------------------------------
  listProducts: (params) => request('List products', (api) => api.get('/products', { params })),
  getProduct: (productId) =>
    request('Get product', (api) => api.get(`/products/${productId}`)),
  deleteStockItem: (stockItemId) =>
    request('Delete stock item', (api) => api.delete(`/stock/${stockItemId}`)),
  getNextStockItem: (variantId) => getNextStockItem(variantId),

  // -- Tickets -----------------------------------------------------------------
  listTickets: (params) => request('List tickets', (api) => api.get('/tickets', { params })),
  getTicket: (ticketId) => request('Get ticket', (api) => api.get(`/tickets/${ticketId}`)),
  replyTicket: (ticketId, message) =>
    request('Reply to ticket', (api) =>
      api.post(`/tickets/${ticketId}/messages`, { message })
    ),
};

