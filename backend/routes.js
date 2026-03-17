export const routes = [
  {
    pattern: '/api/health',
    load: () => import('./health.js'),
    cacheControl: 'public, s-maxage=30, stale-while-revalidate=120'
  },
  { pattern: '/api/auth/google', load: () => import('./auth/google.js') },
  { pattern: '/api/auth/login', load: () => import('./auth/login.js') },
  { pattern: '/api/auth/me', load: () => import('./auth/me.js') },
  { pattern: '/api/auth/refresh', load: () => import('./auth/refresh.js') },
  { pattern: '/api/auth/register', load: () => import('./auth/register.js') },
  { pattern: '/api/auth/callback/google', load: () => import('./auth/callback/google.js') },

  { pattern: '/api/orders/:id/post-sale', load: () => import('./orders/[id]/post-sale.js') },
  { pattern: '/api/orders/:id/status', load: () => import('./orders/[id]/status.js') },
  { pattern: '/api/orders/:id', load: () => import('./orders/[id].js') },
  { pattern: '/api/orders', load: () => import('./orders/index.js') },
  { pattern: '/api/payments/create', load: () => import('./payments/create.js') },
  { pattern: '/api/payments/refund', load: () => import('./payments/refund.js') },
  { pattern: '/api/shipping/quote', load: () => import('./shipping/quote.js') },
  { pattern: '/api/webhooks/efi/reprocess', load: () => import('./webhooks/efi/reprocess.js') },
  { pattern: '/api/webhooks/efi/retry', load: () => import('./webhooks/efi/retry.js') },
  { pattern: '/api/webhooks/efi', load: () => import('./webhooks/efi.js') },
  { pattern: '/api/webhooks/melhor-envio', load: () => import('./webhooks/melhor-envio.js') },

  {
    pattern: '/api/products/:id/publish',
    load: () => import('./products/[id]/publish.js')
  },
  {
    pattern: '/api/products/:id',
    load: () => import('./products/[id].js'),
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=300'
  },
  {
    pattern: '/api/products',
    load: () => import('./products/index.js'),
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=300'
  },

  { pattern: '/api/sellers/me/orders', load: () => import('./sellers/me/orders.js') },
  { pattern: '/api/sellers/me/products', load: () => import('./sellers/me/products.js') },
  { pattern: '/api/sellers/me', load: () => import('./sellers/me.js') },
  {
    pattern: '/api/sellers/:id',
    load: () => import('./sellers/[id].js'),
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=300'
  },

  { pattern: '/api/users/profile', load: () => import('./users/profile.js') },
  {
    pattern: '/api/users/upgrade-to-vendor',
    load: () => import('./users/upgrade-to-vendor.js')
  },
  { pattern: '/api/users/addresses/:id', load: () => import('./users/addresses/[id].js') },
  { pattern: '/api/users/addresses', load: () => import('./users/addresses/index.js') }
];
