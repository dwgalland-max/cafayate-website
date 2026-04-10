const { Resend } = require('resend');
const { google } = require('googleapis');

const resend = new Resend(process.env.RESEND_API_KEY);

// GA4 Property ID (numeric, from GA4 admin)
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '375239353';
const REPORT_EMAIL = process.env.REPORT_EMAIL || 'dwgalland@gmail.com';

module.exports = async function handler(req, res) {
  // Allow GET (for cron) and POST (for manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow if no CRON_SECRET is set (for testing)
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // --- Fetch GA4 Analytics Data ---
    let analyticsData = null;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      try {
        const credentials = JSON.parse(serviceAccountKey);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/analytics.readonly']
        });
        const analyticsDataClient = google.analyticsdata({ version: 'v1beta', auth });

        // Yesterday's data
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Last 7 days for comparison
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        // Last 30 days
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthAgoStr = monthAgo.toISOString().split('T')[0];

        // --- Report 1: Yesterday's overview ---
        const yesterdayReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: yesterdayStr, endDate: yesterdayStr }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'sessions' },
              { name: 'screenPageViews' },
              { name: 'bounceRate' },
              { name: 'averageSessionDuration' }
            ]
          }
        });

        // --- Report 2: Last 7 days by source ---
        const sourceReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: weekAgoStr, endDate: yesterdayStr }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' }
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10
          }
        });

        // --- Report 3: Top pages last 7 days (with retention metrics) ---
        const pagesReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: weekAgoStr, endDate: yesterdayStr }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
              { name: 'screenPageViews' },
              { name: 'activeUsers' },
              { name: 'userEngagementDuration' },
              { name: 'bounceRate' }
            ],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 15
          }
        });

        // --- Report 4: Last 7 days by country ---
        const countryReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: weekAgoStr, endDate: yesterdayStr }],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
            limit: 10
          }
        });

        // --- Report 5: Last 30 days totals for trend ---
        const monthReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: monthAgoStr, endDate: yesterdayStr }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'sessions' },
              { name: 'screenPageViews' }
            ]
          }
        });

        // --- Report 5b: Retention & engagement metrics (yesterday) ---
        const retentionReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: yesterdayStr, endDate: yesterdayStr }],
            metrics: [
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'sessionsPerUser' },
              { name: 'screenPageViewsPerSession' },
              { name: 'newUsers' },
              { name: 'activeUsers' },
              { name: 'userEngagementDuration' }
            ]
          }
        });

        // --- Report 5c: New vs returning users (last 7 days) ---
        const userTypeReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: weekAgoStr, endDate: yesterdayStr }],
            dimensions: [{ name: 'newVsReturning' }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'sessions' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' }
            ],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
          }
        });

        // --- Report 6: Traffic from AI sources (ChatGPT, etc.) ---
        const aiReport = await analyticsDataClient.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: weekAgoStr, endDate: yesterdayStr }],
            dimensions: [{ name: 'sessionSource' }],
            metrics: [{ name: 'sessions' }],
            dimensionFilter: {
              orGroup: {
                expressions: [
                  { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: 'chatgpt' } } },
                  { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: 'openai' } } },
                  { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: 'claude' } } },
                  { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: 'perplexity' } } },
                  { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: 'copilot' } } }
                ]
              }
            },
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
          }
        });

        analyticsData = {
          yesterday: parseSimpleReport(yesterdayReport.data),
          sources: parseReport(sourceReport.data),
          topPages: parseReport(pagesReport.data),
          countries: parseReport(countryReport.data),
          month: parseSimpleReport(monthReport.data),
          retention: parseSimpleReport(retentionReport.data),
          userTypes: parseReport(userTypeReport.data),
          aiTraffic: parseReport(aiReport.data),
          yesterdayDate: yesterdayStr,
          weekAgoDate: weekAgoStr,
          monthAgoDate: monthAgoStr
        };
      } catch (gaError) {
        console.error('GA4 API error:', gaError.message);
        analyticsData = { error: gaError.message };
      }
    }

    // --- Build email HTML ---
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const emailHTML = buildEmailHTML(dateStr, analyticsData);

    // --- Send via Resend ---
    await resend.emails.send({
      from: 'CAFAYATE.com Reports <reports@cafayate.com>',
      to: [REPORT_EMAIL],
      subject: `Cafayate.com Daily Report — ${dateStr}`,
      html: emailHTML
    });

    return res.status(200).json({ success: true, message: 'Report sent' });

  } catch (err) {
    console.error('Daily report error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Parse a report with dimensions + metrics into rows
function parseReport(data) {
  if (!data || !data.rows) return [];
  return data.rows.map(row => ({
    dimensions: (row.dimensionValues || []).map(d => d.value),
    metrics: (row.metricValues || []).map(m => m.value)
  }));
}

// Parse a report with only metrics (no dimensions)
function parseSimpleReport(data) {
  if (!data || !data.rows || !data.rows[0]) return {};
  const headers = (data.metricHeaders || []).map(h => h.name);
  const values = (data.rows[0].metricValues || []).map(m => m.value);
  const result = {};
  headers.forEach((h, i) => { result[h] = values[i]; });
  return result;
}

function buildEmailHTML(dateStr, analytics) {
  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #1e6a3a; color: #fff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.85; font-size: 14px; }
    .section { padding: 20px 24px; border-bottom: 1px solid #eee; }
    .section h2 { font-size: 16px; color: #1e6a3a; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stats-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .stat-box { flex: 1; min-width: 120px; background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #1e6a3a; }
    .stat-label { font-size: 12px; color: #777; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 8px 4px; border-bottom: 2px solid #1e6a3a; color: #1e6a3a; font-size: 12px; text-transform: uppercase; }
    td { padding: 6px 4px; border-bottom: 1px solid #eee; }
    td:last-child, th:last-child { text-align: right; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #999; }
    .note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin: 12px 0; font-size: 13px; border-radius: 0 4px 4px 0; }
    .ai-badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CAFAYATE.COM</h1>
      <p>Daily Performance Report &mdash; ${dateStr}</p>
    </div>`;

  // --- Yesterday's snapshot ---
  if (analytics && !analytics.error) {
    const y = analytics.yesterday || {};
    const users = parseInt(y.activeUsers || 0);
    const sessions = parseInt(y.sessions || 0);
    const pageviews = parseInt(y.screenPageViews || 0);
    const bounceRate = parseFloat(y.bounceRate || 0);
    const avgDuration = parseFloat(y.averageSessionDuration || 0);

    html += `
    <div class="section">
      <h2>Yesterday's Snapshot</h2>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${users}</div>
          <div class="stat-label">Users</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${sessions}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${pageviews}</div>
          <div class="stat-label">Page Views</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${Math.round(bounceRate * 100)}%</div>
          <div class="stat-label">Bounce Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${formatDuration(avgDuration)}</div>
          <div class="stat-label">Avg. Duration</div>
        </div>
      </div>
    </div>`;

    // --- Engagement & retention ---
    const ret = analytics.retention || {};
    const engagedSessions = parseInt(ret.engagedSessions || 0);
    const engagementRate = parseFloat(ret.engagementRate || 0);
    const sessionsPerUser = parseFloat(ret.sessionsPerUser || 0);
    const pagesPerSession = parseFloat(ret.screenPageViewsPerSession || 0);
    const newUsers = parseInt(ret.newUsers || 0);
    const totalUsers = parseInt(ret.activeUsers || 0);
    const returningUsers = Math.max(0, totalUsers - newUsers);
    const totalEngagementSecs = parseFloat(ret.userEngagementDuration || 0);
    const avgEngagementPerUser = totalUsers > 0 ? totalEngagementSecs / totalUsers : 0;

    html += `
    <div class="section">
      <h2>Engagement &amp; Retention (Yesterday)</h2>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${Math.round(engagementRate * 100)}%</div>
          <div class="stat-label">Engagement Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${pagesPerSession.toFixed(1)}</div>
          <div class="stat-label">Pages / Session</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${formatDuration(avgEngagementPerUser)}</div>
          <div class="stat-label">Avg. Engagement</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${sessionsPerUser.toFixed(1)}</div>
          <div class="stat-label">Sessions / User</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${newUsers}</div>
          <div class="stat-label">New Users</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${returningUsers}</div>
          <div class="stat-label">Returning Users</div>
        </div>
      </div>
    </div>`;

    // --- New vs returning users (last 7 days) ---
    if (analytics.userTypes && analytics.userTypes.length > 0) {
      html += `
    <div class="section">
      <h2>New vs Returning Users (Last 7 Days)</h2>
      <table>
        <tr><th>Type</th><th>Users</th><th>Sessions</th><th>Eng. Rate</th><th>Avg. Duration</th></tr>`;
      analytics.userTypes.forEach(r => {
        const label = r.dimensions[0] === 'new' ? 'New visitors' : r.dimensions[0] === 'returning' ? 'Returning visitors' : r.dimensions[0];
        const er = parseFloat(r.metrics[2] || 0);
        const dur = parseFloat(r.metrics[3] || 0);
        html += `<tr><td>${label}</td><td style="text-align:right">${parseInt(r.metrics[0]).toLocaleString()}</td><td style="text-align:right">${parseInt(r.metrics[1]).toLocaleString()}</td><td style="text-align:right">${Math.round(er * 100)}%</td><td style="text-align:right">${formatDuration(dur)}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // --- 30-day totals ---
    const m = analytics.month || {};
    html += `
    <div class="section">
      <h2>Last 30 Days</h2>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${parseInt(m.activeUsers || 0).toLocaleString()}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${parseInt(m.sessions || 0).toLocaleString()}</div>
          <div class="stat-label">Total Sessions</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${parseInt(m.screenPageViews || 0).toLocaleString()}</div>
          <div class="stat-label">Total Page Views</div>
        </div>
      </div>
    </div>`;

    // --- Traffic sources (last 7 days) ---
    if (analytics.sources && analytics.sources.length > 0) {
      html += `
    <div class="section">
      <h2>Traffic Sources (Last 7 Days)</h2>
      <table>
        <tr><th>Channel</th><th>Sessions</th><th>Users</th></tr>`;
      analytics.sources.forEach(r => {
        html += `<tr><td>${r.dimensions[0]}</td><td style="text-align:right">${parseInt(r.metrics[0]).toLocaleString()}</td><td style="text-align:right">${parseInt(r.metrics[1]).toLocaleString()}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // --- AI Traffic ---
    if (analytics.aiTraffic && analytics.aiTraffic.length > 0) {
      html += `
    <div class="section">
      <h2>AI / ChatGPT Traffic <span class="ai-badge">NEW</span></h2>
      <table>
        <tr><th>Source</th><th>Sessions</th></tr>`;
      analytics.aiTraffic.forEach(r => {
        html += `<tr><td>${r.dimensions[0]}</td><td style="text-align:right">${parseInt(r.metrics[0]).toLocaleString()}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // --- Top pages with engagement ---
    if (analytics.topPages && analytics.topPages.length > 0) {
      html += `
    <div class="section">
      <h2>Top Pages (Last 7 Days)</h2>
      <table>
        <tr><th>Page</th><th>Views</th><th>Users</th><th>Time on Page</th><th>Bounce</th></tr>`;
      analytics.topPages.forEach(r => {
        const path = r.dimensions[0];
        const pageName = path === '/' ? 'Homepage (ES)' : path === '/en/' ? 'Homepage (EN)' : path.replace('/en/', '🇺🇸 ').replace('/pages/', '').replace('.html', '').replace(/^\//,'').replace(/\/$/,'');
        const views = parseInt(r.metrics[0]);
        const users = parseInt(r.metrics[1]);
        const engDuration = parseFloat(r.metrics[2] || 0);
        const avgTimeOnPage = users > 0 ? engDuration / users : 0;
        const pageBounce = parseFloat(r.metrics[3] || 0);
        html += `<tr><td>${pageName}</td><td style="text-align:right">${views.toLocaleString()}</td><td style="text-align:right">${users.toLocaleString()}</td><td style="text-align:right">${formatDuration(avgTimeOnPage)}</td><td style="text-align:right">${Math.round(pageBounce * 100)}%</td></tr>`;
      });
      html += `</table></div>`;
    }

    // --- Countries ---
    if (analytics.countries && analytics.countries.length > 0) {
      html += `
    <div class="section">
      <h2>Top Countries (Last 7 Days)</h2>
      <table>
        <tr><th>Country</th><th>Users</th></tr>`;
      analytics.countries.forEach(r => {
        html += `<tr><td>${r.dimensions[0]}</td><td style="text-align:right">${parseInt(r.metrics[0]).toLocaleString()}</td></tr>`;
      });
      html += `</table></div>`;
    }

  } else if (analytics && analytics.error) {
    html += `
    <div class="section">
      <div class="note">
        <strong>Analytics data unavailable:</strong> ${analytics.error}<br>
        Check that GOOGLE_SERVICE_ACCOUNT_KEY is set correctly in Vercel environment variables.
      </div>
    </div>`;
  } else {
    html += `
    <div class="section">
      <div class="note">
        <strong>Setup required:</strong> To see analytics data in this report, add the GOOGLE_SERVICE_ACCOUNT_KEY environment variable in Vercel.<br><br>
        Steps:<br>
        1. Go to <a href="https://console.cloud.google.com">Google Cloud Console</a><br>
        2. Create a service account with Analytics read access<br>
        3. Add the service account email as a Viewer in GA4 Admin<br>
        4. Download the JSON key and paste it as GOOGLE_SERVICE_ACCOUNT_KEY in Vercel
      </div>
    </div>`;
  }

  // --- Google Ads reminder ---
  html += `
    <div class="section">
      <h2>Google Ads Quick Link</h2>
      <p style="font-size:14px;">View your full Google Ads dashboard: <a href="https://ads.google.com/aw/overview?ocid=7007488989" style="color:#1e6a3a;">Open Google Ads</a></p>
      <p style="font-size:12px;color:#999;">Campaign: New Website Search Campaign 2026 &bull; Budget: $12/day &bull; Optimization: 96.8%</p>
    </div>`;

  html += `
    <div class="footer">
      <p>CAFAYATE.COM &mdash; Insider's Guide to Salta's Wine Region</p>
      <p>This report is sent daily at 8:00 AM (Argentina time). <a href="mailto:info@cafayate.com">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
