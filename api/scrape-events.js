const Anthropic = require('@anthropic-ai/sdk');

// ── Config ──────────────────────────────────────────────────────────────
const GITHUB_OWNER = 'dwgalland-max';
const GITHUB_REPO = 'cafayate-website';
const EVENTS_PATH = 'data/events.json';
const GITHUB_BRANCH = 'main';

const SEARCH_QUERIES = [
  'Cafayate eventos vino degustación',
  'Cafayate wine tasting event',
  'Cafayate bodega evento',
  'Cafayate festival música cultura',
  'Museo de la Vid y el Vino Cafayate evento',
  'Cafayate Salta agenda cultural',
  // Nearby Calchaquí Valley towns
  'San Carlos Salta Calchaquí eventos',
  'Animaná Salta eventos',
  'Tolombón Salta eventos',
];

// Known sources to check directly
const KNOWN_SOURCES = [
  'https://www.cafayate.tur.ar/',
  'https://turismosalta.gov.ar/',
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ─────────────────────────────────────────────────────────────

// Web search via Brave Search API. Web-wide by default — no CSE config dance.
// Free tier: 2,000 queries/month, 1 query/sec.
//
// Returns { items, error } so the handler can distinguish:
//   - missing env vars (config issue)
//   - HTTP non-OK (rate limit / quota / auth)
//   - fetch exception (network / timeout)
//   - successful zero-result query (error: null, items: [])
async function searchWeb(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return { items: [], error: { code: 'missing_env', detail: 'BRAVE_SEARCH_API_KEY not set' } };
  }

  // Restrict to the last 14 days, same as the previous Google implementation.
  const fmt = d => d.toISOString().split('T')[0];
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000);
  const freshness = `${fmt(twoWeeksAgo)}to${fmt(today)}`;

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&freshness=${freshness}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });
    if (!resp.ok) {
      let body = '';
      try { body = (await resp.text()).slice(0, 400); } catch (_) {}
      console.warn(`[scrape] search "${query}" -> HTTP ${resp.status}: ${body}`);
      return { items: [], error: { code: `http_${resp.status}`, detail: body } };
    }
    const data = await resp.json();
    const results = (data.web && data.web.results) || [];
    const items = results.map(item => ({
      title: item.title || '',
      snippet: item.description || '',
      link: item.url || '',
    }));
    return { items, error: null };
  } catch (e) {
    console.error(`[scrape] search "${query}" -> fetch exception:`, e.message);
    return { items: [], error: { code: 'fetch_exception', detail: e.message } };
  }
}

async function fetchPageText(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'CafayateEventBot/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    // Strip HTML tags, scripts, styles — rough but effective
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Limit to 8k chars per page
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e.message);
    return '';
  }
}

async function getExistingEvents() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${EVENTS_PATH}?ref=${GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!resp.ok) throw new Error(`GitHub GET failed: ${resp.status}`);
  const data = await resp.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { events: JSON.parse(content), sha: data.sha };
}

async function commitEvents(events, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${EVENTS_PATH}`;
  const content = Buffer.from(JSON.stringify(events, null, 2) + '\n').toString('base64');
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch: GITHUB_BRANCH,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub PUT failed: ${resp.status} — ${err}`);
  }
  return resp.json();
}

function deduplicateEvents(existing, newEvents) {
  const key = (e) => `${e.date}|${e.title_en.toLowerCase().trim()}`;
  const existingKeys = new Set(existing.map(key));
  const unique = newEvents.filter((e) => !existingKeys.has(key(e)));
  return unique;
}

function cleanOldEvents(events, keepDays = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return events.filter((e) => e.date >= cutoffStr);
}

// ── Main extraction with Claude ─────────────────────────────────────────

async function extractEvents(searchResults, pageTexts, existingEvents) {
  const today = new Date().toISOString().split('T')[0];

  const existingSummary = existingEvents
    .map((e) => `- ${e.date}: ${e.title_en} @ ${e.location}`)
    .join('\n');

  const searchContext = searchResults
    .map((r) => `[${r.title}] ${r.snippet} (${r.link})`)
    .join('\n');

  const pagesContext = pageTexts
    .map((p) => `--- Page: ${p.url} ---\n${p.text}`)
    .join('\n\n');

  const prompt = `You are an event extraction assistant for Cafayate, Argentina — a wine tourism town in the Calchaquí Valleys of Salta province.

Today's date: ${today}

EXISTING EVENTS (do NOT duplicate these):
${existingSummary || '(none)'}

Below are Google search results and web page content about events in Cafayate. Extract any NEW events you find that are NOT already in the existing list above.

SEARCH RESULTS:
${searchContext || '(no results)'}

WEB PAGE CONTENT:
${pagesContext || '(no pages fetched)'}

INSTRUCTIONS:
- LOCATION RULE — only extract events whose physical location is one of:
  Cafayate, San Carlos (Salta), Animaná, or Tolombón. These are all towns in
  the Calchaquí Valleys of Salta province, Argentina.
- REJECT (do not extract) events located anywhere else, including but not
  limited to: Salta capital city, Jujuy province (any town), Tucumán province
  (any town, including Amaicha del Valle and San Miguel de Tucumán), Buenos
  Aires, Mendoza, Córdoba, Rosario, or any province other than Salta. An
  event being "wine-related" or "near Cafayate in spirit" does NOT qualify —
  the venue must physically be in one of the four listed towns.
- If the source text doesn't make the exact town/city of the event clear,
  skip it. When in doubt, do not extract.
- Only extract events with enough detail (at least a title, approximate date, and location)
- Events can be: wine tastings, festivals, cultural events, concerts, art exhibitions, food events, markets, sports events, etc.
- If a date is approximate (e.g. "this weekend"), calculate the actual date based on today (${today})
- For recurring events (e.g. "every Saturday"), create ONE entry for the next occurrence only
- Provide descriptions in both Spanish and English
- Category should be one of: wine, music, culture, food, sports, market, festival, other
- If no new events are found, return an empty array

Return ONLY a valid JSON array (no markdown, no explanation) with objects in this exact format:
[
  {
    "title_es": "...",
    "title_en": "...",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "location": "...",
    "description_es": "...",
    "description_en": "...",
    "category": "...",
    "website": "..."
  }
]

If time is unknown, use "". If website is unknown, use "".
Return [] if no new events found.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();

  // Parse JSON — handle potential markdown wrapping
  let jsonStr = text;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const events = JSON.parse(jsonStr);
    if (!Array.isArray(events)) return [];
    // Validate each event has required fields
    return events.filter(
      (e) => e.title_es && e.title_en && e.date && e.location
    );
  } catch (e) {
    console.error('Failed to parse Claude response:', e.message);
    console.error('Raw response:', text.slice(0, 500));
    return [];
  }
}

// ── Handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Allow Vercel cron, or manual trigger via CRON_SECRET / NEWSLETTER_ADMIN_KEY
  const isAuthorized =
    req.headers.authorization === `Bearer ${process.env.CRON_SECRET}` ||
    req.headers['x-vercel-cron'] === '1' ||
    (req.method === 'POST' && req.body?.secret === process.env.CRON_SECRET) ||
    (process.env.NEWSLETTER_ADMIN_KEY && req.query.key === process.env.NEWSLETTER_ADMIN_KEY);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const searchConfigured = !!process.env.BRAVE_SEARCH_API_KEY;
    console.log(`[scrape] starting; search API configured: ${searchConfigured}; queries: ${SEARCH_QUERIES.length}`);

    // 1. Get existing events from GitHub
    const { events: existingEvents, sha } = await getExistingEvents();
    console.log(`[scrape] found ${existingEvents.length} existing events`);

    // 2. Web search for recent Calchaquí Valley events (with per-query diagnostics)
    const allResults = [];
    const searchStats = []; // per-query results so failures are visible
    for (const query of SEARCH_QUERIES) {
      const { items, error } = await searchWeb(query);
      searchStats.push({
        query,
        items: items.length,
        error: error ? error.code : null,
      });
      allResults.push(...items);
      // Brave free tier is 1 query/sec — wait 1.1s between queries to stay under the limit.
      await new Promise((r) => setTimeout(r, 1100));
    }
    const failedQueries = searchStats.filter(s => s.error);
    console.log(`[scrape] search done: ${allResults.length} total results; ${failedQueries.length}/${SEARCH_QUERIES.length} queries failed`);
    if (failedQueries.length) {
      const errorCodes = [...new Set(failedQueries.map(f => f.error))];
      console.log(`[scrape] error codes seen: ${errorCodes.join(', ')}`);
    }

    // Deduplicate URLs
    const seenUrls = new Set();
    const uniqueResults = allResults.filter((r) => {
      if (seenUrls.has(r.link)) return false;
      seenUrls.add(r.link);
      return true;
    });

    // 3. Fetch top pages for more detail (limit to 8 pages)
    const pagesToFetch = [
      ...uniqueResults.slice(0, 6).map((r) => r.link),
      ...KNOWN_SOURCES,
    ];

    const pageTexts = [];
    for (const url of pagesToFetch) {
      const text = await fetchPageText(url);
      if (text.length > 100) {
        pageTexts.push({ url, text });
      }
    }
    console.log(`Fetched ${pageTexts.length} pages`);

    // 4. Use Claude to extract events
    const newEvents = await extractEvents(
      uniqueResults,
      pageTexts,
      existingEvents
    );
    console.log(`Claude extracted ${newEvents.length} new events`);

    if (newEvents.length === 0) {
      return res.status(200).json({
        message: 'No new events found',
        existing: existingEvents.length,
        searched: uniqueResults.length,
        search_configured: searchConfigured,
        search_stats: searchStats,
        pages_fetched: pageTexts.length,
      });
    }

    // 5. Deduplicate against existing
    const uniqueNewEvents = deduplicateEvents(existingEvents, newEvents);
    console.log(`${uniqueNewEvents.length} events after dedup`);

    if (uniqueNewEvents.length === 0) {
      return res.status(200).json({
        message: 'All found events already exist',
        existing: existingEvents.length,
        searched: uniqueResults.length,
        search_configured: searchConfigured,
        search_stats: searchStats,
      });
    }

    // 6. Merge, clean old events, sort by date
    const merged = [...existingEvents, ...uniqueNewEvents];
    const cleaned = cleanOldEvents(merged);
    cleaned.sort((a, b) => a.date.localeCompare(b.date));

    // 7. Commit to GitHub
    const titles = uniqueNewEvents.map((e) => e.title_en).join(', ');
    await commitEvents(
      cleaned,
      sha,
      `Auto-add events: ${titles.slice(0, 72)}`
    );
    console.log('Committed updated events.json');

    return res.status(200).json({
      message: `Added ${uniqueNewEvents.length} new event(s)`,
      added: uniqueNewEvents.map((e) => ({
        title: e.title_en,
        date: e.date,
      })),
      total: cleaned.length,
      searched: uniqueResults.length,
      search_configured: searchConfigured,
      search_stats: searchStats,
    });
  } catch (err) {
    console.error('Scrape error:', err);
    return res.status(500).json({ error: err.message });
  }
};
