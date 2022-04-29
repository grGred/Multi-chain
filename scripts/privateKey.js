var keythereum = require("keythereum");
var datadir = "./";
var address= "fe99d38697e107fdac6e4bfef876564f70041594";
const password = "";
var keyObject = keythereum.importFromFile(address, datadir);
var privateKey = keythereum.recover(password, keyObject);
console.log(privateKey.toString('hex'));
