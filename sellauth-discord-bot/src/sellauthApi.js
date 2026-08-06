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

// SellAuth does not publicly document a "replace delivered item" endpoint.
// We try a handful of plausible endpoint/method combinations in order,
// logging the full SellAuth response for each failed attempt so we can
// figure out which one (if any) actually works. The first attempt that
// succeeds wins; if all fail we throw an error that includes details from
// every attempt.
async function replaceDelivered(invoiceId, itemId, body) {
  const api = client();

  const attempts = [
    {
      method: 'post',
      path: `/invoices/${invoiceId}/deliver`,
      body: { invoice_item_id: itemId, ...body },
    },
    {
      method: 'put',
      path: `/invoices/${invoiceId}/items`,
      body: { invoice_item_id: itemId, ...body },
    },
    {
      method: 'patch',
      path: `/invoices/${invoiceId}/items/${itemId}`,
      body,
    },
    {
      method: 'post',
      path: `/invoices/${invoiceId}/replace-delivered`,
      body: { item_id: itemId, ...body },
    },
  ];

  const failures = [];

  for (const attempt of attempts) {
    const url = `${api.defaults.baseURL}${attempt.path}`;
    console.log(
      `[sellauthApi] Trying ${attempt.method.toUpperCase()} ${url} | Body: ${JSON.stringify(attempt.body)}`
    );

    try {
      const res = await api[attempt.method](attempt.path, attempt.body);
      console.log(
        `[sellauthApi] Success with ${attempt.method.toUpperCase()} ${attempt.path} | Response: ${JSON.stringify(
          res.data
        )}`
      );
      return res.data;
    } catch (err) {
      const status = err.response ? err.response.status : null;
      const data = err.response ? err.response.data : null;
      console.log(
        `[sellauthApi] Attempt failed -> ${attempt.method.toUpperCase()} ${attempt.path} | Status: ${status} | Response: ${JSON.stringify(
          data
        )} | Error: ${err.message}`
      );
      failures.push(
        `${attempt.method.toUpperCase()} ${attempt.path} -> HTTP ${status}: ${
          (data && (data.message || JSON.stringify(data.errors) || JSON.stringify(data))) || err.message
        }`
      );
    }
  }

  throw new Error(
    `Replace delivered items failed — no known endpoint worked. Attempts:\n${failures.join('\n')}`
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
  replaceDelivered,

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

  // -- Tickets -----------------------------------------------------------------
  listTickets: (params) => request('List tickets', (api) => api.get('/tickets', { params })),
  getTicket: (ticketId) => request('Get ticket', (api) => api.get(`/tickets/${ticketId}`)),
  replyTicket: (ticketId, message) =>
    request('Reply to ticket', (api) =>
      api.post(`/tickets/${ticketId}/messages`, { message })
    ),
};
