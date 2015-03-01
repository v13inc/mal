var readline = require('readline-sync');

const READ = (str) => str;
const EVAL = (ast, env) => ast;
const PRINT = (exp) => exp;
const rep = (str) => PRINT(EVAL(READ(str), ''));

while(1) console.log(rep(readline.question('user> ')));
