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

// SellAuth's docs are inconsistent about where variant stock actually lives,
// so we try a handful of known/likely endpoint shapes in order and log every
// attempt (request + response/error) to make it easy to see which one the
// account's API version actually supports. The first one that responds
// successfully wins; if all fail we throw an error summarizing every attempt.
async function getVariantStockWithFallback(productId, variantId) {
  const api = client();

  const attempts = [
    {
      label: `GET /stock?variant_id=${variantId}`,
      call: () => api.get('/stock', { params: { variant_id: variantId } }),
    },
    {
      label: `GET /variants/${variantId}/stock`,
      call: () => api.get(`/variants/${variantId}/stock`),
    },
    {
      label: `GET /products/${productId}/stock`,
      call: () => api.get(`/products/${productId}/stock`),
    },
    {
      label: `GET /stock (filtered client-side by variant_id=${variantId})`,
      call: () => api.get('/stock'),
    },
  ];

  const errors = [];

  for (const attempt of attempts) {
    console.log(`[getVariantStock] Attempting ${attempt.label}`);
    try {
      const res = await attempt.call();
      console.log(
        `[getVariantStock] Success on ${attempt.label} — status ${res.status}, response:`,
        JSON.stringify(res.data)
      );

      // The last attempt fetches all stock, so filter it down to the variant we care about.
      let data = res.data;
      if (attempt.label.startsWith('GET /stock (filtered')) {
        const list = data?.data || data?.stock || data || [];
        if (Array.isArray(list)) {
          data = list.filter(
            (item) => String(item.variant_id ?? item.variantId) === String(variantId)
          );
        }
      }

      return data;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      console.log(
        `[getVariantStock] Failed ${attempt.label} — status ${status ?? 'N/A'}, response:`,
        body ? JSON.stringify(body) : err.message
      );
      errors.push(`${attempt.label} -> HTTP ${status ?? 'N/A'}: ${err.message}`);
    }
  }

  throw new Error(`Get variant stock failed on all attempted endpoints:\n${errors.join('\n')}`);
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
  getVariantStock: (productId, variantId) => getVariantStockWithFallback(productId, variantId),
  deleteStockItem: (stockItemId) =>
    request('Delete stock item', (api) => api.delete(`/stock/${stockItemId}`)),

  // -- Tickets -----------------------------------------------------------------
  listTickets: (params) => request('List tickets', (api) => api.get('/tickets', { params })),
  getTicket: (ticketId) => request('Get ticket', (api) => api.get(`/tickets/${ticketId}`)),
  replyTicket: (ticketId, message) =>
    request('Reply to ticket', (api) =>
      api.post(`/tickets/${ticketId}/messages`, { message })
    ),
};
