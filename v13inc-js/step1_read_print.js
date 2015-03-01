#!/Users/v13inc/bin/iojs --es_staging --harmony_arrow_functions

var readline = require('readline-sync');

// 
// Utils
//

const map = (list, func) => [].map.call(list, func);
const trimLast = (str) => str.substring(0, str.length - 1);
const addCharKeys = (obj, keys, val) => map(keys, (k) => obj[k] = val);

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
  for(var i in hashmap) if(hashmap.hasOwnProperty(i)) {
    list.push(tagType(i.substr(1), types[keyPrefixList[i[0]]])); list.push(hashmap[i]);
  }
  return list;
}

// types
addType('symbol', (s) => String(s), (s) => String(s.val));
addType('keyword', (k) => String(k).substr(1), (k) => ':' + String(k.val));
addType('number', (n) => String(n), (n) => String(n.val));
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
// Parser 
//

// helpers
const pushToken = (s) => s.token.length > 1 && s.ast.push(readToken(trimLast(s.token))) ? s : s;
const readString = (str) => tokenize({ delims: delims.list, token: '', str: str + '\n', ast: [], tokenize }).ast;
const tokenType = (token) => types.symbols[token] || types.chars[token[0]] || types.symbol;
const readToken = (token) => readType(token, tokenType(token));
const mismatchError = (endChar) => new Error("expected '" + endChar + "', got EOF");

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
// PRINTER
//

const printAst = (ast) => {
  if(typeof ast == 'undefined') return '';
  if(ast.type) return ast.type.printer(ast);
  if(!ast.length) return '';
  return map(ast, printAst).join(' ');
}

// 
// Main
//

const printer = (ast) => JSON.stringify(ast);

const READ = (str) => readString(str);
const EVAL = (ast, env) => ast;
const PRINT = (exp) => printAst(exp);

const rep = (str) => PRINT(EVAL(READ(str), ''));

while(1) 
  try { console.log(rep(readline.question('user> ')).trim()) }
  catch(e) { console.log(e.message) }
