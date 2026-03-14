export function mapQuotePayload({ sellerOrigin, destinationPostalCode, packageInfo }) {
  return {
    from: {
      postal_code: sellerOrigin.from_postal_code,
      address: sellerOrigin.from_address_line || undefined,
      number: sellerOrigin.from_number || undefined,
      district: sellerOrigin.from_district || undefined,
      city: sellerOrigin.from_city || undefined,
      state_abbr: sellerOrigin.from_state || undefined,
      country_id: sellerOrigin.from_country || 'BR'
    },
    to: {
      postal_code: destinationPostalCode
    },
    products: [
      {
        id: 'marketplace-package',
        width: packageInfo.width_cm,
        height: packageInfo.height_cm,
        length: packageInfo.length_cm,
        weight: packageInfo.weight_kg,
        insurance_value: packageInfo.insurance_value || 0,
        quantity: 1
      }
    ]
  };
}

export function mapQuoteResponse(rawOptions) {
  const options = Array.isArray(rawOptions) ? rawOptions : [];
  return options
    .filter(option => !option.error)
    .map(option => ({
      serviceId: `${option.id}`,
      serviceName: option.name || option.service,
      carrierName: option.company?.name || option.company || 'Carrier',
      price: parseFloat(option.price || option.custom_price || 0),
      customPrice: option.custom_price ? parseFloat(option.custom_price) : null,
      deliveryTime: option.delivery_time ? parseInt(option.delivery_time, 10) : null,
      raw: option
    }));
}