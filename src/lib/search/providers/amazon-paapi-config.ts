export function amazonPartnerTag(): string | undefined {
  return (
    process.env.AMAZON_PA_API_PARTNER_TAG?.trim() ||
    process.env.AFFILIATE_AMAZON_TAG?.trim() ||
    undefined
  );
}

export function isAmazonPaapiConfigured(): boolean {
  return Boolean(
    process.env.AMAZON_PA_API_ACCESS_KEY?.trim() &&
      process.env.AMAZON_PA_API_SECRET_KEY?.trim() &&
      amazonPartnerTag(),
  );
}
