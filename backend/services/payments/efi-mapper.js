export function mapCreateChargePayload({ order, buyer, splitConfig, paymentMethod = 'pix' }) {
  const amount = Number(order.amount || order.grand_total || order.total || 0).toFixed(2);

  return {
    calendario: {
      expiracao: 3600
    },
    devedor: {
      nome: buyer.nome || 'Comprador',
      cpf: buyer.cpf_cnpj && buyer.cpf_cnpj.length === 11 ? buyer.cpf_cnpj : undefined
    },
    valor: {
      original: amount
    },
    chave: process.env.EFI_PIX_KEY || process.env.EFI_DEFAULT_PIX_KEY,
    solicitacaoPagador: `Pedido #${order.id}`,
    split: splitConfig || undefined,
    metadata: {
      order_id: order.id,
      payment_method: paymentMethod
    }
  };
}

export function mapEfiChargeResponse(response, fallbackPaymentMethod = 'pix') {
  const pix = response.pix || response.loc || {};
  const status = response.status || response.situacao || 'pending';

  return {
    providerChargeId: response.txid || response.id || response.provider_charge_id,
    status,
    paymentMethod: fallbackPaymentMethod,
    pixQrCode: pix.qrcode || response.qrcode,
    pixCopyPaste: pix.copiaECola || response.copia_e_cola,
    raw: response
  };
}