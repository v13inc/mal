#!/Users/v13inc/bin/iojs --es_staging --harmony_arrow_functions --harmony_arrays

var readline = require('readline-sync');

// 
// Utils
//

// list helpers
const map = (list, func) => [].map.call(list, func);
const slice = (list, start, end) => [].slice.call(list, start, end);
const reduce = (list) => [].reduce.apply(list, slice(arguments, 1));
const shift = (list) => [].shift.call(list);
const bind = (func) => func.bind.apply(func, slice(arguments, 1));
const head = (list) => list[0];
const tail = (list) => slice(list, 1);
const list = () => slice(arguments);

// hash helpers
const each = (obj, func) => { for(var i in obj) if(obj.hasOwnProperty(i)) call(func, i, obj[i], obj) };
const addCharKeys = (obj, keys, val) => map(keys, (k) => obj[k] = val);

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
const listToHashmap = (list) => {
  var hashmap = {}, key, prefix;
  map(list, (v, i) => !i % 2 ? key = v : hashmap[keyPrefixMap[key.type.name] + key.val] = v);
  return hashmap;
}
const hashmapToList = (hashmap) => {
  var list = [];
  each(hashmap, (k, v) => list.push(tagType(k.substr(1), types[keyPrefixList[k[0]]]), v));
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
// EVAL
//

// helpers
const operator = (type, func) => {
  const args = map(slice(arguments, 2), (i) => type.reader(i.val || i));
  return tagType(reduce(slice(args, 1), func, args[0]), type);
}

// root environment
var root = {
  '+': operator.bind(null, types.number, (a, b) => a + b),
  '-': operator.bind(null, types.number, (a, b) => a - b),
  '*': operator.bind(null, types.number, (a, b) => a * b),
  '/': operator.bind(null, types.number, (a, b) => a / b),
};

var evals = {
  default: (ast) => ast,
  symbol: (symbol, env) => env[symbol.val],
  list: (l, env) => ( l.val = map(l.val, (i) => eval(i, env)) ) && l,
  vector: (v, env) => ( v.val = map(v.val, (i) => eval(i, env)) ) && v,
  hashmap: (h, env) => each(h.val, (k, v) => h.val[k] = eval(v, env)) || h,
}

const eval = (ast, env) =>
  !ast.type
    ? map(ast, (i) => eval(i, env))
    : ast.type == types.list
      ? callList(evalAst(ast, env), env)
      : evalAst(ast, env)

const evalAst = (ast, env) => (evals[ast.type.name] || evals.default)(ast, env);
const callList = (list, env) => apply(head(list.val), tail(list.val));

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

var test = '{:a (+ 2 3)}';
//console.log(rep(test));
while(1) 
  try { console.log(rep(readline.question('user> ')).trim()) }
  catch(e) { console.log(e.stack) }
