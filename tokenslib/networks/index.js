const bcashregtest = require('./bcashregtest');
const bch = require('./bch');
const bchtestnet = require('./bchtestnet');
const bcoinregtest = require('./bcoinregtest');
const bitcoin = require('./bitcoin');
const kmd = require('./kmd');
const ltc = require('./ltc');
const ltcregtest = require('./ltcregtest');
const ltctestnet = require('./ltctestnet');
const regtest = require('./regtest');
const testnet = require('./testnet');

/** Supported network attributes
*/
module.exports = {
  bcashregtest,
  bch,
  bchtestnet,
  bcoinregtest,
  bitcoin,
  kmd,
  ltc,
  ltcregtest,
  ltctestnet,
  regtest,
  testnet,
};

