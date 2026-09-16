const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = 'https://qlypamvuoewjceqaaprv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFseXBhbXZ1b2V3amNlcWFhcHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Mjc5NjIsImV4cCI6MjEwNTEwMzk2Mn0.JOTzjHrf0l8ZZClZ25tJihSS-wI3cLs1l9jbvrmf4hA';

function fetchJSON(url, options) {
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    var opts = Object.assign({}, options || {});
    var req = lib.request(url, opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({}); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function supabaseRequest(method, table, body) {
  var url = SUPABASE_URL + '/rest/v1/' + table;
  var opts = {
    method: method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetchJSON(url, opts);
}

var SHOPIFY_DEALERS = [
  { name: "Bob's Watches", url: 'https://www.bobswatches.com/products.json?limit=250' },
  { name: 'Wrist Aficionado', url: 'https://wristaficionado.com/products.json?limit=250' },
  { name: 'Happy Jewelers', url: 'https://www.happyjewelers.com/products.json?limit=250' },
  { name: 'The 1916 Company', url: 'https://www.the1916company.com/products.json?limit=250' },
  { name: 'Omi Jewelers', url: 'https://www.omijewelers.com/products.json?limit=250' },
  { name: 'Gray & Sons', url: 'https://www.grayandsons.com/products.json?limit=250' },
  { name: 'DavidSW', url: 'https://davidsw.com/products.json?limit=250' },
  { name: 'Crown & Caliber', url: 'https://www.crownandcaliber.com/products.json?limit=250' },
];

var WATCH_KEYWORDS = ['rolex','richard mille','patek','audemars','cartier','hublot','journe','vacheron','omega','breitling','iwc','panerai','tudor'];

function isWatch(title) {
  var t = (title || '').toLowerCase();
  return WATCH_KEYWORDS.some(function(k) { return t.indexOf(k) !== -1; });
}

function extractReference(title) {
  var match = title.match(/\b([0-9]{4,6}[A-Z0-9\-\/]*)\b/);
  return match ? match[1] : null;
}

function scrapeDealer(dealer) {
  return new Promise(function(resolve) {
    fetchJSON(dealer.url).then(function(data) {
      var products = (data && data.products) || [];
      var watches = [];
      products.forEach(function(p) {
        if (!isWatch(p.title)) return;
        var price = p.variants && p.variants[0] ? parseFloat(p.variants[0].price) : null;
        if (!price) return;
        watches.push({
          dealer: dealer.name,
          title: p.title,
          reference: extractReference(p.title),
          price: price,
          url: 'https://' + dealer.url.split('/')[2] + '/products/' + p.handle,
          scraped_at: new Date().toISOString()
        });
      });
      console.log('Scraped ' + dealer.name + ': ' + watches.length + ' watches');
      resolve(watches);
    }).catch(function(e) {
      console.log('Failed ' + dealer.name + ': ' + e.message);
      resolve([]);
    });
  });
}

function scrapeAllDealers() {
  console.log('Starting market sweep...');
  var promises = SHOPIFY_DEALERS.map(scrapeDealer);
  return Promise.all(promises).then(function(results) {
    var all = [];
    results.forEach(function(r) { all = all.concat(r); });
    console.log('Total watches found: ' + all.length);
    return all;
  });
}

function savePricesToDB(prices) {
  if (!prices.length) return Promise.resolve();
  return supabaseRequest('POST', 'competitor_prices', prices)
    .then(function() { console.log('Saved ' + prices.length + ' prices to database'); })
    .catch(function(e) { console.log('DB save error:', e.message); });
}

function getPricesFromDB(reference) {
  var url = SUPABASE_URL + '/rest/v1/competitor_prices?reference=eq.' + encodeURIComponent(reference) + '&order=price.asc&limit=20';
  var opts = { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } };
  return fetchJSON(url, opts);
}

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', app: 'Claspr', version: '1.0.0' });
});

app.post('/api/sweep', function(req, res) {
  res.json({ status: 'sweep started' });
  scrapeAllDealers().then(savePricesToDB);
});

app.get('/api/prices/:reference', function(req, res) {
  getPricesFromDB(req.params.reference).then(function(data) {
    res.json(data || []);
  }).catch(function(e) { res.json([]); });
});

app.get('/api/status', function(req, res) {
  var url = SUPABASE_URL + '/rest/v1/competitor_prices?select=dealer,scraped_at&order=scraped_at.desc&limit=1';
  var opts = { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } };
  fetchJSON(url, opts).then(function(data) {
    res.json({ status: 'ok', last_sweep: data && data[0] ? data[0].scraped_at : null });
  });
});

function startSweepCycle() {
  console.log('Starting sweep cycle...');
  scrapeAllDealers().then(savePricesToDB);
  setInterval(function() {
    scrapeAllDealers().then(savePricesToDB);
  }, 60 * 60 * 1000);
}

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Claspr running on port ' + PORT);
  setTimeout(startSweepCycle, 5000);
});
