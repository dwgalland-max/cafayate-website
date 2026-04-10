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

  // Allow web/pdf views without auth; require cron secret for email sends
  const format = req.query.format || '';
  const isWebView = (format === 'web' || format === 'pdf');

  if (!isWebView) {
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
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

    // --- Build report ---
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Check if this is a web view request
    if (isWebView) {
      // Show sample data for template preview when no GA4 credentials
      if (!analyticsData && isWebView) {
        analyticsData = getSampleData();
        analyticsData._isSample = true;
      }
      const webHTML = buildWebReportHTML(dateStr, analyticsData);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(webHTML);
    }

    // Otherwise, send email (cron / manual trigger)
    const emailHTML = buildEmailHTML(dateStr, analyticsData);

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
    <div class="section" style="text-align:center;">
      <p style="font-size:14px;"><a href="https://cafayate.com/api/daily-report?format=web" style="color:#1e6a3a;font-weight:600;">View full report in browser &rarr;</a></p>
      <p style="font-size:12px;color:#999;">Open in browser to download as PDF or share</p>
    </div>

    <div class="footer">
      <p>CAFAYATE.COM &mdash; Insider's Guide to Salta's Wine Region</p>
      <p>This report is sent daily at 8:00 AM (Argentina time). <a href="mailto:info@cafayate.com">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

// ===== WEB / PDF REPORT =====
function buildWebReportHTML(dateStr, analytics) {
  let content = '';

  if (analytics && !analytics.error) {
    const y = analytics.yesterday || {};
    const users = parseInt(y.activeUsers || 0);
    const sessions = parseInt(y.sessions || 0);
    const pageviews = parseInt(y.screenPageViews || 0);
    const bounceRate = parseFloat(y.bounceRate || 0);
    const avgDuration = parseFloat(y.averageSessionDuration || 0);

    const ret = analytics.retention || {};
    const engagementRate = parseFloat(ret.engagementRate || 0);
    const pagesPerSession = parseFloat(ret.screenPageViewsPerSession || 0);
    const sessionsPerUser = parseFloat(ret.sessionsPerUser || 0);
    const newUsers = parseInt(ret.newUsers || 0);
    const totalUsers = parseInt(ret.activeUsers || 0);
    const returningUsers = Math.max(0, totalUsers - newUsers);
    const totalEngagementSecs = parseFloat(ret.userEngagementDuration || 0);
    const avgEngagement = totalUsers > 0 ? totalEngagementSecs / totalUsers : 0;

    const m = analytics.month || {};

    // Yesterday snapshot
    content += `
      <section class="report-section">
        <h2>Yesterday's Snapshot</h2>
        <div class="kpi-row">
          <div class="kpi"><span class="kpi-value">${users}</span><span class="kpi-label">Users</span></div>
          <div class="kpi"><span class="kpi-value">${sessions}</span><span class="kpi-label">Sessions</span></div>
          <div class="kpi"><span class="kpi-value">${pageviews}</span><span class="kpi-label">Page Views</span></div>
          <div class="kpi"><span class="kpi-value">${Math.round(bounceRate * 100)}%</span><span class="kpi-label">Bounce Rate</span></div>
          <div class="kpi"><span class="kpi-value">${formatDuration(avgDuration)}</span><span class="kpi-label">Avg. Duration</span></div>
        </div>
      </section>

      <section class="report-section">
        <h2>Engagement &amp; Retention</h2>
        <div class="kpi-row">
          <div class="kpi"><span class="kpi-value">${Math.round(engagementRate * 100)}%</span><span class="kpi-label">Engagement Rate</span></div>
          <div class="kpi"><span class="kpi-value">${pagesPerSession.toFixed(1)}</span><span class="kpi-label">Pages / Session</span></div>
          <div class="kpi"><span class="kpi-value">${formatDuration(avgEngagement)}</span><span class="kpi-label">Avg. Engagement</span></div>
          <div class="kpi"><span class="kpi-value">${sessionsPerUser.toFixed(1)}</span><span class="kpi-label">Sessions / User</span></div>
          <div class="kpi"><span class="kpi-value">${newUsers}</span><span class="kpi-label">New Users</span></div>
          <div class="kpi"><span class="kpi-value">${returningUsers}</span><span class="kpi-label">Returning</span></div>
        </div>
      </section>`;

    // New vs returning
    if (analytics.userTypes && analytics.userTypes.length > 0) {
      content += `
      <section class="report-section">
        <h2>New vs Returning (Last 7 Days)</h2>
        <table>
          <thead><tr><th>Visitor Type</th><th>Users</th><th>Sessions</th><th>Engagement Rate</th><th>Avg. Duration</th></tr></thead>
          <tbody>`;
      analytics.userTypes.forEach(r => {
        const label = r.dimensions[0] === 'new' ? 'New visitors' : r.dimensions[0] === 'returning' ? 'Returning visitors' : r.dimensions[0];
        content += `<tr><td>${label}</td><td>${parseInt(r.metrics[0]).toLocaleString()}</td><td>${parseInt(r.metrics[1]).toLocaleString()}</td><td>${Math.round(parseFloat(r.metrics[2] || 0) * 100)}%</td><td>${formatDuration(parseFloat(r.metrics[3] || 0))}</td></tr>`;
      });
      content += `</tbody></table></section>`;
    }

    // 30-day totals
    content += `
      <section class="report-section">
        <h2>30-Day Overview</h2>
        <div class="kpi-row">
          <div class="kpi"><span class="kpi-value">${parseInt(m.activeUsers || 0).toLocaleString()}</span><span class="kpi-label">Total Users</span></div>
          <div class="kpi"><span class="kpi-value">${parseInt(m.sessions || 0).toLocaleString()}</span><span class="kpi-label">Total Sessions</span></div>
          <div class="kpi"><span class="kpi-value">${parseInt(m.screenPageViews || 0).toLocaleString()}</span><span class="kpi-label">Total Page Views</span></div>
        </div>
      </section>`;

    // Two-column layout: sources + countries
    content += `<div class="two-col">`;

    // Traffic sources
    if (analytics.sources && analytics.sources.length > 0) {
      content += `
      <section class="report-section">
        <h2>Traffic Sources (7 Days)</h2>
        <table>
          <thead><tr><th>Channel</th><th>Sessions</th><th>Users</th></tr></thead>
          <tbody>`;
      analytics.sources.forEach(r => {
        content += `<tr><td>${r.dimensions[0]}</td><td>${parseInt(r.metrics[0]).toLocaleString()}</td><td>${parseInt(r.metrics[1]).toLocaleString()}</td></tr>`;
      });
      content += `</tbody></table></section>`;
    }

    // Countries
    if (analytics.countries && analytics.countries.length > 0) {
      content += `
      <section class="report-section">
        <h2>Top Countries (7 Days)</h2>
        <table>
          <thead><tr><th>Country</th><th>Users</th></tr></thead>
          <tbody>`;
      analytics.countries.forEach(r => {
        content += `<tr><td>${r.dimensions[0]}</td><td>${parseInt(r.metrics[0]).toLocaleString()}</td></tr>`;
      });
      content += `</tbody></table></section>`;
    }

    content += `</div>`; // end two-col

    // AI traffic
    if (analytics.aiTraffic && analytics.aiTraffic.length > 0) {
      content += `
      <section class="report-section">
        <h2>AI / ChatGPT Traffic (7 Days)</h2>
        <table>
          <thead><tr><th>Source</th><th>Sessions</th></tr></thead>
          <tbody>`;
      analytics.aiTraffic.forEach(r => {
        content += `<tr><td>${r.dimensions[0]}</td><td>${parseInt(r.metrics[0]).toLocaleString()}</td></tr>`;
      });
      content += `</tbody></table></section>`;
    }

    // Top pages (the big table)
    if (analytics.topPages && analytics.topPages.length > 0) {
      content += `
      <section class="report-section page-break-before">
        <h2>Page Performance (Last 7 Days)</h2>
        <table class="full-table">
          <thead><tr><th>Page</th><th>Views</th><th>Users</th><th>Avg. Time</th><th>Bounce Rate</th></tr></thead>
          <tbody>`;
      analytics.topPages.forEach(r => {
        const path = r.dimensions[0];
        let pageName = path === '/' ? 'Homepage (ES)' : path === '/en/' ? 'Homepage (EN)' : path.replace('/en/', 'EN: ').replace('/pages/', '').replace('.html', '').replace(/^\//,'').replace(/\/$/,'');
        const views = parseInt(r.metrics[0]);
        const pUsers = parseInt(r.metrics[1]);
        const engDur = parseFloat(r.metrics[2] || 0);
        const avgTime = pUsers > 0 ? engDur / pUsers : 0;
        const pBounce = parseFloat(r.metrics[3] || 0);
        const bounceColor = pBounce > 0.7 ? '#c0392b' : pBounce > 0.5 ? '#e67e22' : '#27ae60';
        content += `<tr><td>${pageName}</td><td>${views.toLocaleString()}</td><td>${pUsers.toLocaleString()}</td><td>${formatDuration(avgTime)}</td><td style="color:${bounceColor};font-weight:600">${Math.round(pBounce * 100)}%</td></tr>`;
      });
      content += `</tbody></table></section>`;
    }

  } else if (analytics && analytics.error) {
    content += `<section class="report-section"><div class="note">Analytics data unavailable: ${analytics.error}</div></section>`;
  } else {
    content += `<section class="report-section"><div class="note">Setup required: Add GOOGLE_SERVICE_ACCOUNT_KEY in Vercel to see analytics data.</div></section>`;
  }

  // Google Ads link
  content += `
    <section class="report-section">
      <h2>Google Ads</h2>
      <p>Campaign: New Website Search Campaign 2026 &bull; Budget: $12/day &bull; Optimization: 96.8%</p>
      <p><a href="https://ads.google.com/aw/overview?ocid=7007488989" class="btn-link">Open Google Ads Dashboard &rarr;</a></p>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cafayate.com — Daily Report — ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; color: #2c3e50; background: #f0f2f5; line-height: 1.5; }

    .report { max-width: 900px; margin: 0 auto; background: #fff; }

    .report-header {
      background: linear-gradient(135deg, #1a5e32 0%, #1e6a3a 50%, #247542 100%);
      color: #fff; padding: 40px 48px; position: relative;
    }
    .report-header h1 { font-size: 28px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4px; }
    .report-header .subtitle { font-size: 15px; opacity: 0.85; }
    .report-header .date { font-size: 13px; opacity: 0.65; margin-top: 8px; }

    .toolbar {
      display: flex; gap: 10px; padding: 16px 48px; background: #f8f9fa;
      border-bottom: 1px solid #e9ecef; justify-content: flex-end;
    }
    .toolbar button {
      padding: 8px 20px; border: 1px solid #1e6a3a; border-radius: 6px;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
    }
    .btn-pdf { background: #1e6a3a; color: #fff; }
    .btn-pdf:hover { background: #165c30; }
    .btn-share { background: #fff; color: #1e6a3a; }
    .btn-share:hover { background: #f0f7f2; }

    .report-body { padding: 32px 48px; }

    .report-section { margin-bottom: 32px; }
    .report-section h2 {
      font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px;
      color: #1e6a3a; border-bottom: 2px solid #1e6a3a; padding-bottom: 8px;
      margin-bottom: 16px; font-weight: 700;
    }

    .kpi-row { display: flex; flex-wrap: wrap; gap: 12px; }
    .kpi {
      flex: 1; min-width: 120px; background: #f8faf9; border: 1px solid #e8efe9;
      border-radius: 10px; padding: 16px; text-align: center;
    }
    .kpi-value { display: block; font-size: 26px; font-weight: 800; color: #1e6a3a; }
    .kpi-label { display: block; font-size: 11px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      text-align: left; padding: 10px 8px; background: #f8faf9;
      color: #1e6a3a; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.5px; font-weight: 700; border-bottom: 2px solid #d5e8d4;
    }
    tbody td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
    tbody tr:hover { background: #fafffe; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

    .note { background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 0 6px 6px 0; font-size: 14px; }

    .btn-link {
      display: inline-block; color: #1e6a3a; font-weight: 600;
      text-decoration: none; border-bottom: 1px solid #1e6a3a;
    }
    .btn-link:hover { color: #165c30; }

    .report-footer {
      text-align: center; padding: 24px 48px; border-top: 1px solid #eee;
      font-size: 12px; color: #95a5a6;
    }

    /* Print / PDF styles */
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .report { max-width: 100%; box-shadow: none; }
      .report-header { padding: 24px 32px; }
      .report-body { padding: 20px 32px; }
      .report-section { margin-bottom: 20px; break-inside: avoid; }
      .page-break-before { break-before: page; }
      .kpi { padding: 10px; }
      .kpi-value { font-size: 20px; }
      table { font-size: 11px; }
      .two-col { grid-template-columns: 1fr 1fr; }
    }

    @media (max-width: 640px) {
      .report-header, .report-body, .toolbar, .report-footer { padding-left: 20px; padding-right: 20px; }
      .kpi-row { gap: 8px; }
      .kpi { min-width: 90px; padding: 10px; }
      .kpi-value { font-size: 20px; }
      .two-col { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="report-header">
      <h1>CAFAYATE.COM</h1>
      <div class="subtitle">Daily Performance Report</div>
      <div class="date">${dateStr}</div>
    </div>

    <div class="toolbar">
      <button class="btn-share" onclick="copyLink()">Copy Link</button>
      <button class="btn-pdf" onclick="window.print()">Download PDF</button>
    </div>

    <div class="report-body">
      ${analytics && analytics._isSample ? '<div style="background:#e3f2fd;border-left:4px solid #2196f3;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;font-size:13px;color:#1565c0;"><strong>Preview Mode</strong> — Showing sample data. Connect Google Analytics to see real metrics.</div>' : ''}
      ${content}
    </div>

    <div class="report-footer">
      CAFAYATE.COM &mdash; Insider's Guide to Salta's Wine Region<br>
      Report generated ${dateStr}
    </div>
  </div>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(function() {
        var btn = document.querySelector('.btn-share');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy Link'; }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

function getSampleData() {
  return {
    yesterday: {
      activeUsers: '47', sessions: '62', screenPageViews: '185',
      bounceRate: '0.42', averageSessionDuration: '145'
    },
    retention: {
      engagedSessions: '38', engagementRate: '0.61',
      sessionsPerUser: '1.3', screenPageViewsPerSession: '3.0',
      newUsers: '31', activeUsers: '47', userEngagementDuration: '4230'
    },
    userTypes: [
      { dimensions: ['new'], metrics: ['128', '142', '0.54', '98'] },
      { dimensions: ['returning'], metrics: ['34', '51', '0.78', '210'] }
    ],
    month: { activeUsers: '842', sessions: '1105', screenPageViews: '3280' },
    sources: [
      { dimensions: ['Organic Search'], metrics: ['320', '285'] },
      { dimensions: ['Paid Search'], metrics: ['195', '178'] },
      { dimensions: ['Direct'], metrics: ['142', '130'] },
      { dimensions: ['Social'], metrics: ['48', '42'] },
      { dimensions: ['Referral'], metrics: ['22', '19'] }
    ],
    countries: [
      { dimensions: ['Argentina'], metrics: ['312'] },
      { dimensions: ['United States'], metrics: ['145'] },
      { dimensions: ['Brazil'], metrics: ['52'] },
      { dimensions: ['Spain'], metrics: ['38'] },
      { dimensions: ['United Kingdom'], metrics: ['27'] },
      { dimensions: ['Chile'], metrics: ['21'] },
      { dimensions: ['France'], metrics: ['18'] }
    ],
    aiTraffic: [
      { dimensions: ['chatgpt.com'], metrics: ['14'] },
      { dimensions: ['perplexity.ai'], metrics: ['6'] },
      { dimensions: ['copilot.microsoft.com'], metrics: ['3'] }
    ],
    topPages: [
      { dimensions: ['/'], metrics: ['420', '285', '28500', '0.38'] },
      { dimensions: ['/en/'], metrics: ['195', '158', '14200', '0.41'] },
      { dimensions: ['/pages/bodegas'], metrics: ['180', '142', '21300', '0.32'] },
      { dimensions: ['/pages/vinos'], metrics: ['156', '118', '17700', '0.35'] },
      { dimensions: ['/en/pages/bodegas'], metrics: ['98', '82', '11500', '0.37'] },
      { dimensions: ['/pages/degustaciones'], metrics: ['87', '71', '9200', '0.44'] },
      { dimensions: ['/pages/restaurantes'], metrics: ['76', '64', '7680', '0.48'] },
      { dimensions: ['/pages/visitas'], metrics: ['65', '52', '6760', '0.40'] },
      { dimensions: ['/pages/hoteles'], metrics: ['58', '45', '5400', '0.52'] },
      { dimensions: ['/pages/agenda'], metrics: ['52', '41', '4920', '0.45'] },
      { dimensions: ['/pages/lugares'], metrics: ['45', '36', '3960', '0.50'] },
      { dimensions: ['/pages/propiedad'], metrics: ['38', '30', '4560', '0.35'] },
      { dimensions: ['/en/pages/vinos'], metrics: ['34', '28', '3640', '0.39'] },
      { dimensions: ['/pages/vinotecas'], metrics: ['28', '22', '2640', '0.55'] },
      { dimensions: ['/pages/fotos'], metrics: ['24', '20', '3600', '0.28'] }
    ]
  };
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
