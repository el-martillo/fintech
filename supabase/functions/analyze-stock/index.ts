import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ticker } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: 'ticker is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `You are a financial analyst assistant. Analyze the stock or crypto ticker "${ticker}" for a retail trader on eToro.

Return ONLY a valid JSON object — no markdown fences, no preamble, no explanation. Exact structure:
{
  "ticker": "${ticker}",
  "companyName": "Full name of the company or asset",
  "price": "Approximate current price in USD as a string e.g. '182.50'",
  "priceChange1d": "1-day % change as string e.g. '+1.2%' or '-0.8%'",
  "weekChange": "1-week % change as string",
  "peRatio": "P/E ratio as string, or 'N/A' for crypto",
  "marketCap": "Market cap e.g. '2.8T' or '450B'",
  "sector": "Sector or asset class",
  "signal": "BUY or SELL or HOLD",
  "confidence": "High or Medium or Low",
  "pros": ["concise positive factor", "concise positive factor", "concise positive factor"],
  "cons": ["concise risk factor", "concise risk factor"],
  "neutral": ["one neutral context point"],
  "tradeSummary": "2-3 sentence eToro-specific recommendation with suggested timeframe and position sizing approach.",
  "etoroUrl": "https://www.etoro.com/markets/${ticker.toLowerCase()}"
}

Be specific and data-informed. Keep each bullet under 15 words.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err.error?.message || `Anthropic API error ${anthropicRes.status}` }),
        { status: anthropicRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await anthropicRes.json();
    const text = data.content.map((b: any) => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(clean);

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
