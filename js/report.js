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
  // Horizontal bars. Each row has one or more bars (grouped when there are several).
  // Bars can be negative (diverging chart); the zero line is drawn then.
  function hbar(id, spec) {
    const host = el(id);
    const rows = spec.rows;
    if (!rows.length) { emptyChart(id); return; }
    const nb = rows[0].bars.length;
    const W = 760;
    const bh = nb > 1 ? 13 : 20;
    const rowH = nb * bh + 12;
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
    const labelW = Math.min(230, Math.max(90, maxLabel * 7.4 + 10));
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
      svg.appendChild(svgText(labelW, y0 + (nb * bh) / 2 + 5, row.label, { 'text-anchor': 'end' }));
      row.bars.forEach((b, j) => {
        const by = y0 + j * bh + 2;
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
    const W = 760;
    const H = 300;
    const padL = 10;
    const padR = 10;
    const padT = 30;
    const padB = 46;
    const plotH = H - padT - padB;
    const colW = (W - padL - padR) / cols.length;
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
      svg.appendChild(svgText(x + w / 2, y - 6, c.text, { 'text-anchor': 'middle', class: 'small' }));
      svg.appendChild(svgText(x + w / 2, padT + plotH + 17, c.label,
        { 'text-anchor': 'middle', class: spec.smallLabels ? 'small' : '' }));
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
    const W = 760;
    const rowH = 22;
    const top = 44;
    const H = top + items.length * rowH + 16;
    const leftX = 330;
    const rightX = 430;
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
      svg.appendChild(svgText(leftX - 12, ya + 4.5, it.label + '  #' + it.a, { 'text-anchor': 'end' }));
      svg.appendChild(svgText(rightX + 12, yb + 4.5, '#' + it.b + '  ' + it.label, { 'text-anchor': 'start' }));
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
