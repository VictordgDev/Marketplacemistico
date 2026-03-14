const DEFAULT_EFI_BASE_URL = process.env.EFI_BASE_URL || 'https://pix-h.api.efipay.com.br';
const DEFAULT_EFI_TOKEN_URL = process.env.EFI_TOKEN_URL || `${DEFAULT_EFI_BASE_URL}/oauth/token`;
const DEFAULT_EFI_PIX_CHARGE_URL = process.env.EFI_PIX_CHARGE_URL || `${DEFAULT_EFI_BASE_URL}/v2/cob`;

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function isMockMode() {
  return process.env.EFI_MOCK === 'true' || process.env.NODE_ENV === 'test';
}

async function fetchToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 10_000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.EFI_CLIENT_ID;
  const clientSecret = process.env.EFI_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('EFI_CLIENT_ID e EFI_CLIENT_SECRET sao obrigatorios');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(DEFAULT_EFI_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ grant_type: 'client_credentials' })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao autenticar com EFI: ${response.status} ${text}`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 300) * 1000)
  };

  return tokenCache.accessToken;
}

export async function createPixCharge(payload) {
  if (isMockMode()) {
    return {
      provider_charge_id: `efi_mock_${Date.now()}`,
      status: 'pending',
      payment_method: 'pix',
      pix_qr_code: '00020126580014BR.GOV.BCB.PIX0136mock-pix-key',
      pix_copy_paste: '00020126580014BR.GOV.BCB.PIX0136mock-pix-key',
      raw: { mock: true, payload }
    };
  }

  const token = await fetchToken();
  const response = await fetch(DEFAULT_EFI_PIX_CHARGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao criar cobranca EFI: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

export async function getChargeStatus(providerChargeId) {
  if (isMockMode()) {
    return { provider_charge_id: providerChargeId, status: 'approved', raw: { mock: true } };
  }

  const token = await fetchToken();
  const url = `${DEFAULT_EFI_PIX_CHARGE_URL}/${providerChargeId}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao consultar cobranca EFI: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}