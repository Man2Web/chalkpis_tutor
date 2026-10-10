// Chalkpis admin dashboard. Plain JavaScript, no outside code. Everything shown is inserted as text, never as HTML.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var store = window.sessionStorage;
  var local = window.localStorage;
  var state = { view: 'overview', users: { q: '', filter: 'all', offset: 0 }, inst: { q: '', sort: 'activity', filter: 'all' }, days: 30, msg: { status: 'all', type: '' }, auto: false };
  var timer = null;

  // ---------- helpers ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, kids, svg) {
    var n = svg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'on') Object.keys(v).forEach(function (e) { n.addEventListener(e, v[e]); });
      else if (k === 'class') n.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function s(tag, attrs, kids) { return el(tag, attrs, kids, true); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function rupees(paise) { return '₹' + inr.format(Math.round((paise || 0) / 100)); }
  function compact(v) { return v >= 1e7 ? (v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v)); }
  function when(iso) { return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'; }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '—'; }
  function ago(iso) {
    if (!iso) return 'never';
    var t = (Date.now() - new Date(iso).getTime()) / 1000;
    if (t < 60) return 'just now'; if (t < 3600) return Math.floor(t / 60) + ' min ago';
    if (t < 86400) return Math.floor(t / 3600) + ' h ago'; return Math.floor(t / 86400) + ' d ago';
  }
  function pill(text, tone) { return el('span', { class: 'pill ' + (tone || '') }, [text]); }
  function toast(text) {
    var t = el('div', { class: 'toast', role: 'status' }, [text]);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function delta(now, before) {
    if (!before && !now) return el('span', { class: 'delta flat' }, ['—']);
    if (!before) return el('span', { class: 'delta up' }, ['new']);
    var p = Math.round(((now - before) / before) * 100);
    return el('span', { class: 'delta ' + (p > 0 ? 'up' : p < 0 ? 'down' : 'flat') }, [(p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%']);
  }
  function healthBadge(h) {
    var c = h >= 70 ? 'var(--green)' : h >= 40 ? 'var(--orange)' : 'var(--red)';
    return el('span', { class: 'health' }, [el('span', { class: 'dot', style: { background: c } }), String(h)]);
  }
  var css = getComputedStyle(document.documentElement);
  function color(name) { return css.getPropertyValue(name).trim() || '#007aff'; }

  // ---------- charts (inline SVG) ----------
  function lineChart(dates, series, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 200, L = 40, R = 8, T = 10, B = 24;
    var max = 1;
    series.forEach(function (sr) { sr.values.forEach(function (v) { if (v > max) max = v; }); });
    max = niceMax(max);
    var x = function (i) { return L + (dates.length < 2 ? 0 : (i * (W - L - R)) / (dates.length - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'chart' });
    for (var g = 0; g <= 4; g++) {
      var gv = (max * g) / 4;
      svg.appendChild(s('line', { x1: L, x2: W - R, y1: y(gv), y2: y(gv), stroke: color('--line') }));
      svg.appendChild(s('text', { x: L - 6, y: y(gv) + 3, 'text-anchor': 'end' }, [opts.money ? '₹' + compact(gv / 100) : compact(gv)]));
    }
    var step = Math.max(1, Math.ceil(dates.length / 7));
    dates.forEach(function (d, i) {
      if (i % step === 0 || i === dates.length - 1)
        svg.appendChild(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, [day(d + 'T12:00:00+05:30')]));
    });
    series.forEach(function (sr, si) {
      var pts = sr.values.map(function (v, i) { return x(i) + ',' + y(v); }).join(' ');
      if (si === 0 && opts.area !== false) {
        var id = 'g' + Math.random().toString(36).slice(2);
        var grad = s('linearGradient', { id: id, x1: 0, x2: 0, y1: 0, y2: 1 }, [
          s('stop', { offset: '0', 'stop-color': sr.color, 'stop-opacity': '0.28' }),
          s('stop', { offset: '1', 'stop-color': sr.color, 'stop-opacity': '0' }),
        ]);
        svg.appendChild(s('defs', null, [grad]));
        svg.appendChild(s('polygon', { points: x(0) + ',' + y(0) + ' ' + pts + ' ' + x(sr.values.length - 1) + ',' + y(0), fill: 'url(#' + id + ')' }));
      }
      svg.appendChild(s('polyline', { points: pts, fill: 'none', stroke: sr.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      sr.values.forEach(function (v, i) {
        var c = s('circle', { cx: x(i), cy: y(v), r: 6, fill: 'transparent' }, [s('title', null, [day(dates[i] + 'T12:00:00+05:30') + ' · ' + sr.name + ': ' + (opts.money ? rupees(v) : v)])]);
        svg.appendChild(c);
      });
    });
    var wrap = el('div', null, [svg]);
    if (series.length > 1 || opts.legend)
      wrap.appendChild(el('div', { class: 'legend' }, series.map(function (sr) { return el('span', null, [el('i', { style: { background: sr.color } }), sr.name]); })));
    return wrap;
  }
  function niceMax(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function barChart(labels, values, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 180, L = 44, B = 24, T = 10;
    var max = niceMax(Math.max.apply(null, values.concat([1])));
    var bw = (W - L) / Math.max(values.length, 1);
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'bar chart' });
    for (var g = 0; g <= 4; g++) {
      var gv = (max * g) / 4, yy = T + (H - T - B) * (1 - gv / max);
      svg.appendChild(s('line', { x1: L, x2: W, y1: yy, y2: yy, stroke: color('--line') }));
      svg.appendChild(s('text', { x: L - 6, y: yy + 3, 'text-anchor': 'end' }, [opts.money ? '₹' + compact(gv / 100) : compact(gv)]));
    }
    values.forEach(function (v, i) {
      var h = ((H - T - B) * v) / max;
      svg.appendChild(s('rect', { x: L + i * bw + bw * 0.2, y: H - B - h, width: bw * 0.6, height: Math.max(h, 1), rx: 4, fill: opts.color || color('--blue') }, [s('title', null, [labels[i] + ': ' + (opts.money ? rupees(v) : v)])]));
      svg.appendChild(s('text', { x: L + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle' }, [labels[i]]));
    });
    return svg;
  }
  function donut(parts) {
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    var R = 52, C = 2 * Math.PI * R, off = 0;
    var svg = s('svg', { class: 'chart', viewBox: '0 0 140 140', style: 'max-width:150px', role: 'img', 'aria-label': 'plans' });
    svg.appendChild(s('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: color('--fill'), 'stroke-width': 18 }));
    parts.forEach(function (p) {
      var len = (p.value / total) * C;
      svg.appendChild(s('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: p.color, 'stroke-width': 18, 'stroke-dasharray': len + ' ' + (C - len), 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }, [s('title', null, [p.name + ': ' + p.value])]));
      off += len;
    });
    var t = s('text', { x: 70, y: 76, 'text-anchor': 'middle', style: 'font-size:20px;font-weight:700;fill:' + color('--text') }, [String(parts.reduce(function (a, p) { return a + p.value; }, 0))]);
    svg.appendChild(t);
    return el('div', { style: { display: 'flex', gap: '18px', alignItems: 'center' } }, [svg, el('div', { class: 'legend', style: { flexDirection: 'column', gap: '6px' } }, parts.map(function (p) { return el('span', null, [el('i', { style: { background: p.color } }), p.name + ' · ' + p.value]); }))]);
  }
  function spark(values, c) {
    var W = 120, H = 34, max = Math.max.apply(null, values.concat([1]));
    var pts = values.map(function (v, i) { return ((i * W) / Math.max(values.length - 1, 1)) + ',' + (H - 2 - ((H - 4) * v) / max); }).join(' ');
    return s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '34', preserveAspectRatio: 'none', class: 'spark', 'aria-hidden': 'true' }, [s('polyline', { points: pts, fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round' })]);
  }

  // ---------- API ----------
  function tokens() { try { return JSON.parse(store.getItem('adm') || 'null'); } catch { return null; } }
  function saveTokens(t) { store.setItem('adm', JSON.stringify(t)); }
  async function call(method, url, body, retried) {
    var t = tokens();
    var res = await fetch(url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t.accessToken } : {}), body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401 && t && !retried) {
      var r = await fetch('/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) });
      if (r.ok) { var j = await r.json(); saveTokens({ accessToken: j.accessToken, refreshToken: j.refreshToken, phone: t.phone }); return call(method, url, body, true); }
      store.removeItem('adm'); render(); throw new Error('Signed out');
    }
    if (url.slice(-4) === '.csv' && res.ok) return res.blob();
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var e = new Error(data.error || 'error ' + res.status); e.code = data.error; throw e; }
    return data;
  }
  async function download(url, name) {
    var blob = await call('GET', url);
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- sign in ----------
  function loginView() {
    var phone = el('input', { placeholder: 'Mobile number', inputmode: 'tel', autocomplete: 'tel' });
    var code = el('input', { placeholder: '6-digit code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', style: { display: 'none' } });
    var err = el('div', { class: 'err small' }), hint = el('div', { class: 'muted small' });
    var step = 1, btn = el('button', { class: 'primary' }, ['Send code on WhatsApp']);
    async function go() {
      err.textContent = ''; btn.disabled = true;
      try {
        if (step === 1) {
          var r = await call('POST', '/auth/otp/request', { phone: phone.value });
          step = 2; code.style.display = ''; code.focus(); btn.textContent = 'Sign in';
          hint.textContent = r.devCode ? 'Test mode code: ' + r.devCode : 'Enter the code sent to your WhatsApp.';
        } else {
          var v = await call('POST', '/auth/otp/verify', { phone: phone.value, code: code.value });
          if (!v.isAdmin) {
            await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: v.refreshToken }) });
            throw new Error('This number is not an admin.');
          }
          saveTokens({ accessToken: v.accessToken, refreshToken: v.refreshToken, phone: v.user.phone }); render();
        }
      } catch (e) {
        err.textContent = e.code === 'invalid_code' ? 'Wrong or expired code.' : e.code === 'invalid_phone' ? 'Enter a valid mobile number.' : e.code === 'too_soon' ? 'Wait a minute before asking for a new code.' : e.message;
      } finally { btn.disabled = false; }
    }
    btn.addEventListener('click', go);
    [phone, code].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); });
    return el('div', { class: 'login' }, [el('div', { class: 'logo' }, ['C']), el('h1', null, ['Chalkpis Admin']), el('div', { class: 'muted' }, ['Sign in with an admin mobile number.']), phone, code, btn, hint, err]);
  }

  // ---------- views ----------
  function kpi(label, value, now, before, values, c) {
    return el('div', { class: 'card kpi' }, [
      el('h3', null, [label, delta(now, before)]),
      el('div', { class: 'v num' }, [value]),
      values ? spark(values, c) : null,
    ]);
  }

  async function overviewView(box) {
    var r = await Promise.all([call('GET', '/admin/api/overview'), call('GET', '/admin/api/analytics?days=30'), call('GET', '/admin/api/institutes?filter=at-risk&sort=students'), call('GET', '/admin/api/logins')]);
    var o = r[0], a = r[1], risky = r[2].institutes, logins = r[3].logins;
    var T = a.totals, S = a.series;
    box.appendChild(el('div', { class: 'grid g4' }, [
      kpi('Active centres (30 d)', T.activeInstitutes.now, T.activeInstitutes.now, T.activeInstitutes.before, S.activeInstitutes, color('--blue')),
      kpi('New sign-ups (30 d)', T.signups.now, T.signups.now, T.signups.before, S.signups, color('--purple')),
      kpi('Fees recorded (30 d)', rupees(T.feesRecorded.now), T.feesRecorded.now, T.feesRecorded.before, S.feesRecorded, color('--green')),
      kpi('WhatsApp sent (30 d)', T.messagesSent.now, T.messagesSent.now, T.messagesSent.before, S.messagesSent, color('--teal')),
    ]));
    box.appendChild(el('div', { class: 'grid g4', style: { marginTop: '14px' } }, [
      ['Logins', o.users, (o.owners + ' tutors · ' + o.staff + ' helpers')],
      ['Signed in now', o.signedIn, o.logins24h + ' logins in 24 h'],
      ['Centres', o.institutes, o.trials + ' trial · ' + o.paid + ' paid · ' + o.expired + ' ended'],
      ['Active students', o.students, Math.round(a.retention.rate7 * 100) + '% of centres used Chalkpis this week'],
    ].map(function (x) { return el('div', { class: 'card kpi' }, [el('h3', null, [x[0]]), el('div', { class: 'v num' }, [x[1]]), el('div', { class: 'sub' }, [x[2]])]); })));

    box.appendChild(el('div', { class: 'grid g2', style: { marginTop: '14px' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Usage, last 30 days']), lineChart(a.dates, [
        { name: 'Active centres', values: S.activeInstitutes, color: color('--blue') },
        { name: 'Attendance saved', values: S.attendanceSaved, color: color('--green') },
        { name: 'Sign-ins', values: S.signIns, color: color('--purple') },
      ])]),
      el('div', { class: 'card' }, [el('h3', null, ['Activation funnel']), funnel(a.funnel)]),
    ]));

    box.appendChild(el('div', { class: 'grid g2', style: { marginTop: '14px' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Needs attention', el('button', { class: 'ghost', on: { click: function () { state.view = 'institutes'; state.inst.filter = 'at-risk'; render(); } } }, ['See all'])]),
        risky.length ? el('div', null, risky.slice(0, 6).map(function (i) {
          return el('div', { class: 'row', style: { cursor: 'pointer' }, on: { click: function () { openInstitute(i.id); } } }, [
            el('div', null, [i.name, el('div', { class: 'sub' }, [(i.owner ? i.owner.phone : '') + ' · ' + i.students + ' students · active ' + ago(i.lastActivityAt)])]), healthBadge(i.health)]);
        })) : el('div', { class: 'empty' }, ['Every centre looks healthy.'])]),
      el('div', { class: 'card livefeed' }, [el('h3', null, ['Live sign-in activity', state.auto ? el('span', { class: 'spin' }) : null]),
        logins.length ? el('div', null, logins.slice(0, 8).map(function (l) {
          return el('div', { class: 'it' }, [pill(l.result, l.result === 'signed in' ? 'green' : l.result.indexOf('wrong') === 0 ? 'red' : ''), el('div', { style: { flex: '1' } }, [(l.name || l.phone), el('div', { class: 'sub' }, [l.phone + ' · ' + ago(l.at)])])]);
        })) : el('div', { class: 'empty' }, ['No sign-ins yet.'])]),
    ]));
  }

  function funnel(f) {
    var steps = [['Centres created', f.institutes], ['Added students', f.withStudents], ['Marked attendance', f.withAttendance], ['Recorded a payment', f.withPayments], ['Set UPI / pay link', f.canBePaid], ['Parent messages on', f.messagesOn], ['Bought a plan', f.everPaid]];
    var top = Math.max(f.institutes, 1);
    return el('div', { class: 'funnel' }, steps.map(function (st) {
      var p = Math.round((st[1] / top) * 100);
      return el('div', { class: 'step' }, [el('span', null, [st[0]]), el('div', { class: 'bar' }, [el('i', { style: { width: p + '%' } })]), el('span', { class: 'num', style: { textAlign: 'right' } }, [st[1] + ' · ' + p + '%'])]);
    }));
  }

  async function analyticsView(box) {
    var seg = el('div', { class: 'actions', style: { marginBottom: '14px' } }, [7, 30, 90, 180].map(function (d) {
      return el('button', { class: state.days === d ? 'primary' : '', on: { click: function () { state.days = d; render(); } } }, [d + ' days']);
    }));
    box.appendChild(seg);
    var a = await call('GET', '/admin/api/analytics?days=' + state.days);
    var T = a.totals, S = a.series;
    box.appendChild(el('div', { class: 'grid g4' }, [
      kpi('Sign-ups', T.signups.now, T.signups.now, T.signups.before, S.signups, color('--purple')),
      kpi('Sign-ins', T.signIns.now, T.signIns.now, T.signIns.before, S.signIns, color('--blue')),
      kpi('Active centres', T.activeInstitutes.now, T.activeInstitutes.now, T.activeInstitutes.before, S.activeInstitutes, color('--teal')),
      kpi('Plan revenue', rupees(T.revenue.now), T.revenue.now, T.revenue.before, S.revenue, color('--green')),
    ]));
    box.appendChild(el('div', { class: 'grid g2', style: { marginTop: '14px' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Growth']), lineChart(a.dates, [{ name: 'Sign-ups', values: S.signups, color: color('--purple') }, { name: 'Sign-ins', values: S.signIns, color: color('--blue') }])]),
      el('div', { class: 'card' }, [el('h3', null, ['Fees recorded by tutors']), lineChart(a.dates, [{ name: 'Fees', values: S.feesRecorded, color: color('--green') }], { money: true })]),
      el('div', { class: 'card' }, [el('h3', null, ['WhatsApp delivery']), lineChart(a.dates, [{ name: 'Sent', values: S.messagesSent, color: color('--teal') }, { name: 'Failed', values: S.messagesFailed, color: color('--red') }], { area: false })]),
      el('div', { class: 'card' }, [el('h3', null, ['Attendance saved']), lineChart(a.dates, [{ name: 'Days saved', values: S.attendanceSaved, color: color('--blue') }])]),
    ]));
    var planColors = { trial: color('--blue'), starter: color('--teal'), standard: color('--purple'), pro: color('--green') };
    box.appendChild(el('div', { class: 'grid g3', style: { marginTop: '14px' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Active plans']), donut(a.plans.map(function (p) { return { name: p.plan, value: p.active, color: planColors[p.plan] || color('--muted') }; }))]),
      el('div', { class: 'card' }, [el('h3', null, ['Plan revenue by month']), a.revenueByMonth.length ? barChart(a.revenueByMonth.map(function (m) { return m.month.slice(5) + '/' + m.month.slice(2, 4); }), a.revenueByMonth.map(function (m) { return m.amount; }), { money: true, color: color('--green') }) : el('div', { class: 'empty' }, ['No plan payments yet.'])]),
      el('div', { class: 'card' }, [el('h3', null, ['Retention and conversion']),
        el('div', { class: 'row' }, [el('span', null, ['Used Chalkpis in the last 7 days']), el('b', null, [Math.round(a.retention.rate7 * 100) + '%'])]),
        el('div', { class: 'row' }, [el('span', null, ['Used Chalkpis in the last 30 days']), el('b', null, [Math.round(a.retention.rate30 * 100) + '%'])]),
        el('div', { class: 'row' }, [el('span', null, ['Trial → paid']), el('b', null, [Math.round(a.conversion * 100) + '%'])]),
        el('div', { class: 'row' }, [el('span', null, ['Centres']), el('b', null, [a.funnel.institutes])]),
      ]),
    ]));
  }

  async function institutesView(box) {
    var I = state.inst;
    var q = el('input', { placeholder: 'Search centre, owner or phone', value: I.q });
    var sort = el('select', null, [['activity', 'Last active'], ['students', 'Most students'], ['health', 'Lowest health'], ['newest', 'Newest'], ['expiring', 'Plan ending soon']].map(function (o) { var x = el('option', { value: o[0] }, [o[1]]); if (o[0] === I.sort) x.selected = true; return x; }));
    var filter = el('select', null, [['all', 'All centres'], ['trial', 'On trial'], ['paid', 'Paid'], ['ended', 'Plan ended'], ['at-risk', 'At risk']].map(function (o) { var x = el('option', { value: o[0] }, [o[1]]); if (o[0] === I.filter) x.selected = true; return x; }));
    var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { I.q = q.value; load(); }, 300); });
    sort.addEventListener('change', function () { I.sort = sort.value; load(); });
    filter.addEventListener('change', function () { I.filter = filter.value; load(); });
    var exp = el('button', { class: 'tinted', on: { click: function () { download('/admin/api/export/institutes.csv', 'chalkpis-institutes.csv'); } } }, ['⤓ Export CSV']);
    var wrap = el('div', { class: 'tablewrap' });
    box.appendChild(el('div', { class: 'tools' }, [q, filter, sort, exp]));
    box.appendChild(wrap);
    async function load() {
      var r = await call('GET', '/admin/api/institutes?q=' + encodeURIComponent(I.q) + '&sort=' + I.sort + '&filter=' + I.filter);
      clear(wrap);
      var rows = r.institutes.map(function (i) {
        return el('tr', { class: 'click', on: { click: function () { openInstitute(i.id); } } }, [
          el('td', null, [el('b', null, [i.name]), el('div', { class: 'sub' }, [i.owner ? i.owner.name + ' · ' + i.owner.phone : 'no owner'])]),
          el('td', null, [pill((i.plan || '—') + (i.planActive ? '' : ' · ended'), i.planActive ? (i.plan === 'trial' ? 'blue' : 'green') : 'orange'), el('div', { class: 'sub' }, [i.expiresAt ? 'until ' + day(i.expiresAt) : ''])]),
          el('td', { class: 'num' }, [String(i.students), el('div', { class: 'sub' }, [i.batches + ' batches · ' + i.staff + ' helpers'])]),
          el('td', { class: 'hide-sm' }, [ago(i.lastActivityAt)]),
          el('td', { class: 'num hide-sm' }, [rupees(i.collected30)]),
          el('td', { class: 'num hide-sm' }, [String(i.messages30), i.failed30 ? el('div', { class: 'sub err' }, [i.failed30 + ' failed']) : null]),
          el('td', null, [healthBadge(i.health)]),
        ]);
      });
      wrap.appendChild(el('table', null, [
        el('thead', null, [el('tr', null, [['Centre'], ['Plan'], ['Students'], ['Last active', 1], ['Fees (30 d)', 1], ['WhatsApp (30 d)', 1], ['Health']].map(function (h) { return el('th', { class: h[1] ? 'hide-sm' : '' }, [h[0]]); }))]),
        el('tbody', null, rows.length ? rows : [el('tr', null, [el('td', { colspan: '7', class: 'empty' }, ['No centres match.'])])]),
      ]));
    }
    await load();
  }

  async function usersView(box) {
    var U = state.users;
    var q = el('input', { placeholder: 'Search name, phone or institute', value: U.q });
    var filter = el('select', null, [['all', 'Everyone'], ['owners', 'Tutors'], ['staff', 'Helpers'], ['blocked', 'Blocked'], ['no-institute', 'Not set up yet']].map(function (f) { var o = el('option', { value: f[0] }, [f[1]]); if (U.filter === f[0]) o.selected = true; return o; }));
    var t; q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { U.q = q.value; U.offset = 0; load(); }, 300); });
    filter.addEventListener('change', function () { U.filter = filter.value; U.offset = 0; load(); });
    var exp = el('button', { class: 'tinted', on: { click: function () { download('/admin/api/export/users.csv', 'chalkpis-logins.csv'); } } }, ['⤓ Export CSV']);
    var wrap = el('div');
    box.appendChild(el('div', { class: 'tools' }, [q, filter, exp]));
    box.appendChild(wrap);
    async function load() {
      var r = await call('GET', '/admin/api/users?q=' + encodeURIComponent(U.q) + '&filter=' + U.filter + '&limit=50&offset=' + U.offset);
      clear(wrap);
      var rows = r.users.map(function (u) {
        var status = u.blocked ? pill('Blocked', 'red') : u.isAdmin ? pill('Admin', 'blue') : u.activeSessions ? pill('Signed in', 'green') : pill('Signed out');
        return el('tr', { class: 'click', on: { click: function () { openUser(u.id); } } }, [
          el('td', null, [el('b', null, [u.name || '(no name)']), el('div', { class: 'sub' }, [u.phone])]),
          el('td', null, [u.role === 'owner' ? 'Tutor' : u.role === 'staff' ? 'Helper' : '—']),
          el('td', { class: 'hide-sm' }, [u.institute ? u.institute.name : '—', u.institute ? el('div', { class: 'sub' }, [u.institute.students + ' students']) : null]),
          el('td', null, [u.institute ? pill((u.institute.plan || '—') + (u.institute.active ? '' : ' · ended'), u.institute.active ? 'green' : 'orange') : pill('—')]),
          el('td', { class: 'hide-sm' }, [ago(u.lastLoginAt), el('div', { class: 'sub' }, [u.activeSessions + ' device(s)'])]),
          el('td', null, [status]),
        ]);
      });
      wrap.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [
        el('thead', null, [el('tr', null, [['Login'], ['Role'], ['Institute', 1], ['Plan'], ['Last login', 1], ['Status']].map(function (h) { return el('th', { class: h[1] ? 'hide-sm' : '' }, [h[0]]); }))]),
        el('tbody', null, rows.length ? rows : [el('tr', null, [el('td', { colspan: '6', class: 'empty' }, ['No logins match.'])])]),
      ])]));
      wrap.appendChild(el('div', { class: 'actions', style: { justifyContent: 'center', marginTop: '12px' } }, [
        U.offset ? el('button', { on: { click: function () { U.offset -= 50; load(); } } }, ['← Previous']) : null,
        r.users.length === 50 ? el('button', { on: { click: function () { U.offset += 50; load(); } } }, ['Next →']) : null,
      ]));
    }
    await load();
  }

  async function whatsappView(box) {
    var M = state.msg;
    var status = el('select', null, ['all', 'failed', 'queued', 'sending', 'sent', 'skipped'].map(function (x) { var o = el('option', { value: x }, [x === 'all' ? 'Every status' : x]); if (M.status === x) o.selected = true; return o; }));
    var type = el('select', null, [['', 'Every type'], ['absent', 'Absent'], ['late', 'Late'], ['fee_due', 'Fee due'], ['fee_overdue', 'Fee overdue'], ['fee_reminder', 'Reminder (QR)'], ['fee_link', 'Reminder (link)'], ['payment_received', 'Receipt'], ['parent_link', 'Parent link']].map(function (x) { var o = el('option', { value: x[0] }, [x[1]]); if (M.type === x[0]) o.selected = true; return o; }));
    status.addEventListener('change', function () { M.status = status.value; render(); });
    type.addEventListener('change', function () { M.type = type.value; render(); });
    var r = await call('GET', '/admin/api/messages?status=' + M.status + '&type=' + M.type + '&limit=150');
    var by = {};
    r.summary.forEach(function (x) { by[x.status] = (by[x.status] || 0) + x.count; });
    var total = Object.keys(by).reduce(function (a, k) { return a + by[k]; }, 0);
    box.appendChild(el('div', { class: 'grid g4' }, [['Sent (7 d)', by.sent || 0, 'green'], ['Failed (7 d)', by.failed || 0, 'red'], ['Skipped (7 d)', by.skipped || 0, ''], ['Delivery rate', total ? Math.round(((by.sent || 0) / total) * 100) + '%' : '—', 'blue']].map(function (x) {
      return el('div', { class: 'card kpi' }, [el('h3', null, [x[0]]), el('div', { class: 'v num' }, [String(x[1])])]);
    })));
    box.appendChild(el('div', { class: 'grid g2', style: { margin: '14px 0' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Top reasons a message did not go']), r.topErrors.length ? el('div', null, r.topErrors.map(function (e) { return el('div', { class: 'row' }, [el('code', null, [e.error]), el('b', null, [String(e.count)])]); })) : el('div', { class: 'empty' }, ['Nothing failed this week.'])]),
      el('div', { class: 'card' }, [el('h3', null, ['By message type (7 d)']), byType(r.summary)]),
    ]));
    box.appendChild(el('div', { class: 'tools' }, [status, type]));
    var rows = r.messages.map(function (m) {
      var tone = m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : m.status === 'skipped' ? '' : 'blue';
      return el('tr', null, [
        el('td', null, [when(m.createdAt)]),
        el('td', null, [el('b', null, [m.institute]), el('div', { class: 'sub' }, [(m.student || '') + ' · ' + m.to])]),
        el('td', null, [m.type, m.manual ? el('div', { class: 'sub' }, ['sent by tutor']) : null]),
        el('td', null, [pill(m.status, tone), m.why ? el('div', { class: 'sub' }, [m.why]) : null]),
        el('td', { class: 'hide-sm sub' }, [m.template || '—']),
        el('td', null, [m.status === 'failed' ? el('button', { class: 'tinted', on: { click: async function (ev) {
          ev.target.disabled = true;
          try { await call('POST', '/admin/api/messages/' + m.id + '/retry'); toast('Queued again'); render(); }
          catch (e) { ev.target.disabled = false; toast(e.code === 'cannot_retry' ? 'Too old to retry (values already wiped)' : e.message); }
        } } }, ['Retry']) : null]),
      ]);
    });
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [
      el('thead', null, [el('tr', null, [['When'], ['Centre / student'], ['Type'], ['Status'], ['Template', 1], ['']].map(function (h) { return el('th', { class: h[1] ? 'hide-sm' : '' }, [h[0]]); }))]),
      el('tbody', null, rows.length ? rows : [el('tr', null, [el('td', { colspan: '6', class: 'empty' }, ['No messages.'])])]),
    ])]));
  }
  function byType(summary) {
    var types = {};
    summary.forEach(function (x) { types[x.type] = types[x.type] || { sent: 0, other: 0 }; if (x.status === 'sent') types[x.type].sent += x.count; else types[x.type].other += x.count; });
    var keys = Object.keys(types);
    if (!keys.length) return el('div', { class: 'empty' }, ['No messages this week.']);
    var max = Math.max.apply(null, keys.map(function (k) { return types[k].sent + types[k].other; }));
    return el('div', null, keys.map(function (k) {
      var t = types[k], w = ((t.sent + t.other) / max) * 100, sw = t.sent + t.other ? (t.sent / (t.sent + t.other)) * 100 : 0;
      return el('div', { class: 'funnel' }, [el('div', { class: 'step' }, [el('span', null, [k]), el('div', { class: 'bar', style: { width: w + '%' } }, [el('i', { style: { width: sw + '%', background: 'var(--green)' } })]), el('span', { class: 'num', style: { textAlign: 'right' } }, [t.sent + ' / ' + (t.sent + t.other)])])]);
    }));
  }

  async function announcementsView(box) {
    var title = el('input', { placeholder: 'Title, e.g. New: poster maker', maxlength: '80' });
    var body = el('textarea', { rows: '3', placeholder: 'A short message for tutors (optional)', maxlength: '400' });
    var link = el('input', { placeholder: 'https:// link (optional)' });
    var tone = el('select', null, [['info', 'Info (blue)'], ['success', 'Good news (green)'], ['warning', 'Warning (orange)']].map(function (x) { return el('option', { value: x[0] }, [x[1]]); }));
    var aud = el('select', null, [['all', 'Everyone'], ['owners', 'Tutors only'], ['staff', 'Helpers only']].map(function (x) { return el('option', { value: x[0] }, [x[1]]); }));
    var days = el('select', null, [[1, '1 day'], [3, '3 days'], [7, '7 days'], [30, '30 days'], ['', 'Until I end it']].map(function (x) { var o = el('option', { value: String(x[0]) }, [x[1]]); if (x[0] === 7) o.selected = true; return o; }));
    var err = el('div', { class: 'err small' });
    var preview = el('div', { class: 'card ann', style: { marginTop: '6px' } });
    function drawPreview() {
      clear(preview); preview.className = 'card ann ' + tone.value;
      preview.appendChild(el('b', null, [title.value || 'Your title']));
      if (body.value) preview.appendChild(el('div', { class: 'sub', style: { marginTop: '4px' } }, [body.value]));
    }
    [title, body, tone].forEach(function (i) { i.addEventListener('input', drawPreview); i.addEventListener('change', drawPreview); });
    drawPreview();
    var send = el('button', { class: 'primary', on: { click: async function () {
      err.textContent = ''; send.disabled = true;
      try {
        await call('POST', '/admin/api/announcements', { title: title.value, body: body.value, link: link.value, tone: tone.value, audience: aud.value, days: days.value ? Number(days.value) : null });
        toast('Announcement is live'); render();
      } catch (e) { err.textContent = e.code === 'bad_request' ? 'Check the title (2+ letters) and that the link starts with https://' : e.message; send.disabled = false; }
    } } }, ['Publish to the app']);
    box.appendChild(el('div', { class: 'grid g2' }, [
      el('div', { class: 'card form' }, [el('h3', null, ['New announcement']), el('label', null, ['Title', title]), el('label', null, ['Message', body]), el('label', null, ['Link', link]),
        el('div', { class: 'actions' }, [el('label', null, ['Look', tone]), el('label', null, ['Who sees it', aud]), el('label', null, ['Show for', days])]), send, err]),
      el('div', { class: 'card' }, [el('h3', null, ['Preview on the tutor’s Home']), preview, el('div', { class: 'sub', style: { marginTop: '8px' } }, ['Shows as a banner at the top of Home until it ends. Tutors can close it.'])]),
    ]));
    var r = await call('GET', '/admin/api/announcements');
    box.appendChild(el('div', { class: 'section' }, ['All announcements']));
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [
      el('thead', null, [el('tr', null, ['Announcement', 'Audience', 'From', 'Until', 'Status', ''].map(function (h) { return el('th', null, [h]); }))]),
      el('tbody', null, r.announcements.length ? r.announcements.map(function (a) {
        return el('tr', null, [
          el('td', null, [el('b', null, [a.title]), a.body ? el('div', { class: 'sub' }, [a.body]) : null]),
          el('td', null, [a.audience]), el('td', null, [when(a.startsAt)]), el('td', null, [a.endsAt ? when(a.endsAt) : 'no end']),
          el('td', null, [a.live ? pill('Live', 'green') : pill('Ended')]),
          el('td', null, [a.live ? el('button', { class: 'danger', on: { click: async function () { if (!confirm('Take "' + a.title + '" down now?')) return; await call('POST', '/admin/api/announcements/' + a.id + '/end'); toast('Taken down'); render(); } } }, ['End now']) : null]),
        ]);
      }) : [el('tr', null, [el('td', { colspan: '6', class: 'empty' }, ['No announcements yet.'])])]),
    ])]));
  }

  async function activityView(box) {
    var r = await call('GET', '/admin/api/logins');
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [
      el('thead', null, [el('tr', null, ['When', 'Number', 'Name', 'Result'].map(function (h) { return el('th', null, [h]); }))]),
      el('tbody', null, r.logins.length ? r.logins.map(function (l) {
        var tone = l.result === 'signed in' ? 'green' : l.result.indexOf('wrong') === 0 ? 'red' : '';
        return el('tr', { class: l.userId ? 'click' : '', on: l.userId ? { click: function () { openUser(l.userId); } } : {} }, [el('td', null, [when(l.at)]), el('td', null, [l.phone]), el('td', null, [l.name || '—']), el('td', null, [pill(l.result, tone)])]);
      }) : [el('tr', null, [el('td', { colspan: '4', class: 'empty' }, ['No login codes in the last day.'])])]),
    ])]));
  }

  async function auditView(box) {
    var r = await call('GET', '/admin/api/audit');
    box.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [
      el('thead', null, [el('tr', null, ['When', 'Admin', 'Action', 'Target', 'Detail'].map(function (h) { return el('th', null, [h]); }))]),
      el('tbody', null, r.audit.length ? r.audit.map(function (a) { return el('tr', null, [el('td', null, [when(a.at)]), el('td', null, [a.admin]), el('td', null, [pill(a.action, a.action === 'block' ? 'red' : 'blue')]), el('td', null, [a.target]), el('td', { class: 'sub' }, [a.detail])]); })
        : [el('tr', null, [el('td', { colspan: '5', class: 'empty' }, ['Nothing yet.'])])]),
    ])]));
  }

  async function systemView(box) {
    var h = await call('GET', '/admin/api/health');
    function up(sec) { var d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); return (d ? d + 'd ' : '') + hh + 'h ' + m + 'm'; }
    var qok = h.queue.oldestQueuedMinutes < 10 && h.queue.failed24h < 20;
    box.appendChild(el('div', { class: 'grid g4' }, [
      ['Server', pill('Running', 'green'), 'v' + h.server.version + ' · ' + h.server.node + ' · up ' + up(h.server.uptimeSeconds)],
      ['Database', pill('Connected', 'green'), h.database.pingMs + ' ms · ' + h.database.sizeMb + ' MB · ' + h.database.lastMigration],
      ['Message queue', pill(qok ? 'Healthy' : 'Check', qok ? 'green' : 'orange'), h.queue.queued + ' waiting · ' + h.queue.sending + ' sending · ' + h.queue.failed24h + ' failed (24 h)' + (h.queue.oldestQueuedMinutes ? ' · oldest ' + h.queue.oldestQueuedMinutes + ' min' : '')],
      ['WhatsApp sender', pill(h.whatsapp.provider === 'none' ? 'Not set up' : h.whatsapp.provider, h.whatsapp.provider === 'none' ? 'red' : 'green'), h.whatsapp.templates.length + ' templates configured'],
    ].map(function (x) { return el('div', { class: 'card' }, [el('h3', null, [x[0], x[1]]), el('div', { class: 'sub' }, [x[2]])]); })));
    box.appendChild(el('div', { class: 'grid g2', style: { marginTop: '14px' } }, [
      el('div', { class: 'card' }, [el('h3', null, ['Scheduled jobs (last run)'])].concat(h.jobs.length ? h.jobs.map(function (j) { return el('div', { class: 'row' }, [el('span', null, [j.job]), el('span', { class: 'sub' }, [when(j.lastRunAt) + ' · ' + ago(j.lastRunAt)])]); }) : [el('div', { class: 'empty' }, ['No job has run yet.'])])),
      el('div', { class: 'card' }, [el('h3', null, ['WhatsApp templates'])].concat(h.whatsapp.templates.length ? h.whatsapp.templates.map(function (t) { var p = t.split(': '); return el('div', { class: 'row' }, [el('span', null, [p[0]]), el('code', { class: 'sub' }, [p[1]])]); }) : [el('div', { class: 'empty' }, ['WA_TEMPLATES is empty.'])])),
      el('div', { class: 'card' }, [el('h3', null, ['Server']),
        el('div', { class: 'row' }, [el('span', null, ['Public address']), el('span', { class: 'sub' }, [h.server.publicBaseUrl || 'not set'])]),
        el('div', { class: 'row' }, [el('span', null, ['Memory']), el('span', { class: 'sub' }, [h.server.memoryMb + ' MB'])]),
      ]),
    ]));
  }

  // ---------- detail panels ----------
  function openPanel() {
    closePanel();
    var scrim = el('div', { class: 'scrim', on: { click: closePanel } });
    var panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true' }, [el('span', { class: 'spin' })]);
    document.body.appendChild(scrim); document.body.appendChild(panel);
    return panel;
  }
  function closePanel() { document.querySelectorAll('.panel,.scrim').forEach(function (n) { n.remove(); }); }
  function head(panel, title, sub) {
    panel.appendChild(el('div', { class: 'actions', style: { justifyContent: 'space-between', marginBottom: '14px' } }, [
      el('div', null, [el('div', { style: { fontSize: '22px', fontWeight: '700' } }, [title]), sub ? el('div', { class: 'sub' }, [sub]) : null]),
      el('button', { on: { click: closePanel } }, ['Close']),
    ]));
  }
  function rows(title, pairs) {
    return el('div', { class: 'card' }, [el('h3', null, [title])].concat(pairs.filter(Boolean).map(function (p) { return el('div', { class: 'row' }, [el('span', { class: 'muted' }, [p[0]]), el('span', { style: { textAlign: 'right' } }, [p[1]])]); })));
  }
  function planEditor(institute, done) {
    var sel = el('select', null, ['trial', 'starter', 'standard', 'pro'].map(function (p) { var o = el('option', { value: p }, [p]); if (p === institute.plan) o.selected = true; return o; }));
    var days = el('select', null, [7, 15, 30, 90, 180, 365].map(function (d) { var o = el('option', { value: String(d) }, [d + ' days']); if (d === 30) o.selected = true; return o; }));
    var msg = el('div', { class: 'small' });
    return el('div', { class: 'card' }, [el('h3', null, ['Plan']),
      el('div', { class: 'row' }, [el('span', { class: 'muted' }, ['Now']), el('span', null, [(institute.plan || '—') + (institute.active || institute.planActive ? ', active until ' : ', ended ') + when(institute.expiresAt)])]),
      el('div', { class: 'actions', style: { marginTop: '10px' } }, [sel, days, el('button', { class: 'primary', on: { click: async function () {
        try { var r = await call('POST', '/admin/api/institutes/' + institute.id + '/plan', { plan: sel.value, days: Number(days.value) }); toast('Plan: ' + r.plan + ' until ' + day(r.expiresAt)); done(); }
        catch (e) { msg.className = 'err small'; msg.textContent = e.message; }
      } } }, ['Extend'])]), msg]);
  }

  async function openUser(id) {
    var panel = openPanel();
    async function draw() {
      var d = await call('GET', '/admin/api/users/' + id), u = d.user;
      clear(panel);
      head(panel, u.name || '(no name)', u.phone);
      var msg = el('div', { class: 'small' });
      async function act(fn, ok) { try { await fn(); toast(ok); await draw(); } catch (e) { msg.className = 'err small'; msg.textContent = e.code === 'cannot_change_admin' ? 'Admin accounts cannot be changed here.' : e.message; } }
      panel.appendChild(rows('Login', [
        ['Status', u.blocked ? pill('Blocked', 'red') : u.isAdmin ? pill('Admin', 'blue') : u.activeSessions ? pill('Signed in', 'green') : pill('Signed out')],
        ['Role', u.role === 'owner' ? 'Tutor (owner)' : u.role === 'staff' ? 'Helper' : 'Not set up yet'],
        ['Joined', when(u.createdAt)], ['Last login', when(u.lastLoginAt)], ['Devices signed in', String(u.activeSessions)],
        u.blocked ? ['Block reason', u.blockedReason || '—'] : null,
      ]));
      if (u.institute) panel.appendChild(el('div', { class: 'card', style: { cursor: 'pointer' }, on: { click: function () { openInstitute(u.institute.id); } } }, [el('h3', null, ['Centre', el('span', { class: 'sub' }, ['Open →'])]), el('b', null, [u.institute.name]), el('div', { class: 'sub' }, [u.institute.students + ' students · ' + (u.institute.plan || '—')])]));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['Actions']), el('div', { class: 'actions' }, [
        el('button', { class: 'tinted', disabled: u.isAdmin || !u.activeSessions, on: { click: function () { if (confirm('Sign ' + u.phone + ' out on every phone?')) act(function () { return call('POST', '/admin/api/users/' + id + '/sign-out'); }, 'Signed out everywhere'); } } }, ['Sign out everywhere']),
        u.blocked ? el('button', { class: 'tinted', on: { click: function () { act(function () { return call('POST', '/admin/api/users/' + id + '/unblock'); }, 'Unblocked'); } } }, ['Unblock'])
          : el('button', { class: 'danger', disabled: u.isAdmin, on: { click: function () { var reason = prompt('Block ' + u.phone + '? They are signed out at once and cannot sign in.\nReason (optional):', ''); if (reason !== null) act(function () { return call('POST', '/admin/api/users/' + id + '/block', { reason: reason }); }, 'Blocked'); } } }, ['Block login']),
      ]), msg]));
      if (u.institute && u.role === 'owner') panel.appendChild(planEditor(u.institute, draw));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['Sign-ins'])].concat(d.sessions.length ? d.sessions.map(function (x) { return el('div', { class: 'row' }, [el('span', null, [when(x.startedAt)]), pill(x.status, x.status === 'active' ? 'green' : '')]); }) : [el('div', { class: 'empty' }, ['None'])])));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['Login codes (last day)'])].concat(d.codes.length ? d.codes.map(function (c) { return el('div', { class: 'row' }, [el('span', null, [when(c.at)]), el('span', { class: 'sub' }, [c.result])]); }) : [el('div', { class: 'empty' }, ['None'])])));
    }
    try { await draw(); } catch (e) { panel.textContent = e.message; }
  }

  async function openInstitute(id) {
    var panel = openPanel();
    async function draw() {
      var d = await call('GET', '/admin/api/institutes/' + id), i = d.institute;
      clear(panel);
      head(panel, i.name, 'Created ' + day(i.createdAt));
      panel.appendChild(el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '12px' } }, [
        ['Health', healthBadge(i.health)], ['Students', String(i.students)], ['Outstanding', rupees(d.activity.outstanding)],
      ].map(function (x) { return el('div', { class: 'card' }, [el('h3', null, [x[0]]), el('div', { style: { fontSize: '20px', fontWeight: '700' } }, [x[1]])]); })));
      panel.appendChild(rows('Last 30 days', [
        ['Last active', ago(i.lastActivityAt)], ['Attendance days saved', String(d.activity.attendance30)], ['Payments recorded', d.activity.payments30 + ' · ' + rupees(i.collected30)],
        ['WhatsApp sent', i.messages30 + (i.failed30 ? ' (' + i.failed30 + ' failed)' : '')], ['Parent messages', i.messagesOn ? 'On' : 'Off'], ['Parents can pay (UPI / link)', i.canBePaid ? 'Yes' : 'No'],
        ['Batches · helpers', i.batches + ' · ' + i.staff],
      ]));
      panel.appendChild(planEditor(i, draw));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['People'])].concat(d.people.map(function (p) {
        return el('div', { class: 'row', style: { cursor: 'pointer' }, on: { click: function () { openUser(p.id); } } }, [el('span', null, [p.name || p.phone, el('div', { class: 'sub' }, [p.phone + ' · ' + (p.role === 'owner' ? 'Tutor' : 'Helper')])]), p.blocked ? pill('Blocked', 'red') : el('span', { class: 'sub' }, [ago(p.lastLoginAt)])]);
      }))));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['WhatsApp (30 d)']), byType(d.messages)]));
      panel.appendChild(el('div', { class: 'card' }, [el('h3', null, ['Plan payments'])].concat(d.billing.length ? d.billing.map(function (b) { return el('div', { class: 'row' }, [el('span', null, [when(b.at)]), el('span', null, [(b.plan || '') + ' · ' + rupees(b.amount)])]); }) : [el('div', { class: 'empty' }, ['None'])])));
    }
    try { await draw(); } catch (e) { panel.textContent = e.message; }
  }

  // ---------- ⌘K quick search ----------
  function palette() {
    if (document.querySelector('.palette')) return;
    var scrim = el('div', { class: 'scrim' });
    var input = el('input', { placeholder: 'Search logins, centres or jump to a page…', 'aria-label': 'Search' });
    var list = el('div');
    var box = el('div', { class: 'palette', role: 'dialog' }, [input, list]);
    var items = [], sel = 0;
    function close() { scrim.remove(); box.remove(); }
    scrim.addEventListener('click', close);
    function draw(groups) {
      clear(list); items = [];
      groups.forEach(function (g) {
        if (!g.items.length) return;
        list.appendChild(el('div', { class: 'grp' }, [g.name]));
        g.items.forEach(function (it) {
          var n = el('div', { class: 'item' }, [el('span', null, [it.title]), el('span', { class: 'sub' }, [it.sub || ''])]);
          n.addEventListener('click', function () { close(); it.go(); });
          list.appendChild(n); items.push({ n: n, go: it.go });
        });
      });
      sel = 0; mark();
    }
    function mark() { items.forEach(function (it, i) { it.n.classList.toggle('sel', i === sel); }); }
    var pages = Object.keys(VIEWS).map(function (k) { return { title: VIEWS[k][0], sub: 'page', go: function () { state.view = k; render(); } }; });
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      var q = input.value.trim().toLowerCase();
      var pg = pages.filter(function (p) { return !q || p.title.toLowerCase().indexOf(q) >= 0; });
      draw([{ name: 'Pages', items: pg }]);
      if (q.length < 2) return;
      t = setTimeout(async function () {
        var r = await call('GET', '/admin/api/search?q=' + encodeURIComponent(q));
        draw([
          { name: 'Logins', items: r.users.map(function (u) { return { title: u.name || u.phone, sub: u.phone, go: function () { openUser(u.id); } }; }) },
          { name: 'Centres', items: r.institutes.map(function (i) { return { title: i.name, sub: 'centre', go: function () { openInstitute(i.id); } }; }) },
          { name: 'Pages', items: pg },
        ]);
      }, 200);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); mark(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); mark(); e.preventDefault(); }
      if (e.key === 'Enter' && items[sel]) { close(); items[sel].go(); }
    });
    document.body.appendChild(scrim); document.body.appendChild(box);
    draw([{ name: 'Pages', items: pages }]);
    input.focus();
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && tokens()) { e.preventDefault(); palette(); }
    if (e.key === 'Escape') closePanel();
  });

  // ---------- shell ----------
  var VIEWS = {
    overview: ['Overview', '◉', overviewView], analytics: ['Analytics', '📈', analyticsView], institutes: ['Centres', '🏫', institutesView],
    users: ['Logins', '👤', usersView], whatsapp: ['WhatsApp', '💬', whatsappView], announcements: ['Announcements', '📣', announcementsView],
    activity: ['Sign-in activity', '🔑', activityView], audit: ['Audit log', '🧾', auditView], system: ['System health', '🩺', systemView],
  };
  function applyTheme() { var t = local.getItem('adm-theme'); if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); css = getComputedStyle(document.documentElement); }
  applyTheme();
  async function render() {
    var t = tokens();
    closePanel();
    if (timer) { clearInterval(timer); timer = null; }
    clear(app);
    if (!t) { app.appendChild(loginView()); return; }
    var content = el('div', { class: 'content' }, [el('span', { class: 'spin' })]);
    var nav = Object.keys(VIEWS).map(function (k) {
      return el('button', { class: 'nav' + (state.view === k ? ' on' : ''), on: { click: function () { state.view = k; render(); } } }, [el('span', { class: 'ico', 'aria-hidden': 'true' }, [VIEWS[k][1]]), VIEWS[k][0]]);
    });
    var side = el('aside', { class: 'side' }, [
      el('div', { class: 'brand' }, [el('div', { class: 'logo' }, ['C']), 'Chalkpis Admin']),
      el('button', { class: 'nav searchbtn', on: { click: palette } }, [el('span', null, ['🔍 Search']), el('kbd', null, ['⌘K'])]),
    ].concat(nav).concat([el('div', { class: 'grow' }), el('div', { class: 'sub', style: { padding: '8px 10px' } }, ['Signed in as ' + t.phone])]));
    var autoBtn = el('button', { class: state.auto ? 'tinted' : '', title: 'Refresh every 30 seconds', on: { click: function () { state.auto = !state.auto; render(); } } }, [state.auto ? '● Live' : '○ Live']);
    var theme = el('button', { title: 'Light / dark', on: { click: function () { var cur = local.getItem('adm-theme'); local.setItem('adm-theme', cur === 'dark' ? 'light' : 'dark'); applyTheme(); render(); } } }, ['◐']);
    var refresh = el('button', { on: { click: function () { render(); } } }, ['↻ Refresh']);
    var out = el('button', { class: 'tinted', on: { click: async function () {
      await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) }).catch(function () {});
      store.removeItem('adm'); render();
    } } }, ['Sign out']);
    app.appendChild(el('div', { class: 'shell' }, [side, el('div', { class: 'main' }, [el('div', { class: 'top' }, [el('h1', null, [VIEWS[state.view][0]]), autoBtn, refresh, theme, out]), content])]));
    try {
      var tmp = el('div');
      await VIEWS[state.view][2](tmp);
      clear(content);
      while (tmp.firstChild) content.appendChild(tmp.firstChild);
    } catch (e) {
      if (e.code === 'forbidden' || e.code === 'account_blocked') { store.removeItem('adm'); render(); return; }
      clear(content); content.appendChild(el('div', { class: 'card err' }, ['Could not load: ' + e.message]));
    }
    if (state.auto) timer = setInterval(function () { if (!document.querySelector('.panel,.palette')) render(); }, 30000);
  }
  render();
})();
