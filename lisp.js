// -*- mode: js2; moz-minor-mode: nil; jsc-minor-mode: t; js-run: "lisp-tests.js" -*-
var util = require("util");
var assert = process.assert;

var I = {};

function _symbol (name) {
  this.name = name;
}

_symbol.prototype.toString = function toString () {
  return this.name;
};

function S(name) {
  if (I.hasOwnProperty(name))
    return I[name];
  return I[name] = new _symbol(name);
};

function symbolp (o) {
  return o instanceof _symbol;
};

var nil = S("nil");

function nullp (o) {
  return o === nil;
};

function _cons (car, cdr) {
  this.car = car;
  this.cdr = cdr;
}

_cons.prototype.toString = function toString () {
  var result = [];
  if (this.car == S("quote") && consp(this.cdr) && nullp(this.cdr.cdr))
    return "'" + repr(this.cdr.car);
  for (var c = this;; c = c.cdr) {
    if (consp(c))
      result.push(repr(c.car));
    else {
      if (!nullp(c))
        result.push(". " + repr(c));
      break;
    }
  }
  return '(' + result.join(" ") + ')';
};

function consp (o) {
  return o instanceof _cons;
}

function cons (car, cdr) {
  return new _cons(car, cdr);
}

function car (o) {
  return o.car;
}

function cdr (o) {
  return o.cdr;
}

function repr (x) {
  if (typeof(x) == "string")
    return '"' + x.replace(/"/g, '\\"') + '"';
  return String(x);
};

function list () {
  var tail = nil;
  for (var i = arguments.length - 1; i >= 0; --i)
    tail = cons(arguments[i], tail);
  return tail;
}

function listp (o) {
  return nullp(o) || consp(o);
}

function reverse (l) {
  var r = nil;
  for (; !nullp(l); l = cdr(l))
    r = cons(car(l), r);
  return r;
}

function append (l1, l2) {
  if (l1 === nil)
    return l2;
  var r = cons(car(l1), nil), tail = r;
  while ((l1 = cdr(l1)) !== nil) {
    tail.cdr = cons(car(l1));
    tail = tail.cdr;
  }
  tail.cdr = l2;
  return r;
}

function StringInputStream (string) {
  this._string = string;
  this._pos = 0;
  this._max = this._string.length;
}

StringInputStream.prototype.pos = function pos () {
  return this._pos;
};

StringInputStream.prototype.getc = function getc () {
  if (this._pos == this._max)
    return null;
  return this._string.charAt(this._pos++);
};

StringInputStream.prototype.readchar = function readchar () {
  var c = this.getc();
  if (c === null)
    throw new Error("StringInputStream.readchar(): EOF reached");
  return c;
};

StringInputStream.prototype.ungetc = function ungetc (c) {
  if (this._pos > 0 && this._string[this._pos - 1] == c)
    --this._pos;
  else { /* FIXME: { is just to make nodejs repl happy */
    throw new Error("StringInputStream.ungetc(): invalid argument");
  }
};

function LispReader (s) {
  this.s = s;
}

LispReader.prototype.readNumberOrSymbol = function readNumberOrSymbol () {
  var token = this.readToken();
  if (token == "")
    throw new Error("LispReader.readNumberOrSymbol(): EOF reached");
  if (/^[-+]?[0-9]+$/.test(token))
    return parseInt(token);
  if (/^[-+]?[0-9]*\.?[0-9]+(?:[dDeE][-+]?[0-9]+)?/.test(token))
    return parseFloat(token.replace(/d/g, "e"));
  return S(token);
};

LispReader.prototype.read = function read () {
  this.skipWhitespace();
  var c = this.s.getc();
  switch (c) {
  case "(":
    return this.readList();
  case '"':
    return this.readString();
  case "'":
    return this.readQuote();
  case null:
    throw new Error("LispReader.read(): EOF reached");
  default:
    this.s.ungetc(c);
    return this.readNumberOrSymbol();
  }
};

LispReader.prototype.readList = function readList () {
  var l = nil;
  var head = nil;
  while (true) {
    this.skipWhitespace();
    var c = this.s.readchar();
    switch (c) {
    case ")":
      return l;
    case ".":
      var c1 = this.s.readchar();
      if (" \n\t".indexOf(c1) < 0)
        this.s.ungetc(c1); // process the default case
      else {
        if (nullp(l))
          throw new Error("LispReader.readList(): invalid placement of the dot");
        head.cdr = this.read();
        return l;
      }
    default:
      this.s.ungetc(c);
      if (nullp(l)) {
        l = list(this.read());
        head = l;
      } else {
        head.cdr = list(this.read());
        head = head.cdr;
      }
    }
  }
  return null; /* never get there */
};

LispReader.prototype.readString = function readString () {
  var r = [];
  while (true) {
    var c = this.s.readchar();
    switch (c) {
    case '"':
      return r.join("");
    case "\\":
      c = this.s.readchar();
      if (c != "\\" && c != '"')
        throw new Error("Invalid escape char " + c);
    }
    r.push(c);
  }
  return null; /* never get there */
};

LispReader.prototype.readQuote = function readQuote () {
  return list(S("quote"), this.read());
};

LispReader.prototype.readToken = function readToken () {
  var c, token = [];
  while ((c = this.s.getc()) != null) {
    if (this.isTerminating(c)) {
      this.s.ungetc(c);
      break;
    }
    token.push(c);
  }
  return token.join("");
};

LispReader.prototype.skipWhitespace = function skipWhitespace () {
  while (true) {
    var c = this.s.getc();
    switch (c) {
    case " ":
    case "\n":
    case "\t":
      continue;
    case null:
      return;
    default:
      this.s.ungetc(c);
      return;
    }
  }
};

LispReader.prototype.isTerminating = function isTerminating (c) {
  return " \n\t()\"'".indexOf(c) >= 0;
};

function readFromString (str) {
  return new LispReader(new StringInputStream(str)).read();
}

function _conversionError (value, spec) {
  return new TypeError(
    "error converting " + util.inspect(value) + " using spec " + util.inspect(spec));
};

function naturalValue (v) {
  if (typeof(v) == "number" || typeof(v) == "string")
    return v;
  else if (symbolp(v))
    return v === nil ? null : v.name;
  else if (consp(v)) {
    var result = [];
    for (; v !== nil; v = cdr(v)) {
      if (consp(v))
        result.push(naturalValue(car(v)));
      else {
        result.push(naturalValue(v));
        break;
      }
    }
    return result;
  } else
    return v;
};

function plistValue (l, useNatural, map) {
  assert(!map || !useNatural);
  var origList = l;
  var result = {};
  for (; l !== nil; l = cdr(cdr(l))) {
    if (!consp(l) || !consp(cdr(l)))
      throw _conversionError(origList, "<plist>");
    var nameSym = car(l);
    if (!symbolp(nameSym))
      throw _conversionError(origList, "<plist>");
    var value = car(cdr(l));
    var targetName = nameSym.name.replace(/^.*:/, "").toLowerCase();
    if (useNatural)
      result[targetName] = naturalValue(value);
    else if (map) {
      if (!map.hasOwnProperty(targetName))
        continue;
      var mapSpec = map[targetName];
      if (typeof(mapSpec) == "object") {
        assert(mapSpec.spec);
        result[mapSpec.hasOwnProperty("name") ? mapSpec.name : targetName] =
          fromLisp(value, mapSpec.spec);
      } else {
        var arg = mapSpec.split(/:/);
        if (arg.length > 1)
          result[arg[1]] = fromLisp(value, arg[0]);
        else
          result[targetName] = fromLisp(value, arg[0]);
      }
    } else
      result[targetName] = value;
  }
  return result;
};

function plainList (l, spec) {
  var result = {};
  var origList = l;
  for (var i = 0; i < spec.length; ++i, l = cdr(l)) {
    if (l !== nil && !consp(l))
      throw _conversionError(origList, spec);
    var arg = spec[i].split(/:/);
    var type = arg[0];
    var name = arg[1];
    if (type == ">") {
      assert(i < spec.length - 1);
      type = spec[++i];
    }
    if (type == ">*") {
      assert(i < spec.length - 1);
      result[name] = fromLisp(l, spec[++i]);
      l = nil;
      break;
    }
    if (type == "R" || type == "R*") {
      result[name] = [];
      for (; l !== nil; l = cdr(l))
        result[name].push(type == "R*" ? car(l) : naturalValue(car(l)));
      break;
    }
    if (type == "RD" || type == "RD*") {
      result[name] = plistValue(l, type == "RD");
      l = nil;
      break;
    }
    if (l === nil)
      throw _conversionError(origList, spec);
    result[name] = fromLisp(car(l), type);
  }
  if (l !== nil)
    throw _conversionError(origList, spec);

  return result;
};

function fromLisp (o, spec) {
  if (typeof(spec) == "string") {
    switch (spec) {
    case 'S':
      if (!symbolp(o))
        throw _conversionError(o, spec);
      return nullp(o) ? null : o.name;
    case 's':
      if (typeof(o) != "string")
        throw _conversionError(o, spec);
      return o;
    case 'N':
      if (typeof(o) != "number")
        throw _conversionError(o, spec);
      return o;
    case 'D':
    case 'D*':
      return plistValue(o, spec == "D");
    case "@":
      return naturalValue(o);
    case '_':
      return o;
    }
  } else if (spec instanceof Array)
    return plainList(o, spec);
  else if (typeof(spec) == "object")
    return plistValue(o, false, spec);
  throw new Error("invalid destructuring type spec");
}

function naturalValueToLisp (v) {
  if (v === null)
    return nil;
  if (typeof(v) == "number" || typeof(v) == "string" || symbolp(v))
    return v;
  if (v instanceof Array) {
    var r = nil;
    for (var i = 0; i < v.length; ++i)
      r = cons(naturalValueToLisp(v[i]), r);
    return reverse(r);
  }
  if (typeof(v) != "object")
    throw _conversionError(v, "<natural>");
  var keys = [];
  for (var k in v) {
    if (v.hasOwnProperty(k))
      keys.push(k);
  }
  keys.sort();
  var r = nil;
  for (var i = 0; i < keys.length; ++i) {
    var keyNameSym = /:/.test(keys[i]) ? S(keys[i]) : S(":" + keys[i]);
    r = cons(naturalValueToLisp(v[keys[i]]), cons(keyNameSym, r));
  }
  return reverse(r);
};

function plistValueToLisp (o, useNatural) {
  var r = nil;
  var keys = [];
  for (var k in o) {
    if (o.hasOwnProperty(k))
      keys.push(k);
  }
  keys.sort();
  for (var i = 0; i < keys.length; ++i) {
    var v = o[keys[i]];
    if (useNatural)
      v = naturalValueToLisp(v);
    var keyNameSym = /:/.test(keys[i]) ? S(keys[i]) : S(":" + keys[i]);
    r = cons(v, cons(keyNameSym, r));
  }

  return reverse(r);
}

function mappedPlistValueToLisp (o, map) {
  var items = [];
  for (var k in map) {
    if (!map.hasOwnProperty(k))
      continue;
    var mapSpec = map[k];
    if (typeof(mapSpec) == "object") {
      assert(mapSpec.spec);
      items.push({ jsName: mapSpec.hasOwnProperty("name") ? mapSpec.name : k,
                   lispName: k, spec: mapSpec.spec });
    } else {
      var arg = mapSpec.split(/:/);
      items.push({ jsName: arg.length > 1 ? arg[1] : k,
                   lispName: k, spec: arg[0] });
    }
  }

  items.sort(function (a, b) {
               if (a.lispName < b.lispName)
                 return -1;
               else if (a.lispName > b.lispName)
                 return 1;
               return 0;
             });

  var r = nil;
  for (var i = 0; i < items.length; ++i) {
    if (!o.hasOwnProperty(items[i].jsName))
      continue;
    var v = toLisp(o[items[i].jsName], items[i].spec);
    var lispName = items[i].lispName;
    var keyNameSym = /:/.test(lispName) ? S(lispName) : S(":" + lispName);
    r = cons(v, cons(keyNameSym, r));
  }

  return reverse(r);
};

function plainListToLisp (o, spec) {
  var r = nil;
  if (typeof(o) != "object")
    throw _conversionError(o, spec);
  for (var i = 0; i < spec.length; ++i) {
    if (symbolp(spec[i])) {
      r = cons(spec[i], r);
      continue;
    }
    var arg = spec[i].split(/:/);
    var type = arg[0];
    var name = arg[1];
    if (!o.hasOwnProperty(name))
      throw _conversionError(o, spec);
    var v = o[name];

    if (type == ">") {
      assert(i < spec.length - 1);
      type = spec[++i];
    }

    switch (type) {
    case ">*":
      assert(i < spec.length - 1);
      return append(reverse(r), toLisp(v, spec[++i]));
    case "R":
      return append(reverse(r), naturalValueToLisp(v));
    case "R*":
      return append(reverse(r), list.apply(null, v));
    case "RD":
    case "RD*":
      return append(reverse(r), plistValueToLisp(v, type == "RD"));
    default:
      r = cons(toLisp(v, type), r);
    }
  }

  return reverse(r);
};

function toLisp (o, spec) {
  if (typeof(spec) == "string") {
    switch (spec) {
    case 'S':
      if (symbolp(o))
        return o;
      if (o === null)
        return nil;
      if (typeof(o) != "string")
        throw _conversionError(o, spec);
      return S(o);
    case 's':
      if (typeof(o) != "string")
        throw _conversionError(o, spec);
      return o;
    case 'N':
      if (typeof(o) != "number")
        throw _conversionError(o, spec);
      return o;
    case 'D':
    case 'D*':
      return plistValueToLisp(o, spec == "D");
    case "@":
      return naturalValueToLisp(o);
    case '_':
      return o === null ? nil : o;
    }
  } else if (spec instanceof Array)
    return plainListToLisp(o, spec);
  else if (typeof(spec) == "object")
    return mappedPlistValueToLisp(o, spec);
  throw new Error("invalid destructuring type spec");
}

exports.S = S;
exports.cons = cons;
exports.consp = consp;
exports.car = car;
exports.cdr = cdr;
exports.nil = nil;
exports.nullp = nullp;
exports.listp = listp;
exports.list = list;
exports.reverse = reverse;
exports.append = append;
exports.repr = repr;
exports.StringInputStream = StringInputStream;
exports.readFromString = readFromString;
exports.fromLisp = fromLisp;
exports.toLisp = toLisp;
