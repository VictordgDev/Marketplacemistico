import { query } from '../db.js';
import { sanitizeInteger, sanitizeString, sanitizeNumber } from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireAuth } from '../auth-middleware.js';
import { createEfiCharge } from '../services/payments/efi-service.js';
import { normalizePaymentStatus } from '../services/payments/payment-status-machine.js';
import { recordPaymentLedgerEntries } from '../services/finance/ledger-service.js';
import { logError, logInfo } from '../observability/logger.js';
import { incrementMetric } from '../observability/metrics-store.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  incrementMetric('payments.create.request.total');

  try {
    const orderId = sanitizeInteger(req.body.order_id);
    const paymentMethod = sanitizeString(req.body.payment_method || 'pix').toLowerCase();

    if (!orderId) {
      return sendError(res, 'VALIDATION_ERROR', 'order_id obrigatorio');
    }

    const orders = await query(
      `SELECT o.id, o.comprador_id, o.vendedor_id, o.total, o.grand_total,
              s.id as seller_id, s.nome_loja, s.is_efi_connected, s.efi_payee_code,
              s.commission_rate, s.manual_payout_fee_rate
       FROM orders o
       JOIN sellers s ON s.id = o.vendedor_id
       WHERE o.id = $1 AND o.comprador_id = $2`,
      [orderId, req.user.id]
    );

    if (orders.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Pedido nao encontrado', 404);
    }

    const buyers = await query('SELECT id, nome, email, cpf_cnpj FROM users WHERE id = $1', [req.user.id]);
    if (buyers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Comprador nao encontrado', 404);
    }

    const order = orders[0];
    const amount = sanitizeNumber(order.grand_total || order.total) || 0;

    const charge = await createEfiCharge({
      order: { ...order, amount },
      buyer: buyers[0],
      seller: order,
      paymentMethod
    });

    const normalizedStatus = normalizePaymentStatus(charge.status);

    const paymentResult = await query(
      `INSERT INTO payments (
         order_id, provider, provider_charge_id, payment_method, status, amount, raw_response_json, paid_at
       )
       VALUES ($1, 'efi', $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        orderId,
        charge.providerChargeId,
        charge.paymentMethod,
        normalizedStatus,
        amount,
        JSON.stringify(charge.raw || {}),
        normalizedStatus === 'approved' ? new Date().toISOString() : null
      ]
    );

    const payment = paymentResult[0];

    const commissionRate = sanitizeNumber(order.commission_rate) ?? 0.12;
    const manualFeeRate = sanitizeNumber(order.manual_payout_fee_rate) ?? 0;
    const platformFeeAmount = amount * commissionRate;
    const operationalFeeAmount = charge.splitMode === 'manual' ? amount * manualFeeRate : 0;
    const sellerNetAmount = Math.max(0, amount - platformFeeAmount - operationalFeeAmount);

    await query(
      `INSERT INTO payment_splits (
         payment_id, seller_id, split_mode, gross_amount, platform_fee_amount,
         gateway_fee_amount, operational_fee_amount, seller_net_amount,
         efi_payee_code_snapshot, status
       )
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9)`,
      [
        payment.id,
        order.seller_id,
        charge.splitMode,
        amount,
        platformFeeAmount,
        operationalFeeAmount,
        sellerNetAmount,
        charge.splitRecipientCode || null,
        normalizedStatus === 'approved' ? 'ready' : 'pending'
      ]
    );

    if (normalizedStatus === 'approved') {
      await recordPaymentLedgerEntries({
        orderId: orderId,
        paymentId: payment.id,
        grossAmount: amount,
        platformFeeAmount,
        sellerNetAmount,
        splitMode: charge.splitMode
      });
    }

    if (charge.splitMode === 'manual') {
      await query(
        `INSERT INTO manual_payouts (
           seller_id, order_id, amount, fee_amount, status, scheduled_for
         )
         VALUES ($1, $2, $3, $4, 'pending', NOW())`,
        [order.seller_id, orderId, sellerNetAmount, operationalFeeAmount]
      );
    }

    incrementMetric('payments.create.success.total');

    return sendSuccess(res, {
      payment,
      pixQrCode: charge.pixQrCode,
      pixCopyPaste: charge.pixCopyPaste,
      splitMode: charge.splitMode
    }, 201);
  } catch (error) {
    incrementMetric('payments.create.error.total');
    logError('payments.create.error', error, {
      correlation_id: req.correlationId || null
    });
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao criar cobranca de pagamento', 500);
  }

  finally {
    logInfo('payments.create.completed', {
      correlation_id: req.correlationId || null
    });
  }
}

export default withCors(requireAuth(handler));
