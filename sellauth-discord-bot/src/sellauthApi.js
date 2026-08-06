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

// Attempts to fetch the next available stock item for a variant.
// SellAuth doesn't document a single canonical endpoint for this, so we try
// a handful of likely candidates in order and log every attempt so we can
// see exactly which one (if any) works in production.
async function getNextStockItem(variantId) {
  const attempts = [
    {
      label: 'GET /stock/next?variant_id=',
      run: (api) => api.get('/stock/next', { params: { variant_id: variantId } }),
    },
    {
      label: 'POST /stock/next { variant_id }',
      run: (api) => api.post('/stock/next', { variant_id: variantId }),
    },
    {
      label: 'GET /variants/:id/next',
      run: (api) => api.get(`/variants/${variantId}/next`),
    },
    {
      label: 'GET /stock/next/:variantId',
      run: (api) => api.get(`/stock/next/${variantId}`),
    },
    {
      label: 'GET /variants/:id/stock/next',
      run: (api) => api.get(`/variants/${variantId}/stock/next`),
    },
  ];

  const api = client();
  const errors = [];

  for (const attempt of attempts) {
    try {
      console.log(`[sellauthApi] getNextStockItem: trying ${attempt.label} (variant_id=${variantId})`);
      const res = await attempt.run(api);
      console.log(
        `[sellauthApi] getNextStockItem: ${attempt.label} succeeded ->`,
        JSON.stringify(res.data)
      );
      const item = res.data?.data || res.data;
      if (item && (item.id || item.value || item.content)) {
        return { item, endpoint: attempt.label };
      }
      console.log(`[sellauthApi] getNextStockItem: ${attempt.label} returned no usable item, continuing.`);
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;
      console.log(`[sellauthApi] getNextStockItem: ${attempt.label} failed (HTTP ${status}): ${message}`);
      errors.push(`${attempt.label} -> HTTP ${status}: ${message}`);
    }
  }

  throw new Error(
    `Could not find a working "next stock item" endpoint for variant ${variantId}. Attempts:\n${errors.join('\n')}`
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
