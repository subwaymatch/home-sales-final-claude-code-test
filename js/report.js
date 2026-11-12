/* College-town home sales: report page.
 *
 * Reads data/college_town_home_sales.csv in the visitor's browser and computes every number on the
 * page from it. Charts are drawn as inline SVG, so there are no libraries and no build step.
 * The rules are listed at the top of index.html and in AGENTS.md.
 */
(function () {
  'use strict';

  const DATA_URL = 'data/college_town_home_sales.csv';
  const PRICE_MIN = 10000;
  const PRICE_MAX = 5000000;
  const DAY_MS = 86400000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Short labels for the campus-area charts. The full names are used in the written answers and tables.
  const CAMPUS_SHORT = {
    'Purdue University': 'Purdue',
    'The Pennsylvania State University': 'Penn State',
    'The University of Iowa': 'Iowa',
    'The University of North Carolina at Chapel Hill': 'UNC Chapel Hill',
    'University of California, Davis': 'UC Davis',
    'University of Florida': 'Florida',
    'University of Georgia': 'Georgia',
    'University of Illinois Urbana-Champaign': 'Illinois (Urbana-Champaign)',
    'University of Michigan': 'Michigan',
    'University of Virginia': 'Virginia',
    'University of Wisconsin-Madison': 'Wisconsin (Madison)'
  };

  // ---------- Formatting ----------
  const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const countFmt = new Intl.NumberFormat('en-US');
  const oneFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Round half away from zero to one decimal place, the same rule as the cross-check script.
  function round1(v) { return (v < 0 ? -1 : 1) * Math.round(Math.abs(v) * 10) / 10; }
  function money(v) { return moneyFmt.format(Math.round(v)); }
  function count(v) { return countFmt.format(v); }
  function one(v) {
    const r = round1(v);
    return (r < 0 ? '−' : '') + oneFmt.format(Math.abs(r));
  }
  function pct(v) { return one(v) + '%'; }
  function signedPct(v) {
    const r = round1(v);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + oneFmt.format(Math.abs(r)) + '%';
  }
  function days(v) { return one(v) + ' days'; }
  function joinNames(list) {
    if (list.length <= 1) return list.join('');
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }
  function campusLabel(name) { return CAMPUS_SHORT[name] || name; }
  function plural(n, word) { return count(n) + ' ' + word + (n === 1 ? '' : 's'); }

  // ---------- CSV parsing ----------
  // Handles quoted fields that contain commas, such as "Flat,Other".
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function num(s) {
    if (s === undefined || s === null) return null;
    const t = s.trim();
    if (t === '') return null;
    const v = Number(t);
    return isFinite(v) ? v : null;
  }

  // Whole days since 1970-01-01 for a YYYY-MM-DD string. Differences of two of these are exact day counts.
  function dayNumber(s) {
    if (!s) return null;
    const p = s.trim().split('-');
    if (p.length !== 3) return null;
    const t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(t) ? null : Math.round(t / DAY_MS);
  }

  function cell(fields, col, name) { return fields[col[name]] || ''; }

  // ---------- Building the data ----------
  let DB = null;

  function buildDB(text) {
    const table = parseCSV(text);
    const head = table[0].map(h => h.trim());
    const col = {};
    head.forEach((h, i) => { col[h] = i; });
    const rows = [];
    for (let r = 1; r < table.length; r++) {
      const f = table[r];
      if (f.length < head.length) continue;
      const price = num(cell(f, col, 'sale_price'));
      const saleDate = cell(f, col, 'sale_date').trim();
      rows.push({
        city: cell(f, col, 'city').trim() + ', ' + cell(f, col, 'state').trim(),
        campus: cell(f, col, 'university').trim(),
        price: price,
        valid: price !== null && price >= PRICE_MIN && price <= PRICE_MAX,
        beds: num(cell(f, col, 'beds')),
        miles: num(cell(f, col, 'miles_to_campus')),
        tax: num(cell(f, col, 'tax_annual_amount')),
        lat: num(cell(f, col, 'latitude')),
        lon: num(cell(f, col, 'longitude')),
        living: num(cell(f, col, 'living_area_sqft')),
        yearBuilt: num(cell(f, col, 'year_built')),
        garage: num(cell(f, col, 'has_garage')),
        basement: num(cell(f, col, 'has_basement')),
        fireplace: num(cell(f, col, 'has_fireplace')),
        listDay: dayNumber(cell(f, col, 'list_date')),
        contractDay: dayNumber(cell(f, col, 'contract_date')),
        saleDate: saleDate || null,
        saleYear: saleDate ? Number(saleDate.slice(0, 4)) : null,
        saleMonth: saleDate ? Number(saleDate.slice(5, 7)) : null
      });
    }
    const valid = rows.filter(r => r.valid);
    return {
      rows: rows,
      valid: valid,
      cities: uniqueSorted(rows.map(r => r.city), (a, b) => a.localeCompare(b)),
      campuses: uniqueSorted(rows.map(r => r.campus), (a, b) => a.localeCompare(b)),
      years: uniqueSorted(rows.map(r => r.saleYear), (a, b) => a - b)
    };
  }

  function uniqueSorted(values, cmp) {
    const seen = new Set();
    const out = [];
    values.forEach(v => {
      if (v !== null && v !== undefined && v !== '' && !seen.has(v)) { seen.add(v); out.push(v); }
    });
    return out.sort(cmp);
  }

  // ---------- Statistics ----------
  function prices(rows) { return rows.map(r => r.price).filter(p => p !== null); }

  function median(values) {
    if (!values.length) return null;
    const a = values.slice().sort((x, y) => x - y);
    const mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function mean(values) {
    if (!values.length) return null;
    let total = 0;
    values.forEach(v => { total += v; });
    return total / values.length;
  }

  // Group rows by a key. Returns an object of arrays, one per key.
  function byKey(rows, keyFn) {
    const groups = Object.create(null);
    rows.forEach(r => {
      const k = keyFn(r);
      if (k === null || k === undefined) return;
      (groups[k] = groups[k] || []).push(r);
    });
    return groups;
  }

  // Every item tied for the highest (or lowest) value of `key`. Items with no value are skipped.
  function bestOf(items, key, largest) {
    let best = null;
    let out = [];
    items.forEach(it => {
      const v = it[key];
      if (v === null || v === undefined || isNaN(v)) return;
      if (best === null || (largest ? v > best : v < best)) {
        best = v;
        out = [it];
      } else if (v === best) {
        out.push(it);
      }
    });
    return out;
  }

  function names(items) { return items.map(i => i.label); }
  function isIn(list, item) { return list.indexOf(item) !== -1; }

  // ---------- DOM helpers ----------
  function el(id) { return document.getElementById(id); }

  function setText(id, text) { el(id).textContent = text; }

  function setOptions(id, options, selected) {
    const select = el(id);
    select.textContent = '';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = o.label;
      if (String(o.value) === String(selected)) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function renderTable(id, headers, rows) {
    const host = el(id);
    host.textContent = '';
    const details = document.createElement('details');
    details.className = 'values';
    const summary = document.createElement('summary');
    summary.textContent = 'Every value in this chart';
    details.appendChild(summary);
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    headers.forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      if (i > 0) th.className = 'num';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        td.setAttribute('data-label', headers[i]);
        if (i > 0) td.className = 'num';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    details.appendChild(table);
    host.appendChild(details);
  }

  // ---------- SVG helpers ----------
  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(k => node.setAttribute(k, String(attrs[k])));
    return node;
  }

  function svgText(x, y, str, attrs) {
    const t = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}));
    t.textContent = str;
    return t;
  }

  function withTitle(node, tip) {
    const t = svgEl('title', {});
    t.textContent = tip;
    node.appendChild(t);
    return node;
  }

  function svgRoot(host, width, height, label) {
    host.textContent = '';
    const svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      role: 'img',
      'aria-label': label
    });
    host.appendChild(svg);
    return svg;
  }

  function emptyChart(id) {
    const host = el(id);
    host.textContent = '';
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'No sales match these choices, so there is no chart.';
    host.appendChild(p);
  }

  // ---------- Charts ----------
  // Every chart is drawn at the width of its box, so text is never scaled down and nothing scrolls sideways.
  function chartWidth(host) {
    const w = host && host.clientWidth ? host.clientWidth : 760;
    return Math.max(280, Math.min(760, Math.floor(w)));
  }

  // Shorten text that would not fit in px pixels (about 7.2 px per character at 13px). The table
  // under each chart keeps the full name, and the tooltip shows it too.
  function fitText(text, px) {
    const max = Math.max(4, Math.floor(px / 7.2));
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  // Horizontal bars. Each row has one or more bars (grouped when there are several).
  // Bars can be negative (diverging chart); the zero line is drawn then.
  // On narrow screens the label sits above its bars, so the bars keep most of the width.
  function hbar(id, spec) {
    const host = el(id);
    const rows = spec.rows;
    if (!rows.length) { emptyChart(id); return; }
    const nb = rows[0].bars.length;
    const W = chartWidth(host);
    const stacked = W < 520;
    const labelRow = stacked ? 16 : 0;
    const bh = nb > 1 ? 13 : 20;
    const rowH = nb * bh + 12 + labelRow;
    const top = 12 + (spec.legend ? 26 : 0);
    const H = top + rows.length * rowH + 14;

    let maxLabel = 0;
    let maxPosText = 0;
    let maxNegText = 0;
    let dmin = 0;
    let dmax = 0;
    rows.forEach(row => {
      maxLabel = Math.max(maxLabel, row.label.length);
      row.bars.forEach(b => {
        dmin = Math.min(dmin, b.value);
        dmax = Math.max(dmax, b.value);
        if (b.value < 0) maxNegText = Math.max(maxNegText, b.text.length);
        else maxPosText = Math.max(maxPosText, b.text.length);
      });
    });
    if (dmax === dmin) dmax = dmin + 1;
    const labelW = stacked ? 0 : Math.min(230, Math.max(90, maxLabel * 7.4 + 10), W * 0.42);
    const leftW = maxNegText ? maxNegText * 7.2 + 14 : 0;
    const rightW = maxPosText * 7.2 + 16;
    const x0 = labelW + 10 + leftW;
    const x1 = W - rightW;
    const X = v => x0 + (v - dmin) / (dmax - dmin) * (x1 - x0);
    const zx = X(0);

    const svg = svgRoot(host, W, H, spec.label);
    if (spec.legend) {
      let lx = labelW + 10;
      spec.legend.forEach(item => {
        svg.appendChild(svgEl('rect', { x: lx, y: 6, width: 12, height: 12, class: item.cls }));
        svg.appendChild(svgText(lx + 18, 16.5, item.text));
        lx += 18 + item.text.length * 7.2 + 24;
      });
    }
    svg.appendChild(svgEl('line', { x1: zx, y1: top - 4, x2: zx, y2: H - 8, class: 'axis' }));

    rows.forEach((row, i) => {
      const y0 = top + i * rowH;
      if (stacked) {
        svg.appendChild(svgText(10 + leftW, y0 + 12, fitText(row.label, W - 20 - leftW),
          { 'text-anchor': 'start', class: 'head' }));
      } else {
        svg.appendChild(svgText(labelW, y0 + (nb * bh) / 2 + 5 + labelRow,
          fitText(row.label, labelW - 10), { 'text-anchor': 'end' }));
      }
      row.bars.forEach((b, j) => {
        const by = y0 + labelRow + j * bh + 2;
        const barH = bh - 3;
        const xa = X(b.value);
        const rect = svgEl('rect', {
          x: Math.min(zx, xa),
          y: by,
          width: Math.max(Math.abs(xa - zx), 0.6),
          height: barH,
          class: b.cls || 'b1'
        });
        svg.appendChild(withTitle(rect, b.tip || (row.label + ': ' + b.text)));
        const pos = b.value >= 0;
        svg.appendChild(svgText(pos ? xa + 6 : xa - 6, by + barH / 2 + 4.5, b.text,
          { 'text-anchor': pos ? 'start' : 'end' }));
      });
    });
  }

  // Columns with optional marker line (used for the histogram and its median).
  function vbar(id, spec) {
    const host = el(id);
    const cols = spec.cols;
    if (!cols.length) { emptyChart(id); return; }
    const W = chartWidth(host);
    const H = 300;
    const padL = 10;
    const padR = 10;
    const padT = 30;
    const padB = 46;
    const plotH = H - padT - padB;
    const colW = (W - padL - padR) / cols.length;
    // Narrow columns cannot hold every label, so value and axis labels are thinned out.
    const showValues = colW >= 26;
    const showLabel = i => colW >= 30 || i % 2 === 0;
    const maxV = Math.max(1, Math.max.apply(null, cols.map(c => c.value)));
    const svg = svgRoot(host, W, H, spec.label);
    svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH, class: 'axis' }));
    cols.forEach((c, i) => {
      const x = padL + i * colW + colW * 0.15;
      const w = colW * 0.7;
      const h = c.value / maxV * plotH;
      const y = padT + plotH - h;
      svg.appendChild(withTitle(svgEl('rect', { x: x, y: y, width: w, height: Math.max(h, 0.6), class: c.cls || 'b1' }),
        c.tip || (c.label + ': ' + c.text)));
      if (showValues) {
        svg.appendChild(svgText(x + w / 2, y - 6, c.text, { 'text-anchor': 'middle', class: 'small' }));
      }
      if (showLabel(i)) {
        svg.appendChild(svgText(x + w / 2, padT + plotH + 17, c.label,
          { 'text-anchor': 'middle', class: spec.smallLabels ? 'small' : '' }));
      }
    });
    if (spec.marker) {
      const mx = padL + spec.marker.pos * colW;
      const line = svgEl('line', { x1: mx, y1: padT - 4, x2: mx, y2: padT + plotH, class: 'marker' });
      svg.appendChild(withTitle(line, spec.marker.tip));
    }
  }

  // Slope chart: each city is a line from its rank in one column to its rank in another.
  function slope(id, spec) {
    const host = el(id);
    const items = spec.items;
    const W = chartWidth(host);
    const rowH = 22;
    const top = 44;
    const H = top + items.length * rowH + 16;
    // The two columns sit near the middle. On a wide chart they are 100 units apart; on a phone they are
    // closer, and the city names are shortened so that they fit beside the lines.
    const half = W >= 600 ? 50 : W * 0.08;
    const leftX = W / 2 - half;
    const rightX = W / 2 + half;
    const sideRoom = Math.max(60, (W - (rightX - leftX)) / 2 - 24);
    const svg = svgRoot(host, W, H, spec.label);
    svg.appendChild(svgText(leftX, 24, spec.leftTitle, { 'text-anchor': 'middle', class: 'head' }));
    svg.appendChild(svgText(rightX, 24, spec.rightTitle, { 'text-anchor': 'middle', class: 'head' }));
    items.forEach(it => {
      const ya = top + (it.a - 0.5) * rowH;
      const yb = top + (it.b - 0.5) * rowH;
      const cls = it.changed ? ' changed' : '';
      const line = svgEl('line', { x1: leftX, y1: ya, x2: rightX, y2: yb, class: 'line' + cls });
      svg.appendChild(withTitle(line, it.tip));
      svg.appendChild(svgEl('circle', { cx: leftX, cy: ya, r: 3.5, class: 'dot' + cls }));
      svg.appendChild(svgEl('circle', { cx: rightX, cy: yb, r: 3.5, class: 'dot' + cls }));
      svg.appendChild(svgText(leftX - 12, ya + 4.5, fitText(it.label, sideRoom) + '  #' + it.a, { 'text-anchor': 'end' }));
      svg.appendChild(svgText(rightX + 12, yb + 4.5, '#' + it.b + '  ' + fitText(it.label, sideRoom), { 'text-anchor': 'start' }));
    });
  }

  // ---------- Question 1 ----------
  function renderQ1() {
    const groups = byKey(DB.valid, r => r.city);
    const items = DB.cities.map(c => {
      const g = groups[c] || [];
      return { label: c, value: median(prices(g)), n: g.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => b.value - a.value);
    const top = bestOf(items, 'value', true);
    const low = bestOf(items, 'value', false);

    const topSentence = top.length > 1
      ? joinNames(names(top)) + ' tie for the highest median sale price, at ' + money(top[0].value) + ' each.'
      : top[0].label + ' has the highest median sale price, at ' + money(top[0].value) +
        ' (' + plural(top[0].n, 'sale') + ' with valid prices).';
    const lowSentence = low.length > 1
      ? joinNames(names(low)) + ' tie for the lowest, at ' + money(low[0].value) + ' each.'
      : 'The lowest is ' + low[0].label + ', at ' + money(low[0].value) + '.';
    setText('q1-answer', topSentence + ' ' + lowSentence);

    hbar('q1-chart', {
      label: 'Bar chart: median sale price for each city, highest first',
      rows: sorted.map(i => ({
        label: i.label,
        bars: [{
          value: i.value,
          text: money(i.value),
          tip: i.label + ': median ' + money(i.value) + ' from ' + count(i.n) + ' sales',
          cls: isIn(top, i) ? 'hi' : 'b1'
        }]
      }))
    });
    renderTable('q1-table', ['City', 'Median sale price', 'Sales (valid prices)'],
      sorted.map(i => [i.label, money(i.value), count(i.n)]));
  }

  // ---------- Question 2 ----------
  function renderQ2() {
    const all = byKey(DB.rows, r => r.city);
    const valid = byKey(DB.valid, r => r.city);
    const items = DB.cities.map(c => {
      const p = prices(all[c] || []);
      const m = mean(p);
      const md = median(p);
      return { label: c, mean: m, median: md, gap: (m - md) / md * 100, n: p.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => b.gap - a.gap);
    const top = bestOf(items, 'gap', true);
    const t = top[0];

    const rows = all[t.label];
    const high = rows.filter(r => r.price > PRICE_MAX);
    const low = rows.filter(r => r.price < PRICE_MIN);
    const maxPrice = Math.max.apply(null, prices(rows));
    const vrows = valid[t.label] || [];
    const vmean = mean(prices(vrows));
    const vmedian = median(prices(vrows));
    const vgap = (vmean - vmedian) / vmedian * 100;

    const first = top.length > 1
      ? joinNames(names(top)) + ' tie for the largest gap, at ' + pct(t.gap) + ' each. The first is listed here: ' +
        t.label + ', with a mean of ' + money(t.mean) + ' against a median of ' + money(t.median) + ' (all rows).'
      : t.label + ' has the largest gap: its mean is ' + pct(t.gap) +
        ' above its median, with all rows (' + money(t.mean) + ' against ' + money(t.median) + ').';
    const cause = [];
    if (high.length) {
      cause.push(plural(high.length, 'sale') + ' above $5,000,000 (the highest is ' + money(maxPrice) + ')');
    }
    if (low.length) {
      cause.push(plural(low.length, 'sale') + ' under $10,000');
    }
    let second;
    if (cause.length) {
      const effect = t.gap >= vgap
        ? 'add ' + one(t.gap - vgap) + ' points to the gap'
        : 'reduce the gap by ' + one(vgap - t.gap) + ' points';
      second = 'The cause is partly these extreme rows: ' + joinNames(cause) + '. With valid prices only, the mean is ' +
        money(vmean) + ' and the gap is ' + pct(vgap) + ', so the extreme rows ' + effect +
        '; the rest comes from the spread of ordinary sales, where a few expensive homes pull the mean above the median.';
    } else {
      second = 'No sale in this city is outside the valid price range, so the gap comes from the spread of' +
        ' ordinary sales, where a few expensive homes pull the mean above the median.';
    }
    setText('q2-answer', first + ' ' + second);

    hbar('q2-chart', {
      label: 'Grouped bar chart: mean and median sale price for each city, all rows, largest gap first',
      legend: [{ text: 'Mean (all rows)', cls: 'b1' }, { text: 'Median (all rows)', cls: 'b2' }],
      rows: sorted.map(i => ({
        label: i.label,
        bars: [
          { value: i.mean, text: money(i.mean) + ' (gap ' + signedPct(i.gap) + ')',
            tip: i.label + ': mean ' + money(i.mean) + ', ' + pct(i.gap) + ' above the median', cls: 'b1' },
          { value: i.median, text: money(i.median), tip: i.label + ': median ' + money(i.median), cls: 'b2' }
        ]
      }))
    });
    renderTable('q2-table', ['City', 'Mean (all rows)', 'Median (all rows)', 'Gap, % of median', 'Sales (all rows)'],
      sorted.map(i => [i.label, money(i.mean), money(i.median), pct(i.gap), count(i.n)]));
  }

  // ---------- Question 3 ----------
  function renderQ3() {
    const all = byKey(DB.rows, r => r.city);
    const valid = byKey(DB.valid, r => r.city);
    const items = DB.cities.map(c => {
      const ma = mean(prices(all[c] || []));
      const mv = mean(prices(valid[c] || []));
      return { label: c, meanAll: ma, meanValid: mv, nAll: (all[c] || []).length, nValid: (valid[c] || []).length };
    }).filter(i => i.meanAll !== null && i.meanValid !== null);
    items.forEach(i => {
      i.a = 1 + items.filter(o => o.meanAll > i.meanAll).length;
      i.b = 1 + items.filter(o => o.meanValid > i.meanValid).length;
      i.changed = i.a !== i.b;
      i.move = i.a - i.b;
      i.tip = i.label + ': #' + i.a + ' with all rows (' + money(i.meanAll) + '), #' + i.b +
        ' with valid prices (' + money(i.meanValid) + ')';
    });
    const changed = items.filter(i => i.changed).sort((x, y) => Math.abs(y.move) - Math.abs(x.move));
    const byRank = items.slice().sort((x, y) => x.b - y.b);

    let answer;
    if (!changed.length) {
      answer = 'No city changes rank when invalid prices are removed.';
    } else {
      const parts = changed.map(i => {
        const dir = i.move > 0 ? 'up' : 'down';
        return i.label + ' moves from #' + i.a + ' to #' + i.b + ', ' + dir + ' ' +
          plural(Math.abs(i.move), 'position');
      });
      answer = count(changed.length) + (changed.length === 1 ? ' city changes' : ' cities change') +
        ' rank. ' + parts.join('; ') + '. The other ' + count(items.length - changed.length) +
        (items.length - changed.length === 1 ? ' city keeps' : ' cities keep') + ' the same rank.';
    }
    setText('q3-answer', answer);

    slope('q3-chart', {
      label: 'Slope chart: rank by mean sale price, all rows on the left and valid prices on the right',
      leftTitle: 'All rows',
      rightTitle: 'Valid prices only',
      items: items.map(i => ({ label: i.label, a: i.a, b: i.b, changed: i.changed, tip: i.tip }))
    });
    renderTable('q3-table', ['City', 'Mean (all rows)', 'Rank (all rows)', 'Mean (valid prices)', 'Rank (valid prices)', 'Change in position'],
      byRank.map(i => [i.label, money(i.meanAll), '#' + i.a, money(i.meanValid), '#' + i.b,
        i.move === 0 ? 'none' : (i.move > 0 ? 'up ' : 'down ') + Math.abs(i.move)]));
  }

  // ---------- Question 4 ----------
  function renderQ4() {
    const groups = byKey(DB.valid, r => r.campus);
    const items = DB.campuses.map(c => {
      const g = groups[c] || [];
      const y24 = prices(g.filter(r => r.saleYear === 2024));
      const y25 = prices(g.filter(r => r.saleYear === 2025));
      const m24 = median(y24);
      const m25 = median(y25);
      return {
        label: c, m24: m24, m25: m25, n24: y24.length, n25: y25.length,
        pct: (m24 !== null && m25 !== null && m24 !== 0) ? (m25 - m24) / m24 * 100 : null
      };
    }).filter(i => i.pct !== null);
    const sorted = items.slice().sort((a, b) => b.pct - a.pct);
    const top = bestOf(items, 'pct', true);
    const decreases = sorted.filter(i => round1(i.pct) < 0).sort((a, b) => a.pct - b.pct);

    const t = top[0];
    let answer = (top.length > 1 ? joinNames(names(top)) + ' tie for the largest increase' :
      t.label + ' had the largest increase') +
      ' (' + signedPct(t.pct) + '): the median rose from ' + money(t.m24) + ' in 2024 to ' +
      money(t.m25) + ' in 2025. ';
    if (decreases.length) {
      answer += 'Decreases: ' + decreases.map(i => i.label + ' (' + signedPct(i.pct) + ', from ' +
        money(i.m24) + ' to ' + money(i.m25) + ')').join('; ') + '.';
    } else {
      answer += 'No campus area had a decrease.';
    }
    setText('q4-answer', answer);

    hbar('q4-chart', {
      label: 'Diverging bar chart: percent change in median sale price, 2024 to 2025, by campus area',
      rows: sorted.map(i => ({
        label: campusLabel(i.label),
        bars: [{
          value: i.pct,
          text: signedPct(i.pct),
          tip: i.label + ': median ' + money(i.m24) + ' in 2024 (' + count(i.n24) + ' sales), ' +
            money(i.m25) + ' in 2025 (' + count(i.n25) + ' sales), change ' + signedPct(i.pct),
          cls: round1(i.pct) < 0 ? 'down' : (isIn(top, i) ? 'hi' : 'b1')
        }]
      }))
    });
    renderTable('q4-table', ['Campus area', 'Median 2024', 'Median 2025', 'Change', 'Sales 2024', 'Sales 2025'],
      sorted.map(i => [i.label, money(i.m24), money(i.m25), signedPct(i.pct), count(i.n24), count(i.n25)]));
  }

  // ---------- Question 5 ----------
  function renderQ5() {
    const groups = byKey(DB.valid.filter(r => r.listDay !== null && r.contractDay !== null), r => r.campus);
    const items = DB.campuses.map(c => {
      const g = groups[c] || [];
      const dom = g.map(r => r.contractDay - r.listDay);
      return { label: c, med: median(dom), n: dom.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => b.med - a.med);
    const slowest = bestOf(items, 'med', true);
    const fastest = bestOf(items, 'med', false);

    const slowText = slowest.length > 1
      ? joinNames(names(slowest)) + ' tie for the slowest, at ' + days(slowest[0].med) + ' each.'
      : slowest[0].label + ' is the slowest, at ' + days(slowest[0].med) + ' (' + plural(slowest[0].n, 'sale') + ' with both dates).';
    const fastText = fastest.length > 1
      ? joinNames(names(fastest)) + ' tie for the fastest, at ' + days(fastest[0].med) + ' each.'
      : fastest[0].label + ' is the fastest, at ' + days(fastest[0].med) + '.';
    setText('q5-answer', slowText + ' ' + fastText);

    hbar('q5-chart', {
      label: 'Bar chart: median days on market for each campus area, slowest first',
      rows: sorted.map(i => ({
        label: campusLabel(i.label),
        bars: [{
          value: i.med,
          text: days(i.med),
          tip: i.label + ': median ' + days(i.med) + ' from ' + count(i.n) + ' sales with both dates',
          cls: isIn(slowest, i) ? 'hi' : 'b1'
        }]
      }))
    });
    renderTable('q5-table', ['Campus area', 'Median days on market', 'Sales with both dates'],
      sorted.map(i => [i.label, days(i.med), count(i.n)]));
  }

  // ---------- Question 6 ----------
  function renderQ6() {
    const groups = byKey(
      DB.valid.filter(r => r.tax !== null && r.tax > 0 && r.tax < r.price),
      r => r.campus);
    const items = DB.campuses.map(c => {
      const g = groups[c] || [];
      const ratio = g.map(r => r.tax / r.price * 100);
      return { label: c, med: median(ratio), n: ratio.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => b.med - a.med);
    const highest = bestOf(items, 'med', true);
    const lowest = bestOf(items, 'med', false);

    const hiText = highest.length > 1
      ? joinNames(names(highest)) + ' tie for the highest tax burden, at ' + pct(highest[0].med) + ' each.'
      : highest[0].label + ' has the highest tax burden, at ' + pct(highest[0].med) + ' of sale price.';
    const loText = lowest.length > 1
      ? joinNames(names(lowest)) + ' tie for the lowest, at ' + pct(lowest[0].med) + ' each.'
      : lowest[0].label + ' has the lowest, at ' + pct(lowest[0].med) + '.';
    setText('q6-answer', hiText + ' ' + loText);

    hbar('q6-chart', {
      label: 'Bar chart: median annual tax as a percent of sale price, by campus area, highest first',
      rows: sorted.map(i => ({
        label: campusLabel(i.label),
        bars: [{
          value: i.med,
          text: pct(i.med),
          tip: i.label + ': median tax ' + pct(i.med) + ' of sale price, from ' + count(i.n) + ' sales',
          cls: isIn(highest, i) ? 'hi' : 'b1'
        }]
      }))
    });
    renderTable('q6-table', ['Campus area', 'Median tax, % of sale price', 'Sales used'],
      sorted.map(i => [i.label, pct(i.med), count(i.n)]));
  }

  // ---------- Question 7 (interactive) ----------
  function bedsLabel(beds) {
    if (beds === 7) return '7 or more bedrooms';
    return beds === 1 ? '1 bedroom' : beds + ' bedrooms';
  }

  function renderQ7() {
    const beds = Number(el('q7-beds').value);
    const rows = DB.valid.filter(r => r.beds !== null && (beds === 7 ? r.beds >= 7 : r.beds === beds));
    const groups = byKey(rows, r => r.city);
    const items = DB.cities.map(c => {
      const g = groups[c] || [];
      return { label: c, value: median(prices(g)), n: g.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => a.value - b.value);
    const low = bestOf(items, 'value', false);
    const high = bestOf(items, 'value', true);
    const noSales = DB.cities.length - items.length;

    let answer;
    if (!items.length) {
      answer = 'No valid-price sales have ' + bedsLabel(beds) + '.';
    } else {
      answer = 'For ' + bedsLabel(beds) + ', ' + (low.length > 1
        ? joinNames(names(low)) + ' tie for the lowest median sale price, at ' + money(low[0].value) + ' each'
        : low[0].label + ' has the lowest median sale price, at ' + money(low[0].value) +
          ', from ' + plural(low[0].n, 'sale')) + '. ';
      answer += 'The highest is ' + joinNames(names(high)) + ', at ' + money(high[0].value) + '.';
      if (noSales) {
        answer += ' ' + count(noSales) + (noSales === 1 ? ' city has' : ' cities have') +
          ' no sales with this bedroom count and ' + (noSales === 1 ? 'is' : 'are') + ' left off the chart.';
      }
      if (low[0].n < 30) answer += ' Note: the lowest city has only ' + plural(low[0].n, 'sale') + ', so the median is not stable.';
    }
    setText('q7-answer', answer);

    hbar('q7-chart', {
      label: 'Bar chart: median sale price for each city with the chosen bedroom count, lowest first',
      rows: sorted.map(i => ({
        label: i.label,
        bars: [{
          value: i.value,
          text: money(i.value) + ' (' + count(i.n) + ' sales)',
          tip: i.label + ': median ' + money(i.value) + ' from ' + count(i.n) + ' sales',
          cls: isIn(low, i) ? 'hi' : 'b1'
        }]
      }))
    });
    renderTable('q7-table', ['City', 'Median sale price', 'Sales'],
      sorted.map(i => [i.label, money(i.value), count(i.n)]));
  }

  // ---------- Question 8 (interactive) ----------
  // label: the option text. phrase: how the range reads inside a sentence, such as "For sales under $250,000".
  const RANGES = [
    { value: 'all', label: 'All valid prices ($10,000 to $5,000,000)', phrase: 'at all valid prices',
      lo: PRICE_MIN, hi: PRICE_MAX + 1 },
    { value: 'under250', label: 'Under $250,000', phrase: 'under $250,000', lo: PRICE_MIN, hi: 250000 },
    { value: '250to500', label: '$250,000 to $499,999', phrase: 'from $250,000 to $499,999', lo: 250000, hi: 500000 },
    { value: '500to750', label: '$500,000 to $749,999', phrase: 'from $500,000 to $749,999', lo: 500000, hi: 750000 },
    { value: '750to1m', label: '$750,000 to $999,999', phrase: 'from $750,000 to $999,999', lo: 750000, hi: 1000000 },
    { value: '1mup', label: '$1,000,000 and up', phrase: 'at $1,000,000 and up', lo: 1000000, hi: PRICE_MAX + 1 }
  ];

  function renderQ8() {
    const range = RANGES.filter(r => r.value === el('q8-range').value)[0] || RANGES[0];
    const inRange = DB.valid.filter(r => r.price >= range.lo && r.price < range.hi);
    const withDates = inRange.filter(r => r.listDay !== null && r.contractDay !== null);
    const excluded = inRange.length - withDates.length;
    const groups = byKey(withDates, r => r.city);
    const items = DB.cities.map(c => {
      const dom = (groups[c] || []).map(r => r.contractDay - r.listDay);
      return { label: c, value: median(dom), n: dom.length };
    }).filter(i => i.n > 0);
    const sorted = items.slice().sort((a, b) => a.value - b.value);
    const low = bestOf(items, 'value', false);
    const high = bestOf(items, 'value', true);

    let answer;
    if (!items.length) {
      answer = 'No sales in this price range have both a list date and a contract date.';
    } else {
      answer = 'For sales ' + range.phrase + ', ' +
        (low.length > 1
          ? joinNames(names(low)) + ' tie for the shortest median days on market, at ' + days(low[0].value) + ' each'
          : low[0].label + ' has the shortest median days on market, at ' + days(low[0].value) +
            ', from ' + plural(low[0].n, 'sale') + ' with both dates') + '. ';
      answer += 'The longest is ' + joinNames(names(high)) + ', at ' + days(high[0].value) + '.';
      answer += ' ' + count(excluded) + ' sales in this range have no list or contract date and are left out.';
    }
    setText('q8-answer', answer);

    hbar('q8-chart', {
      label: 'Bar chart: median days on market for each city in the chosen price range, shortest first',
      rows: sorted.map(i => ({
        label: i.label,
        bars: [{
          value: i.value,
          text: days(i.value) + ' (' + count(i.n) + ' sales)',
          tip: i.label + ': median ' + days(i.value) + ' from ' + count(i.n) + ' sales with both dates',
          cls: isIn(low, i) ? 'hi' : 'b1'
        }]
      }))
    });
    renderTable('q8-table', ['City', 'Median days on market', 'Sales used (both dates)'],
      sorted.map(i => [i.label, days(i.value), count(i.n)]));
  }

  // ---------- Question 9 (interactive) ----------
  function renderQ9() {
    const city = el('q9-city').value;
    const year = Number(el('q9-year').value);
    const rows = DB.rows.filter(r => r.city === city && r.saleYear === year && r.saleMonth !== null);
    const counts = new Array(12).fill(0);
    rows.forEach(r => { counts[r.saleMonth - 1]++; });
    const total = rows.length;
    const cols = counts.map((n, i) => ({ label: MONTH_SHORT[i], value: n, text: count(n),
      tip: MONTHS[i] + ' ' + year + ': ' + plural(n, 'sale') }));
    const peak = Math.max.apply(null, counts);
    const peakMonths = [];
    counts.forEach((n, i) => { if (n === peak && peak > 0) peakMonths.push(i); });
    cols.forEach((c, i) => { c.cls = peakMonths.indexOf(i) !== -1 ? 'hi' : 'b1'; });

    const yearDates = DB.rows.filter(r => r.saleYear === year && r.saleDate).map(r => r.saleDate).sort();
    let answer;
    if (!total) {
      answer = 'There are no sales for ' + city + ' in ' + year + '.';
    } else {
      const monthNames = peakMonths.map(i => MONTHS[i]);
      answer = city + ' recorded ' + plural(total, 'sale') + ' in ' + year + '. ' +
        (monthNames.length > 1
          ? joinNames(monthNames) + ' tie for the most sales, with ' + count(peak) + ' each. '
          : monthNames[0] + ' had the most sales, with ' + plural(peak, 'sale') + '. ');
      answer += 'Sale dates for ' + year + ' in the data run from ' + yearDates[0] + ' to ' +
        yearDates[yearDates.length - 1] + '.';
    }
    setText('q9-answer', answer);

    vbar('q9-chart', {
      label: 'Column chart: number of sales in each month for the chosen city and year',
      cols: cols
    });
    renderTable('q9-table', ['Month', 'Sales'], MONTHS.map((m, i) => [m + ' ' + year, count(counts[i])]));
  }

  // ---------- Question 10 (interactive) ----------
  function budgetLabel(v) { return v === 'none' ? 'no maximum budget' : 'a maximum of ' + money(Number(v)); }
  function bedsRequirement(v) {
    return v === 0 ? 'any number of bedrooms' : 'at least ' + plural(v, 'bedroom');
  }

  function renderQ10() {
    const campus = el('q10-campus').value;
    const budget = el('q10-budget').value;
    const minBeds = Number(el('q10-beds').value);
    const rows = DB.valid.filter(r =>
      r.campus === campus &&
      (budget === 'none' || r.price <= Number(budget)) &&
      (minBeds === 0 || (r.beds !== null && r.beds >= minBeds)) &&
      r.miles !== null);
    const miles = rows.map(r => r.miles);
    const n = rows.length;
    const med = median(miles);

    let answer;
    if (!n) {
      answer = 'No sales meet all three conditions: ' + campus + ', ' + budgetLabel(budget) + ', and ' +
        bedsRequirement(minBeds) + '.';
    } else {
      answer = plural(n, 'sale') + ' with a valid price meet all three conditions: ' + campus + ', ' +
        budgetLabel(budget) + ', and ' + bedsRequirement(minBeds) + '. ' +
        'Their median distance to campus is ' + one(med) + ' miles.';
    }
    setText('q10-answer', answer);

    if (!n) {
      emptyChart('q10-chart');
      renderTable('q10-table', ['Miles to campus', 'Sales'], []);
      return;
    }
    const maxMiles = Math.max.apply(null, miles);
    const nbins = Math.floor(maxMiles) + 1;
    const counts = new Array(nbins).fill(0);
    miles.forEach(m => { counts[Math.min(Math.floor(m), nbins - 1)]++; });
    const cols = counts.map((c, i) => ({
      label: i + '–' + (i + 1),
      value: c,
      text: count(c),
      tip: i + ' to ' + (i + 1) + ' miles: ' + plural(c, 'sale')
    }));
    vbar('q10-chart', {
      label: 'Histogram: distance to campus in one-mile bands, with a dashed line at the median',
      cols: cols,
      smallLabels: true,
      marker: { pos: med, tip: 'Median distance ' + one(med) + ' miles' }
    });
    renderTable('q10-table', ['Miles to campus', 'Sales'],
      cols.map(c => [c.label + ' miles', count(c.value)]));
  }

  // ---------- Explore: filters, map, sliders, results table, comparison ----------
  // These controls change only this section. Q1 to Q6 never read them.
  const SLIDERS = {
    living: { label: 'Living area', step: 1, get: r => (r.living !== null && r.living > 0 ? r.living : null) },
    miles: { label: 'Distance from campus', step: 0.1, get: r => r.miles },
    year: { label: 'Year built', step: 1, get: r => r.yearBuilt }
  };
  const FEATURE_KEYS = ['garage', 'basement', 'fireplace'];
  const RESULT_COLS = [
    { key: 'city', label: 'City', type: 'text' },
    { key: 'campus', label: 'Campus area', type: 'text' },
    { key: 'n', label: 'Sales', type: 'num', fmt: count },
    { key: 'price', label: 'Median sale price', type: 'num', fmt: money },
    { key: 'dom', label: 'Median days on market', type: 'num', fmt: days },
    { key: 'miles', label: 'Median miles to campus', type: 'num', fmt: v => one(v) + ' miles' }
  ];
  const EXPLORE = { bounds: {}, cityCampus: {}, cityPos: [], mapNodes: {}, sort: { key: 'n', dir: 'desc' }, cityRows: [] };

  function sliderText(key, v) {
    if (key === 'living') return count(v) + ' sq ft';
    if (key === 'miles') return one(v) + ' miles';
    return String(v);
  }

  function initExploreData() {
    Object.keys(SLIDERS).forEach(k => {
      const vals = DB.valid.map(SLIDERS[k].get).filter(v => v !== null);
      EXPLORE.bounds[k] = [Math.min.apply(null, vals), Math.max.apply(null, vals)];
    });
    // Each city's campus area: the one that most of its sales are assigned to.
    const tally = Object.create(null);
    DB.rows.forEach(r => {
      tally[r.city] = tally[r.city] || Object.create(null);
      tally[r.city][r.campus] = (tally[r.city][r.campus] || 0) + 1;
    });
    Object.keys(tally).forEach(c => {
      let best = null;
      Object.keys(tally[c]).forEach(k => {
        if (best === null || tally[c][k] > tally[c][best]) best = k;
      });
      EXPLORE.cityCampus[c] = best;
    });
    // Map position of each city: the median latitude and longitude of its sales (all rows).
    const byCity = byKey(DB.rows, r => r.city);
    const validN = byKey(DB.valid, r => r.city);
    EXPLORE.cityPos = DB.cities.filter(c => byCity[c]).map(c => ({
      city: c,
      lat: median(byCity[c].map(r => r.lat).filter(v => v !== null)),
      lon: median(byCity[c].map(r => r.lon).filter(v => v !== null)),
      n: (validN[c] || []).length
    }));
  }

  // Read the controls into one filter object.
  function readFilters() {
    return {
      campus: el('f-campus').value,
      city: el('f-city').value,
      year: el('f-year').value,
      beds: el('f-beds').value,
      price: el('f-price').value,
      slider: el('f-slider').value,
      lo: Number(el('f-lo').value),
      hi: Number(el('f-hi').value),
      garage: el('f-garage').value,
      basement: el('f-basement').value,
      fireplace: el('f-fireplace').value
    };
  }

  // The range filter is on only when a handle is moved inside the full data range. The half-step
  // tolerance stops a handle that sits at the end of the range (after the browser snaps it to a step)
  // from switching the filter on.
  function sliderIsOn(F) {
    const b = EXPLORE.bounds[F.slider];
    const tol = SLIDERS[F.slider].step / 2;
    return !!(b && (F.lo > b[0] + tol || F.hi < b[1] - tol));
  }

  // Sales that pass every filter. skip: names of filters to ignore ('campus', 'city', 'year').
  // Blank values are unknown: a row with a blank value is left out only when a filter uses that field.
  // Returns { rows, unknown } where unknown counts rows left out only because of a blank.
  function exploreRows(F, skip) {
    const range = RANGES.filter(x => x.value === F.price)[0] || RANGES[0];
    const slider = SLIDERS[F.slider];
    const sliderOn = sliderIsOn(F);
    const feats = FEATURE_KEYS.filter(k => F[k] === 'yes' || F[k] === 'no');
    const rows = [];
    let unknown = 0;
    DB.valid.forEach(r => {
      if (r.price < range.lo || r.price >= range.hi) return;
      if (!skip.campus && F.campus && r.campus !== F.campus) return;
      if (!skip.city && F.city && r.city !== F.city) return;
      if (!skip.year && F.year && r.saleYear !== Number(F.year)) return;
      if (F.beds && (r.beds === null || (F.beds === '7' ? r.beds < 7 : r.beds !== Number(F.beds)))) return;
      let blank = false;
      if (sliderOn) {
        const v = slider.get(r);
        if (v === null) blank = true;
        else if (v < F.lo || v > F.hi) return;
      }
      for (let i = 0; i < feats.length; i++) {
        const v = r[feats[i]];
        if (v === null) { blank = true; continue; }
        if ((F[feats[i]] === 'yes') !== (v === 1)) return;
      }
      if (blank) { unknown++; return; }
      rows.push(r);
    });
    return { rows: rows, unknown: unknown };
  }

  function setOptionsFromList(id, list, selected) {
    setOptions(id, list, selected);
  }

  function refreshCityOptions() {
    const campus = el('f-campus').value;
    const current = el('f-city').value;
    const cities = DB.cities.filter(c => !campus || EXPLORE.cityCampus[c] === campus);
    const keep = cities.indexOf(current) !== -1 ? current : '';
    setOptionsFromList('f-city', [{ value: '', label: 'All cities' }]
      .concat(cities.map(c => ({ value: c, label: c }))), keep);
  }

  function refreshCompareOptions() {
    const mode = el('c-mode').value;
    const list = mode === 'campus' ? DB.campuses : DB.cities;
    const defaults = mode === 'campus'
      ? ['University of Michigan', 'University of Wisconsin-Madison']
      : ['Ann Arbor, MI', 'Madison, WI'];
    ['c-a', 'c-b'].forEach((id, i) => {
      const current = el(id).value;
      const keep = list.indexOf(current) !== -1 ? current : (list.indexOf(defaults[i]) !== -1 ? defaults[i] : list[0]);
      setOptionsFromList(id, list.map(v => ({ value: v, label: v })), keep);
    });
  }

  function fillExploreControls() {
    setOptions('f-campus', [{ value: '', label: 'All campus areas' }]
      .concat(DB.campuses.map(c => ({ value: c, label: c }))), '');
    refreshCityOptions();
    setOptions('f-year', [{ value: '', label: 'All years' }]
      .concat(DB.years.map(y => ({ value: y, label: String(y) }))), '');
    const beds = [{ value: '', label: 'Any number' }];
    for (let b = 1; b <= 6; b++) beds.push({ value: b, label: bedsLabel(b) });
    beds.push({ value: 7, label: '7 or more bedrooms' });
    setOptions('f-beds', beds, '');
    setOptions('f-price', RANGES.map(r => ({ value: r.value, label: r.label })), 'all');
    const yesNo = [{ value: 'any', label: 'Any (blank is not counted)' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
    setOptions('f-garage', yesNo, 'any');
    setOptions('f-basement', yesNo, 'any');
    setOptions('f-fireplace', yesNo, 'any');
    setOptions('f-slider', Object.keys(SLIDERS).map(k => ({ value: k, label: SLIDERS[k].label })), 'living');
    setOptions('c-mode', [{ value: 'campus', label: 'Campus areas' }, { value: 'city', label: 'Cities' }], 'campus');
    refreshCompareOptions();
  }

  function hasOption(id, v) {
    return Array.prototype.some.call(el(id).options, o => o.value === v);
  }

  // Set the slider's limits to the data range, and its handles to lo and hi (defaults: the full range).
  function configureSlider(key, lo, hi) {
    const b = EXPLORE.bounds[key];
    const low = el('f-lo');
    const high = el('f-hi');
    [low, high].forEach(e => { e.min = b[0]; e.max = b[1]; e.step = SLIDERS[key].step; });
    let L = typeof lo === 'number' && isFinite(lo) ? lo : b[0];
    let H = typeof hi === 'number' && isFinite(hi) ? hi : b[1];
    L = Math.min(Math.max(L, b[0]), b[1]);
    H = Math.min(Math.max(H, b[0]), b[1]);
    if (L > H) { const t = L; L = H; H = t; }
    low.value = String(L);
    high.value = String(H);
    updateSliderText(key);
  }

  function updateSliderText(key) {
    setText('f-lo-text', sliderText(key, Number(el('f-lo').value)));
    setText('f-hi-text', sliderText(key, Number(el('f-hi').value)));
  }

  function onSliderInput(id) {
    const lo = el('f-lo');
    const hi = el('f-hi');
    if (Number(lo.value) > Number(hi.value)) {
      if (id === 'f-lo') hi.value = lo.value; else lo.value = hi.value;
    }
    updateSliderText(el('f-slider').value);
    renderExplore();
  }

  // The address bar holds the current filters, so a copied link shows the same view.
  function writeURL(F) {
    const p = new URLSearchParams();
    if (F.campus) p.set('campus', F.campus);
    if (F.city) p.set('city', F.city);
    if (F.year) p.set('year', F.year);
    if (F.beds) p.set('beds', F.beds);
    if (F.price !== 'all') p.set('price', F.price);
    if (sliderIsOn(F)) {
      p.set('slider', F.slider);
      p.set('lo', String(F.lo));
      p.set('hi', String(F.hi));
    }
    FEATURE_KEYS.forEach(k => { if (F[k] !== 'any') p.set(k, F[k]); });
    if (el('c-mode').value !== 'campus') p.set('cmode', el('c-mode').value);
    p.set('ca', el('c-a').value);
    p.set('cb', el('c-b').value);
    const qs = p.toString();
    try {
      history.replaceState(null, '', qs ? '?' + qs : location.pathname);
    } catch (e) {
      // Some browsers refuse to change the address (for example, a file opened from disk). The filters still work.
    }
  }

  function applyFromURL() {
    const p = new URLSearchParams(location.search);
    const pick = (id, key) => {
      const v = p.get(key);
      if (v !== null && hasOption(id, v)) el(id).value = v;
    };
    pick('f-campus', 'campus');
    refreshCityOptions();
    pick('f-city', 'city');
    pick('f-year', 'year');
    pick('f-beds', 'beds');
    pick('f-price', 'price');
    pick('f-garage', 'garage');
    pick('f-basement', 'basement');
    pick('f-fireplace', 'fireplace');
    pick('c-mode', 'cmode');
    refreshCompareOptions();
    pick('c-a', 'ca');
    pick('c-b', 'cb');
    const slider = p.get('slider');
    if (slider && SLIDERS[slider]) el('f-slider').value = slider;
    const lo = p.get('lo');
    const hi = p.get('hi');
    configureSlider(el('f-slider').value,
      lo !== null ? Number(lo) : null,
      hi !== null ? Number(hi) : null);
  }

  // The map: one circle per city, placed at the median latitude and longitude of its sales.
  function buildMap() {
    const host = el('f-map');
    const W = chartWidth(host);
    const pts = EXPLORE.cityPos;
    const pad = 40;
    const lats = pts.map(p => p.lat);
    const lons = pts.map(p => p.lon);
    const latMin = Math.min.apply(null, lats);
    const latMax = Math.max.apply(null, lats);
    const lonMin = Math.min.apply(null, lons);
    const lonMax = Math.max.apply(null, lons);
    const kx = Math.cos((latMin + latMax) / 2 * Math.PI / 180);
    const scale = (W - 2 * pad) / ((lonMax - lonMin) * kx);
    const H = Math.round((latMax - latMin) * scale + 2 * pad);
    const x = p => pad + (p.lon - lonMin) * kx * scale;
    const y = p => pad + (latMax - p.lat) * scale;
    const maxN = Math.max.apply(null, pts.map(p => p.n));
    const svg = svgRoot(host, W, H, 'Map of cities. Click a city to filter the results to it.');
    pts.forEach(p => {
      const cx = x(p);
      const cy = y(p);
      const radius = 5 + 16 * Math.sqrt(p.n / maxN);
      const node = svgEl('circle', {
        cx: cx, cy: cy, r: radius.toFixed(1), class: 'city', tabindex: '0', role: 'button',
        'aria-pressed': 'false',
        'aria-label': p.city + ': ' + count(p.n) + ' valid-price sales. Press to filter to this city.'
      });
      withTitle(node, p.city + ': ' + count(p.n) + ' valid-price sales');
      node.addEventListener('click', () => selectCityFromMap(p.city));
      node.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCityFromMap(p.city); }
      });
      // Labels stay hidden until a city is hovered, focused or selected, because the cities overlap.
      const wrap = svgEl('g', { class: 'city-wrap' });
      wrap.appendChild(node);
      // Cities on the right-hand side get their label on the left, so the label stays inside the map.
      const toLeft = cx > W * 0.6;
      wrap.appendChild(svgText(toLeft ? cx - radius - 4 : cx + radius + 4, cy + 4, p.city,
        { class: 'map-label', 'text-anchor': toLeft ? 'end' : 'start' }));
      svg.appendChild(wrap);
      EXPLORE.mapNodes[p.city] = { circle: node, wrap: wrap };
    });
  }

  function updateMapSelection(city) {
    Object.keys(EXPLORE.mapNodes).forEach(c => {
      const m = EXPLORE.mapNodes[c];
      const on = c === city;
      m.circle.setAttribute('class', on ? 'city selected' : 'city');
      m.circle.setAttribute('aria-pressed', on ? 'true' : 'false');
      m.wrap.setAttribute('class', on ? 'city-wrap selected' : 'city-wrap');
    });
  }

  function selectCityFromMap(city) {
    if (el('f-city').value === city) {
      el('f-city').value = '';
    } else {
      el('f-campus').value = EXPLORE.cityCampus[city] || '';
      refreshCityOptions();
      el('f-city').value = city;
    }
    renderExplore();
  }

  function buildCityRows(rows) {
    const groups = byKey(rows, r => r.city);
    return Object.keys(groups).map(c => {
      const g = groups[c];
      const dom = g.filter(r => r.listDay !== null && r.contractDay !== null).map(r => r.contractDay - r.listDay);
      const miles = g.map(r => r.miles).filter(m => m !== null);
      return {
        city: c,
        campus: EXPLORE.cityCampus[c] || '',
        n: g.length,
        price: median(prices(g)),
        dom: median(dom),
        miles: median(miles)
      };
    });
  }

  function renderResults() {
    const host = el('f-table');
    host.textContent = '';
    const items = EXPLORE.cityRows;
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'No sales match these filters.';
      host.appendChild(p);
      return;
    }
    const s = EXPLORE.sort;
    const col = RESULT_COLS.filter(c => c.key === s.key)[0];
    const sorted = items.slice().sort((a, b) => {
      const x = a[s.key];
      const y = b[s.key];
      if (col.type === 'text') {
        const c = x.localeCompare(y);
        return s.dir === 'asc' ? c : -c;
      }
      // Blank values always go last, whatever the direction.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return s.dir === 'asc' ? x - y : y - x;
    });
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    RESULT_COLS.forEach(c => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (c.type === 'num') th.className = 'num';
      if (s.key === c.key) th.setAttribute('aria-sort', s.dir === 'asc' ? 'ascending' : 'descending');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sortable';
      btn.textContent = c.label;
      btn.addEventListener('click', () => {
        if (EXPLORE.sort.key === c.key) {
          EXPLORE.sort = { key: c.key, dir: EXPLORE.sort.dir === 'asc' ? 'desc' : 'asc' };
        } else {
          EXPLORE.sort = { key: c.key, dir: c.type === 'num' ? 'desc' : 'asc' };
        }
        renderResults();
      });
      th.appendChild(btn);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    sorted.forEach(row => {
      const tr2 = document.createElement('tr');
      RESULT_COLS.forEach(c => {
        const td = document.createElement('td');
        const v = row[c.key];
        td.setAttribute('data-label', c.label);
        if (c.type === 'num') td.className = 'num';
        td.textContent = (c.type === 'text') ? v : (v === null ? '—' : c.fmt(v));
        tr2.appendChild(td);
      });
      tbody.appendChild(tr2);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
    const caption = document.createElement('p');
    caption.className = 'note';
    caption.textContent = 'Sorted by ' + col.label.toLowerCase() + (s.dir === 'asc' ? ', lowest first.' : ', highest first.');
    host.appendChild(caption);
  }

  function renderYearChart(F) {
    const counts = Object.create(null);
    exploreRows(F, { year: true }).rows.forEach(r => { counts[r.saleYear] = (counts[r.saleYear] || 0) + 1; });
    const cols = DB.years.map(y => {
      const n = counts[y] || 0;
      return { label: String(y), value: n, text: count(n), tip: y + ': ' + plural(n, 'sale'),
        cls: String(y) === F.year ? 'hi' : 'b1' };
    });
    vbar('f-year-chart', { label: 'Column chart: sales by year of sale, under the other filters', cols: cols });
  }

  function renderCompare(F) {
    const mode = el('c-mode').value;
    const a = el('c-a').value;
    const b = el('c-b').value;
    const base = exploreRows(F, { campus: true, city: true }).rows;
    const side = name => {
      const rows = base.filter(r => (mode === 'campus' ? r.campus === name : r.city === name));
      const dom = rows.filter(r => r.listDay !== null && r.contractDay !== null).map(r => r.contractDay - r.listDay);
      const miles = rows.map(r => r.miles).filter(m => m !== null);
      return { name: name, n: rows.length, price: median(prices(rows)), dom: median(dom), miles: median(miles) };
    };
    const table = el('c-table');
    const chartHost = el('c-chart');
    table.textContent = '';
    chartHost.textContent = '';
    if (a === b) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'Pick two different places to compare.';
      table.appendChild(p);
      return;
    }
    const A = side(a);
    const B = side(b);
    const fmtOrDash = (v, f) => (v === null ? '—' : f(v));
    const rowsOut = [
      ['Number of sales', count(A.n), count(B.n)],
      ['Median sale price', fmtOrDash(A.price, money), fmtOrDash(B.price, money)],
      ['Median days on market', fmtOrDash(A.dom, days), fmtOrDash(B.dom, days)],
      ['Median miles to campus', fmtOrDash(A.miles, v => one(v) + ' miles'),
        fmtOrDash(B.miles, v => one(v) + ' miles')]
    ];
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const t = document.createElement('table');
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Measure', A.name, B.name].forEach((h, i) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      if (i > 0) th.className = 'num';
      hr.appendChild(th);
    });
    head.appendChild(hr);
    t.appendChild(head);
    const body = document.createElement('tbody');
    rowsOut.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        td.setAttribute('data-label', ['Measure', A.name, B.name][i]);
        if (i > 0) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    t.appendChild(body);
    wrap.appendChild(t);
    table.appendChild(wrap);
    const withPrice = [A, B].filter(s => s.price !== null);
    if (withPrice.length) {
      hbar('c-chart', {
        label: 'Bar chart: median sale price of the two places, side by side',
        rows: [A, B].map(s => ({
          label: campusLabel(s.name),
          bars: [{ value: s.price || 0, text: s.price === null ? 'No sales' : money(s.price),
            tip: s.name + ': median ' + (s.price === null ? 'no sales' : money(s.price)) + ' from ' + count(s.n) + ' sales',
            cls: s === A ? 'b1' : 'hi' }]
        }))
      });
    }
  }

  function renderExplore() {
    if (!DB) return;
    const F = readFilters();
    const all = exploreRows(F, {});
    const rows = all.rows;
    setText('k-count', count(rows.length));
    setText('k-median', rows.length ? money(median(prices(rows))) : 'No sales');
    let note = '';
    if (!rows.length) {
      note = 'No sales match these filters. Widen a filter to see results.';
    } else if (all.unknown > 0) {
      note = count(all.unknown) + ' sales are left out because a field that a filter uses is blank' +
        ' (or living area is 0). A blank is treated as unknown, not as no.';
    }
    setText('f-note', note);
    updateSliderText(F.slider);
    updateMapSelection(F.city);
    renderYearChart(F);
    EXPLORE.cityRows = buildCityRows(rows);
    renderResults();
    renderCompare(F);
    writeURL(F);
  }

  function resetExplore() {
    el('f-campus').value = '';
    refreshCityOptions();
    ['f-year', 'f-beds', 'f-garage', 'f-basement', 'f-fireplace'].forEach(id => { el(id).value = id === 'f-garage' || id === 'f-basement' || id === 'f-fireplace' ? 'any' : ''; });
    el('f-price').value = 'all';
    el('f-slider').value = 'living';
    configureSlider('living');
    renderExplore();
  }

  function copyLink() {
    const status = el('f-copy-status');
    const done = () => { status.textContent = 'Link copied. Paste it to open this same view.'; };
    const fail = () => { status.textContent = 'Could not copy automatically. Copy the link from the address bar.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(done, fail);
    } else {
      fail();
    }
  }

  function onExploreChange(e) {
    if (e.target.id === 'f-campus') refreshCityOptions();
    if (e.target.id === 'c-mode') refreshCompareOptions();
    renderExplore();
  }

  function bindExplore() {
    ['f-campus', 'f-city', 'f-year', 'f-beds', 'f-price', 'f-garage', 'f-basement', 'f-fireplace',
      'c-mode', 'c-a', 'c-b'].forEach(id => el(id).addEventListener('change', onExploreChange));
    el('f-slider').addEventListener('change', () => {
      configureSlider(el('f-slider').value);
      renderExplore();
    });
    ['f-lo', 'f-hi'].forEach(id => el(id).addEventListener('input', () => onSliderInput(id)));
    el('f-reset').addEventListener('click', resetExplore);
    el('f-copy').addEventListener('click', copyLink);
  }

  function initExplore() {
    initExploreData();
    fillExploreControls();
    applyFromURL();
    buildMap();
    bindExplore();
    renderExplore();
  }

  // ---------- Page-level and setup ----------
  function fillControls() {
    setOptions('q7-beds', [1, 2, 3, 4, 5, 6, 7].map(b => ({
      value: b, label: b === 7 ? '7 or more bedrooms' : bedsLabel(b)
    })), 3);

    setOptions('q8-range', RANGES.map(r => ({ value: r.value, label: r.label })), 'all');

    setOptions('q9-city', DB.cities.map(c => ({ value: c, label: c })),
      DB.cities.indexOf('Ann Arbor, MI') !== -1 ? 'Ann Arbor, MI' : DB.cities[0]);
    const defaultYear = DB.years.indexOf(2025) !== -1 ? 2025 : DB.years[DB.years.length - 1];
    setOptions('q9-year', DB.years.map(y => ({ value: y, label: String(y) })), defaultYear);

    setOptions('q10-campus', DB.campuses.map(c => ({ value: c, label: c })),
      DB.campuses.indexOf('University of Michigan') !== -1 ? 'University of Michigan' : DB.campuses[0]);
    const budgets = [200000, 300000, 400000, 500000, 750000, 1000000, 1500000, 2000000];
    setOptions('q10-budget', budgets.map(b => ({ value: b, label: 'Up to ' + money(b) }))
      .concat([{ value: 'none', label: 'No maximum' }]), '500000');
    const bedOptions = [{ value: 0, label: 'Any number of bedrooms' }];
    for (let b = 1; b <= 6; b++) bedOptions.push({ value: b, label: 'At least ' + plural(b, 'bedroom') });
    setOptions('q10-beds', bedOptions, 3);
  }

  function fillIntroStats() {
    setText('stat-cities', count(DB.cities.length));
    setText('stat-campuses', count(DB.campuses.length));
    setText('stat-valid', 'Rows in the file: ' + count(DB.rows.length) + '. Rows with a valid price: ' +
      count(DB.valid.length) + '.');
  }

  function renderAll() {
    renderQ1();
    renderQ2();
    renderQ3();
    renderQ4();
    renderQ5();
    renderQ6();
    renderQ7();
    renderQ8();
    renderQ9();
    renderQ10();
  }

  function bindControls() {
    el('q7-beds').addEventListener('change', renderQ7);
    el('q8-range').addEventListener('change', renderQ8);
    el('q9-city').addEventListener('change', renderQ9);
    el('q9-year').addEventListener('change', renderQ9);
    el('q10-campus').addEventListener('change', renderQ10);
    el('q10-budget').addEventListener('change', renderQ10);
    el('q10-beds').addEventListener('change', renderQ10);
  }

  // ---------- Light and dark modes ----------
  // The toggle sets data-theme on <html>. Without a choice, the system setting applies.
  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function initTheme() {
    const button = el('theme-toggle');
    const showState = () => button.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    showState();
    button.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('homeSalesTheme', next); } catch (e) { /* the choice lasts for this visit only */ }
      showState();
    });
  }

  // Charts are drawn to the width of their box, so they are redrawn when the width changes
  // (for example, when a phone is turned sideways).
  function initResize() {
    let timer = null;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.innerWidth === lastWidth || !DB) return;
        lastWidth = window.innerWidth;
        renderAll();
        buildMap();
        renderExplore();
      }, 250);
    });
  }

  function init() {
    fetch(DATA_URL)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(text => {
        DB = buildDB(text);
        fillControls();
        fillIntroStats();
        renderAll();
        bindControls();
        initExplore();
        initTheme();
        initResize();
        const status = el('stat-line');
        status.textContent = 'Loaded ' + count(DB.rows.length) + ' sales from the data file. ' +
          'All numbers below were computed from it.';
      })
      .catch(err => {
        const status = el('stat-line');
        status.className = 'status error';
        status.textContent = 'The data file did not load (' + err.message + '). ' +
          'The page needs the data/college_town_home_sales.csv file next to it.';
      });
  }

  init();
})();
