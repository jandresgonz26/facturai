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

let cachedVes: { rate: number; date: string | null; at: number } | null = null;

export type VesRateSource = 'manual' | 'bcv' | 'last_invoice';

/**
 * Tasa Bs/USD para una factura nueva en bolívares. Orden: la manual de
 * Configuración (si está, manda), la oficial del BCV del día, y si esa API
 * no responde, la última que se usó en una factura. Si no hay ninguna, error:
 * mejor no facturar que imprimir un monto en Bs inventado.
 */
export const getVesRate = async (): Promise<{ rate: number; source: VesRateSource; date: string | null }> => {
    try {
        const { data: settings } = await supabase.from('company_settings').select('ves_usd_rate').single();
        if (settings?.ves_usd_rate) return { rate: Number(settings.ves_usd_rate), source: 'manual', date: null };
    } catch (error) {
        console.error('Error fetching manual VES rate:', error);
    }

    if (cachedVes && Date.now() - cachedVes.at < CACHE_DURATION) {
        return { rate: cachedVes.rate, source: 'bcv', date: cachedVes.date };
    }
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(8000) });
        const data = (await response.json()) as { promedio?: number; fechaActualizacion?: string };
        if (data?.promedio && data.promedio > 0) {
            cachedVes = { rate: data.promedio, date: data.fechaActualizacion?.slice(0, 10) ?? null, at: Date.now() };
            return { rate: cachedVes.rate, source: 'bcv', date: cachedVes.date };
        }
        throw new Error('Respuesta inválida del BCV');
    } catch (error) {
        console.error('Error fetching BCV rate:', error);
    }

    const { data: last } = await supabase
        .from('invoices')
        .select('ves_rate, issue_date')
        .not('ves_rate', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (last?.ves_rate) return { rate: Number(last.ves_rate), source: 'last_invoice', date: last.issue_date ?? null };

    throw new Error('No pude obtener la tasa del BCV. Pon una tasa Bs/USD manual en Configuración y vuelve a intentarlo.');
};
