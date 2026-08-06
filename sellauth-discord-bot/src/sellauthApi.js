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
// SellAuth's documented per-variant "next stock" endpoints 404 in practice,
// so we first fetch the full unfiltered stock list and filter client-side.
// If that doesn't turn up a match we fall back to a handful of other likely
// candidate endpoints, logging every attempt so we can see exactly which
// one (if any) works in production.

// Digs through a variety of possible response shapes (plain array, Laravel
// style { data: [...] }, nested paginator { data: { data: [...] } }, etc.)
// and returns the first array it finds.
function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  if (payload && Array.isArray(payload.stock)) return payload.stock;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return null;
}

function matchesVariant(stockItem, variantId) {
  const candidates = [
    stockItem.variant_id,
    stockItem.variantId,
    stockItem.variant?.id,
    stockItem.product_variant_id,
  ];
  return candidates.some((value) => value != null && String(value) === String(variantId));
}

async function getNextStockItem(variantId) {
  const api = client();
  const errors = [];

  // First, try fetching ALL stock unfiltered and picking the first item that
  // matches the requested variant client-side. SellAuth's documented
  // per-variant "next stock" endpoints appear to 404 in practice, but the
  // plain /stock listing does work and includes every item across variants.
  try {
    console.log(`[sellauthApi] getNextStockItem: trying GET /stock (unfiltered) (variant_id=${variantId})`);
    const res = await api.get('/stock');
    console.log(
      `[sellauthApi] getNextStockItem: GET /stock (unfiltered) succeeded, response shape keys ->`,
      JSON.stringify(Object.keys(res.data || {}))
    );
    const list = extractList(res.data);
    if (list) {
      const match = list.find((stockItem) => matchesVariant(stockItem, variantId));
      if (match) {
        console.log(
          `[sellauthApi] getNextStockItem: GET /stock (unfiltered) found matching item ->`,
          JSON.stringify(match)
        );
        return { item: match, endpoint: 'GET /stock (unfiltered, client-side filter)' };
      }
      console.log(
        `[sellauthApi] getNextStockItem: GET /stock (unfiltered) returned ${list.length} item(s) but none matched variant ${variantId}, continuing.`
      );
    } else {
      console.log(
        `[sellauthApi] getNextStockItem: GET /stock (unfiltered) returned an unrecognized shape, continuing.`
      );
    }
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    console.log(`[sellauthApi] getNextStockItem: GET /stock (unfiltered) failed (HTTP ${status}): ${message}`);
    errors.push(`GET /stock (unfiltered) -> HTTP ${status}: ${message}`);
  }

  const attempts = [
    {
      label: 'GET /stock/next?variant_id=',
      run: (apiClient) => apiClient.get('/stock/next', { params: { variant_id: variantId } }),
    },
    {
      label: 'POST /stock/next { variant_id }',
      run: (apiClient) => apiClient.post('/stock/next', { variant_id: variantId }),
    },
    {
      label: 'GET /variants/:id/next',
      run: (apiClient) => apiClient.get(`/variants/${variantId}/next`),
    },
    {
      label: 'GET /stock/next/:variantId',
      run: (apiClient) => apiClient.get(`/stock/next/${variantId}`),
    },
    {
      label: 'GET /variants/:id/stock/next',
      run: (apiClient) => apiClient.get(`/variants/${variantId}/stock/next`),
    },
  ];

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
