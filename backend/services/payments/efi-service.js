import { createPixCharge, createPixRefund } from './efi-client.js';
import { mapCreateChargePayload, mapEfiChargeResponse, mapEfiRefundResponse } from './efi-mapper.js';

export async function createEfiCharge({ order, buyer, seller, paymentMethod = 'pix' }) {
  if (paymentMethod !== 'pix') {
    throw new Error('No MVP, somente PIX esta habilitado');
  }

  const splitConfig = seller?.is_efi_connected && seller?.efi_payee_code
    ? {
        mode: 'efi_split',
        recipient_code: seller.efi_payee_code
      }
    : {
        mode: 'manual'
      };

  const payload = mapCreateChargePayload({ order, buyer, splitConfig, paymentMethod });
  const providerResponse = await createPixCharge(payload);

  return {
    ...mapEfiChargeResponse(providerResponse, paymentMethod),
    splitMode: splitConfig.mode,
    splitRecipientCode: splitConfig.recipient_code
  };
}

export async function createEfiRefund({ providerChargeId, amount, reason }) {
  const refundReference = `refund_${Date.now()}`;
  const providerResponse = await createPixRefund({
    providerChargeId,
    amount,
    refundReference,
    reason
  });

  return {
    ...mapEfiRefundResponse(providerResponse, amount),
    refundReference
  };
}
