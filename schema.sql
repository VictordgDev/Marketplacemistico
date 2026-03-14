-- Drop in dependency order
DROP TABLE IF EXISTS shipment_events CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS manual_payouts CASCADE;
DROP TABLE IF EXISTS payment_splits CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS shipping_quotes CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS seller_shipping_profiles CASCADE;
DROP TABLE IF EXISTS seller_billing_profiles CASCADE;
DROP TABLE IF EXISTS addresses CASCADE;
DROP TABLE IF EXISTS sellers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('vendedor', 'cliente')),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    telefone VARCHAR(20) UNIQUE,
    cpf_cnpj VARCHAR(20) UNIQUE,
    tipo_documento VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sellers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome_loja VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    descricao_loja TEXT,
    logo_url VARCHAR(500),
    avaliacao_media DECIMAL(3,2) DEFAULT 0,
    total_vendas INTEGER DEFAULT 0,
    is_efi_connected BOOLEAN NOT NULL DEFAULT false,
    efi_payee_code VARCHAR(255),
    payout_mode VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (payout_mode IN ('efi_split', 'manual')),
    commission_rate NUMERIC(8,4) NOT NULL DEFAULT 0.12,
    manual_payout_fee_rate NUMERIC(8,4) NOT NULL DEFAULT 0.00,
    payout_delay_days INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seller_billing_profiles (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
    legal_name VARCHAR(255),
    cpf_cnpj VARCHAR(20),
    bank_name VARCHAR(120),
    bank_agency VARCHAR(50),
    bank_account VARCHAR(50),
    pix_key VARCHAR(255),
    pix_key_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seller_shipping_profiles (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
    from_postal_code VARCHAR(12) NOT NULL,
    from_address_line VARCHAR(255),
    from_number VARCHAR(50),
    from_district VARCHAR(120),
    from_city VARCHAR(120),
    from_state VARCHAR(2),
    from_country VARCHAR(2) DEFAULT 'BR',
    contact_name VARCHAR(255),
    contact_phone VARCHAR(30),
    document_type VARCHAR(20),
    document_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cep VARCHAR(9),
    rua VARCHAR(255),
    numero VARCHAR(20),
    complemento VARCHAR(255),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    estoque INTEGER DEFAULT 0,
    imagem_url VARCHAR(500),
    publicado BOOLEAN DEFAULT false,
    weight_kg NUMERIC(10,3),
    height_cm NUMERIC(10,2),
    width_cm NUMERIC(10,2),
    length_cm NUMERIC(10,2),
    insurance_value NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipping_quotes (
    id SERIAL PRIMARY KEY,
    cart_id VARCHAR(100),
    buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    service_id VARCHAR(100) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    carrier_name VARCHAR(255),
    price NUMERIC(10,2) NOT NULL,
    custom_price NUMERIC(10,2),
    delivery_time INTEGER,
    raw_response_json JSONB NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    comprador_id INTEGER NOT NULL REFERENCES users(id),
    vendedor_id INTEGER NOT NULL REFERENCES sellers(id),
    total DECIMAL(10,2) NOT NULL,
    items_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    shipping_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    selected_shipping_quote_id INTEGER REFERENCES shipping_quotes(id) ON DELETE SET NULL,
    shipping_address_snapshot_json JSONB,
    billing_address_snapshot_json JSONB,
    status VARCHAR(50) DEFAULT 'pendente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantidade INTEGER NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2),
    name_snapshot VARCHAR(255),
    weight_snapshot NUMERIC(10,3),
    dimension_snapshot_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_charge_id VARCHAR(255),
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    raw_response_json JSONB,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_splits (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    split_mode VARCHAR(30) NOT NULL,
    gross_amount NUMERIC(10,2) NOT NULL,
    platform_fee_amount NUMERIC(10,2) NOT NULL,
    gateway_fee_amount NUMERIC(10,2) DEFAULT 0,
    operational_fee_amount NUMERIC(10,2) DEFAULT 0,
    seller_net_amount NUMERIC(10,2) NOT NULL,
    efi_payee_code_snapshot VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE manual_payouts (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    scheduled_for TIMESTAMP,
    paid_at TIMESTAMP,
    external_reference VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100),
    external_id VARCHAR(255),
    payload_json JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'received',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    selected_service_id VARCHAR(100),
    selected_service_name VARCHAR(255),
    carrier_name VARCHAR(255),
    melhor_envio_shipment_id VARCHAR(255),
    tracking_code VARCHAR(255),
    label_url TEXT,
    protocol_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipment_events (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    event_payload_json JSONB NOT NULL,
    occurred_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_categoria ON products(categoria);
CREATE INDEX idx_products_publicado ON products(publicado);
CREATE INDEX idx_orders_comprador ON orders(comprador_id);
CREATE INDEX idx_orders_vendedor ON orders(vendedor_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(telefone);
CREATE INDEX idx_users_document ON users(cpf_cnpj);
CREATE UNIQUE INDEX idx_sellers_nome_loja_lower ON sellers(LOWER(nome_loja));
CREATE INDEX idx_shipping_quotes_cart ON shipping_quotes(cart_id);
CREATE INDEX idx_shipping_quotes_seller ON shipping_quotes(seller_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_provider_charge ON payments(provider, provider_charge_id);
CREATE INDEX idx_webhook_events_unique ON webhook_events(provider, external_id, event_type);
CREATE INDEX idx_shipments_order_id ON shipments(order_id);