// ../marches-deployment-20261018/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
var UnzipPassThrough = /* @__PURE__ */ (function() {
  function UnzipPassThrough2() {
  }
  UnzipPassThrough2.prototype.push = function(data, final) {
    this.ondata(null, data, final);
  };
  UnzipPassThrough2.compression = 0;
  return UnzipPassThrough2;
})();
var UnzipInflate = /* @__PURE__ */ (function() {
  function UnzipInflate2() {
    var _this = this;
    this.i = new Inflate(function(dat, final) {
      _this.ondata(null, dat, final);
    });
  }
  UnzipInflate2.prototype.push = function(data, final) {
    try {
      this.i.push(data, final);
    } catch (e) {
      this.ondata(e, null, final);
    }
  };
  UnzipInflate2.compression = 8;
  return UnzipInflate2;
})();
var Unzip = /* @__PURE__ */ (function() {
  function Unzip2(cb) {
    this.onfile = cb;
    this.k = [];
    this.o = {
      0: UnzipPassThrough
    };
    this.p = et;
  }
  Unzip2.prototype.push = function(chunk, final) {
    var _this = this;
    if (!this.onfile)
      err(5);
    if (!this.p)
      err(4);
    if (this.c > 0) {
      var len = Math.min(this.c, chunk.length);
      var toAdd = chunk.subarray(0, len);
      this.c -= len;
      if (this.d)
        this.d.push(toAdd, !this.c);
      else
        this.k[0].push(toAdd);
      chunk = chunk.subarray(len);
      if (chunk.length)
        return this.push(chunk, final);
    } else {
      var f = 0, i = 0, is = void 0, buf = void 0;
      if (!this.p.length)
        buf = chunk;
      else if (!chunk.length)
        buf = this.p;
      else {
        buf = new u8(this.p.length + chunk.length);
        buf.set(this.p), buf.set(chunk, this.p.length);
      }
      var l = buf.length, oc = this.c, add = oc && this.d;
      var _loop_2 = function() {
        var _a2;
        var sig = b4(buf, i);
        if (sig == 67324752) {
          f = 1, is = i;
          this_1.d = null;
          this_1.c = 0;
          var bf = b2(buf, i + 6), cmp_1 = b2(buf, i + 8), u = bf & 2048, dd = bf & 8, fnl = b2(buf, i + 26), es = b2(buf, i + 28);
          if (l > i + 30 + fnl + es) {
            var chks_3 = [];
            this_1.k.unshift(chks_3);
            f = 2;
            var sc_1 = b4(buf, i + 18), su_1 = b4(buf, i + 22);
            var fn_1 = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u);
            if (sc_1 == 4294967295) {
              _a2 = dd ? [-2] : z64e(buf, i), sc_1 = _a2[0], su_1 = _a2[1];
            } else if (dd)
              sc_1 = -1;
            i += es;
            this_1.c = sc_1;
            var d_1;
            var file_1 = {
              name: fn_1,
              compression: cmp_1,
              start: function() {
                if (!file_1.ondata)
                  err(5);
                if (!sc_1)
                  file_1.ondata(null, et, true);
                else {
                  var ctr = _this.o[cmp_1];
                  if (!ctr)
                    file_1.ondata(err(14, "unknown compression type " + cmp_1, 1), null, false);
                  d_1 = sc_1 < 0 ? new ctr(fn_1) : new ctr(fn_1, sc_1, su_1);
                  d_1.ondata = function(err2, dat3, final2) {
                    file_1.ondata(err2, dat3, final2);
                  };
                  for (var _i = 0, chks_4 = chks_3; _i < chks_4.length; _i++) {
                    var dat2 = chks_4[_i];
                    d_1.push(dat2, false);
                  }
                  if (_this.k[0] == chks_3 && _this.c)
                    _this.d = d_1;
                  else
                    d_1.push(et, true);
                }
              },
              terminate: function() {
                if (d_1 && d_1.terminate)
                  d_1.terminate();
              }
            };
            if (sc_1 >= 0)
              file_1.size = sc_1, file_1.originalSize = su_1;
            this_1.onfile(file_1);
          }
          return "break";
        } else if (oc) {
          if (sig == 134695760) {
            is = i += 12 + (oc == -2 && 8), f = 3, this_1.c = 0;
            return "break";
          } else if (sig == 33639248) {
            is = i -= 4, f = 3, this_1.c = 0;
            return "break";
          }
        }
      };
      var this_1 = this;
      for (; i < l - 4; ++i) {
        var state_1 = _loop_2();
        if (state_1 === "break")
          break;
      }
      this.p = et;
      if (oc < 0) {
        var dat = f ? buf.subarray(0, is - 12 - (oc == -2 && 8) - (b4(buf, is - 16) == 134695760 && 4)) : buf.subarray(0, i);
        if (add)
          add.push(dat, !!f);
        else
          this.k[+(f == 2)].push(dat);
      }
      if (f & 2)
        return this.push(buf.subarray(i), final);
      this.p = buf.subarray(i);
    }
    if (final) {
      if (this.c)
        err(13);
      this.p = null;
    }
  };
  Unzip2.prototype.register = function(decoder) {
    this.o[decoder.compression] = decoder;
  };
  return Unzip2;
})();

// marches/reader.js
var MAX_TEXT = 5e5;
var MAX_PAGES = 150;
var asset = (name) => new URL("marches/vendor/" + name, location.href).href;
function xml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("XML externe non accept\xE9.");
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.querySelector("parsererror")) throw new Error("Document Office illisible.");
  return d;
}
var elements = (node, name) => [...node.getElementsByTagNameNS("*", name)];
function unpack(bytes) {
  const files = {};
  let total = 0, count = 0;
  files.skippedParts = [];
  const unzip = new Unzip((file) => {
    if (/^(word\/(media|header|footer|footnotes|endnotes|embeddings)|xl\/(media|drawings|embeddings))/.test(file.name)) files.skippedParts.push(file.name);
    if (!/^(word\/document\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml.rels|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml))$/.test(file.name)) return;
    if (++count > 200) throw new Error("Trop de feuilles dans ce document.");
    const chunks = [];
    file.ondata = (error, data, final) => {
      if (error) throw error;
      total += data.length;
      if (total > 16e6) {
        file.terminate();
        throw new Error("Document Office d\xE9compress\xE9 trop volumineux (16 Mo).");
      }
      chunks.push(data);
      if (final) {
        const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of chunks) {
          all.set(c, off);
          off += c.length;
        }
        files[file.name] = strFromU8(all);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(bytes, true);
  return files;
}
function office(bytes, name) {
  const files = unpack(bytes);
  const warnings = [];
  if (files.skippedParts.length) warnings.push("Le texte et les tableaux ont \xE9t\xE9 lus. V\xE9rifiez aussi les images, notes, en-t\xEAtes et objets int\xE9gr\xE9s dans l\u2019original.");
  let text = "", pages = 1;
  if (/\.docx$/i.test(name)) {
    const doc = xml(files["word/document.xml"] || "");
    const body = elements(doc, "body")[0];
    if (!body) throw new Error("Texte Word absent.");
    for (const node of body.children) {
      if (node.localName === "p") text += elements(node, "t").map((x) => x.textContent).join("") + "\n";
      else if (node.localName === "tbl") for (const row of elements(node, "tr")) text += elements(row, "tc").map((c) => elements(c, "t").map((t) => t.textContent).join(" ")).join(" | ") + "\n";
    }
    text = "[Document Word \u2014 paragraphes et tableaux]\n" + text;
  } else {
    const wb = xml(files["xl/workbook.xml"] || ""), rels = xml(files["xl/_rels/workbook.xml.rels"] || "");
    const shared = files["xl/sharedStrings.xml"] ? elements(xml(files["xl/sharedStrings.xml"]), "si").map((s) => elements(s, "t").map((t) => t.textContent).join("")) : [];
    const styles = files["xl/styles.xml"] ? xml(files["xl/styles.xml"]) : null, formats = Object.fromEntries((styles ? elements(styles, "numFmt") : []).map((n) => [n.getAttribute("numFmtId"), n.getAttribute("formatCode")]));
    const xf = styles ? elements(styles, "cellXfs")[0]?.children || [] : [], date1904 = elements(wb, "workbookPr")[0]?.getAttribute("date1904") === "1";
    const sheets = elements(wb, "sheet");
    pages = sheets.length;
    if (pages > 150) throw new Error("Maximum 150 feuilles par classeur.");
    for (const sheet of sheets) {
      const rid = sheet.getAttribute("r:id"), rel = elements(rels, "Relationship").find((r) => r.getAttribute("Id") === rid);
      let target = rel?.getAttribute("Target") || "";
      target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(target) || !files[target]) throw new Error("Feuille Excel non lisible.");
      text += "\n[Feuille " + sheet.getAttribute("name") + "]\n";
      const doc = xml(files[target]);
      for (const row of elements(doc, "row")) {
        const values = [];
        for (const cell of elements(row, "c")) {
          const type = cell.getAttribute("t"), raw = elements(cell, "v")[0]?.textContent || "";
          let value = type === "s" ? shared[Number(raw)] || "" : type === "inlineStr" ? elements(cell, "t").map((t) => t.textContent).join("") : raw;
          const fmt = xf[Number(cell.getAttribute("s") || 0)]?.getAttribute("numFmtId"), custom = (formats[fmt] || "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
          if (type !== "s" && raw !== "" && Number.isFinite(Number(raw)) && (Number(fmt) >= 14 && Number(fmt) <= 22 || /[dy]/i.test(custom))) {
            const date = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Number(raw) * 864e5);
            if (Number.isFinite(date.getTime())) value = date.toISOString().slice(0, 10);
          }
          if (elements(cell, "f").length && raw === "") warnings.push("Une formule Excel ne contient pas de r\xE9sultat enregistr\xE9 : ouvrir et recalculer le classeur.");
          if (value !== "") values.push(cell.getAttribute("r") + " : " + value);
        }
        text += values.join(" | ") + "\n";
        if (text.length > MAX_TEXT) throw new Error("Classeur trop long : maximum 500 000 caract\xE8res.");
      }
    }
  }
  if (text.length > MAX_TEXT) throw new Error("Document trop long : maximum 500 000 caract\xE8res.");
  return { text, method: "office", complete: !warnings.length, pages, warnings: [...new Set(warnings)] };
}
async function readDocument(file, progress = () => {
}, cancelled = () => false) {
  const check = () => {
    if (cancelled()) throw new Error("Lecture interrompue. Vous pouvez reprendre sans perdre les pi\xE8ces import\xE9es.");
  };
  const warnings = [];
  let worker = null, usedOcr = false;
  async function ocr(image) {
    check();
    usedOcr = true;
    if (!worker) {
      const { default: Tesseract } = await import("./vendor/ocr/tesseract.esm.min.js");
      const { createWorker } = Tesseract;
      worker = await createWorker("fra+eng", 1, { workerPath: asset("ocr/worker.min.js"), corePath: asset("ocr/core"), langPath: asset("ocr/lang"), workerBlobURL: false });
      await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300", tessedit_pageseg_mode: "3" });
    }
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const words = (data.blocks || []).flatMap((b) => b.paragraphs || []).flatMap((p) => p.lines || []).flatMap((l) => l.words || []).filter((w) => w.text?.trim() && w.bbox);
    if (words.length) {
      const rows = [];
      for (const w of words.sort((a, b) => a.bbox.y0 + a.bbox.y1 - (b.bbox.y0 + b.bbox.y1) || a.bbox.x0 - b.bbox.x0)) {
        const cy = (w.bbox.y0 + w.bbox.y1) / 2, h = w.bbox.y1 - w.bbox.y0;
        let row = rows.at(-1);
        if (!row || Math.abs(row.cy - cy) > Math.max(5, Math.min(row.h, h) * 0.55)) {
          row = { cy, h, words: [] };
          rows.push(row);
        }
        row.words.push(w);
      }
      data.text = rows.map((row) => row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(" ")).join("\n");
    }
    return data;
  }
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Maximum 5 Mo par pi\xE8ce.");
    check();
    if (/\.(docx|xlsx)$/i.test(file.name)) return office(new Uint8Array(await file.arrayBuffer()), file.name);
    if (/\.(txt|csv)$/i.test(file.name)) {
      const text = await file.text();
      if (text.length > MAX_TEXT) throw new Error("Texte trop long (500 000 caract\xE8res).");
      return { text, method: "text", complete: true, pages: 1, warnings };
    }
    if (/\.(png|jpe?g)$/i.test(file.name)) {
      progress("Reconnaissance du scan");
      const data = await ocr(file);
      if (data.confidence < 50 || !data.text.trim()) warnings.push("Scan peu lisible : v\xE9rifier le texte et les montants.");
      return { text: "[Page 1]\n" + data.text, method: "ocr", complete: !warnings.length, pages: 1, warnings };
    }
    if (!/\.pdf$/i.test(file.name)) throw new Error("Format non pris en charge.");
    const pdf = await import("./vendor/pdf.mjs");
    pdf.GlobalWorkerOptions.workerSrc = asset("pdf.worker.mjs");
    const document = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true }).promise;
    try {
      if (document.numPages > MAX_PAGES) throw new Error("Maximum 150 pages par pi\xE8ce ; d\xE9coupez le PDF en plusieurs pi\xE8ces.");
      let text = "";
      for (let i = 1; i <= document.numPages; i++) {
        check();
        progress("Page " + i + " / " + document.numPages);
        const page = await document.getPage(i), data = await page.getTextContent();
        let content = data.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("");
        if (content.trim().length < 80) {
          progress("Reconnaissance du scan \xB7 page " + i + " / " + document.numPages);
          const viewport = page.getViewport({ scale: 3 }), canvas = documentGlobalCanvas();
          const scale = Math.min(1, 3e3 / Math.max(viewport.width, viewport.height)), vp = page.getViewport({ scale: 3 * scale });
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          const result = await ocr(canvas);
          content = result.text;
          canvas.width = canvas.height = 1;
          if (result.confidence < 45 && content.trim()) warnings.push("Page " + i + " : reconnaissance incertaine, v\xE9rifier l\u2019original.");
        }
        text += "[Page " + i + "]\n" + content + "\n";
        page.cleanup();
        if (text.length > MAX_TEXT) throw new Error("PDF trop long : maximum 500 000 caract\xE8res par pi\xE8ce.");
      }
      if (!text.replace(/\[Page \d+\]/g, "").trim()) warnings.push("Aucun texte exploitable dans cette pi\xE8ce.");
      if (usedOcr) warnings.push("Les cases coch\xE9es, signatures et chiffres reconnus par OCR doivent \xEAtre v\xE9rifi\xE9s dans l\u2019original.");
      return { text, method: usedOcr ? "ocr" : "pdf", complete: !warnings.some((w) => /incertaine|Aucun texte/.test(w)), pages: document.numPages, warnings };
    } finally {
      await document.destroy();
    }
  } finally {
    if (worker) await worker.terminate();
  }
}
function documentGlobalCanvas() {
  return window.document.createElement("canvas");
}
export {
  readDocument
};
