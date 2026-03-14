import { quoteShipment } from './melhor-envio-client.js';
import { mapQuotePayload, mapQuoteResponse } from './melhor-envio-mapper.js';

export async function quoteWithMelhorEnvio({ sellerOrigin, destinationPostalCode, packageInfo }) {
  const payload = mapQuotePayload({ sellerOrigin, destinationPostalCode, packageInfo });
  const rawOptions = await quoteShipment(payload);
  return {
    payload,
    options: mapQuoteResponse(rawOptions),
    rawOptions
  };
}