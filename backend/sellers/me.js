import { query } from '../db.js';
import {
  sanitizeString,
  sanitizeBoolean,
  sanitizePayoutMode,
  validateEfiPayeeCode,
  sanitizeDecimalPositive,
  sanitizeInteger,
  sanitizePhone
} from '../sanitize.js';
import { sendSuccess, sendError } from '../response.js';
import { withCors } from '../middleware.js';
import { requireVendedor } from '../auth-middleware.js';

function normalizeUf(value) {
  return sanitizeString(value || '').toUpperCase().slice(0, 2);
}

function normalizePostalCode(value) {
  return sanitizeString(value || '').replace(/\D+/g, '').slice(0, 8);
}

function hasAnyValue(obj) {
  return Object.values(obj).some(v => v !== undefined && v !== null && `${v}`.trim() !== '');
}

async function loadSeller(userId) {
  const rows = await query(
    `SELECT s.id, s.nome_loja, s.categoria, s.descricao_loja, s.logo_url,
            s.avaliacao_media, s.total_vendas, s.created_at,
            s.is_efi_connected, s.efi_payee_code, s.payout_mode,
            s.commission_rate, s.manual_payout_fee_rate, s.payout_delay_days,
            u.nome, u.email, u.telefone,
            bp.legal_name, bp.cpf_cnpj as billing_cpf_cnpj, bp.bank_name, bp.bank_agency,
            bp.bank_account, bp.pix_key, bp.pix_key_type,
            sp.from_postal_code, sp.from_address_line, sp.from_number, sp.from_district,
            sp.from_city, sp.from_state, sp.from_country, sp.contact_name,
            sp.contact_phone, sp.document_type, sp.document_number
     FROM sellers s
     JOIN users u ON s.user_id = u.id
     LEFT JOIN seller_billing_profiles bp ON bp.seller_id = s.id
     LEFT JOIN seller_shipping_profiles sp ON sp.seller_id = s.id
     WHERE s.user_id = $1`,
    [userId]
  );

  return rows;
}

async function handler(req, res) {
  try {
    const sellers = await loadSeller(req.user.id);

    if (sellers.length === 0) {
      return sendError(res, 'NOT_FOUND', 'Perfil de vendedor nao encontrado', 404);
    }

    if (req.method === 'GET') {
      return sendSuccess(res, { seller: sellers[0] });
    }

    if (req.method === 'PUT') {
      let {
        nome_loja,
        categoria,
        descricao_loja,
        logo_url,
        is_efi_connected,
        efi_payee_code,
        payout_mode,
        commission_rate,
        manual_payout_fee_rate,
        payout_delay_days,
        legal_name,
        cpf_cnpj,
        bank_name,
        bank_agency,
        bank_account,
        pix_key,
        pix_key_type,
        from_postal_code,
        from_address_line,
        from_number,
        from_district,
        from_city,
        from_state,
        from_country,
        contact_name,
        contact_phone,
        document_type,
        document_number
      } = req.body;

      nome_loja = sanitizeString(nome_loja);
      categoria = sanitizeString(categoria);
      descricao_loja = sanitizeString(descricao_loja);
      logo_url = sanitizeString(logo_url);

      is_efi_connected = sanitizeBoolean(is_efi_connected);
      const payoutModeValidation = sanitizePayoutMode(payout_mode);
      if (!payoutModeValidation.ok) {
        return sendError(res, 'VALIDATION_ERROR', payoutModeValidation.reason);
      }
      payout_mode = payoutModeValidation.value;

      const efiPayeeValidation = validateEfiPayeeCode(efi_payee_code, is_efi_connected);
      if (!efiPayeeValidation.ok) {
        return sendError(res, 'VALIDATION_ERROR', efiPayeeValidation.reason);
      }
      efi_payee_code = efiPayeeValidation.value;

      commission_rate = sanitizeDecimalPositive(commission_rate, { allowZero: true });
      manual_payout_fee_rate = sanitizeDecimalPositive(manual_payout_fee_rate, { allowZero: true });
      payout_delay_days = sanitizeInteger(payout_delay_days);

      if (!nome_loja || !categoria) {
        return sendError(res, 'VALIDATION_ERROR', 'Nome da loja e categoria sao obrigatorios');
      }

      const existingStore = await query(
        'SELECT id FROM sellers WHERE LOWER(nome_loja) = LOWER($1) AND user_id <> $2 LIMIT 1',
        [nome_loja, req.user.id]
      );
      if (existingStore.length > 0) {
        return sendError(res, 'STORE_NAME_TAKEN', 'Nome da loja ja cadastrado');
      }

      await query(
        `UPDATE sellers
         SET nome_loja = $1,
             categoria = $2,
             descricao_loja = $3,
             logo_url = $4,
             is_efi_connected = $5,
             efi_payee_code = $6,
             payout_mode = $7,
             commission_rate = COALESCE($8, commission_rate),
             manual_payout_fee_rate = COALESCE($9, manual_payout_fee_rate),
             payout_delay_days = COALESCE($10, payout_delay_days)
         WHERE user_id = $11`,
        [
          nome_loja,
          categoria,
          descricao_loja || '',
          logo_url || '',
          is_efi_connected,
          efi_payee_code || null,
          payout_mode,
          commission_rate,
          manual_payout_fee_rate,
          payout_delay_days,
          req.user.id
        ]
      );

      const sellerIdRows = await query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
      const sellerId = sellerIdRows[0].id;

      const billingData = {
        legal_name: sanitizeString(legal_name),
        cpf_cnpj: sanitizeString(cpf_cnpj),
        bank_name: sanitizeString(bank_name),
        bank_agency: sanitizeString(bank_agency),
        bank_account: sanitizeString(bank_account),
        pix_key: sanitizeString(pix_key),
        pix_key_type: sanitizeString(pix_key_type)
      };

      if (hasAnyValue(billingData)) {
        await query(
          `INSERT INTO seller_billing_profiles (
             seller_id, legal_name, cpf_cnpj, bank_name, bank_agency, bank_account, pix_key, pix_key_type
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (seller_id)
           DO UPDATE SET
             legal_name = EXCLUDED.legal_name,
             cpf_cnpj = EXCLUDED.cpf_cnpj,
             bank_name = EXCLUDED.bank_name,
             bank_agency = EXCLUDED.bank_agency,
             bank_account = EXCLUDED.bank_account,
             pix_key = EXCLUDED.pix_key,
             pix_key_type = EXCLUDED.pix_key_type,
             updated_at = CURRENT_TIMESTAMP`,
          [
            sellerId,
            billingData.legal_name || null,
            billingData.cpf_cnpj || null,
            billingData.bank_name || null,
            billingData.bank_agency || null,
            billingData.bank_account || null,
            billingData.pix_key || null,
            billingData.pix_key_type || null
          ]
        );
      }

      const shippingData = {
        from_postal_code: normalizePostalCode(from_postal_code),
        from_address_line: sanitizeString(from_address_line),
        from_number: sanitizeString(from_number),
        from_district: sanitizeString(from_district),
        from_city: sanitizeString(from_city),
        from_state: normalizeUf(from_state),
        from_country: sanitizeString(from_country || 'BR').toUpperCase().slice(0, 2),
        contact_name: sanitizeString(contact_name),
        contact_phone: sanitizePhone(contact_phone),
        document_type: sanitizeString(document_type),
        document_number: sanitizeString(document_number)
      };

      if (hasAnyValue(shippingData)) {
        if (!shippingData.from_postal_code || shippingData.from_postal_code.length !== 8) {
          return sendError(res, 'VALIDATION_ERROR', 'CEP de origem invalido');
        }
        if (!shippingData.from_state || shippingData.from_state.length !== 2) {
          return sendError(res, 'VALIDATION_ERROR', 'UF de origem invalida');
        }

        await query(
          `INSERT INTO seller_shipping_profiles (
             seller_id, from_postal_code, from_address_line, from_number, from_district,
             from_city, from_state, from_country, contact_name, contact_phone,
             document_type, document_number
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (seller_id)
           DO UPDATE SET
             from_postal_code = EXCLUDED.from_postal_code,
             from_address_line = EXCLUDED.from_address_line,
             from_number = EXCLUDED.from_number,
             from_district = EXCLUDED.from_district,
             from_city = EXCLUDED.from_city,
             from_state = EXCLUDED.from_state,
             from_country = EXCLUDED.from_country,
             contact_name = EXCLUDED.contact_name,
             contact_phone = EXCLUDED.contact_phone,
             document_type = EXCLUDED.document_type,
             document_number = EXCLUDED.document_number,
             updated_at = CURRENT_TIMESTAMP`,
          [
            sellerId,
            shippingData.from_postal_code,
            shippingData.from_address_line || null,
            shippingData.from_number || null,
            shippingData.from_district || null,
            shippingData.from_city || null,
            shippingData.from_state,
            shippingData.from_country,
            shippingData.contact_name || null,
            shippingData.contact_phone || null,
            shippingData.document_type || null,
            shippingData.document_number || null
          ]
        );
      }

      const updated = await loadSeller(req.user.id);
      return sendSuccess(res, { seller: updated[0] });
    }

    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  } catch (error) {
    console.error('Erro no perfil do vendedor:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao processar dados do vendedor', 500);
  }
}

export default withCors(requireVendedor(handler));