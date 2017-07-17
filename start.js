let IO = require('./atajo.io');


var args = process.argv.splice(process.execArgv.length + 2);

if (!args[0] || (['dev', 'qas', 'prd'].indexOf(args[0]) == -1)) {
    console.error("Release not defined - e.g. node io/start.js dev domain secret");
    process.exit(1);
} else if (!args[1]) {
    console.error("Domain not defined - e.g. node io/start.js dev domain secret");
    process.exit(1);
} else if (!args[2]) {
    console.error("Secret not defined - e.g. node io/start.js dev domain secret");
    process.exit(1);
}

let provider = new IO(args[0], args[1], args[2]);