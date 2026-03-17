# Payment + Shipping Setup (Efi + Melhor Envio)

## Variaveis de ambiente

### Efi
- `EFI_CLIENT_ID`
- `EFI_CLIENT_SECRET`
- `EFI_PIX_KEY`
- `EFI_BASE_URL` (opcional)
- `EFI_TOKEN_URL` (opcional)
- `EFI_PIX_CHARGE_URL` (opcional)
- `EFI_WEBHOOK_SECRET` (opcional)
- `EFI_MOCK=true` (opcional para desenvolvimento local)
- `WEBHOOK_OPS_SECRET` ou `WEBHOOK_REPROCESS_SECRET` (opcional para endpoints operacionais de replay/retry)

### Melhor Envio
- `MELHOR_ENVIO_ACCESS_TOKEN`
- `MELHOR_ENVIO_BASE_URL` (opcional)
- `MELHOR_ENVIO_QUOTE_URL` (opcional)
- `MELHOR_ENVIO_WEBHOOK_SECRET` (opcional)
- `MELHOR_ENVIO_MOCK=true` (opcional para desenvolvimento local)

## Endpoints novos

- `POST /api/payments/create`
  - body:
  - `{ "order_id": 123, "payment_method": "pix" }`

- `POST /api/shipping/quote`
  - body:
  - `{"seller_id":1,"destination_postal_code":"01311-000","items":[{"product_id":1},{"product_id":2}],"cart_id":"cart_abc"}`

- `POST /api/webhooks/efi`
  - header opcional: `x-webhook-secret`

- `POST /api/webhooks/efi/retry`
  - body opcional:
  - `{ \"limit\": 10 }`
  - header opcional para operacao interna: `x-webhook-ops-secret`

- `POST /api/webhooks/efi/reprocess`
  - body:
  - `{ \"event_id\": 123, \"force\": false }`
  - header opcional para operacao interna: `x-webhook-ops-secret`

- `POST /api/webhooks/melhor-envio`
  - header opcional: `x-webhook-secret`

## Observacoes

- No MVP, `payment_method` aceito no backend: `pix`.
- O carrinho agora bloqueia produtos de sellers diferentes no frontend.
- O backend de pedidos tambem bloqueia multivendedor (`MULTI_SELLER_NOT_ALLOWED`).
- Produtos publicados agora exigem peso e dimensoes validas.
