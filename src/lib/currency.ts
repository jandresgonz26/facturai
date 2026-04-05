import { supabase } from './supabase';

let cachedRate: number | null = null;
let lastFetch: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export const getEurToUsdRate = async (): Promise<number> => {
    // 1. Check for manual override in settings first
    try {
        const { data: settings } = await supabase
            .from('company_settings')
            .select('eur_usd_rate')
            .single();

        if (settings?.eur_usd_rate) {
            return settings.eur_usd_rate;
        }
    } catch (error) {
        console.error('Error fetching manual rate:', error);
    }

    // 2. Fallback to API with cache
    const now = Date.now();

    if (cachedRate && (now - lastFetch < CACHE_DURATION)) {
        return cachedRate;
    }

    try {
        const response = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
        const data = await response.json();

        if (data && data.rates && data.rates.USD) {
            cachedRate = data.rates.USD as number;
            lastFetch = now;
            return cachedRate;
        }

        throw new Error('Invalid API response');
    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        return cachedRate || 1.08;
    }
};
