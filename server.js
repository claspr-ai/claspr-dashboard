const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = 'https://qlypamvuoewjceqaaprv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseXBhbXZ1b2V3amNlcWFhcHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mjc5NjIsImV4cCI6MjEwNTEwMzk2Mn0.JOTzjHrf0l8ZZClZ25tJihSS-wI3cLs1l9jbvrmf4hA';
const APIFY_TOKEN = 'apify_api_d33QZ7uq4WAWuzbVTgcb1EiWjgjcpr2Uc4ZL';

// ── HELPERS ──
function httpsPost(hostname, reqPath, body, extraHeaders) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var opts = {
      hostname: hostname,
      path: reqPath,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }, extraHeaders || {})
    };
    var req = https.request(opts, function(res) {
      var out = '';
      res.on('data', function(c) { out += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(out)); } catch(e) { resolve(out); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, function() { req.destroy(); });
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, reqPath, headers) {
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: hostname, path: reqPath, method: 'GET',
      headers: headers || {},
    }, function(res) {
      var out = '';
      res.on('data', function(c) { out += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(out)); } catch(e) { resolve(out); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(); });
    req.end();
  });
}

function supabaseInsert(rows) {
  if (!rows || !rows.length) return Promise.resolve();
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Prefer': 'return=minimal'
  };
  return httpsPost('qlypamvuoewjceqaaprv.supabase.co', '/rest/v1/competitor_prices', rows, headers)
    .then(function() { console.log('Saved ' + rows.length + ' rows to Supabase'); })
    .catch(function(e) { console.log('Supabase error:', e.message); });
}

function supabaseGet(reference) {
  return httpsGet(
    'qlypamvuoewjceqaaprv.supabase.co',
    '/rest/v1/competitor_prices?reference=eq.' + encodeURIComponent(reference) + '&order=price.asc&limit=30',
    { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  );
}

// ── WATCH DETECTION ──
var WATCH_KEYWORDS = ['rolex','richard mille','rm ','patek philippe','audemars piguet','ap royal','cartier','hublot','f.p. journe','fp journe','vacheron','omega','breitling','iwc','panerai','tudor','a. lange','jaeger','zenith','tag heuer','chopard','girard'];

function isWatch(title) {
  if (!title) return false;
  var t = title.toLowerCase();
  return WATCH_KEYWORDS.some(function(k) { return t.indexOf(k) !== -1; });
}

function extractReference(title) {
  if (!title) return null;
  var patterns = [
    /\b(RM[\s\-]?[\d]+[\-\.][\d]+[A-Z]*)\b/i,
    /\b([0-9]{5,6}[A-Z]{0,4}(?:[\-\/][A-Z0-9]+)?)\b/,
    /\b([0-9]{4}[A-Z]{2,4})\b/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = title.match(patterns[i]);
    if (m) return m[1].trim().toUpperCase();
  }
  return null;
}

// ── ALL SOURCES ──

// GROUP 1: Shopify stores (free public JSON feeds)
var SHOPIFY_DEALERS = [
  { name: "Bob's Watches",    domain: 'www.bobswatches.com',       currency: 'USD' },
  { name: 'Wrist Aficionado', domain: 'wristaficionado.com',        currency: 'USD' },
  { name: 'Happy Jewelers',   domain: 'www.happyjewelers.com',      currency: 'USD' },
  { name: 'The 1916 Company', domain: 'www.the1916company.com',     currency: 'USD' },
  { name: 'DavidSW',          domain: 'davidsw.com',                currency: 'USD' },
  { name: 'Crown & Caliber',  domain: 'www.crownandcaliber.com',    currency: 'USD' },
  { name: 'Gray & Sons',      domain: 'www.grayandsons.com',        currency: 'USD' },
  { name: 'Omi Jewelers',     domain: 'www.omijewelers.com',        currency: 'USD' },
  { name: 'Avi & Co',         domain: 'www.aviandco.com',           currency: 'USD' },
  { name: 'TPT Timepiece',    domain: 'www.timepiecetradingllc.com',currency: 'USD' },
  { name: 'WatchBox',         domain: 'www.watchbox.com',           currency: 'USD' },
  { name: 'Xupes',            domain: 'www.xupes.com',              currency: 'GBP' },
  { name: 'Watchfinder',      domain: 'www.watchfinder.co.uk',      currency: 'GBP' },
  { name: 'Watches World',    domain: 'www.watchesworld.com',       currency: 'USD' },
  { name: 'Swiss Time House', domain: 'www.swisstimehouse.com',     currency: 'CAD' },
];

// GROUP 2: Apify-powered scrapes (non-Shopify, need browser)
var APIFY_DEALERS = [
  { name: 'The RealReal',     url: 'https://www.therealreal.com/c/watches', currency: 'USD' },
  { name: '1stDibs',          url: 'https://www.1stdibs.com/jewelry/watches/', currency: 'USD' },
  { name: 'Chronext',         url: 'https://www.chronext.com/watches', currency: 'EUR' },
  { name: 'Collector Square', url: 'https://www.collectorsquare.com/en/watches', currency: 'EUR' },
  { name: 'Pride & Pinion',   url: 'https://www.prideandpinion.com/collections/watches', currency: 'GBP' },
  { name: 'Beyer Chronometrie', url: 'https://www.beyer-zurich.ch/en/watches', currency: 'CHF' },
];

// GROUP 3: Chrono24 via Apify (best watch-specific data)
var CHRONO24_BRANDS = [
  'Rolex', 'Richard Mille', 'Patek Philippe', 'Audemars Piguet',
  'Cartier', 'Hublot', 'F.P. Journe', 'Vacheron Constantin'
];

// ── SCRAPER 1: Direct Shopify JSON ──
function scrapeShopifyDealer(dealer) {
  return new Promise(function(resolve) {
    var req = https.request({
      hostname: dealer.domain,
      path: '/products.json?limit=250',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          var products = json.products || [];
          var watches = [];
          products.forEach(function(p) {
            if (!isWatch(p.title)) return;
            var price = p.variants && p.variants[0] ? parseFloat(p.variants[0].price) : 0;
            if (!price || price < 1000) return;
            watches.push({
              dealer: dealer.name,
              title: p.title,
              reference: extractReference(p.title),
              price: price,
              url: 'https://' + dealer.domain + '/products/' + p.handle,
              scraped_at: new Date().toISOString()
            });
          });
          console.log('Shopify scraped ' + dealer.name + ': ' + watches.length + ' watches');
          resolve(watches);
        } catch(e) {
          console.log('Shopify blocked ' + dealer.name + ' - will use Apify');
          resolve([]);
        }
      });
    });
    req.on('error', function() { resolve([]); });
    req.setTimeout(20000, function() { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── SCRAPER 2: Apify Shopify scraper for blocked stores ──
function scrapeBlockedWithApify(blockedDealers) {
  if (!blockedDealers.length) return Promise.resolve([]);
  console.log('Using Apify for ' + blockedDealers.length + ' blocked dealers...');

  var startUrls = blockedDealers.map(function(d) {
    return { url: 'https://' + d.domain + '/collections/all' };
  });

  return httpsPost('api.apify.com',
    '/v2/acts/drobnikj~extended-shopify-scraper/run-sync-get-dataset-items?token=' + APIFY_TOKEN + '&timeout=120&memory=512',
    { startUrls: startUrls, maxProductsPerCrawl: 500, proxyConfiguration: { useApifyProxy: true } }
  ).then(function(results) {
    if (!Array.isArray(results)) return [];
    var watches = [];
    results.forEach(function(product) {
      if (!isWatch(product.title)) return;
      var dealer = null;
      blockedDealers.forEach(function(d) {
        if (product.url && product.url.indexOf(d.domain) !== -1) dealer = d.name;
      });
      if (!dealer) return;
      var price = product.price || (product.variants && product.variants[0] && product.variants[0].price);
      if (!price || parseFloat(price) < 1000) return;
      watches.push({
        dealer: dealer,
        title: product.title,
        reference: extractReference(product.title),
        price: parseFloat(price),
        url: product.url || '',
        scraped_at: new Date().toISOString()
      });
    });
    console.log('Apify Shopify got ' + watches.length + ' watches from blocked dealers');
    return watches;
  }).catch(function(e) {
    console.log('Apify Shopify error:', e.message);
    return [];
  });
}

// ── SCRAPER 3: Chrono24 via Apify ──
function scrapeChrono24() {
  console.log('Scraping Chrono24...');
  var searchUrls = CHRONO24_BRANDS.map(function(brand) {
    return { url: 'https://www.chrono24.com/search/index.htm?query=' + encodeURIComponent(brand) + '&dosearch=true&watchTypes=U&resultview=list' };
  });

  return httpsPost('api.apify.com',
    '/v2/acts/apify~web-scraper/run-sync-get-dataset-items?token=' + APIFY_TOKEN + '&timeout=120&memory=512',
    {
      startUrls: searchUrls,
      pageFunction: 'async function pageFunction(context) { const $ = context.$; var items = []; $(".article-item-container, .rwl-item-container").each(function(i, el) { var title = $(el).find(".title, h2, .rgl-item-title").first().text().trim(); var price = $(el).find(".price, .wt-price").first().text().trim(); var href = $(el).find("a").first().attr("href"); items.push({ title: title, price: price, url: href ? "https://www.chrono24.com" + href : "" }); }); return items; }',
      proxyConfiguration: { useApifyProxy: true },
      maxPagesPerCrawl: 10
    }
  ).then(function(results) {
    if (!Array.isArray(results)) return [];
    var watches = [];
    results.forEach(function(item) {
      if (!item.title || !isWatch(item.title)) return;
      var priceStr = (item.price || '').replace(/[^0-9\.]/g, '');
      var price = parseFloat(priceStr);
      if (!price || price < 1000) return;
      watches.push({
        dealer: 'Chrono24',
        title: item.title,
        reference: extractReference(item.title),
        price: price,
        url: item.url || 'https://chrono24.com',
        scraped_at: new Date().toISOString()
      });
    });
    console.log('Chrono24 got ' + watches.length + ' listings');
    return watches;
  }).catch(function(e) {
    console.log('Chrono24 error:', e.message);
    return [];
  });
}

// ── MAIN SWEEP ──
function runSweep() {
  console.log('=== Starting full market sweep ===');
  var allWatches = [];
  var blockedDealers = [];

  // Step 1: Try all Shopify dealers directly
  var shopifyPromises = SHOPIFY_DEALERS.map(function(dealer) {
    return scrapeShopifyDealer(dealer).then(function(watches) {
      if (watches.length === 0) blockedDealers.push(dealer);
      else allWatches = allWatches.concat(watches);
    });
  });

  return Promise.all(shopifyPromises)
    .then(function() {
      console.log('Direct scraped: ' + allWatches.length + ' watches, ' + blockedDealers.length + ' blocked dealers');
      // Step 2: Use Apify for blocked dealers
      return scrapeBlockedWithApify(blockedDealers);
    })
    .then(function(apifyWatches) {
      allWatches = allWatches.concat(apifyWatches);
      // Step 3: Scrape Chrono24
      return scrapeChrono24();
    })
    .then(function(c24Watches) {
      allWatches = allWatches.concat(c24Watches);
      console.log('=== Total watches found: ' + allWatches.length + ' ===');
      return supabaseInsert(allWatches);
    })
    .catch(function(e) {
      console.log('Sweep error:', e.message);
    });
}

// ── ROUTES ──
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', app: 'Claspr', sources: SHOPIFY_DEALERS.length + APIFY_DEALERS.length + 1 });
});

app.post('/api/sweep', function(req, res) {
  res.json({ status: 'sweep started', sources: SHOPIFY_DEALERS.length + ' dealers + Chrono24' });
  runSweep();
});

app.get('/api/prices/:reference', function(req, res) {
  supabaseGet(req.params.reference)
    .then(function(data) { res.json(Array.isArray(data) ? data : []); })
    .catch(function() { res.json([]); });
});

app.get('/api/status', function(req, res) {
  httpsGet(
    'qlypamvuoewjceqaaprv.supabase.co',
    '/rest/v1/competitor_prices?select=scraped_at,dealer&order=scraped_at.desc&limit=1',
    { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  ).then(function(data) {
    var rows = Array.isArray(data) ? data : [];
    res.json({ status: 'ok', last_sweep: rows[0] ? rows[0].scraped_at : null });
  }).catch(function() { res.json({ status: 'ok', last_sweep: null }); });
});

// ── AUTO SWEEP EVERY 60 MIN ──
function startSweepCycle() {
  console.log('Claspr sweep cycle started - ' + (SHOPIFY_DEALERS.length + 1) + ' sources');
  runSweep();
  setInterval(runSweep, 60 * 60 * 1000);
}

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Claspr v3 running on port ' + PORT);
  setTimeout(startSweepCycle, 5000);
});
