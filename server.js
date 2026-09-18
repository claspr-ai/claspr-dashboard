const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = 'https://qlypamvuoewjceqaaprv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseXBhbXZ1b2V3amNlcWFhcHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mjc5NjIsImV4cCI6MjEwNTEwMzk2Mn0.JOTzjHrf0l8ZZClZ25tJihSS-wI3cLs1l9jbvrmf4hA';
const APIFY_TOKEN = 'apify_api_d33QZ7uq4WAWuzbVTgcb1EiWjgjcpr2Uc4ZL';

function fetchJSON(url, options) {
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    var opts = Object.assign({}, options || {});
    var parsed = new URL(url);
    opts.hostname = parsed.hostname;
    opts.path = parsed.pathname + parsed.search;
    opts.method = opts.method || 'GET';
    var req = lib.request(opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function supabaseInsert(rows) {
  if (!rows.length) return Promise.resolve();
  var opts = {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  };
  return fetchJSON(SUPABASE_URL + '/rest/v1/competitor_prices', opts)
    .then(function() { console.log('Saved ' + rows.length + ' prices to Supabase'); })
    .catch(function(e) { console.log('Supabase error:', e.message); });
}

function supabaseGet(reference) {
  var url = SUPABASE_URL + '/rest/v1/competitor_prices?reference=eq.' + 
    encodeURIComponent(reference) + '&order=price.asc&limit=20';
  var opts = {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  };
  return fetchJSON(url, opts);
}

// ── APIFY ACTOR RUN ──
function runApifyActor(actorId, input) {
  var url = 'https://api.apify.com/v2/acts/' + actorId + '/run-sync-get-dataset-items?token=' + APIFY_TOKEN + '&timeout=60&memory=256';
  var opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  };
  return fetchJSON(url, opts);
}


// ── DIRECT FALLBACK SCRAPER ──
function scrapeDirectFallback() {
  console.log('Using direct fallback scraper...');
  var allWatches = [];
  var pending = DEALER_URLS.length;
  
  return new Promise(function(resolve) {
    DEALER_URLS.forEach(function(dealer) {
      var opts = {
        hostname: new URL(dealer.url).hostname,
        path: new URL(dealer.url).pathname + new URL(dealer.url).search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 15000
      };
      
      var req = https.request(opts, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var json = JSON.parse(data);
            var products = json.products || [];
            var watches = 0;
            products.forEach(function(p) {
              if (!isWatch(p.title)) return;
              var price = p.variants && p.variants[0] ? parseFloat(p.variants[0].price) : null;
              if (!price || price < 1000) return;
              allWatches.push({
                dealer: dealer.name,
                title: p.title,
                reference: extractReference(p.title),
                price: price,
                url: 'https://' + opts.hostname + '/products/' + p.handle,
                scraped_at: new Date().toISOString()
              });
              watches++;
            });
            console.log('Direct scraped ' + dealer.name + ': ' + watches + ' watches');
          } catch(e) {
            console.log('Parse error ' + dealer.name + ': ' + e.message);
          }
          pending--;
          if (pending === 0) {
            console.log('Direct fallback total: ' + allWatches.length);
            resolve(allWatches);
          }
        });
      });
      req.on('error', function(e) {
        console.log('Direct error ' + dealer.name + ': ' + e.message);
        pending--;
        if (pending === 0) resolve(allWatches);
      });
      req.setTimeout(15000, function() { req.destroy(); });
      req.end();
    });
  });
}

// ── SCRAPE SHOPIFY DEALERS VIA APIFY WEB SCRAPER ──
var DEALER_URLS = [
  { name: "Bob's Watches",    url: 'https://www.bobswatches.com/products.json?limit=250' },
  { name: 'Wrist Aficionado', url: 'https://wristaficionado.com/products.json?limit=250' },
  { name: 'Happy Jewelers',   url: 'https://www.happyjewelers.com/products.json?limit=250' },
  { name: 'The 1916 Company', url: 'https://www.the1916company.com/products.json?limit=250' },
  { name: 'DavidSW',          url: 'https://davidsw.com/products.json?limit=250' },
  { name: 'Crown & Caliber',  url: 'https://www.crownandcaliber.com/products.json?limit=250' },
  { name: 'Gray & Sons',      url: 'https://www.grayandsons.com/products.json?limit=250' },
  { name: 'Omi Jewelers',     url: 'https://www.omijewelers.com/products.json?limit=250' },
];

var WATCH_KEYWORDS = ['rolex','richard mille','rm ','patek','audemars','ap ','cartier','hublot','journe','vacheron','omega','breitling','iwc','panerai','tudor','submariner','daytona','gmt','datejust','yacht'];

function isWatch(title) {
  var t = (title || '').toLowerCase();
  return WATCH_KEYWORDS.some(function(k) { return t.indexOf(k) !== -1; });
}

function extractReference(title) {
  var patterns = [
    /\b(RM\s*[\d\-]+(?:[\.\-]\d+)?)\b/i,
    /\b([0-9]{4,6}[A-Z]{0,4}(?:[\-\/][A-Z0-9]+)?)\b/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = title.match(patterns[i]);
    if (m) return m[1].trim();
  }
  return null;
}

function scrapeAllDealers() {
  console.log('Starting Apify-powered market sweep...');
  
  // Use Apify's URL fetcher to get the JSON feeds
  var input = {
    startUrls: DEALER_URLS.map(function(d) { return { url: d.url }; }),
    pageFunction: "async function pageFunction(context) { const $ = context.$; const body = context.body; try { const data = JSON.parse(body); return { url: context.request.url, products: data.products || [] }; } catch(e) { return { url: context.request.url, products: [] }; } }",
    proxyConfiguration: { useApifyProxy: true },
    maxPagesPerCrawl: 20
  };

  return runApifyActor('apify~web-scraper', input).then(function(results) {
    var allWatches = [];
    console.log('Apify raw response type:', typeof results);
    
    // Handle different response formats
    var items = [];
    if (Array.isArray(results)) {
      items = results;
    } else if (results && Array.isArray(results.items)) {
      items = results.items;
    } else if (results && results.data && Array.isArray(results.data)) {
      items = results.data;
    } else {
      console.log('Apify response keys:', results ? Object.keys(results).join(',') : 'null');
      // Try parsing each dealer URL directly as fallback
      return scrapeDirectFallback();
    }
    var results = items;
    if (!Array.isArray(results)) {
      return allWatches;
    }

    results.forEach(function(page) {
      // Find which dealer this URL belongs to
      var dealer = null;
      DEALER_URLS.forEach(function(d) {
        if (page.url && page.url.indexOf(d.url.split('/products')[0].replace('https://','').replace('http://','')) !== -1) {
          dealer = d.name;
        }
      });
      if (!dealer) return;

      var products = page.products || [];
      products.forEach(function(p) {
        if (!isWatch(p.title)) return;
        var price = p.variants && p.variants[0] ? parseFloat(p.variants[0].price) : null;
        if (!price || price < 1000) return;
        allWatches.push({
          dealer: dealer,
          title: p.title,
          reference: extractReference(p.title),
          price: price,
          url: page.url.split('/products.json')[0] + '/products/' + p.handle,
          scraped_at: new Date().toISOString()
        });
      });
      console.log('Processed ' + dealer + ': ' + products.filter(function(p){ return isWatch(p.title); }).length + ' watches');
    });

    console.log('Total watches scraped: ' + allWatches.length);
    return allWatches;
  }).catch(function(e) {
    console.log('Apify sweep error:', e.message);
    return [];
  });
}

// ── ROUTES ──
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', app: 'Claspr' });
});

app.post('/api/sweep', function(req, res) {
  res.json({ status: 'sweep started' });
  scrapeAllDealers().then(supabaseInsert);
});

app.get('/api/prices/:reference', function(req, res) {
  supabaseGet(req.params.reference)
    .then(function(data) { res.json(Array.isArray(data) ? data : []); })
    .catch(function() { res.json([]); });
});

app.get('/api/status', function(req, res) {
  var url = SUPABASE_URL + '/rest/v1/competitor_prices?select=scraped_at&order=scraped_at.desc&limit=1';
  var opts = { method:'GET', headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY } };
  fetchJSON(url, opts).then(function(data) {
    var rows = Array.isArray(data) ? data : [];
    res.json({ status:'ok', last_sweep: rows[0] ? rows[0].scraped_at : null, total: rows.length });
  }).catch(function(){ res.json({ status:'ok', last_sweep:null }); });
});

// ── AUTO SWEEP EVERY 60 MIN ──
function startSweepCycle() {
  console.log('Starting sweep cycle...');
  scrapeAllDealers().then(supabaseInsert);
  setInterval(function() {
    scrapeAllDealers().then(supabaseInsert);
  }, 60 * 60 * 1000);
}

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Claspr running on port ' + PORT);
  setTimeout(startSweepCycle, 5000);
});
