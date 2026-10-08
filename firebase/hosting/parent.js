/* Parent page: read-only. Everything is drawn with textContent (never innerHTML), so nothing in the data
 * can inject markup, and the page's content-security policy allows no inline script. */
(function () {
  "use strict";

  var STR = {
    en: {
      title: "Student progress",
      attendance: "Attendance, last 30 days",
      fees: "Fees",
      payments: "Recent payments",
      present: "Present",
      late: "Late",
      absent: "Absent",
      noAttendance: "No attendance recorded in the last 30 days.",
      outstanding: "Balance due",
      allPaid: "All fees are paid. Thank you!",
      noFees: "No fees yet.",
      noPayments: "No payments yet.",
      fee: "Fee",
      paid: "paid",
      due: "due",
      dueOn: "Due",
      receipt: "Receipt",
      status_pending: "Pending",
      status_partial: "Part paid",
      status_paid: "Paid",
      status_waived: "Waived",
      mode_cash: "Cash",
      mode_upi: "UPI",
      mode_bank: "Bank",
      mode_other: "Other",
      validUntil: "This private link works until",
      readOnly: "This page is read-only.",
      contact: "Questions? Call",
      classN: "Class",
      loading: "Loading…",
      badTitle: "This link is not valid",
      badText:
        "It may have expired or been switched off. Please ask your tutor for a new link.",
      errTitle: "Could not load",
      errText: "Please check your internet and refresh the page.",
    },
    hi: {
      title: "विद्यार्थी की प्रगति",
      attendance: "उपस्थिति, पिछले 30 दिन",
      fees: "फीस",
      payments: "हाल के भुगतान",
      present: "उपस्थित",
      late: "देर से",
      absent: "अनुपस्थित",
      noAttendance: "पिछले 30 दिनों में कोई उपस्थिति दर्ज नहीं।",
      outstanding: "बाकी राशि",
      allPaid: "सारी फीस चुकाई जा चुकी है। धन्यवाद!",
      noFees: "अभी कोई फीस नहीं।",
      noPayments: "अभी कोई भुगतान नहीं।",
      fee: "फीस",
      paid: "चुकाया",
      due: "बाकी",
      dueOn: "देय",
      receipt: "रसीद",
      status_pending: "बाकी",
      status_partial: "आंशिक",
      status_paid: "चुकाया",
      status_waived: "माफ़",
      mode_cash: "नकद",
      mode_upi: "UPI",
      mode_bank: "बैंक",
      mode_other: "अन्य",
      validUntil: "यह निजी लिंक इस तारीख तक चलेगा:",
      readOnly: "यह पेज केवल पढ़ने के लिए है।",
      contact: "प्रश्न? कॉल करें",
      classN: "कक्षा",
      loading: "लोड हो रहा है…",
      badTitle: "यह लिंक सही नहीं है",
      badText:
        "हो सकता है इसकी समय-सीमा खत्म हो गई हो या इसे बंद कर दिया गया हो। कृपया अपने शिक्षक से नया लिंक माँगें।",
      errTitle: "लोड नहीं हो सका",
      errText: "कृपया इंटरनेट जाँचें और पेज ताज़ा करें।",
    },
  };

  var params = new URLSearchParams(location.search);
  var lang =
    params.get("lang") === "hi" || params.get("lang") === "en"
      ? params.get("lang")
      : (navigator.language || "").toLowerCase().indexOf("hi") === 0
        ? "hi"
        : "en";
  var view = null;
  var failure = null; // 'bad' | 'error'

  function t(key) {
    return (STR[lang] && STR[lang][key]) || STR.en[key] || key;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  var locale = function () {
    return lang === "hi" ? "hi-IN" : "en-IN";
  };
  function money(paise) {
    var hasPaise = Math.abs(paise) % 100 !== 0;
    return (
      "₹" +
      new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: hasPaise ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(paise / 100)
    );
  }
  function dateText(ymd, withYear) {
    var d = new Date(ymd + "T12:00:00+05:30");
    return d.toLocaleDateString(locale(), {
      day: "numeric",
      month: "short",
      year: withYear ? "numeric" : undefined,
      timeZone: "Asia/Kolkata",
    });
  }
  function monthText(period) {
    return new Date(period + "-01T12:00:00Z").toLocaleDateString(locale(), {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function chip(cls, text) {
    return el("span", "chip " + cls, text);
  }
  function card() {
    return el("section", "card");
  }

  function langSwitch() {
    var box = el("div", "lang");
    ["en", "hi"].forEach(function (code) {
      var b = el("button", null, code === "en" ? "EN" : "हि");
      b.type = "button";
      b.setAttribute("aria-pressed", String(lang === code));
      b.setAttribute("aria-label", code === "en" ? "English" : "हिन्दी");
      b.addEventListener("click", function () {
        lang = code;
        document.documentElement.lang = code;
        draw();
      });
      box.appendChild(b);
    });
    return box;
  }

  function header(inst) {
    var h = el("div", "head");
    if (
      inst &&
      typeof inst.logoUrl === "string" &&
      inst.logoUrl.indexOf("https://") === 0
    ) {
      var img = el("img", "logo");
      img.src = inst.logoUrl;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      h.appendChild(img);
    }
    h.appendChild(el("div", "name", inst ? inst.name : "TutorDesk"));
    h.appendChild(langSwitch());
    return h;
  }

  function attendanceCard(a) {
    var c = card();
    c.appendChild(el("h2", null, t("attendance")));
    if (!a.days.length) {
      c.appendChild(el("p", "muted", t("noAttendance")));
      return c;
    }
    c.appendChild(el("div", "big", a.pct === null ? "—" : a.pct + "%"));
    var chips = el("div", "chips");
    chips.appendChild(chip("ok", t("present") + " " + a.present));
    chips.appendChild(chip("warn", t("late") + " " + a.late));
    chips.appendChild(chip("bad", t("absent") + " " + a.absent));
    c.appendChild(chips);
    var grid = el("div", "days");
    a.days
      .slice()
      .reverse()
      .forEach(function (d) {
        var s = el("div", "day " + d.mark, d.mark);
        var label =
          dateText(d.date) +
          ": " +
          t(d.mark === "P" ? "present" : d.mark === "L" ? "late" : "absent");
        s.title = label;
        s.setAttribute("role", "img");
        s.setAttribute("aria-label", label);
        grid.appendChild(s);
      });
    c.appendChild(grid);
    return c;
  }

  function feesCard(f) {
    var c = card();
    c.appendChild(el("h2", null, t("fees")));
    if (!f.items.length) {
      c.appendChild(el("p", "muted", t("noFees")));
      return c;
    }
    c.appendChild(el("div", "muted", t("outstanding")));
    var big = el("div", "big", money(f.outstanding));
    big.style.color = f.outstanding ? "#8a5200" : "#1c7c3c";
    c.appendChild(big);
    if (!f.outstanding) c.appendChild(el("p", "muted", t("allPaid")));
    f.items.forEach(function (i) {
      var row = el("div", "row");
      var left = el("div");
      left.appendChild(
        el("div", "title", i.description + " · " + monthText(i.period)),
      );
      left.appendChild(
        el(
          "div",
          "sub",
          t("fee") +
            " " +
            money(i.net) +
            " · " +
            t("paid") +
            " " +
            money(i.paid) +
            " · " +
            t("dueOn") +
            " " +
            dateText(i.dueDate, true),
        ),
      );
      row.appendChild(left);
      var right = el("div", "amt");
      var cls =
        i.status === "paid"
          ? "ok"
          : i.status === "waived"
            ? "neutral"
            : i.status === "partial"
              ? "warn"
              : "bad";
      right.appendChild(chip(cls, t("status_" + i.status)));
      if (i.outstanding)
        right.appendChild(el("div", null, money(i.outstanding)));
      row.appendChild(right);
      c.appendChild(row);
    });
    return c;
  }

  function paymentsCard(list) {
    var c = card();
    c.appendChild(el("h2", null, t("payments")));
    if (!list.length) {
      c.appendChild(el("p", "muted", t("noPayments")));
      return c;
    }
    list.forEach(function (p) {
      var row = el("div", "row");
      var left = el("div");
      left.appendChild(el("div", "title", t("receipt") + " " + p.receiptNo));
      left.appendChild(
        el("div", "sub", dateText(p.date, true) + " · " + t("mode_" + p.mode)),
      );
      row.appendChild(left);
      row.appendChild(el("div", "amt", money(p.amount)));
      c.appendChild(row);
    });
    return c;
  }

  function footer(v) {
    var f = el("div", "foot");
    f.appendChild(
      el(
        "div",
        null,
        t("readOnly") +
          " " +
          t("validUntil") +
          " " +
          dateText(v.expiresAt.slice(0, 10), true) +
          ".",
      ),
    );
    if (v.institute.phone) {
      var p = el("div");
      p.appendChild(document.createTextNode(t("contact") + " "));
      var a = el("a", null, v.institute.phone);
      a.href = "tel:" + v.institute.phone.replace(/[^+\d]/g, "");
      p.appendChild(a);
      f.appendChild(p);
    }
    return f;
  }

  function draw() {
    var app = document.getElementById("app");
    while (app.firstChild) app.removeChild(app.firstChild);
    document.title = t("title");
    if (failure) {
      app.appendChild(header(null));
      var box = el("div", "error");
      box.appendChild(
        el("h1", null, t(failure === "bad" ? "badTitle" : "errTitle")),
      );
      box.appendChild(
        el("p", "muted", t(failure === "bad" ? "badText" : "errText")),
      );
      app.appendChild(box);
      return;
    }
    if (!view) {
      app.appendChild(el("p", "muted", t("loading")));
      return;
    }
    app.appendChild(header(view.institute));
    var who = card();
    who.appendChild(el("div", "student", view.student.name));
    if (view.student.className)
      who.appendChild(
        el("div", "muted", t("classN") + " " + view.student.className),
      );
    app.appendChild(who);
    app.appendChild(attendanceCard(view.attendance));
    app.appendChild(feesCard(view.fees));
    app.appendChild(paymentsCard(view.payments));
    app.appendChild(footer(view));
  }

  var parts = location.pathname.split("/").filter(Boolean);
  var token = parts[0] === "p" ? parts[1] : "";
  document.documentElement.lang = lang;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) {
    failure = "bad";
    draw();
    return;
  }

  fetch("/api/parent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  })
    .then(function (res) {
      if (res.status === 404) {
        failure = "bad";
        return null;
      }
      if (!res.ok) throw new Error("http");
      return res.json();
    })
    .then(function (data) {
      if (data) view = data;
      draw();
    })
    .catch(function () {
      failure = "error";
      draw();
    });
})();
