/**
 * Bot detection — to filter out crawler noise from Sentry.
 *
 * Coverage: Googlebot, Bingbot, Slurp, DuckDuckBot, Baiduspider, YandexBot,
 * facebookexternalhit, Twitterbot, LinkedInBot, WhatsApp, Telegrambot,
 * AhrefsBot, SemrushBot, MJ12bot, DataForSeoBot, generic curl/wget/python-requests.
 */

const BOT_REGEX =
  /bot|crawler|spider|crawling|scraper|http(?:client|client)|curl\/|wget\/|python-requests|preview|fetch|axios\/|node-fetch|lighthouse|headlesschrome|pingdombot|uptimerobot|statuscake|datadog/i;

export function isBot(userAgent?: string | null): boolean {
  if (!userAgent) return false;
  return BOT_REGEX.test(userAgent);
}
