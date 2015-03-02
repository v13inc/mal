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

// hash helpers
const each = (obj, func) => { for(var i in obj) if(obj.hasOwnProperty(i)) func(i, obj[i], obj) };
const addCharKeys = (obj, keys, val) => map(keys, (k) => obj[k] = val);
const merge = (obj) => map(slice(arguments, 1), (o) => each(o, (k, v) => obj[k] = v)) && obj;

// function helpers
const call = () => shift(arguments).apply(null, arguments);
const apply = (func, args) => func.apply(null, args);

// string helpers
const trimLast = (str) => str.substring(0, str.length - 1);

// 
// Type System
//

var types = { chars: {}, symbols: {} };

// helpers
const addType = (name, reader, printer) => types[name] = { name, reader, printer };
const tagType = (val, type) => ({ val, type });
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

// types
addType('symbol', (s) => String(s), (s) => String(s.val));
addType('keyword', (k) => String(k).substr(1), (k) => ':' + String(k.val));
addType('number', (n) => Number(n), (n) => String(n.val));
addType('nil', (n) => null, (n) => 'nil');
addType('boolean', (b) => !( b == 'false' ), (b) => String(b.val));
addType('string', (s) => val(s[0], ''), (s) => JSON.stringify(s.val));
addType('list', (l) => l, (l) => '(' + printAst(l.val) + ')');
addType('vector', (v) => v, (v) => '[' + printAst(v.val) + ']');
addType('hashmap', (h) => listToHashmap(h), (h) => '{' + printAst(hashmapToList(h.val)) + '}');
addType('comment', (c) => val(c[0], ''), (c) => '');

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

const tokenizeEnd = (s) => s;

// basic tokenizers
const seperator = (s) => {
  pushToken(s);
  return s.tokenize({ delims: s.delims, token: '', str: s.str, ast: s.ast, tokenize: s.tokenize });
}

// block tokenizers
const blockStart = (delims, endChar, type, s) => {
  pushToken(s);
  const s2 = s.tokenize({ delims: delims, token: '', str: s.str, ast: [], tokenize: s.tokenize });
  s.ast.push(readType(s2.ast, type));
  return s.tokenize({ delims: s.delims, token: s2.token, str: s2.str, ast: s.ast, tokenize: s.tokenize });
}

const blockEnd = (endChar, s) => {
  pushToken(s);
  return { delims: s.delims, token: '', str: s.str, ast: s.ast, tokenize: s.tokenize };
}

// string tokenizers
const escapeChar = (s) => {
  const chars = { t: '\t', n: '\n', r: '\r', f: '\f' };
  const c = chars[s.str[0]] || s.str[0];
  return s.tokenize({ 
    delims: s.delims, token: trimLast(s.token) + c, str: s.str.substr(1), ast: s.ast, tokenize: s.tokenize 
  });
}

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

// helpers
const operator = (type, func) => {
  const args = map(slice(arguments, 2), (i) => type.reader(i.val || i));
  return tagType(reduce(slice(args, 1), func, args[0]), type);
}

// root environment
var root = {
  parent: null, children: [], env: {
    '+': operator.bind(null, types.number, (a, b) => a + b),
    '-': operator.bind(null, types.number, (a, b) => a - b),
    '*': operator.bind(null, types.number, (a, b) => a * b),
    '/': operator.bind(null, types.number, (a, b) => a / b),
  }
};

const addEnv = (parent, env) => { 
  var newEnv = { parent, env: env || {}, children: [] };
  parent.children.push(newEnv);
  return newEnv;
}

const lookup = (env, key) => env.env[key] || lookup(env.parent, key);
const define = (env, key, val) => env.env[key] = val;

// 
// EVAL
//

// helpers

const defineAst = (env, symbol, ast) => define(env, symbol.val, eval(ast, env));

const evals = {
  default: (ast) => ast,
  symbol: (symbol, env) => lookup(env, symbol.val),
  list: (l, env) => ( l.val = map(l.val, (i) => eval(i, env)) ) && l,
  vector: (v, env) => ( v.val = map(v.val, (i) => eval(i, env)) ) && v,
  hashmap: (h, env) => each(h.val, (k, v) => h.val[k] = eval(v, env)) || h,
}

const builtins = {
  'def!': (ast, env) => defineAst(env, ast.val[1], ast.val[2]),
  'let*': (ast, env, e, s) => ( e = addEnv(env, {}) ) && map(ast.val[1].val, (v, i) => i % 2 ? defineAst(e, s, v) : s = v) && eval(ast.val[2], e)
}

const eval = (ast, env) =>
  !ast.type
    ? map(ast, (i) => eval(i, env))
    : ast.type == types.list
      ? callList(ast, env)
      : evalAst(ast, env)

const evalAst = (ast, env) => (evals[ast.type.name] || evals.default)(ast, env);
const callListFunction = (ast, env) => ( list = evalAst(ast, env) ) && apply(head(list.val), tail(list.val));
const callList = (ast, env) => ( head(ast.val).type == types.symbol && builtins[head(ast.val).val] || callListFunction )(ast, env);

// 
// PRINT
//

const printAst = (ast) =>
  ast && ast.type 
    ? ast.type.printer(ast) 
    : ast && ast.length 
      ? map(ast, printAst).join(' ')
      : ''

// 
// Main
//

const READ = (str) => readString(str);
const EVAL = (ast, env) => eval(ast, env);
const PRINT = (exp) => printAst(exp);

const rep = (str) => PRINT(EVAL(READ(str), root));

//var test = '{:a (+ 2 3)}';
//var test = '(let* (p (+ 2 3) q (+ 2 p)) (+ p q))';
//var test = '(let* [p (+ 2 3) q (+ 2 p)] (+ p q))';
var test = '(let* (a 5 b {:a :foo}) [3 4 a [b 7] 8])';
//var test = '(let* (p 2 q 3) (+ p q))';
//console.log(rep(test));
while(1) 
  try { console.log(rep(readline.question('user> ')).trim()) }
  catch(e) { console.log(e.stack) }
