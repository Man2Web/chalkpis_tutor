// Chalkpis Admin. Plain JavaScript, no outside code (strict CSP). Everything shown is inserted as text, never HTML.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var ss = window.sessionStorage, ls = window.localStorage;
  var st = { live: ls.getItem('adm-live') === '1', collapsed: ls.getItem('adm-side') === '1', days: 30, users: { q: '', filter: 'all', offset: 0 }, inst: { q: '', sort: 'activity', filter: 'all', tag: '' }, msg: { status: 'all', type: '' }, feed: { kinds: [] } };
  var liveTimer = null, bellTimer = null;

  /* ---------------- helpers ---------------- */
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, a, kids, svg) {
    var n = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
    if (a) for (var k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'on') for (var e in v) n.addEventListener(e, v[e]);
      else if (k === 'style') { if (typeof v === 'object') Object.assign(n.style, v); else n.style.cssText = v; }
      else n.setAttribute(k === 'cls' ? 'class' : k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c == null || c === false) return; n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return n;
  }
  function s(tag, a, kids) { return el(tag, a, kids, true); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function money(p) { return '₹' + inr.format(Math.round((p || 0) / 100)); }
  function compact(v) { v = Math.abs(v); return v >= 1e7 ? (v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(1) + 'L' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v)); }
  var TZ = { timeZone: 'Asia/Kolkata' };
  function when(iso) { return iso ? new Date(iso).toLocaleString('en-IN', Object.assign({ day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, TZ)) : '—'; }
  function time(iso) { return new Date(iso).toLocaleTimeString('en-IN', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ)); }
  function dshort(iso) { return iso ? new Date(iso).toLocaleDateString('en-IN', Object.assign({ day: 'numeric', month: 'short' }, TZ)) : '—'; }
  function dlong(iso) { return new Date(iso).toLocaleDateString('en-IN', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, TZ)); }
  function ymd(iso) { return new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10); }
  function ago(iso) {
    if (!iso) return 'never';
    var t = (Date.now() - new Date(iso).getTime()) / 1000;
    if (t < 45) return 'just now'; if (t < 3600) return Math.round(t / 60) + 'm ago'; if (t < 86400) return Math.round(t / 3600) + 'h ago';
    if (t < 86400 * 30) return Math.round(t / 86400) + 'd ago'; return dshort(iso);
  }
  function initials(n) { var p = String(n || '?').replace(/^\+\d{2}/, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
  var PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#6366f1', '#14b8a6', '#737373'];
  function hue(str) { var h = 0; for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
  function avatar(name, cls) { return el('div', { cls: 'av ' + (cls || ''), style: { background: hue(name) }, 'aria-hidden': 'true' }, [initials(name)]); }
  // "1 student", "2 students"
  function n(count, one, many) { return count + ' ' + (count === 1 ? one : many || one + 's'); }
  function pill(t, tone) { return el('span', { cls: 'pill ' + (tone || '') }, [t]); }
  function tagEl(t) { return el('span', { cls: 'tag ' + t }, [t.replace('-', ' ')]); }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function toast(t, ok) {
    document.querySelectorAll('.toast').forEach(function (n) { n.remove(); });
    var n = el('div', { cls: 'toast', role: 'status' }, [ic(ok === false ? 'alert' : 'check'), t]);
    document.body.appendChild(n); setTimeout(function () { n.remove(); }, 2600);
  }
  function delta(now, before) {
    if (!now && !before) return el('span', { cls: 'delta flat' }, ['—']);
    if (!before) return el('span', { cls: 'delta up' }, ['New']);
    var p = Math.round(((now - before) / before) * 100);
    return el('span', { cls: 'delta ' + (p > 0 ? 'up' : p < 0 ? 'down' : 'flat') }, [(p > 0 ? '↑ ' : p < 0 ? '↓ ' : '') + Math.abs(p) + '%']);
  }
  function score(h) {
    var c = h >= 70 ? cssv('--green') : h >= 40 ? cssv('--orange') : cssv('--red');
    return el('span', { cls: 'score' }, [el('span', { cls: 'num' }, [String(h)]), el('span', { cls: 'track' }, [el('i', { style: { width: h + '%', background: c } })])]);
  }
  function empty(icon, text) { return el('div', { cls: 'empty' }, [ic(icon), el('div', null, [text])]); }
  // The Chalkpis logo, with white letters in dark mode.
  function logo(cls) { return el('span', { cls: 'logo ' + (cls || '') }, [el('img', { cls: 'lt', src: '/admin-logo/logo.svg', alt: 'Chalkpis' }), el('img', { cls: 'dk', src: '/admin-logo/logo-dark.svg', alt: 'Chalkpis' })]); }
  // A list that reloads as you type: only the newest request may draw (a slow older answer is dropped), and the
  // current rows stay visible, dimmed, while the next answer is on its way.
  function latest(list) {
    var n = 0;
    return async function (fetcher, draw) {
      var my = ++n;
      if (list.firstChild) list.classList.add('loading'); else list.appendChild(sk(320));
      try {
        var r = await fetcher();
        if (my !== n) return;
        list.classList.remove('loading'); clear(list); draw(r);
      } catch (e) {
        if (my !== n) return;
        list.classList.remove('loading'); clear(list).appendChild(card('Could not load', e.message, el('span')));
      }
    };
  }
  function sk(h) { return el('div', { cls: 'sk', style: { height: (h || 120) + 'px' } }); }

  /* ---------------- icons (SF Symbols-like strokes) ---------------- */
  var P = {
    overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z', analytics: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
    cohorts: 'M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16', centres: 'M4 20V8l8-4 8 4v12M9 20v-6h6v6M3 20h18',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4v4h-4z',
    activity: 'M3 12h4l3-8 4 16 3-8h4', chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12',
    key: 'M14 10a4 4 0 1 1-1.2-2.8L21 7v3h-2v2h-2v2l-3.2-1.2', audit: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    system: 'M3 12h4l2-5 4 10 2-5h6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', sidebar: 'M4 4h16v16H4zM9 4v16', logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
    plus: 'M12 5v14M5 12h14', phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1', x: 'M18 6 6 18M6 6l12 12', chev: 'M9 6l6 6-6 6', back: 'M15 6l-6 6 6 6',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6', download: 'M12 3v12M7 10l5 5 5-5M4 21h16', tag: 'M20 12l-8 8-9-9V4h7zM7.5 7.5h.01',
    note: 'M4 4h16v12l-4 4H4zM16 20v-4h4', sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    check: 'M20 6 9 17l-5-5', menu: 'M4 6h16M4 12h16M4 18h16', rupee: 'M6 4h12M6 9h12M14 4c3 0 4 2.5 4 5s-2 5-5 5H6l9 7',
    calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4', login: 'M15 3h4v18h-4M10 17l5-5-5-5M15 12H3', flag: 'M5 21V4M5 4h12l-2 4 2 4H5', keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  };
  function ic(name, cls) { return s('svg', { 'class': 'ico ' + (cls || ''), viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [s('path', { d: P[name] || P.sparkle })]); }

  /* ---------------- API ---------------- */
  // The admin session token lives only in this tab (sessionStorage): closing the tab signs out of it here.
  function tok() { try { var t = JSON.parse(ss.getItem('adm') || 'null'); return t && t.token ? t : null; } catch { return null; } }
  function saveTok(t) { ss.setItem('adm', JSON.stringify(t)); }
  var flash = '';
  async function call(method, url, body) {
    var t = tok();
    // JSON header only with a body: the server refuses a request that announces JSON and sends none (DELETE, bare POSTs)
    var res = await fetch(url, { method: method, headers: Object.assign({ 'X-Client-Platform': 'web' }, body ? { 'Content-Type': 'application/json' } : {}, t ? { Authorization: 'Bearer ' + t.token } : {}), body: body ? JSON.stringify(body) : undefined });
    // an admin session ends after 30 idle minutes or 8 hours: back to the sign-in screen
    if (res.status === 401 && t) {
      ss.removeItem('adm'); flash = 'Your admin session ended. Please sign in again.'; boot(); throw new Error('Signed out');
    }
    if (/\.csv$/.test(url) && res.ok) return res.blob();
    var d = await res.json().catch(function () { return {}; });
    if (!res.ok) { var e = new Error(d.error || 'Error ' + res.status); e.code = d.error; throw e; }
    return d;
  }
  async function download(url, name) { var b = await call('GET', url); var a = el('a', { href: URL.createObjectURL(b), download: name }); document.body.appendChild(a); a.click(); a.remove(); toast('Downloaded ' + name); }

  /* ---------------- charts ---------------- */
  var tip = null;
  function showTip(x, y, title, lines) {
    if (!tip) { tip = el('div', { cls: 'tooltip' }); document.body.appendChild(tip); }
    clear(tip); tip.appendChild(el('b', null, [title]));
    lines.forEach(function (l) { tip.appendChild(el('div', null, [el('span', { style: { color: l[2] } }, ['● ']), l[0] + ': ', el('b', { style: { display: 'inline' } }, [l[1]])])); });
    tip.style.display = 'block'; tip.style.left = Math.min(x + 14, innerWidth - 200) + 'px'; tip.style.top = (y + 14) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }
  function nice(v) { if (v <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function lineChart(dates, series, o) {
    o = o || {};
    // drawn at phone width on phones, so the axis labels stay readable instead of shrinking with the chart
    var narrow = innerWidth < 640, W = narrow ? 420 : 720, H = o.h || (narrow ? 260 : 230), L = 44, R = 10, T = 12, B = 26, max = 1;
    series.forEach(function (x) { x.values.forEach(function (v) { if (v > max) max = v; }); });
    max = nice(max);
    var X = function (i) { return L + (dates.length < 2 ? 0 : (i * (W - L - R)) / (dates.length - 1)); }, Y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var svg = s('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'chart' });
    for (var g = 0; g <= 4; g++) { var gv = (max * g) / 4; svg.appendChild(s('line', { x1: L, x2: W - R, y1: Y(gv), y2: Y(gv), stroke: cssv('--line'), 'stroke-dasharray': g ? '3 4' : '' })); svg.appendChild(s('text', { x: L - 8, y: Y(gv) + 3.5, 'text-anchor': 'end' }, [o.money ? '₹' + compact(gv / 100) : compact(gv)])); }
    var step = Math.max(1, Math.ceil(dates.length / (narrow ? 4 : 8)));
    var lastI = dates.length - 1;
    // a tick every `step` days, the last day always, and never two labels on top of each other
    dates.forEach(function (d, i) { if ((i % step === 0 && lastI - i >= step / 2) || i === lastI) svg.appendChild(s('text', { x: X(i), y: H - 6, 'text-anchor': 'middle' }, [dshort(d + 'T12:00:00+05:30')])); });
    series.forEach(function (sr, si) {
      var path = sr.values.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
      if (si === 0 && o.area !== false) {
        var id = 'g' + Math.random().toString(36).slice(2);
        svg.appendChild(s('defs', null, [s('linearGradient', { id: id, x1: 0, x2: 0, y1: 0, y2: 1 }, [s('stop', { offset: 0, 'stop-color': sr.color, 'stop-opacity': 0.24 }), s('stop', { offset: 1, 'stop-color': sr.color, 'stop-opacity': 0 })])]));
        svg.appendChild(s('path', { d: path + ' L' + X(sr.values.length - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + 'Z', fill: 'url(#' + id + ')' }));
      }
      svg.appendChild(s('path', { d: path, fill: 'none', stroke: sr.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    var cross = s('line', { y1: T, y2: H - B, stroke: cssv('--faint'), 'stroke-dasharray': '3 3', opacity: 0 });
    var dots = series.map(function (sr) { var c = s('circle', { r: 4.5, fill: sr.color, stroke: cssv('--bg-elev'), 'stroke-width': 2, opacity: 0 }); svg.appendChild(c); return c; });
    svg.appendChild(cross);
    var hit = s('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
    hit.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      var i = Math.max(0, Math.min(dates.length - 1, Math.round(((px - L) / (W - L - R)) * (dates.length - 1))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      dots.forEach(function (d, k) { d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(series[k].values[i])); d.setAttribute('opacity', 1); });
      showTip(e.clientX, e.clientY, dlong(dates[i] + 'T12:00:00+05:30'), series.map(function (sr) { return [sr.name, o.money ? money(sr.values[i]) : String(sr.values[i]), sr.color]; }));
    });
    hit.addEventListener('mouseleave', function () { cross.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); hideTip(); });
    svg.appendChild(hit);
    var w = el('div', null, [svg]);
    if (series.length > 1 || o.legend) w.appendChild(el('div', { cls: 'legend' }, series.map(function (x) { return el('span', null, [el('i', { style: { background: x.color } }), x.name]); })));
    return w;
  }
  function spark(values, c) {
    var W = 200, H = 44, max = Math.max.apply(null, values.concat([1]));
    var pts = values.map(function (v, i) { return [(i * W) / Math.max(values.length - 1, 1), H - 3 - ((H - 6) * v) / max]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var id = 's' + Math.random().toString(36).slice(2);
    return s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: 44, preserveAspectRatio: 'none', 'aria-hidden': 'true', style: 'display:block;margin-top:8px' }, [
      s('defs', null, [s('linearGradient', { id: id, x1: 0, x2: 0, y1: 0, y2: 1 }, [s('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0.22 }), s('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0 })])]),
      s('path', { d: d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z', fill: 'url(#' + id + ')' }),
      s('path', { d: d, fill: 'none', stroke: c, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }),
    ]);
  }
  function bars(labels, values, o) {
    o = o || {};
    var W = innerWidth < 640 ? 420 : 720, H = o.h || (innerWidth < 640 ? 240 : 200), L = 46, B = 26, T = 10, max = nice(Math.max.apply(null, values.concat([1]))), bw = (W - L) / Math.max(values.length, 1);
    var svg = s('svg', { 'class': 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'bar chart' });
    for (var g = 0; g <= 4; g++) { var gv = (max * g) / 4, y = T + (H - T - B) * (1 - gv / max); svg.appendChild(s('line', { x1: L, x2: W, y1: y, y2: y, stroke: cssv('--line'), 'stroke-dasharray': g ? '3 4' : '' })); svg.appendChild(s('text', { x: L - 8, y: y + 3.5, 'text-anchor': 'end' }, [o.money ? '₹' + compact(gv / 100) : compact(gv)])); }
    values.forEach(function (v, i) {
      var h = ((H - T - B) * v) / max, r = s('rect', { x: L + i * bw + bw * 0.22, y: H - B - h, width: bw * 0.56, height: Math.max(h, 1.5), rx: 5, fill: o.color || cssv('--accent') });
      r.addEventListener('mousemove', function (e) { showTip(e.clientX, e.clientY, o.tips ? o.tips[i] : labels[i], [[o.name || 'Value', o.money ? money(v) : String(v), o.color || cssv('--accent')]]); });
      r.addEventListener('mouseleave', hideTip);
      svg.appendChild(r);
      // with many bars, label every `every`-th one (and the last) so the axis stays readable
      if (!o.every || i % o.every === 0 || i === values.length - 1) svg.appendChild(s('text', { x: L + i * bw + bw / 2, y: H - 7, 'text-anchor': 'middle' }, [labels[i]]));
    });
    return svg;
  }
  function donut(parts, center) {
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0), R = 54, C = 2 * Math.PI * R, off = 0;
    var svg = s('svg', { 'class': 'chart', viewBox: '0 0 140 140', style: 'max-width:150px', role: 'img', 'aria-label': 'breakdown' });
    svg.appendChild(s('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: cssv('--fill'), 'stroke-width': 16 }));
    parts.forEach(function (p) { if (!p.value) return; var len = (p.value / (total || 1)) * C; svg.appendChild(s('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: p.color, 'stroke-width': 16, 'stroke-dasharray': Math.max(len - 2, 0.5) + ' ' + (C - len + 2), 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)', 'stroke-linecap': 'round' })); off += len; });
    svg.appendChild(s('text', { x: 70, y: 72, 'text-anchor': 'middle', style: 'font-size:24px;font-weight:700;fill:' + cssv('--text') }, [String(total)]));
    svg.appendChild(s('text', { x: 70, y: 90, 'text-anchor': 'middle' }, [center || 'total']));
    return el('div', { style: { display: 'flex', gap: '22px', alignItems: 'center', flexWrap: 'wrap' } }, [svg, el('div', { cls: 'legend', style: { flexDirection: 'column', gap: '8px', marginTop: 0 } }, parts.map(function (p) { return el('span', null, [el('i', { style: { background: p.color } }), p.name + ' · ', el('b', { style: { color: cssv('--text') } }, [String(p.value)])]); }))]);
  }
  function ring(pct, c, label) {
    var R = 30, C = 2 * Math.PI * R;
    return el('div', { cls: 'ring' }, [s('svg', { viewBox: '0 0 80 80', width: 78, height: 78, role: 'img', 'aria-label': label + ' ' + pct + '%' }, [
      s('circle', { cx: 40, cy: 40, r: R, fill: 'none', stroke: cssv('--fill'), 'stroke-width': 8 }),
      s('circle', { cx: 40, cy: 40, r: R, fill: 'none', stroke: c, 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-dasharray': (C * pct) / 100 + ' ' + C, transform: 'rotate(-90 40 40)' }),
      s('text', { x: 40, y: 45, 'text-anchor': 'middle', style: 'font-size:15px;font-weight:700;fill:' + cssv('--text') }, [pct + '%']),
    ])]);
  }

  /* ---------------- routing ---------------- */
  var NAV = [
    ['Insights', [['overview', 'Overview', 'overview'], ['analytics', 'Analytics', 'analytics'], ['cohorts', 'Retention', 'cohorts']]],
    ['Customers', [['centres', 'Centres', 'centres'], ['logins', 'Logins', 'users'], ['leaders', 'Leaderboard', 'trophy']]],
    ['Engagement', [['activity', 'Live activity', 'activity'], ['whatsapp', 'WhatsApp', 'chat'], ['announce', 'Announcements', 'megaphone']]],
    ['Admin', [['signins', 'Sign-ins', 'key'], ['audit', 'Audit log', 'audit'], ['system', 'System health', 'system']]],
  ];
  var TITLES = {}; NAV.forEach(function (g) { g[1].forEach(function (i) { TITLES[i[0]] = [i[1], g[0]]; }); });
  function route() { var h = location.hash.replace(/^#\/?/, '').split('/'); return { view: TITLES[h[0]] || h[0] === 'centre' ? h[0] : 'overview', id: h[1] || null }; }
  // Going to the page you are already on refreshes it (the hash does not change, so no hashchange fires).
  function go(view, id) { var h = '#/' + view + (id ? '/' + id : ''); if (location.hash === h) render(); else location.hash = h; }
  window.addEventListener('hashchange', function () { if (tok()) render(); });

  /* ---------------- sign in ---------------- */
  // Email + password, then the 6-digit code emailed for that attempt. Forgot password: a code by email, then a new
  // password (12+ characters with upper, lower, digit and symbol). Every wrong answer reads the same.
  var ERR = { invalid_credentials: 'Email or password is wrong.', invalid_code: 'That code is wrong or has expired.', unavailable: 'Email is not working right now. Try again later.', too_short: 'Use at least 12 characters.', too_long: 'Use at most 128 characters.', needs_mix: 'Use upper and lower case letters, a number and a symbol.', too_common: 'That password is too common. Choose another.', contains_email: 'Do not use your email name in the password.', 'Too Many Requests': 'Too many tries. Wait a few minutes.' };
  function loginView() {
    var mode = 'login', email = '', challenge = '';
    var box = el('div', { cls: 'box' });
    function field(attrs) { return el('input', Object.assign({ cls: 'field' }, attrs)); }
    function draw(msg, ok) {
      clear(box);
      var err = el('div', { cls: ok ? 'muted sm' : 'err sm' }, [msg || flash || '']); flash = '';
      var hint = el('div', { cls: 'muted sm' });
      var btn = el('button', { cls: 'btn primary', type: 'button' });
      var link = function (text, to) { return el('button', { cls: 'btn ghost', type: 'button', style: { justifyContent: 'center' }, on: { click: function () { mode = to; draw(); } } }, [text]); };
      var inputs = [], go;
      var mail = field({ type: 'email', placeholder: 'Admin email', autocomplete: 'username', 'aria-label': 'Admin email', value: email });
      var pass = field({ type: 'password', placeholder: 'Password', autocomplete: 'current-password', 'aria-label': 'Password', maxlength: '128' });
      var code = field({ placeholder: '6-digit code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', 'aria-label': 'Code from your email', style: { letterSpacing: '0.4em', textAlign: 'center', fontWeight: 700 } });
      var pass1 = field({ type: 'password', placeholder: 'New password', autocomplete: 'new-password', 'aria-label': 'New password', maxlength: '128' });
      var pass2 = field({ type: 'password', placeholder: 'New password again', autocomplete: 'new-password', 'aria-label': 'New password again', maxlength: '128' });
      var title, sub, extra = [];
      if (mode === 'login') {
        title = 'Admin sign in'; sub = 'Email and password, then a code we email you.'; inputs = [mail, pass]; btn.textContent = 'Continue';
        go = async function () { email = mail.value.trim(); var r = await call('POST', '/admin/auth/login', { email: email, password: pass.value }); challenge = r.challenge; mode = 'code'; draw(r.devCode ? 'Test mode code: ' + r.devCode : 'We emailed a 6-digit code to ' + email + '.', true); };
        extra = [link('Forgot password?', 'forgot')];
      } else if (mode === 'code') {
        title = 'Check your email'; sub = 'Enter the 6-digit code. It works for 10 minutes.'; inputs = [code]; btn.textContent = 'Sign in';
        go = async function () { var r = await call('POST', '/admin/auth/verify', { email: email, challenge: challenge, code: code.value.trim() }); saveTok({ token: r.token, email: r.email }); boot(); };
        extra = [link('Start again', 'login')];
      } else if (mode === 'forgot') {
        title = 'Reset password'; sub = 'We email a code to your admin address.'; inputs = [mail]; btn.textContent = 'Send code';
        go = async function () { email = mail.value.trim(); var r = await call('POST', '/admin/auth/forgot', { email: email }); mode = 'reset'; draw(r.devCode ? 'Test mode code: ' + r.devCode : 'If ' + email + ' is an admin, a code is on its way.', true); };
        extra = [link('Back to sign in', 'login')];
      } else {
        title = 'Choose a new password'; sub = 'At least 12 characters with upper and lower case, a number and a symbol.'; inputs = [code, pass1, pass2]; btn.textContent = 'Save password';
        go = async function () {
          if (pass1.value !== pass2.value) throw Object.assign(new Error('The two passwords are not the same.'), { code: '' });
          await call('POST', '/admin/auth/reset', { email: email, code: code.value.trim(), password: pass1.value });
          mode = 'login'; draw('Password saved. Every admin session was signed out. Sign in with the new password.', true);
        };
        extra = [link('Back to sign in', 'login')];
      }
      async function submit() {
        err.className = 'err sm'; err.textContent = ''; btn.disabled = true;
        try { await go(); } catch (e) { err.className = 'err sm'; err.textContent = ERR[e.code] || e.message; }
        btn.disabled = false;
      }
      btn.addEventListener('click', submit);
      inputs.forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); }); });
      [logo('login-logo'), el('h1', null, [title]), el('div', { cls: 'muted' }, [sub])].concat(inputs, [btn], extra, [hint, err, el('div', { cls: 'faint xs', style: { marginTop: '8px' } }, ['M2W Technologies Private Limited'])]).forEach(function (n) { box.appendChild(n); });
      (inputs[0].value ? inputs[inputs.length - 1] : inputs[0]).focus();
    }
    draw();
    return el('div', { cls: 'login' }, [box]);
  }

  /* ---------------- shared bits ---------------- */
  // PanelUI card: a grey shell with a small header and a white inner panel holding the content.
  function card(title, sub, body, action) { return el('div', { cls: 'card panel' }, [el('div', { cls: 'card-h' }, [el('div', null, [el('h3', null, [title]), sub ? el('p', null, [sub]) : null]), action || null]), el('div', { cls: 'card-b' }, [body])]); }
  // PanelUI Kpi anatomy: an icon tile and a quiet title, the trend on the right, a loud value, a small sparkline.
  var KPI_ICON = { 'Active centres': 'centres', 'New sign-ups': 'sparkle', 'Sign-ups': 'sparkle', 'Sign-ins': 'login', 'Fees recorded': 'rupee', 'Plan revenue': 'rupee', 'WhatsApp delivered': 'chat' };
  function kpi(label, value, now, before, values, color, onClick) {
    var tile = el('span', { cls: 'ki', style: { color: color, background: 'color-mix(in srgb, ' + color + ' 12%, transparent)' } }, [ic(KPI_ICON[label] || 'activity')]);
    return el('div', { cls: 'card kpi', style: onClick ? { cursor: 'pointer' } : null, on: onClick ? { click: onClick } : null }, [el('div', { cls: 'label' }, [el('span', { cls: 'kh' }, [tile, label]), delta(now, before)]), el('div', { cls: 'value num' }, [value]), values ? spark(values, color) : null]);
  }
  function seg(options, value, onChange) { return el('div', { cls: 'seg', role: 'tablist' }, options.map(function (o) { return el('button', { cls: o[0] === value ? 'on' : '', role: 'tab', 'aria-selected': o[0] === value ? 'true' : 'false', on: { click: function () { onChange(o[0]); } } }, [o[1]]); })); }
  function select(options, value, onChange, label) { var x = el('select', { cls: 'field', 'aria-label': label || 'Filter' }, options.map(function (o) { var op = el('option', { value: o[0] }, [o[1]]); if (o[0] === value) op.selected = true; return op; })); x.addEventListener('change', function () { onChange(x.value); }); return x; }
  function searchField(value, ph, onChange) { var t, x = el('input', { cls: 'field', placeholder: ph, value: value, 'aria-label': ph }); x.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { onChange(x.value); }, 280); }); return x; }

  /* ---------------- views ---------------- */
  async function overview(box) {
    var hr = Number(new Intl.DateTimeFormat('en-GB', Object.assign({ hour: 'numeric', hour12: false }, TZ)).format(new Date()));
    var r = await Promise.all([call('GET', '/admin/api/overview'), call('GET', '/admin/api/analytics?days=30'), call('GET', '/admin/api/institutes?filter=at-risk&sort=students'), call('GET', '/admin/api/events?limit=12')]);
    var o = r[0], a = r[1], risky = r[2].institutes, ev = r[3].events, T = a.totals, S = a.series;
    box.appendChild(el('div', { cls: 'hello' }, [el('div', null, [el('h2', null, [(hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + '']), el('p', null, [dlong(new Date().toISOString()) + ' · ' + n(o.signedIn, 'tutor') + ' signed in right now'])])]));
    box.appendChild(el('div', { cls: 'grid g4' }, [
      kpi('Active centres', String(T.activeInstitutes.now), T.activeInstitutes.now, T.activeInstitutes.before, S.activeInstitutes, cssv('--accent'), function () { go('analytics'); }),
      kpi('New sign-ups', String(T.signups.now), T.signups.now, T.signups.before, S.signups, cssv('--purple'), function () { go('logins'); }),
      kpi('Fees recorded', money(T.feesRecorded.now), T.feesRecorded.now, T.feesRecorded.before, S.feesRecorded, cssv('--green'), function () { go('analytics'); }),
      kpi('WhatsApp delivered', String(T.messagesSent.now), T.messagesSent.now, T.messagesSent.before, S.messagesSent, cssv('--teal'), function () { go('whatsapp'); }),
    ]));
    var metric = 'activeInstitutes', chartBox = el('div');
    var METRICS = [['activeInstitutes', 'Active centres', '--accent'], ['signIns', 'Sign-ins', '--purple'], ['attendanceSaved', 'Attendance', '--green'], ['feesRecorded', 'Fees', '--green'], ['messagesSent', 'WhatsApp', '--teal']];
    function drawChart() { clear(chartBox); var m = METRICS.find(function (x) { return x[0] === metric; }); chartBox.appendChild(lineChart(a.dates, [{ name: m[1], values: S[metric], color: cssv(m[2]) }], { money: metric === 'feesRecorded', h: 250 })); }
    var segBox = el('div');
    function drawSeg() { clear(segBox); segBox.appendChild(seg(METRICS.map(function (m) { return [m[0], m[1]]; }), metric, function (v) { metric = v; drawSeg(); drawChart(); })); }
    drawSeg(); drawChart();
    var feed = el('div', { cls: 'rows' }, ev.length ? ev.slice(0, 8).map(function (e) { return evRow(e, true); }) : [empty('activity', 'Nothing yet today.')]);
    box.appendChild(el('div', { cls: 'split mt' }, [
      el('div', { cls: 'card panel' }, [el('div', { cls: 'card-h' }, [el('div', null, [el('h3', null, ['Last 30 days']), el('p', null, ['Hover the chart for daily numbers'])]), segBox]), el('div', { cls: 'card-b' }, [chartBox])]),
      card('Happening now', null, feed, el('button', { cls: 'btn ghost', on: { click: function () { go('activity'); } } }, ['See all'])),
    ]));
    box.appendChild(el('div', { cls: 'grid g3 mt' }, [
      card('Platform', null, el('div', null, [
        el('div', { cls: 'kv' }, [el('span', null, ['Logins']), el('b', { cls: 'num' }, [o.users + ' (' + n(o.owners, 'tutor') + ', ' + n(o.staff, 'helper') + ')'])]),
        el('div', { cls: 'kv' }, [el('span', null, ['Centres']), el('b', { cls: 'num' }, [String(o.institutes)])]),
        el('div', { cls: 'kv' }, [el('span', null, ['On trial · paid · ended']), el('b', { cls: 'num' }, [o.trials + ' · ' + o.paid + ' · ' + o.expired])]),
        el('div', { cls: 'kv' }, [el('span', null, ['Active students']), el('b', { cls: 'num' }, [inr.format(o.students)])]),
        el('div', { cls: 'kv' }, [el('span', null, ['Blocked logins']), el('b', { cls: 'num' }, [String(o.blocked)])]),
      ])),
      card('Health', 'Share of centres using Chalkpis', el('div', { style: { display: 'flex', gap: '20px', justifyContent: 'space-around', flexWrap: 'wrap' } }, [
        el('div', { style: { textAlign: 'center' } }, [ring(Math.round(a.retention.rate7 * 100), cssv('--accent'), 'This week'), el('div', { cls: 'sm muted' }, ['This week'])]),
        el('div', { style: { textAlign: 'center' } }, [ring(Math.round(a.retention.rate30 * 100), cssv('--purple'), 'This month'), el('div', { cls: 'sm muted' }, ['This month'])]),
        el('div', { style: { textAlign: 'center' } }, [ring(Math.round(a.conversion * 100), cssv('--green'), 'Trial to paid'), el('div', { cls: 'sm muted' }, ['Trial → paid'])]),
      ])),
      card('Needs attention', 'Lowest health first', risky.length ? el('div', { cls: 'rows' }, risky.slice(0, 5).map(function (i) {
        return el('div', { cls: 'r click', on: { click: function () { go('centre', i.id); } } }, [avatar(i.name, 'sq'), el('div', { cls: 'grow' }, [el('div', { cls: 'ellipsis', style: { fontWeight: 600 } }, [i.name]), el('div', { cls: 'sm muted' }, [n(i.students, 'student') + ' · active ' + ago(i.lastActivityAt)])]), score(i.health)]);
      })) : empty('check', 'Every centre looks healthy.'), el('button', { cls: 'btn ghost', on: { click: function () { st.inst.filter = 'at-risk'; go('centres'); } } }, ['All'])),
    ]));
    // how tutors sign in, from which phones, and which centres to celebrate or call
    var MCOL = { whatsapp: '#1DA851', google: '#4285F4', apple: cssv('--text'), email: cssv('--purple'), unknown: cssv('--fill') };
    var PCOL = { ios: cssv('--accent'), android: '#3DDC84', web: cssv('--teal'), unknown: cssv('--fill') };
    function mixParts(obj, names, colors) { return Object.keys(obj).sort(function (x, y) { return obj[y] - obj[x]; }).map(function (k) { return { name: names[k] || 'Before tracking', value: obj[k], color: colors[k] || cssv('--faint') }; }); }
    var watch = 'top', watchBox = el('div'), watchSeg = el('div');
    function drawWatch() {
      clear(watchSeg).appendChild(seg([['top', 'Most active'], ['quiet', 'Gone quiet']], watch, function (v) { watch = v; drawWatch(); }));
      var list = watch === 'top' ? a.topCentres : a.quietCentres, max = list.length && watch === 'top' ? list[0].events : 1;
      clear(watchBox).appendChild(list.length ? el('div', { cls: 'rows' }, list.map(function (c) {
        return el('div', { cls: 'r click', on: { click: function () { go('centre', c.id); } } }, [avatar(c.name, 'sq'), el('div', { cls: 'grow' }, [el('div', { cls: 'ellipsis', style: { fontWeight: 600 } }, [c.name]), watch === 'top' ? el('div', { cls: 'bar', style: { marginTop: '6px' } }, [el('i', { style: { width: (c.events / max) * 100 + '%', background: cssv('--purple') } })]) : el('div', { cls: 'sm muted' }, ['last active ' + ago(c.lastAt)])]), watch === 'top' ? el('b', { cls: 'num' }, [String(c.events)]) : pill('Call', 'orange')]);
      })) : empty(watch === 'top' ? 'trophy' : 'check', watch === 'top' ? 'No activity yet.' : 'No centre has gone quiet this week.'));
    }
    drawWatch();
    var methods = a.signInMethods || {}, platforms = a.signInPlatforms || {};
    box.appendChild(el('div', { cls: 'grid g3 mt' }, [
      card('How tutors sign in', 'Last 30 days', Object.keys(methods).length ? donut(mixParts(methods, METHOD, MCOL), 'sign-ins') : empty('login', 'No sign-ins yet.')),
      card('Their phones', 'Last 30 days', Object.keys(platforms).length ? donut(mixParts(platforms, DEVICE, PCOL), 'sign-ins') : empty('login', 'No sign-ins yet.')),
      card('Centres to watch', watch === 'top' ? 'Changes and sign-ins, 30 days' : null, watchBox, watchSeg),
    ]));
    box.appendChild(el('div', { cls: 'mt' }, [card('Activation funnel', 'How far new centres get', funnel(a.funnel))]));
  }
  function funnel(f) {
    var steps = [['Created a centre', f.institutes], ['Added students', f.withStudents], ['Marked attendance', f.withAttendance], ['Recorded a payment', f.withPayments], ['Set UPI or pay link', f.canBePaid], ['Turned on WhatsApp', f.messagesOn], ['Bought a plan', f.everPaid]], top = Math.max(f.institutes, 1);
    var w = el('div', { cls: 'funnel' }, steps.map(function (x) { var p = Math.round((x[1] / top) * 100); return el('div', { cls: 'step' }, [el('span', { cls: 'sm' }, [x[0]]), el('div', { cls: 'bar' }, [el('i', { style: { width: '0%' }, 'data-w': p + '%' })]), el('span', { cls: 'num sm', style: { textAlign: 'right' } }, [el('b', null, [String(x[1])]), ' · ' + p + '%'])]); }));
    requestAnimationFrame(function () { w.querySelectorAll('i[data-w]').forEach(function (i) { i.style.width = i.getAttribute('data-w'); }); });
    return w;
  }

  async function analytics(box) {
    box.appendChild(el('div', { cls: 'toolbar' }, [seg([[7, '7 days'], [30, '30 days'], [90, '90 days'], [180, '6 months']].map(function (x) { return [String(x[0]), x[1]]; }), String(st.days), function (v) { st.days = Number(v); render(); })]));
    var a = await call('GET', '/admin/api/analytics?days=' + st.days), T = a.totals, S = a.series;
    box.appendChild(el('div', { cls: 'grid g4' }, [
      kpi('Sign-ups', String(T.signups.now), T.signups.now, T.signups.before, S.signups, cssv('--purple')),
      kpi('Sign-ins', String(T.signIns.now), T.signIns.now, T.signIns.before, S.signIns, cssv('--accent')),
      kpi('Active centres', String(T.activeInstitutes.now), T.activeInstitutes.now, T.activeInstitutes.before, S.activeInstitutes, cssv('--teal')),
      kpi('Plan revenue', money(T.revenue.now), T.revenue.now, T.revenue.before, S.revenue, cssv('--green')),
    ]));
    box.appendChild(el('div', { cls: 'grid g2 mt' }, [
      card('Growth', 'New tutors and how often they come back', lineChart(a.dates, [{ name: 'Sign-ups', values: S.signups, color: cssv('--purple') }, { name: 'Sign-ins', values: S.signIns, color: cssv('--accent') }])),
      card('Fees recorded by tutors', 'Money tutors collected from parents (not Chalkpis revenue)', lineChart(a.dates, [{ name: 'Fees', values: S.feesRecorded, color: cssv('--green') }], { money: true })),
      card('WhatsApp delivery', null, lineChart(a.dates, [{ name: 'Delivered', values: S.messagesSent, color: cssv('--teal') }, { name: 'Failed', values: S.messagesFailed, color: cssv('--red') }], { area: false })),
      card('Attendance saved', 'Class days marked', lineChart(a.dates, [{ name: 'Days', values: S.attendanceSaved, color: cssv('--accent') }])),
    ]));
    var colors = { trial: cssv('--accent'), starter: cssv('--teal'), standard: cssv('--purple'), pro: cssv('--green') };
    box.appendChild(el('div', { cls: 'grid g3 mt' }, [
      card('Active plans', null, donut(a.plans.map(function (p) { return { name: p.plan, value: p.active, color: colors[p.plan] || cssv('--faint') }; }), 'centres')),
      card('Plan revenue by month', null, a.revenueByMonth.length ? bars(a.revenueByMonth.map(function (m) { return m.month.slice(5) + '/' + m.month.slice(2, 4); }), a.revenueByMonth.map(function (m) { return m.amount; }), { money: true, color: cssv('--green'), name: 'Revenue' }) : empty('rupee', 'No plan payments yet.')),
      card('Funnel', null, funnel(a.funnel)),
    ]));
  }

  async function cohortsView(box) {
    var r = await call('GET', '/admin/api/cohorts?weeks=12'), rows = r.cohorts;
    if (!rows.length) { box.appendChild(card('Weekly retention', null, empty('cohorts', 'No centres joined in the last 12 weeks.'))); return; }
    var maxW = Math.max.apply(null, rows.map(function (c) { return c.active.length; }));
    var head = el('tr', null, [el('th', { style: { textAlign: 'left' } }, ['Joined week']), el('th', null, ['Centres'])].concat(Array.from({ length: maxW }, function (_, k) { return el('th', null, ['W' + k]); })));
    var body = rows.map(function (c) {
      return el('tr', null, [el('td', { style: { textAlign: 'left', fontWeight: 600 } }, [dshort(c.week + 'T12:00:00+05:30')]), el('td', null, [String(c.size)])].concat(Array.from({ length: maxW }, function (_, k) {
        if (k >= c.active.length) return el('td');
        var p = c.size ? Math.round((c.active[k] / c.size) * 100) : 0;
        return el('td', { title: c.active[k] + ' of ' + c.size + ' active', style: { background: 'color-mix(in srgb, ' + cssv('--accent') + ' ' + Math.max(p, 4) + '%, transparent)', color: p > 55 ? cssv('--on-accent') : cssv('--text') } }, [p + '%']);
      })));
    });
    box.appendChild(card('Weekly retention', 'Of the centres that joined each week, the share that used Chalkpis (attendance or a payment) in each week after', el('div', { style: { overflowX: 'auto' } }, [el('table', { cls: 'heat' }, [el('thead', null, [head]), el('tbody', null, body)])])));
  }

  function tableCard(headers, rows, emptyText) {
    // each cell remembers its column name, so the phone layout (rows as cards, no header row) can label it
    rows.forEach(function (tr) { Array.prototype.forEach.call(tr.children, function (td, i) { if (headers[i] && headers[i][0]) td.setAttribute('data-label', headers[i][0]); }); });
    return el('div', { cls: 'card pad0' }, [el('div', { style: { overflowX: 'auto' } }, [el('table', { cls: 'table' }, [
      el('thead', null, [el('tr', null, headers.map(function (h) { return el('th', { cls: h[1] ? 'hide-sm' : null }, [h[0]]); }))]),
      el('tbody', null, rows.length ? rows : [el('tr', null, [el('td', { colspan: String(headers.length) }, [empty('search', emptyText || 'Nothing here.')])])]),
    ])])]);
  }

  async function centres(box) {
    var I = st.inst, list = el('div');
    box.appendChild(el('div', { cls: 'toolbar' }, [
      searchField(I.q, 'Search centre, owner or phone', function (v) { I.q = v; load(); }),
      select([['all', 'All centres'], ['trial', 'On trial'], ['paid', 'Paid'], ['ended', 'Plan ended'], ['at-risk', 'At risk']], I.filter, function (v) { I.filter = v; load(); }, 'Filter'),
      select([['', 'Any tag'], ['vip', 'VIP'], ['follow-up', 'Follow up'], ['churn-risk', 'Churn risk'], ['onboarding', 'Onboarding'], ['partner', 'Partner'], ['test', 'Test']], I.tag, function (v) { I.tag = v; load(); }, 'Tag'),
      select([['activity', 'Last active'], ['students', 'Most students'], ['health', 'Lowest health'], ['newest', 'Newest'], ['expiring', 'Plan ending soon']], I.sort, function (v) { I.sort = v; load(); }, 'Sort'),
      el('button', { cls: 'btn', on: { click: function () { download('/admin/api/export/institutes.csv', 'chalkpis-centres.csv'); } } }, [ic('download'), 'Export']),
    ]));
    box.appendChild(list);
    var run = latest(list);
    function load() { return run(function () { return call('GET', '/admin/api/institutes?q=' + encodeURIComponent(I.q) + '&sort=' + I.sort + '&filter=' + I.filter); }, function (r) {
      var items = r.institutes.filter(function (i) { return !I.tag || (i.tags || []).indexOf(I.tag) >= 0; });
      clear(list).appendChild(tableCard([['Centre'], ['Plan'], ['Students'], ['Last active', 1], ['Fees · 30d', 1], ['WhatsApp · 30d', 1], ['Health']], items.map(function (i) {
        return el('tr', { cls: 'click', on: { click: function () { go('centre', i.id); } } }, [
          el('td', null, [el('div', { cls: 'cell-main' }, [avatar(i.name, 'sq'), el('div', { cls: 'grow' }, [el('b', { cls: 'ellipsis' }, [i.name]), el('small', null, [category(i.category) + ' · ' + (i.owner ? i.owner.name + ' · ' + i.owner.phone : '—')]), (i.tags || []).length ? el('div', { cls: 'chips', style: { marginTop: '4px' } }, i.tags.map(tagEl)) : null])])]),
          el('td', null, [pill((i.plan || '—') + (i.planActive ? '' : ' · ended'), i.planActive ? (i.plan === 'trial' ? 'blue' : 'green') : 'orange'), el('div', { cls: 'xs muted', style: { marginTop: '3px' } }, [i.expiresAt ? 'until ' + dshort(i.expiresAt) : ''])]),
          el('td', { cls: 'num' }, [el('b', null, [String(i.students)]), el('div', { cls: 'xs muted' }, [n(i.batches, 'batch', 'batches') + ' · ' + n(i.staff, 'helper')])]),
          el('td', { cls: 'hide-sm' }, [ago(i.lastActivityAt)]),
          el('td', { cls: 'num hide-sm' }, [money(i.collected30)]),
          el('td', { cls: 'num hide-sm' }, [String(i.messages30), i.failed30 ? el('div', { cls: 'xs err' }, [i.failed30 + ' failed']) : null]),
          el('td', null, [score(i.health)]),
        ]);
      }), 'No centres match.'));
    }); }
    await load();
  }

  async function centre(box, id) {
    var d = await call('GET', '/admin/api/institutes/' + id), i = d.institute, owner = i.owner;
    var tab = 'overview', body = el('div');
    var tags = i.tags || [];
    function contact() {
      if (!owner || !owner.phone) return null; // an Apple sign-in may have no phone yet
      var digits = owner.phone.replace(/\D/g, '');
      return el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        el('a', { cls: 'btn soft', href: 'tel:' + owner.phone }, [ic('phone'), 'Call']),
        el('a', { cls: 'btn soft', href: 'https://wa.me/' + digits, target: '_blank', rel: 'noopener noreferrer' }, [ic('chat'), 'WhatsApp']),
        el('button', { cls: 'btn', on: { click: function () { navigator.clipboard.writeText(owner.phone).then(function () { toast('Number copied'); }); } } }, [ic('copy'), 'Copy number']),
      ]);
    }
    var tagBox = el('div', { cls: 'chips' });
    function drawTags() {
      clear(tagBox);
      tags.forEach(function (t) { tagBox.appendChild(tagEl(t)); });
      tagBox.appendChild(el('button', { cls: 'chip', on: { click: function (e) { tagMenu(e.currentTarget); } } }, [ic('tag'), tags.length ? 'Edit tags' : 'Add tag']));
    }
    function tagMenu(anchor) {
      var all = ['vip', 'follow-up', 'churn-risk', 'onboarding', 'partner', 'test'];
      menu(anchor, all.map(function (t) {
        return [(tags.indexOf(t) >= 0 ? '✓ ' : '   ') + t.replace('-', ' '), async function () {
          var next = tags.indexOf(t) >= 0 ? tags.filter(function (x) { return x !== t; }) : tags.concat([t]);
          var r = await call('PUT', '/admin/api/institutes/' + id + '/tags', { tags: next }); tags = r.tags; drawTags(); toast('Tags saved');
        }];
      }));
    }
    drawTags();
    box.appendChild(el('button', { cls: 'btn ghost', style: { marginBottom: '12px', paddingLeft: 0 }, on: { click: function () { if (history.length > 1) history.back(); else go('centres'); } } }, [ic('back'), 'Centres']));
    box.appendChild(el('div', { cls: 'hero' }, [avatar(i.name, 'lg'), el('div', { cls: 'grow' }, [el('h2', null, [i.name]), el('div', { cls: 'meta' }, [category(i.category) + ' · ' + (owner ? owner.name + ' · ' + (owner.phone || NOPHONE) + ' · ' : '') + 'joined ' + dshort(i.createdAt) + ' · last active ' + ago(i.lastActivityAt)]), el('div', { style: { marginTop: '8px' } }, [tagBox])]), contact()]));
    box.appendChild(el('div', { cls: 'grid g4' }, [
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Health']), el('div', { cls: 'value' }, [score(i.health)])]),
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Students']), el('div', { cls: 'value num' }, [String(i.students)]), el('div', { cls: 'sm muted' }, [n(i.batches, 'batch', 'batches') + ' · ' + n(i.staff, 'helper')])]),
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Fees recorded · 30 d']), el('div', { cls: 'value num' }, [money(i.collected30)]), el('div', { cls: 'sm muted' }, [money(d.activity.outstanding) + ' still owed'])]),
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Plan']), el('div', { cls: 'value', style: { fontSize: '22px', textTransform: 'capitalize' } }, [i.plan || '—']), el('div', { cls: 'sm muted' }, [(i.planActive ? 'until ' : 'ended ') + dshort(i.expiresAt)])]),
    ]));
    var tabs = el('div', { cls: 'tabs mt2', role: 'tablist' });
    var TABS = [['overview', 'Overview'], ['logs', 'Logs'], ['people', 'People'], ['messages', 'WhatsApp'], ['notes', 'Notes'], ['billing', 'Plan & billing']];
    var AREA = { student: ['Students', '--accent'], batch: ['Batches', '--purple'], attendance: ['Attendance', '--teal'], fee: ['Fees', '--green'], message: ['WhatsApp', '--teal'], settings: ['Settings', '--faint'], staff: ['Helpers', '--orange'], parent: ['Parent links', '--blue'], centre: ['Setup', '--faint'], billing: ['Plan', '--green'] };
    var LOG = { kinds: [], q: '' };
    function drawTabs() { clear(tabs); TABS.forEach(function (t) { tabs.appendChild(el('button', { cls: t[0] === tab ? 'on' : '', role: 'tab', on: { click: function () { tab = t[0]; drawTabs(); drawBody(); } } }, [t[1]])); }); }
    // ---- one centre's full log: filter by kind, search, download, load older ----
    var LOG_KINDS = [['activity', 'Changes'], ['login', 'Sign-ins'], ['payment', 'Payments'], ['attendance', 'Attendance'], ['message', 'WhatsApp'], ['message-failed', 'Failures'], ['reversal', 'Corrections'], ['plan', 'Plan'], ['admin', 'Admin']];
    async function drawLogs() {
      var holder = el('div', { cls: 'feed' }), chipBox = el('div', { cls: 'chips swipe' }), moreBox = el('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '14px' } }), oldest = null;
      function drawChips() {
        clear(chipBox);
        chipBox.appendChild(el('button', { cls: 'chip' + (LOG.kinds.length ? '' : ' on'), on: { click: function () { LOG.kinds = []; drawChips(); load(); } } }, ['Everything']));
        LOG_KINDS.forEach(function (k) { var on = LOG.kinds.indexOf(k[0]) >= 0; chipBox.appendChild(el('button', { cls: 'chip' + (on ? ' on' : ''), on: { click: function () { LOG.kinds = on ? LOG.kinds.filter(function (x) { return x !== k[0]; }) : LOG.kinds.concat([k[0]]); drawChips(); load(); } } }, [ic(KIND[k[0]][0] === 'shield' ? 'audit' : KIND[k[0]][0]), k[1]])); });
      }
      var run = latest(holder);
      function q(before) { return '/admin/api/events?limit=100&institute=' + id + '&kinds=' + LOG.kinds.join(',') + '&q=' + encodeURIComponent(LOG.q) + (before ? '&before=' + encodeURIComponent(before) : ''); }
      function after(r) {
        clear(moreBox);
        if (!r.events.length && !oldest) { holder.appendChild(empty('activity', LOG.q || LOG.kinds.length ? 'Nothing matches.' : 'Nothing in the last 30 days.')); return; }
        dayFeed(holder, r.events, { inCentre: true });
        oldest = r.events.length ? r.events[r.events.length - 1].at : oldest;
        if (r.events.length === 100) moreBox.appendChild(el('button', { cls: 'btn', on: { click: async function () { var x = await call('GET', q(oldest)); after(x); } } }, ['Load older']));
      }
      function load() { oldest = null; holder.removeAttribute('data-last-day'); return run(function () { return call('GET', q()); }, after); }
      drawChips();
      body.appendChild(el('div', { cls: 'toolbar' }, [
        searchField(LOG.q, 'Search this centre’s log: a student, a batch, a person', function (v) { LOG.q = v; load(); }),
        el('button', { cls: 'btn', on: { click: function () { download('/admin/api/institutes/' + id + '/logs.csv', 'chalkpis-' + i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-logs.csv'); } } }, [ic('download'), 'Export']),
      ]));
      body.appendChild(chipBox); body.appendChild(holder); body.appendChild(moreBox);
      await load();
    }
    async function drawBody() {
      clear(body);
      if (tab === 'overview') {
        var busy = d.trend.values.reduce(function (x, y) { return x + y; }, 0);
        body.appendChild(el('div', { cls: 'split' }, [
          card('Activity · last 30 days', busy ? n(busy, 'action') + ' and sign-ins' : 'Nothing recorded yet', busy ? bars(d.trend.dates.map(function (x) { return dshort(x + 'T12:00:00+05:30'); }), d.trend.values, { name: 'Actions', color: cssv('--purple'), h: 190, label: 'actions per day', every: 7, tips: d.trend.dates.map(function (x) { return dlong(x + 'T12:00:00+05:30'); }) }) : empty('activity', 'Changes and sign-ins show here from now on.'), el('button', { cls: 'btn ghost', on: { click: function () { tab = 'logs'; drawTabs(); drawBody(); } } }, ['Open logs'])),
          card('What they use', 'Last 30 days', d.areas.length ? donut(d.areas.map(function (a) { var m = AREA[a.area] || [a.area, '--faint']; return { name: m[0], value: a.count, color: cssv(m[1]) }; }), 'actions') : empty('check', 'No changes yet.')),
        ]));
        body.appendChild(el('div', { cls: 'grid g2 mt' }, [
        card('Last 30 days', null, el('div', null, [['Attendance days saved', d.activity.attendance30], ['Payments recorded', d.activity.payments30 + ' · ' + money(i.collected30)], ['WhatsApp delivered', i.messages30 + (i.failed30 ? ' (' + i.failed30 + ' failed)' : '')]].map(function (k) { return el('div', { cls: 'kv' }, [el('span', null, [k[0]]), el('b', { cls: 'num' }, [String(k[1])])]); }))),
        card('Setup', 'What helps a centre succeed', el('div', null, [['Parents can pay (UPI / link)', i.canBePaid], ['Parent WhatsApp messages', i.messagesOn], ['Has students', i.students > 0], ['Has a helper', i.staff > 0]].map(function (k) { return el('div', { cls: 'kv' }, [el('span', null, [k[0]]), k[1] ? pill('Yes', 'green') : pill('No', 'orange')]); }))),
        ]));
      }
      if (tab === 'logs') await drawLogs();
      if (tab === 'people') body.appendChild(card('People', null, el('div', { cls: 'rows' }, d.people.map(function (p) {
        var how = [METHOD[p.lastMethod], DEVICE[p.lastPlatform] && 'on ' + DEVICE[p.lastPlatform]].filter(Boolean).join(' ');
        return el('div', { cls: 'r click', on: { click: function () { openUser(p.id); } } }, [avatar(p.name || p.phone || '?'), el('div', { cls: 'grow' }, [el('div', { style: { fontWeight: 600 } }, [p.name || p.phone || NOPHONE]), el('div', { cls: 'sm muted' }, [(p.phone || NOPHONE) + ' · ' + (p.role === 'owner' ? 'Tutor' : 'Helper') + ' · ' + n(p.logins30, 'sign-in') + ' in 30 days'])]), p.blocked ? pill('Blocked', 'red') : el('div', { style: { textAlign: 'right' } }, [el('div', { cls: 'sm muted' }, [ago(p.lastLoginAt)]), how ? el('div', { cls: 'xs faint' }, [how]) : null]), ic('chev', 'faint')]);
      }))));
      if (tab === 'messages') body.appendChild(card('WhatsApp · last 30 days', null, byType(d.messages)));
      if (tab === 'billing') body.appendChild(el('div', { cls: 'grid g2' }, [planEditor(i, function () { render(); }), card('Plan payments', null, d.billing.length ? el('div', null, d.billing.map(function (b) { return el('div', { cls: 'kv' }, [el('span', null, [when(b.at)]), el('b', null, [(b.plan || '') + ' · ' + money(b.amount)])]); })) : empty('rupee', 'No plan payments yet.'))]));
      if (tab === 'notes') {
        var input = el('textarea', { cls: 'field', rows: '3', placeholder: 'Add a private note (only admins see it): calls, promises, problems…', maxlength: '1000', style: { width: '100%' } });
        var list = el('div');
        async function loadNotes() {
          var r = await call('GET', '/admin/api/institutes/' + id + '/notes'); clear(list);
          if (!r.notes.length) list.appendChild(empty('note', 'No notes yet.'));
          r.notes.forEach(function (n) {
            list.appendChild(el('div', { cls: 'note' }, [avatar(n.author), el('div', null, [el('div', { cls: 'sm' }, [el('b', null, [n.author]), el('span', { cls: 'muted' }, [' · ' + when(n.at)])]), el('div', { cls: 'body' }, [n.body])]), el('button', { cls: 'btn icon ghost', title: 'Delete note', 'aria-label': 'Delete note', on: { click: async function () { if (!confirm('Delete this note?')) return; await call('DELETE', '/admin/api/institutes/' + id + '/notes/' + n.id); loadNotes(); } } }, [ic('x')])]));
          });
        }
        body.appendChild(card('Notes', 'A private timeline for your team', el('div', null, [input, el('div', { style: { display: 'flex', justifyContent: 'flex-end', margin: '10px 0 6px' } }, [el('button', { cls: 'btn primary', on: { click: async function () { if (!input.value.trim()) return; await call('POST', '/admin/api/institutes/' + id + '/notes', { body: input.value }); input.value = ''; toast('Note added'); loadNotes(); } } }, [ic('plus'), 'Add note'])]), list])));
        await loadNotes();
      }
    }
    box.appendChild(tabs); box.appendChild(body); drawTabs(); await drawBody();
    setCrumb(i.name, 'Customers · Centres');
  }

  function planEditor(i, done) {
    var plan = i.plan || 'trial', days = 30, msg = el('div', { cls: 'sm' });
    var a = el('div'), b = el('div');
    function draw() { clear(a).appendChild(seg([['trial', 'Trial'], ['starter', 'Starter'], ['standard', 'Standard'], ['pro', 'Pro']], plan, function (v) { plan = v; draw(); })); clear(b).appendChild(seg([['7', '7d'], ['30', '30d'], ['90', '90d'], ['365', '1 yr']], String(days), function (v) { days = Number(v); draw(); })); }
    draw();
    return card('Plan', (i.plan || '—') + ((i.planActive || i.active) ? ', active until ' : ', ended ') + dshort(i.expiresAt), el('div', { style: { display: 'grid', gap: '12px' } }, [a, b, el('div', null, [el('button', { cls: 'btn primary', on: { click: async function () { try { var r = await call('POST', '/admin/api/institutes/' + i.id + '/plan', { plan: plan, days: days }); toast(r.plan + ' until ' + dshort(r.expiresAt)); done(); } catch (e) { msg.className = 'sm err'; msg.textContent = e.message; } } } }, ['Extend by ' + days + ' days'])]), msg]));
  }

  async function logins(box) {
    var U = st.users, list = el('div');
    box.appendChild(el('div', { cls: 'toolbar' }, [
      searchField(U.q, 'Search name, phone or centre', function (v) { U.q = v; U.offset = 0; load(); }),
      seg([['all', 'Everyone'], ['owners', 'Tutors'], ['staff', 'Helpers'], ['blocked', 'Blocked'], ['no-institute', 'Not set up']], U.filter, function (v) { U.filter = v; U.offset = 0; render(); }),
      el('button', { cls: 'btn', on: { click: function () { download('/admin/api/export/users.csv', 'chalkpis-logins.csv'); } } }, [ic('download'), 'Export']),
    ]));
    box.appendChild(list);
    var run = latest(list);
    function load() { return run(function () { return call('GET', '/admin/api/users?q=' + encodeURIComponent(U.q) + '&filter=' + U.filter + '&limit=50&offset=' + U.offset); }, function (r) {
      list.appendChild(tableCard([['Person'], ['Role', 1], ['Centre', 1], ['Plan'], ['Last login', 1], ['Status']], r.users.map(function (u) {
        var status = u.blocked ? pill('Blocked', 'red') : u.isAdmin ? pill('Admin', 'blue') : u.activeSessions ? pill('Online', 'green') : pill('Offline');
        return el('tr', { cls: 'click', on: { click: function () { openUser(u.id); } } }, [
          el('td', null, [el('div', { cls: 'cell-main' }, [avatar(u.name || u.phone || '?'), el('div', null, [el('b', null, [u.name || '(no name)']), el('small', null, [u.phone || NOPHONE])])])]),
          el('td', { cls: 'hide-sm' }, [u.role === 'owner' ? 'Tutor' : u.role === 'staff' ? 'Helper' : '—']),
          el('td', { cls: 'hide-sm' }, [u.institute ? u.institute.name : '—']),
          el('td', null, [u.institute ? pill((u.institute.plan || '—') + (u.institute.active ? '' : ' · ended'), u.institute.active ? 'green' : 'orange') : '—']),
          el('td', { cls: 'hide-sm' }, [ago(u.lastLoginAt), el('div', { cls: 'xs muted' }, [u.activeSessions + ' device' + (u.activeSessions === 1 ? '' : 's')])]),
          el('td', null, [status]),
        ]);
      }), 'No logins match.'));
      list.appendChild(el('div', { style: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px' } }, [U.offset ? el('button', { cls: 'btn', on: { click: function () { U.offset -= 50; load(); } } }, ['← Previous']) : null, r.users.length === 50 ? el('button', { cls: 'btn', on: { click: function () { U.offset += 50; load(); } } }, ['Next →']) : null]));
    }); }
    await load();
  }

  async function leaders(box) {
    var r = await call('GET', '/admin/api/institutes?sort=students'), list = r.institutes;
    function board(title, sub, key, fmt, color) {
      var top = list.slice().sort(function (a, b) { return b[key] - a[key]; }).filter(function (i) { return i[key] > 0; }).slice(0, 10), max = top.length ? top[0][key] : 1;
      return card(title, sub, top.length ? el('div', { cls: 'rows' }, top.map(function (i, k) {
        return el('div', { cls: 'r click', on: { click: function () { go('centre', i.id); } } }, [el('div', { style: { width: '26px', textAlign: 'center', fontWeight: 800, color: k < 3 ? ['#d4a017', '#9aa0a6', '#b87333'][k] : cssv('--faint') } }, [String(k + 1)]), avatar(i.name, 'sq'), el('div', { cls: 'grow' }, [el('div', { cls: 'ellipsis', style: { fontWeight: 600 } }, [i.name]), el('div', { cls: 'bar', style: { marginTop: '6px' } }, [el('i', { style: { width: (i[key] / max) * 100 + '%', background: color } })])]), el('b', { cls: 'num' }, [fmt(i[key])])]);
      })) : empty('trophy', 'Nothing to rank yet.'));
    }
    box.appendChild(el('div', { cls: 'grid g3' }, [
      board('Most students', 'Active students', 'students', String, cssv('--accent')),
      board('Top collectors', 'Fees recorded, last 30 days', 'collected30', money, cssv('--green')),
      board('Most engaged with parents', 'WhatsApp delivered, last 30 days', 'messages30', String, cssv('--teal')),
    ]));
  }

  var KIND = {
    signup: ['sparkle', '--purple', 'Sign-ups'], login: ['login', '--accent', 'Logins'], activity: ['activity', '--purple', 'Changes'], centre: ['centres', '--teal', 'New centres'], payment: ['rupee', '--green', 'Payments'],
    reversal: ['refresh', '--orange', 'Corrections'], attendance: ['calendar', '--accent', 'Attendance'], message: ['chat', '--teal', 'WhatsApp sent'], 'message-failed': ['alert', '--red', 'WhatsApp failures'], plan: ['trophy', '--green', 'Plans'], admin: ['shield', '--faint', 'Admin'],
  };
  // the platform feed leaves routine WhatsApp sends out (one centre's log shows them)
  var FEED_KINDS = Object.keys(KIND).filter(function (k) { return k !== 'message'; });
  var DEVICE = { ios: 'iPhone', android: 'Android', web: 'Web' };
  var METHOD = { whatsapp: 'WhatsApp', google: 'Google', apple: 'Apple', email: 'Email' };
  // what a centre teaches (institutes.category)
  var CATEGORY = { tuition: 'Tuition', coaching: 'Coaching', abacus: 'Abacus', karate: 'Karate', dance: 'Dance', yoga: 'Yoga', sports: 'Sports', other: 'Other' };
  function category(c) { return CATEGORY[c] || 'Tuition'; }
  // an account made with Sign in with Apple may not have added a mobile yet
  var NOPHONE = 'No phone (Apple)';
  function device(p) { return p && DEVICE[p] ? el('span', { cls: 'dev', title: 'From ' + DEVICE[p] }, [DEVICE[p]]) : null; }
  /** Events grouped under Today / Yesterday / the date, newest first; `more` loads the next older page. */
  function dayFeed(holder, events, opts) {
    opts = opts || {};
    var lastDay = holder.getAttribute('data-last-day') || '';
    events.forEach(function (e) {
      var d = ymd(e.at), today = ymd(new Date().toISOString()), yest = ymd(new Date(Date.now() - 86400000).toISOString());
      if (d !== lastDay) { lastDay = d; holder.appendChild(el('div', { cls: 'daysep' }, [el('span', null, [d === today ? 'Today' : d === yest ? 'Yesterday' : dlong(e.at)])])); }
      holder.appendChild(evRow(e, false, opts.inCentre));
    });
    holder.setAttribute('data-last-day', lastDay);
  }
  function evRow(e, compactRow, inCentre) {
    var k = KIND[e.kind] || KIND.admin, c = cssv(k[1]);
    // inside a centre's own log, a line opens the person; elsewhere it opens the centre
    var clickable = inCentre ? e.userId : e.instituteId || e.userId;
    var open = function () { if (!inCentre && e.instituteId) go('centre', e.instituteId); else openUser(e.userId); };
    var n = el('div', { cls: compactRow ? 'r' + (clickable ? ' click' : '') : 'ev', style: clickable ? { cursor: 'pointer' } : null, on: clickable ? { click: open } : null }, [
      el('div', { cls: 'kind', style: { width: compactRow ? '32px' : null, height: compactRow ? '32px' : null, borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, ' + c + ' 14%, transparent)', color: c, flex: 'none' } }, [ic(k[0] === 'shield' ? 'audit' : k[0])]),
      el('div', { cls: 'grow' }, [el('div', null, [el('b', null, [e.actor]), ' ' + e.text, e.amount != null ? el('span', { cls: 'amt', style: { color: e.amount < 0 ? cssv('--orange') : cssv('--green') } }, [money(e.amount)]) : null, device(e.platform)]), compactRow ? el('div', { cls: 'xs muted' }, [ago(e.at)]) : (!inCentre && e.institute && e.institute !== e.actor ? el('div', { cls: 'xs muted' }, [e.institute]) : null)]),
      compactRow ? null : el('div', { cls: 'when' }, [time(e.at)]),
    ]);
    return n;
  }
  async function activity(box) {
    var F = st.feed, holder = el('div', { cls: 'feed' }), latest = null;
    var chipBox = el('div', { cls: 'chips swipe', style: { marginBottom: '6px' } });
    function drawChips() {
      clear(chipBox);
      chipBox.appendChild(el('button', { cls: 'chip' + (F.kinds.length ? '' : ' on'), on: { click: function () { F.kinds = []; drawChips(); load(); } } }, ['Everything']));
      FEED_KINDS.forEach(function (k) { var on = F.kinds.indexOf(k) >= 0; chipBox.appendChild(el('button', { cls: 'chip' + (on ? ' on' : ''), on: { click: function () { F.kinds = on ? F.kinds.filter(function (x) { return x !== k; }) : F.kinds.concat([k]); drawChips(); load(); } } }, [ic(KIND[k][0] === 'shield' ? 'audit' : KIND[k][0]), KIND[k][2]])); });
    }
    drawChips();
    box.appendChild(el('div', { cls: 'hello' }, [el('div', null, [el('h2', null, ['# platform-activity']), el('p', null, ['Everything happening on Chalkpis, as it happens'])]), el('button', { cls: 'btn', on: { click: function () { load(); } } }, [ic('refresh'), 'Refresh'])]));
    box.appendChild(chipBox); box.appendChild(holder);
    async function load(silent) {
      if (!silent) clear(holder).appendChild(sk(400));
      var r = await call('GET', '/admin/api/events?limit=200&kinds=' + F.kinds.join(','));
      if (silent) {
        var fresh = r.events.filter(function (e) { return latest && e.at > latest; }).length;
        if (fresh && !holder.querySelector('.newpill')) holder.insertBefore(el('div', { cls: 'newpill' }, [el('button', { on: { click: function () { load(); scrollTo({ top: 0, behavior: 'smooth' }); } } }, ['↑ ' + fresh + ' new'])]), holder.firstChild);
        return;
      }
      clear(holder); holder.removeAttribute('data-last-day'); latest = r.events[0] ? r.events[0].at : null;
      if (!r.events.length) { holder.appendChild(card('Nothing yet', null, empty('activity', 'Events appear here the moment tutors use Chalkpis.'))); return; }
      dayFeed(holder, r.events);
    }
    await load();
    clearInterval(liveTimer); liveTimer = setInterval(function () { if (route().view === 'activity') load(true); }, 15000);
  }

  async function whatsapp(box) {
    var M = st.msg, r = await call('GET', '/admin/api/messages?status=' + M.status + '&type=' + M.type + '&limit=150'), by = {};
    r.summary.forEach(function (x) { by[x.status] = (by[x.status] || 0) + x.count; });
    var total = Object.keys(by).reduce(function (a, k) { return a + by[k]; }, 0), rate = total ? Math.round(((by.sent || 0) / total) * 100) : 0;
    box.appendChild(el('div', { cls: 'grid g4' }, [
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Delivered · 7 d']), el('div', { cls: 'value num' }, [String(by.sent || 0)])]),
      el('div', { cls: 'card kpi' }, [el('div', { cls: 'label' }, ['Failed · 7 d']), el('div', { cls: 'value num', style: { color: by.failed ? cssv('--red') : null } }, [String(by.failed || 0)])]),
      el('div', { cls: 'card kpi wide' }, [el('div', { cls: 'label' }, ['Skipped · 7 d']), el('div', { cls: 'value num' }, [String(by.skipped || 0)]), el('div', { cls: 'sm muted' }, ['messages off, opted out or no template'])]),
      el('div', { cls: 'card kpi wide', style: { flexDirection: 'row', alignItems: 'center', gap: '16px' } }, [ring(rate, rate >= 90 ? cssv('--green') : cssv('--orange'), 'Delivery rate'), el('div', null, [el('div', { cls: 'label' }, ['Delivery rate']), el('div', { cls: 'sm muted' }, [n(total, 'message') + ' this week'])])]),
    ]));
    box.appendChild(el('div', { cls: 'grid g2 mt' }, [
      card('Why messages did not go', 'Top reasons this week', r.topErrors.length ? el('div', null, r.topErrors.map(function (e) { return el('div', { cls: 'kv' }, [el('code', { cls: 'sm' }, [e.error]), el('b', { cls: 'num' }, [String(e.count)])]); })) : empty('check', 'Nothing failed this week.')),
      card('By message type', 'Delivered of total, this week', byType(r.summary)),
    ]));
    box.appendChild(el('div', { cls: 'toolbar mt2' }, [
      seg([['all', 'All'], ['failed', 'Failed'], ['queued', 'Waiting'], ['sent', 'Delivered'], ['skipped', 'Skipped']], M.status, function (v) { M.status = v; render(); }),
      select([['', 'Every type'], ['absent', 'Absent'], ['late', 'Late'], ['fee_due', 'Fee due'], ['fee_overdue', 'Fee overdue'], ['fee_reminder', 'Reminder · QR'], ['fee_link', 'Reminder · link'], ['payment_received', 'Receipt'], ['parent_link', 'Parent link']], M.type, function (v) { M.type = v; render(); }, 'Type'),
    ]));
    box.appendChild(tableCard([['When'], ['Centre · student'], ['Message'], ['Status'], ['', 0]], r.messages.map(function (m) {
      var tone = m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : m.status === 'skipped' ? '' : 'blue';
      return el('tr', null, [
        el('td', { cls: 'sm' }, [when(m.createdAt)]),
        el('td', null, [el('b', null, [m.institute]), el('div', { cls: 'xs muted' }, [(m.student || '') + ' · ' + m.to])]),
        el('td', null, [m.type.replace(/_/g, ' '), el('div', { cls: 'xs muted' }, [m.manual ? 'sent by tutor' : 'automatic'])]),
        el('td', null, [pill(m.status === 'sent' ? 'delivered' : m.status, tone), m.why ? el('div', { cls: 'xs muted', style: { marginTop: '3px' } }, [m.why]) : null]),
        el('td', null, [m.status === 'failed' ? el('button', { cls: 'btn soft', on: { click: async function (ev) { ev.currentTarget.disabled = true; try { await call('POST', '/admin/api/messages/' + m.id + '/retry'); toast('Queued again'); render(); } catch (e) { toast(e.code === 'cannot_retry' ? 'Too old to retry' : e.message, false); } } } }, [ic('refresh'), 'Retry']) : null]),
      ]);
    }), 'No messages.'));
  }
  function byType(summary) {
    var t = {}; summary.forEach(function (x) { t[x.type] = t[x.type] || { ok: 0, all: 0 }; t[x.type].all += x.count; if (x.status === 'sent') t[x.type].ok += x.count; });
    var keys = Object.keys(t); if (!keys.length) return empty('chat', 'No messages yet.');
    return el('div', { cls: 'funnel' }, keys.map(function (k) { var p = Math.round((t[k].ok / t[k].all) * 100); return el('div', { cls: 'step' }, [el('span', { cls: 'sm' }, [k.replace(/_/g, ' ')]), el('div', { cls: 'bar' }, [el('i', { style: { width: p + '%', background: cssv('--green') } })]), el('span', { cls: 'num sm', style: { textAlign: 'right' } }, [t[k].ok + ' / ' + t[k].all])]); }));
  }

  async function announce(box) {
    var f = { title: '', body: '', link: '', tone: 'info', audience: 'all', days: '7' }, err = el('div', { cls: 'err sm' }), preview = el('div');
    var TONE = { info: ['megaphone', '--accent'], success: ['sparkle', '--green'], warning: ['alert', '--orange'] };
    function drawPreview() {
      var t = TONE[f.tone], c = cssv(t[1]);
      clear(preview).appendChild(el('div', { style: { maxWidth: '360px', margin: '0 auto', background: cssv('--bg'), borderRadius: '28px', padding: '18px 14px', boxShadow: cssv('--shadow-2') } }, [
        el('div', { cls: 'xs muted', style: { textAlign: 'center', marginBottom: '10px' } }, ['Tutor’s Home screen']),
        el('div', { style: { display: 'flex', gap: '10px', padding: '12px', borderRadius: '12px', background: 'color-mix(in srgb, ' + c + ' 14%, transparent)' } }, [el('span', { style: { color: c } }, [ic(t[0])]), el('div', { cls: 'grow' }, [el('div', { style: { fontWeight: 700, color: c } }, [f.title || 'Your title']), f.body ? el('div', { cls: 'sm', style: { marginTop: '2px' } }, [f.body]) : null]), el('span', { cls: 'faint' }, [ic('x')])]),
        el('div', { cls: 'sk', style: { height: '90px', marginTop: '10px', borderRadius: '18px', animation: 'none', background: 'linear-gradient(135deg,#1c8cff,#0051c7)' } }),
      ]));
    }
    function inp(key, ph, multi) { var x = el(multi ? 'textarea' : 'input', { cls: 'field', placeholder: ph, rows: multi ? '3' : null, maxlength: multi ? '400' : key === 'title' ? '80' : '300', style: { width: '100%' } }); x.addEventListener('input', function () { f[key] = x.value; drawPreview(); }); return x; }
    var segTone = el('div'), segAud = el('div'), segDays = el('div');
    function drawSegs() {
      clear(segTone).appendChild(seg([['info', 'Info'], ['success', 'Good news'], ['warning', 'Warning']], f.tone, function (v) { f.tone = v; drawSegs(); drawPreview(); }));
      clear(segAud).appendChild(seg([['all', 'Everyone'], ['owners', 'Tutors'], ['staff', 'Helpers']], f.audience, function (v) { f.audience = v; drawSegs(); }));
      clear(segDays).appendChild(seg([['1', '1 day'], ['7', '7 days'], ['30', '30 days'], ['', 'No end']], f.days, function (v) { f.days = v; drawSegs(); }));
    }
    drawSegs(); drawPreview();
    function lab(t, x) { return el('label', { style: { display: 'grid', gap: '6px' } }, [el('span', { cls: 'sm muted', style: { fontWeight: 600 } }, [t]), x]); }
    var pub = el('button', { cls: 'btn primary', on: { click: async function () {
      err.textContent = '';
      // say exactly what is wrong before sending anything
      if (f.title.trim().length < 2) { err.textContent = 'Add a title (at least 2 letters).'; return; }
      if (f.link.trim() && !/^https:\/\/\S+$/.test(f.link.trim())) { err.textContent = 'The link must start with https://'; return; }
      pub.disabled = true;
      try { await call('POST', '/admin/api/announcements', { title: f.title, body: f.body, link: f.link.trim(), tone: f.tone, audience: f.audience, days: f.days ? Number(f.days) : null }); toast('Live in the app'); render(); }
      catch (e) { err.textContent = e.code === 'bad_request' ? 'A title of at least 2 letters is needed, and links must start with https://' : e.message; pub.disabled = false; }
    } } }, [ic('megaphone'), 'Publish']);
    box.appendChild(el('div', { cls: 'split' }, [
      card('New announcement', 'Shows as a banner on Home until it ends; tutors can close it', el('div', { style: { display: 'grid', gap: '14px' } }, [lab('Title', inp('title', 'e.g. New: poster maker')), lab('Message', inp('body', 'One or two short sentences', true)), lab('Link (optional)', inp('link', 'https://')), lab('Look', segTone), lab('Who sees it', segAud), lab('Show for', segDays), el('div', null, [pub]), err])),
      card('Preview', null, preview),
    ]));
    var r = await call('GET', '/admin/api/announcements');
    box.appendChild(el('div', { cls: 'section-t' }, ['History']));
    box.appendChild(tableCard([['Announcement'], ['Audience', 1], ['Shown', 1], ['Status'], ['']], r.announcements.map(function (a) {
      return el('tr', null, [el('td', null, [el('b', null, [a.title]), a.body ? el('div', { cls: 'xs muted' }, [a.body]) : null]), el('td', { cls: 'hide-sm' }, [a.audience]), el('td', { cls: 'hide-sm sm' }, [dshort(a.startsAt) + ' → ' + (a.endsAt ? dshort(a.endsAt) : 'no end')]), el('td', null, [a.live ? pill('Live', 'green') : pill('Ended')]),
        el('td', null, [a.live ? el('button', { cls: 'btn danger', on: { click: async function () { if (!confirm('Take “' + a.title + '” down now?')) return; await call('POST', '/admin/api/announcements/' + a.id + '/end'); toast('Taken down'); render(); } } }, ['End']) : null])]);
    }), 'No announcements yet.'));
  }

  async function signins(box) {
    var r = await call('GET', '/admin/api/logins');
    box.appendChild(tableCard([['When'], ['Number'], ['Name', 1], ['Result']], r.logins.map(function (l) {
      return el('tr', { cls: l.userId ? 'click' : null, on: l.userId ? { click: function () { openUser(l.userId); } } : null }, [el('td', { cls: 'sm' }, [when(l.at)]), el('td', null, [l.phone]), el('td', { cls: 'hide-sm' }, [l.name || '—']), el('td', null, [pill(l.result, l.result === 'signed in' ? 'green' : l.result.indexOf('wrong') === 0 ? 'red' : '')])]);
    }), 'No login codes in the last day.'));
  }
  async function audit(box) {
    var r = await call('GET', '/admin/api/audit');
    var LABEL = { block: 'Blocked', unblock: 'Unblocked', 'sign-out': 'Signed out', 'set-plan': 'Plan changed', announce: 'Announcement', 'end-announcement': 'Announcement ended', 'retry-message': 'Message retried' };
    var TONE = { block: 'red', unblock: 'green', 'sign-out': 'orange', 'set-plan': 'green' };
    var isId = function (v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || ''); };
    box.appendChild(tableCard([['When'], ['Admin'], ['Action'], ['Who', 1], ['Detail', 1]], r.audit.map(function (a) {
      return el('tr', null, [el('td', { cls: 'sm' }, [when(a.at)]), el('td', null, [a.admin]), el('td', null, [pill(LABEL[a.action] || a.action, TONE[a.action] || 'blue')]), el('td', { cls: 'hide-sm' }, [a.target || '—']), el('td', { cls: 'hide-sm sm muted' }, [isId(a.detail) ? '' : a.detail || ''])]);
    }), 'Nothing yet.'));
  }
  async function system(box) {
    var h = await call('GET', '/admin/api/health');
    function up(x) { var d = Math.floor(x / 86400), hh = Math.floor((x % 86400) / 3600), m = Math.floor((x % 3600) / 60); return (d ? d + 'd ' : '') + hh + 'h ' + m + 'm'; }
    var qok = h.queue.oldestQueuedMinutes < 10 && h.queue.failed24h < 20, wok = h.whatsapp.provider !== 'none';
    function stat(title, ok, okText, lines) { return card(title, null, el('div', null, lines.map(function (l) { return el('div', { cls: 'kv' }, [el('span', null, [l[0]]), el('b', { cls: 'num sm' }, [String(l[1])])]); })), pill(okText, ok ? 'green' : 'orange')); }
    box.appendChild(el('div', { cls: 'hello' }, [el('div', null, [el('h2', null, [qok && wok ? 'All systems normal' : 'Needs a look']), el('p', null, ['Checked ' + time(new Date().toISOString())])]), el('button', { cls: 'btn', on: { click: render } }, [ic('refresh'), 'Check again'])]));
    box.appendChild(el('div', { cls: 'grid g2' }, [
      stat('Server', true, 'Running', [['Version', 'v' + h.server.version], ['Node', h.server.node], ['Up for', up(h.server.uptimeSeconds)], ['Memory', h.server.memoryMb + ' MB'], ['Address', h.server.publicBaseUrl || 'not set']]),
      stat('Database', true, 'Connected', [['Response', h.database.pingMs + ' ms'], ['Size', h.database.sizeMb + ' MB'], ['Last migration', h.database.lastMigration]]),
      stat('Message queue', qok, qok ? 'Healthy' : 'Backlog', [['Waiting', h.queue.queued], ['Sending', h.queue.sending], ['Failed (24 h)', h.queue.failed24h], ['Oldest waiting', h.queue.oldestQueuedMinutes + ' min']]),
      stat('WhatsApp', wok, wok ? h.whatsapp.provider : 'Not set up', h.whatsapp.templates.map(function (t) { var p = t.split(': '); return [p[0], p[1]]; })),
      card('Scheduled jobs', 'When each last ran', h.jobs.length ? el('div', null, h.jobs.map(function (j) { return el('div', { cls: 'kv' }, [el('span', null, [j.job]), el('span', { cls: 'sm' }, [ago(j.lastRunAt)])]); })) : empty('calendar', 'No job has run yet.')),
    ]));
  }

  /* ---------------- user drawer, menus, palette, bell ---------------- */
  function overlay(node) { closeOverlays(); var sc = el('div', { cls: 'scrim', on: { click: closeOverlays } }); document.body.appendChild(sc); document.body.appendChild(node); return node; }
  function closeOverlays() { document.querySelectorAll('.scrim,.drawer,.palette,.menu').forEach(function (n) { n.remove(); }); hideTip(); }
  async function openUser(id) {
    var dr = overlay(el('div', { cls: 'drawer', role: 'dialog', 'aria-modal': 'true' }, [sk(80), el('div', { style: { height: '12px' } }), sk(220)]));
    async function draw() {
      var d = await call('GET', '/admin/api/users/' + id), u = d.user, msg = el('div', { cls: 'sm' });
      async function act(fn, ok) { try { await fn(); toast(ok); await draw(); } catch (e) { msg.className = 'sm err'; msg.textContent = e.code === 'cannot_change_admin' ? 'Admin accounts cannot be changed here.' : e.message; } }
      clear(dr);
      dr.appendChild(el('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '18px' } }, [avatar(u.name || u.phone || '?', 'lg'), el('div', { cls: 'grow' }, [el('div', { style: { fontSize: '21px', fontWeight: 700, letterSpacing: '-0.02em' } }, [u.name || '(no name)']), el('div', { cls: 'muted' }, [u.phone || NOPHONE])]), el('button', { cls: 'btn icon', 'aria-label': 'Close', on: { click: closeOverlays } }, [ic('x')])]));
      var digits = (u.phone || '').replace(/\D/g, '');
      dr.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' } }, [u.phone ? el('a', { cls: 'btn soft', href: 'tel:' + u.phone }, [ic('phone'), 'Call']) : null, u.phone ? el('a', { cls: 'btn soft', href: 'https://wa.me/' + digits, target: '_blank', rel: 'noopener noreferrer' }, [ic('chat'), 'WhatsApp']) : null, u.institute ? el('button', { cls: 'btn', on: { click: function () { closeOverlays(); go('centre', u.institute.id); } } }, [ic('centres'), 'Open centre']) : null]));
      dr.appendChild(card('Account', null, el('div', null, [['Status', u.blocked ? pill('Blocked', 'red') : u.isAdmin ? pill('Admin', 'blue') : u.activeSessions ? pill('Online', 'green') : pill('Offline')], ['Role', u.role === 'owner' ? 'Tutor (owner)' : u.role === 'staff' ? 'Helper' : 'Not set up yet'], ['Centre', u.institute ? u.institute.name : '—'], ['Joined', when(u.createdAt)], ['Last login', when(u.lastLoginAt)], ['Devices', String(u.activeSessions)], u.blocked ? ['Block reason', u.blockedReason || '—'] : null].filter(Boolean).map(function (k) { return el('div', { cls: 'kv' }, [el('span', null, [k[0]]), typeof k[1] === 'object' ? k[1] : el('b', { cls: 'sm' }, [k[1]])]); }))));
      dr.appendChild(card('Actions', null, el('div', null, [el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        el('button', { cls: 'btn', disabled: u.isAdmin || !u.activeSessions, on: { click: function () { if (confirm('Sign ' + (u.name || u.phone || 'this person') + ' out on every device?')) act(function () { return call('POST', '/admin/api/users/' + id + '/sign-out'); }, 'Signed out everywhere'); } } }, [ic('logout'), 'Sign out everywhere']),
        u.blocked ? el('button', { cls: 'btn soft', on: { click: function () { act(function () { return call('POST', '/admin/api/users/' + id + '/unblock'); }, 'Unblocked'); } } }, ['Unblock'])
          : el('button', { cls: 'btn danger', disabled: u.isAdmin, on: { click: function () { var reason = prompt('Block ' + (u.name || u.phone || 'this person') + '? They are signed out at once and cannot sign in.\n\nReason (optional):', ''); if (reason !== null) act(function () { return call('POST', '/admin/api/users/' + id + '/block', { reason: reason }); }, 'Blocked'); } } }, [ic('flag'), 'Block']),
      ]), msg])));
      if (u.institute && u.role === 'owner') dr.appendChild(planEditor(u.institute, draw));
      dr.appendChild(card('Devices', null, d.sessions.length ? el('div', null, d.sessions.map(function (x) { return el('div', { cls: 'kv' }, [el('span', null, ['Since ' + when(x.startedAt)]), pill(x.status, x.status === 'active' ? 'green' : '')]); })) : empty('login', 'No sign-ins.')));
      dr.appendChild(card('Login codes · last day', null, d.codes.length ? el('div', null, d.codes.map(function (c) { return el('div', { cls: 'kv' }, [el('span', null, [when(c.at)]), el('span', { cls: 'sm muted' }, [c.result])]); })) : empty('key', 'None.')));
    }
    try { await draw(); } catch (e) { clear(dr).appendChild(el('div', { cls: 'err' }, [e.message])); }
  }
  function menu(anchor, items) {
    var r = anchor.getBoundingClientRect();
    var m = el('div', { cls: 'menu', role: 'menu', style: { top: r.bottom + 6 + 'px', left: Math.min(r.left, innerWidth - 240) + 'px' } }, items.map(function (it) { return it === '-' ? el('hr') : el('button', { role: 'menuitem', on: { click: function () { closeOverlays(); it[1](); } } }, [it[2] ? ic(it[2]) : null, it[0]]); }));
    overlay(m);
  }
  function palette() {
    if (document.querySelector('.palette')) return;
    var input = el('input', { placeholder: 'Search people, centres, or jump to…', 'aria-label': 'Search' }), list = el('div', { cls: 'list' }), items = [], sel = 0, t;
    var box = overlay(el('div', { cls: 'palette', role: 'dialog' }, [el('div', { cls: 'in' }, [ic('search', 'faint'), input, el('kbd', null, ['esc'])]), list]));
    var pages = []; NAV.forEach(function (g) { g[1].forEach(function (i) { pages.push({ t: i[1], s: g[0], icon: i[2], go: function () { go(i[0]); } }); }); });
    pages.push({ t: 'Switch light / dark', s: 'Action', icon: 'moon', go: toggleTheme }, { t: 'Keyboard shortcuts', s: 'Help', icon: 'keyboard', go: help });
    function draw(groups) { clear(list); items = []; groups.forEach(function (g) { if (!g.items.length) return; list.appendChild(el('div', { cls: 'g' }, [g.name])); g.items.forEach(function (it) { var n = el('div', { cls: 'it', on: { click: function () { closeOverlays(); it.go(); }, mousemove: function () { sel = items.indexOf(ref); mark(); } } }, [it.av ? avatar(it.t, it.sq ? 'sq' : '') : ic(it.icon || 'chev'), el('span', null, [it.t]), el('small', null, [it.s || ''])]); var ref = { n: n, go: it.go }; items.push(ref); list.appendChild(n); }); }); sel = Math.min(sel, Math.max(items.length - 1, 0)); mark(); }
    function mark() { items.forEach(function (it, i) { it.n.classList.toggle('sel', i === sel); if (i === sel) it.n.scrollIntoView({ block: 'nearest' }); }); }
    input.addEventListener('input', function () {
      clearTimeout(t); var q = input.value.trim().toLowerCase(); sel = 0;
      var pg = pages.filter(function (p) { return !q || p.t.toLowerCase().indexOf(q) >= 0; });
      draw([{ name: 'Go to', items: pg }]);
      if (q.length < 2) return;
      t = setTimeout(async function () { var r = await call('GET', '/admin/api/search?q=' + encodeURIComponent(q)); if (input.value.trim().toLowerCase() !== q) return; draw([{ name: 'People', items: r.users.map(function (u) { return { t: u.name || u.phone, s: u.phone, av: true, go: function () { openUser(u.id); } }; }) }, { name: 'Centres', items: r.institutes.map(function (i) { return { t: i.name, s: 'Centre', av: true, sq: true, go: function () { go('centre', i.id); } }; }) }, { name: 'Go to', items: pg }]); }, 180);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); mark(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); mark(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { var g = items[sel].go; closeOverlays(); g(); }
    });
    draw([{ name: 'Go to', items: pages }]); input.focus();
    return box;
  }
  function help() {
    var rows = [['Search anything', '⌘ K'], ['Go to Overview', 'g o'], ['Go to Analytics', 'g a'], ['Go to Centres', 'g c'], ['Go to Logins', 'g l'], ['Go to Live activity', 'g f'], ['Go to WhatsApp', 'g w'], ['Go to System health', 'g s'], ['Toggle light / dark', 't'], ['Collapse the sidebar', '['], ['Close a panel', 'esc'], ['This help', '?']];
    overlay(el('div', { cls: 'palette', role: 'dialog', style: { padding: '22px 24px' } }, [el('h3', { style: { margin: '0 0 14px' } }, ['Keyboard shortcuts']), el('div', { cls: 'helpgrid' }, rows.reduce(function (a, r) { return a.concat([el('span', null, [r[0]]), el('span', null, r[1].split(' ').map(function (k) { return el('kbd', { style: { marginLeft: '4px' } }, [k]); }))]); }, []))]));
  }
  async function bell(anchor) {
    var r = await call('GET', '/admin/api/events?limit=40'), seen = ls.getItem('adm-seen') || '';
    ls.setItem('adm-seen', new Date().toISOString()); updateBell(0);
    var rr = anchor.getBoundingClientRect();
    overlay(el('div', { cls: 'menu notif', style: { top: rr.bottom + 6 + 'px', left: Math.max(10, rr.right - 380) + 'px' } }, [el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 10px' } }, [el('b', null, ['Notifications']), el('button', { cls: 'btn ghost', on: { click: function () { closeOverlays(); go('activity'); } } }, ['Open feed'])]), el('div', { cls: 'rows' }, r.events.length ? r.events.map(function (e) { var row = evRow(e, true); if (seen && e.at > seen) row.style.background = cssv('--accent-soft'); return row; }) : [empty('bell', 'All caught up.')])]));
  }
  var bellCount = 0;
  function updateBell(n) { bellCount = n; var d = document.querySelector('.bell .dot'); if (d) { d.textContent = n > 99 ? '99+' : String(n); d.style.display = n ? '' : 'none'; } }
  async function pollBell() { try { var seen = ls.getItem('adm-seen'); if (!seen) { ls.setItem('adm-seen', new Date().toISOString()); return; } var r = await call('GET', '/admin/api/events?limit=100&kinds=signup,centre,payment,message-failed,plan'); updateBell(r.events.filter(function (e) { return e.at > seen; }).length); } catch { /* quiet */ } }

  /* ---------------- shell ---------------- */
  function toggleTheme() { var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; ls.setItem('adm-theme', cur); applyTheme(); render(); }
  function applyTheme() { var t = ls.getItem('adm-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme', t); }
  var crumbEl = null;
  function setCrumb(title, sub) { if (!crumbEl) return; clear(crumbEl); crumbEl.appendChild(el('small', null, [sub])); crumbEl.appendChild(el('h1', null, [title])); document.title = title + ' · Chalkpis Admin'; }
  var VIEWS = { overview: overview, analytics: analytics, cohorts: cohortsView, centres: centres, logins: logins, leaders: leaders, activity: activity, whatsapp: whatsapp, announce: announce, signins: signins, audit: audit, system: system };
  // The sidebar always opens a list unfiltered; a shortcut such as Overview's "Needs attention > All" may preset one.
  function resetFilters(view) {
    if (view === 'centres') st.inst = { q: '', sort: 'activity', filter: 'all', tag: '' };
    if (view === 'logins') st.users = { q: '', filter: 'all', offset: 0 };
    if (view === 'whatsapp') st.msg = { status: 'all', type: '' };
  }
  var seq = 0;
  async function render() {
    var t = tok(); closeOverlays(); clearInterval(liveTimer);
    if (!t) return boot();
    var r = route(), my = ++seq;
    var shell = el('div', { cls: 'shell' + (st.collapsed ? ' collapsed' : '') });
    var side = el('aside', { cls: 'side', 'aria-label': 'Main' }, [el('div', { cls: 'brand' }, [logo('full'), el('img', { cls: 'mark', src: '/admin-logo/logo-mark.svg', alt: 'Chalkpis' }), el('span', { cls: 'badge' }, ['Admin'])])]);
    NAV.forEach(function (g) {
      side.appendChild(el('div', { cls: 'grp' }, [g[0]]));
      g[1].forEach(function (i) { var on = r.view === i[0] || (r.view === 'centre' && i[0] === 'centres'); side.appendChild(el('button', { cls: 'navi' + (on ? ' on' : ''), title: i[1], 'aria-current': on ? 'page' : null, on: { click: function () { shell.classList.remove('open'); resetFilters(i[0]); go(i[0]); } } }, [ic(i[2]), el('span', { cls: 'label' }, [i[1]])])); });
    });
    side.appendChild(el('div', { cls: 'spacer' }));
    side.appendChild(el('button', { cls: 'navi hide-sm', title: 'Collapse sidebar', on: { click: function () { st.collapsed = !st.collapsed; ls.setItem('adm-side', st.collapsed ? '1' : '0'); shell.classList.toggle('collapsed', st.collapsed); } } }, [ic('sidebar'), el('span', { cls: 'label' }, ['Collapse'])]));
    side.appendChild(el('div', { cls: 'me' }, [avatar(t.email), el('div', { style: { minWidth: 0 } }, [el('div', { cls: 'ellipsis', style: { fontWeight: 600 } }, ['Admin']), el('div', { cls: 'xs muted ellipsis' }, [t.email])])]));
    crumbEl = el('div', { cls: 'crumbs' });
    var liveBtn = el('button', { cls: 'livechip' + (st.live ? ' on' : ''), title: 'Refresh every 30 seconds', on: { click: function () { st.live = !st.live; ls.setItem('adm-live', st.live ? '1' : '0'); render(); } } }, [el('i'), st.live ? 'Live' : 'Paused']);
    var bellBtn = el('button', { cls: 'btn icon bell', 'aria-label': 'Notifications', on: { click: function (e) { bell(e.currentTarget); } } }, [ic('bell'), el('span', { cls: 'dot', style: { display: bellCount ? '' : 'none' } }, [String(bellCount)])]);
    var top = el('header', { cls: 'topbar' }, [
      el('button', { cls: 'btn icon only-sm', 'aria-label': 'Menu', on: { click: function () { shell.classList.toggle('open'); } } }, [ic('menu')]),
      crumbEl,
      el('button', { cls: 'search', on: { click: palette } }, [ic('search'), el('span', null, ['Search']), el('kbd', null, ['⌘K'])]),
      el('span', { cls: 'hide-sm' }, [liveBtn]), bellBtn,
      el('button', { cls: 'btn icon', 'aria-label': 'Account', on: { click: function (e) { menu(e.currentTarget, [['Light / dark', toggleTheme, document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon'], ['Keyboard shortcuts', help, 'keyboard'], '-', ['Sign out', async function () { await fetch('/admin/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t.token } }).catch(function () {}); ss.removeItem('adm'); boot(); }, 'logout']]); } } }, [avatar(t.email)]),
    ]);
    var content = el('main', { cls: 'content' }, [el('div', { cls: 'grid g4' }, [sk(130), sk(130), sk(130), sk(130)]), el('div', { style: { height: '16px' } }), sk(300)]);
    // phones: the sidebar slides over a dimmed page; tapping the page closes it
    var backdrop = el('div', { cls: 'side-scrim', 'aria-hidden': 'true', on: { click: function () { shell.classList.remove('open'); } } });
    shell.appendChild(side); shell.appendChild(backdrop); shell.appendChild(el('div', { cls: 'main' }, [top, content]));
    clear(app).appendChild(shell);
    var title = r.view === 'centre' ? ['Centre', 'Customers'] : TITLES[r.view] || TITLES.overview;
    setCrumb(title[0], title[1]);
    try {
      var tmp = el('div');
      await (r.view === 'centre' ? centre(tmp, r.id) : VIEWS[r.view](tmp));
      if (my !== seq) return;
      clear(content); while (tmp.firstChild) content.appendChild(tmp.firstChild);
    } catch (e) {
      if (my !== seq) return;
      if (e.code === 'forbidden' || e.code === 'unauthorized') { ss.removeItem('adm'); return boot(); }
      clear(content).appendChild(card('Could not load this page', e.message, el('button', { cls: 'btn', on: { click: render } }, [ic('refresh'), 'Try again'])));
    }
    if (st.live && r.view !== 'activity') liveTimer = setInterval(function () { if (!document.querySelector('.drawer,.palette,.menu') && document.visibilityState === 'visible') render(); }, 30000);
  }
  function boot() {
    clearInterval(bellTimer); applyTheme();
    if (!tok()) { clear(app).appendChild(loginView()); return; }
    render(); pollBell(); bellTimer = setInterval(pollBell, 60000);
  }

  /* ---------------- keyboard ---------------- */
  var gPending = false;
  document.addEventListener('keydown', function (e) {
    if (!tok()) return;
    var typing = /input|textarea|select/i.test((e.target && e.target.tagName) || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    if (e.key === 'Escape') { closeOverlays(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (gPending) { gPending = false; var m = { o: 'overview', a: 'analytics', c: 'centres', l: 'logins', f: 'activity', w: 'whatsapp', s: 'system', r: 'cohorts', n: 'announce' }[e.key]; if (m) { e.preventDefault(); go(m); } return; }
    if (e.key === 'g') { gPending = true; setTimeout(function () { gPending = false; }, 900); return; }
    if (e.key === '/') { e.preventDefault(); palette(); }
    else if (e.key === '?') help();
    else if (e.key === 't') toggleTheme();
    else if (e.key === '[') { st.collapsed = !st.collapsed; ls.setItem('adm-side', st.collapsed ? '1' : '0'); var sh = document.querySelector('.shell'); if (sh) sh.classList.toggle('collapsed', st.collapsed); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!ls.getItem('adm-theme')) { applyTheme(); if (tok()) render(); } });
  boot();
})();
