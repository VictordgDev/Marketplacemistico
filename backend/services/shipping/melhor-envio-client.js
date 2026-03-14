const DEFAULT_MELHOR_ENVIO_BASE_URL = process.env.MELHOR_ENVIO_BASE_URL || 'https://sandbox.melhorenvio.com.br';
const DEFAULT_MELHOR_ENVIO_QUOTE_URL =
  process.env.MELHOR_ENVIO_QUOTE_URL || `${DEFAULT_MELHOR_ENVIO_BASE_URL}/api/v2/me/shipment/calculate`;

function isMockMode() {
  return process.env.MELHOR_ENVIO_MOCK === 'true' || process.env.NODE_ENV === 'test';
}

export async function quoteShipment(payload) {
  if (isMockMode()) {
    return [
      {
        id: 'mock-pac',
        name: 'PAC',
        company: { name: 'Correios' },
        price: '22.90',
        delivery_time: 8,
        custom_price: null
      },
      {
        id: 'mock-sedex',
        name: 'SEDEX',
        company: { name: 'Correios' },
        price: '39.50',
        delivery_time: 3,
        custom_price: null
      }
    ];
  }

  const token = process.env.MELHOR_ENVIO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MELHOR_ENVIO_ACCESS_TOKEN nao configurado');
  }

  const response = await fetch(DEFAULT_MELHOR_ENVIO_QUOTE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'MarketplaceMistico/1.0'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao cotar frete no Melhor Envio: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}