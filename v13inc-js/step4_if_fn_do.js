#!/Users/v13inc/bin/iojs --es_staging --harmony_arrow_functions --harmony_arrays

var readline = require('readline-sync');

// 
// Utils
//

// list helpers
const map = () => [].map.apply(arguments[0], slice(arguments, 1));
const slice = (list, start, end) => [].slice.call(list, start, end);
const reduce = (list) => [].reduce.apply(list, slice(arguments, 1));
const shift = (list) => [].shift.call(list);
const bind = (func) => func.bind.apply(func, slice(arguments, 1));
const head = (list) => list[0];
const tail = (list) => slice(list, 1);
const last = (list) => list[list.length - 1];

// hash helpers
const each = (obj, func) => { for(var i in obj) if(obj.hasOwnProperty(i)) func(i, obj[i], obj) };
const addCharKeys = (obj, keys, val) => map(keys, (k) => obj[k] = val);
const merge = (obj) => map(slice(arguments, 1), (o) => each(o, (k, v) => obj[k] = v)) && obj;

// function helpers
const call = () => shift(arguments).apply(null, arguments);
const apply = (func, args) => func.apply(null, args);

// string helpers
const trimLast = (str) => str.substring(0, str.length - 1);
const output = () => map(arguments, (s) => console.log(s)) || true;

// 
// Type System
//

var types = { chars: {}, symbols: {} };

// helpers
const addType = (name, reader, printer, readable) => types[name] = { name, reader, printer, readable };
const tagType = (val, type) => ({ val, type });
const tag = (name, val) => tagType(val, types[name]);
const readType = (val, type) => tagType(type.reader(val), type);
const val = (ast, def) => ast ? ast.val : def; 
const keyPrefixMap = { symbol: 0, string: 1, keyword: 2, number: 3 };
const keyPrefixList = ['symbol', 'string', 'keyword', 'number'];
const listToHashmap = (list, prefix) => {
  var hashmap = {}, key, prefix = prefix == null ? true : prefix;
  map(list, (v, i) => i % 2 ? hashmap[ (prefix ? keyPrefixMap[key.type.name] : '') + key.val] = v : key = v);
  return hashmap;
}
const hashmapToList = (hashmap, prefix, type) => {
  var list = [], prefix = prefix == null ? true : prefix, type = type == null ? types.string : type;
  each(hashmap, (k, v) => list.push(tagType(k.substr(1), prefix ? types[keyPrefixList[k[0]]] : type), v));
  return list;
}
const toBool = (ast) => !( ast.type == types.nil || (ast.type == types.boolean && ast.val === false) );
const isList = (l) => l.type == types.vector || l.type == types.list;
const equals = (a, b) => isList(a) ? isList(b) && listEquals(a, b) : a.type == b.type && a.val === b.val;
const listEquals = (a, b, m) => (m = a.val.length == b.val.length) && map(a.val, (v, i) => b.val[i] && equals(v, b.val[i]) || (m = false)) && m;

// types
addType('symbol', (s) => String(s), (s) => String(s.val));
addType('keyword', (k) => String(k).substr(1), (k) => ':' + String(k.val));
addType('number', (n) => Number(n), (n) => String(n.val));
addType('nil', (n) => null, (n) => 'nil');
const nil = tag('nil', null);
addType('boolean', (b) => !( b == 'false' ), (b) => String(b.val));
addType('string', (s) => val(s[0], ''), (s, r) => r ? JSON.stringify(s.val) : s.val);
addType('list', (l) => l, (l, r) => '(' + print(l.val, r) + ')');
addType('vector', (v) => v, (v, r) => '[' + print(v.val, r) + ']');
addType('hashmap', (h) => listToHashmap(h), (h, r) => '{' + print(hashmapToList(h.val), r) + '}');
addType('comment', (c) => val(c[0], ''), (c) => '');
addType('function', (f) => f, (f, r) => '(fn*' + print(f.val, r) + ')');
addType('native', (f) => f, (f) => '(<native>)');

// token type hints
types.symbols.nil = types.nil;
types.symbols.true = types.boolean;
types.symbols.false = types.boolean;
addCharKeys(types.chars, '0123456789', types.number);
addCharKeys(types.chars, ':', types.keyword);

// 
// READ
//

// helpers
const pushToken = (s) => s.token.length > 1 && s.ast.push(readToken(trimLast(s.token))) ? s : s;
const tokenType = (token) => types.symbols[token] || types.chars[token[0]] || types.symbol;
const readToken = (token) => readType(token, tokenType(token));
const mismatchError = (endChar) => new Error("expected '" + endChar + "', got EOF");

const readString = (str) =>
  tokenize({ delims: delims.list, token: '', str: str + '\n', ast: [], tokenize }).ast;

// default tokenizer (NOTE: str MUST end in whitespace!)
const tokenizeEnd = (s) => s;
const tokenize = (s) => {
  if(!s.str.length) return tokenizeEnd(s);
  const c = s.str[0];
  return (s.delims[c] || s.tokenize)({
    delims: s.delims,
    token: s.token + c,
    str: s.str.substr(1),
    ast: s.ast,
    tokenize: s.tokenize
  });
}


// basic tokenizers
const seperator = (s) => pushToken(s) && s.tokenize({ delims: s.delims, token: '', str: s.str, ast: s.ast, tokenize: s.tokenize });

// block tokenizers
const blockStart = (delims, endChar, type, s) => {
  pushToken(s);
  const s2 = s.tokenize({ delims: delims, token: '', str: s.str, ast: [], tokenize: s.tokenize });
  s.ast.push(readType(s2.ast, type));
  return s.tokenize({ delims: s.delims, token: s2.token, str: s2.str, ast: s.ast, tokenize: s.tokenize });
}

const blockEnd = (endChar, s) => pushToken(s) && { delims: s.delims, token: '', str: s.str, ast: s.ast, tokenize: s.tokenize };

// string tokenizers
const escapeChars = { t: '\t', n: '\n', r: '\r', f: '\f' };
const escapeChar = (s, c) => (c = escapeChars[s.str[0]] || s.str[0]) && s.tokenize({ delims: s.delims, token: trimLast(s.token) + c, str: s.str.substr(1), ast: s.ast, tokenize: s.tokenize });

// setup tokenizer lookups by delimiter
var delims = { list: {}, string: {}, comment: {} };

// basic lists
addCharKeys(delims.list, '(', blockStart.bind(null, delims.list, ')', types.list));
addCharKeys(delims.list, '[', blockStart.bind(null, delims.list, ']', types.vector));
addCharKeys(delims.list, '{', blockStart.bind(null, delims.list, '}', types.hashmap));
addCharKeys(delims.list, ' \t\r\n\f,', seperator);
addCharKeys(delims.list, ')', blockEnd.bind(null, ')'));
addCharKeys(delims.list, ']', blockEnd.bind(null, ']'));
addCharKeys(delims.list, '}', blockEnd.bind(null, '}'));

// strings
addCharKeys(delims.list, '"', blockStart.bind(null, delims.string, '"', types.string));
addCharKeys(delims.string, '"', blockEnd.bind(null, '"'));
addCharKeys(delims.string, '\\', escapeChar);

// comments
addCharKeys(delims.list, ';', blockStart.bind(null, delims.comment, '\n', types.comment));
addCharKeys(delims.comment, '\n', blockEnd.bind(null, '\n'));

// 
// ENV
//

// root environment
var root = { parent: null, children: [], env: {} };

// helpers
const newEnv = (parent, env, e) => parent.children.push(e = { parent, env: env || {}, children: [] }) && e;
const lookup = (env, key) => env ? env.env[key] || lookup(env.parent, key) : nil;
const define = (env, key, val) => env.env[key] = val;
const native = (key, func, type) => define(root, key, tag('native', () => tag(type, apply(func, arguments))));
const nativeVals = (key, func, type) => native(key, () => apply(func, map(arguments, val)), type);
const operator = (key, func) => native(key, (args) => ( args = map(arguments, (i) => types.number.reader(val(i))) ) && reduce(slice(args, 1), func, args[0]), 'number');

// 
// EVAL
//

// helpers

const defineAst = (env, symbol, ast) => define(env, symbol.val, eval(ast, env));
const defineEval = (key, body) => define(root, key, eval(readString(body)[0], root));
const newFunction = (env, args, body) => tag('function', [env, args, body]);
const evalFunction = (func, vs) => {
  var e = newEnv(func.val[0]), as = func.val[1], b = func.val[2], r = false;
  map(as.val, (v, i) => val(v) == '&' ? r = true : define(e, val(v), !r ? vs[i] : tag('list', slice(vs, i-1))));
  return eval(body, env);
}

const evals = {
  default: (ast) => ast,
  symbol: (symbol, env) => lookup(env, symbol.val),
  list: (l, env) => tag('list', map(l.val, (i) => eval(i, env))),
  vector: (v, env) => tag('vector', map(v.val, (i) => eval(i, env))),
  hashmap: (h, env, hh) => (hh = {}) || each(h.val, (k, v) => hh[k] = eval(v, env)) || tag('hashmap', hh),
}

const builtins = {
  'def!': (ast, env) => defineAst(env, ast.val[1], ast.val[2]),
  'let*': (ast, env, e, s) => ( e = newEnv(env, {}) ) && map(ast.val[1].val, (v, i) => i % 2 ? defineAst(e, s, v) : s = v) && eval(ast.val[2], e),
  'do': (ast, env) => last(map(slice(ast.val, 1), (v, i) => eval(v, env))),
  'if': (ast, env) => toBool(eval(ast.val[1], env)) ? eval(ast.val[2], env) : ast.val.length > 3 && eval(ast.val[3], env) || nil,
  'fn*': (ast, env) => newFunction(env, ast.val[1], ast.val[2]),
}

const eval = (ast, env) =>
  !ast.type
    ? map(ast, (i) => eval(i, env))
    : ast.type == types.list
      ? callList(ast, env)
      : evalAst(ast, env)

const evalAst = (ast, env) => (evals[ast.type.name] || evals.default)(ast, env);
const callListFunction = (ast, env) => {
  const list = evalAst(ast, env), func = head(list.val), args = tail(list.val);
  return func.type == types.function ? evalFunction(func, args) : apply(func.val, args);
}
const callList = (ast, env) => ( head(ast.val).type == types.symbol && builtins[head(ast.val).val] || callListFunction )(ast, env);

// 
// PRINT
//

const print = (ast, readable) => printAst(ast, readable, ' ');
const printAst = (ast, readable, join) =>
  ast && ast.type 
    ? ast.type.printer(ast, readable) 
    : ast && ast.length 
      ? map(ast, (a) => print(a, readable)).join(join)
      : ''

// 
// REPL
//

const READ = (str) => readString(str);
const EVAL = (ast, env) => eval(ast, env);
const PRINT = (exp) => print(exp, true);
const rep = (str, env) => PRINT(EVAL(READ(str), env || root));

// 
// Standard Library
//

native('=', equals, 'boolean');
native('!=', (a, b) => !equals(a, b), 'boolean');
nativeVals('<', (a, b) => a < b, 'boolean');
nativeVals('<=', (a, b) => a <= b, 'boolean');
nativeVals('>', (a, b) => a > b, 'boolean');
nativeVals('>=', (a, b) => a >= b, 'boolean');
operator('+', (a, b) => a + b);
operator('-', (a, b) => a - b);
operator('*', (a, b) => a * b);
operator('/', (a, b) => a / b);
native('list', () => arguments, 'list');
native('list?', (l) => l.type == types.list, 'boolean');
native('empty?', (l) => l.val ? l.val.length === 0 : false, 'boolean');
native('count', (l) => l.val && l.val.length ? l.val.length : 0, 'number');
native('pr-str', () => print(arguments, true), 'string');
native('prn', () => output(print(arguments, true)) || nil, 'nil');
native('println', () => output(print(arguments)) || nil, 'nil');
native('str', () => printAst(arguments, false, ''), 'string');
defineEval('not', '(fn* (a) (if a false true))');

//
// Main
// 

while(1) 
  try { output(rep(readline.question('user> ')).trim()) }
  catch(e) { output(e.name) }
