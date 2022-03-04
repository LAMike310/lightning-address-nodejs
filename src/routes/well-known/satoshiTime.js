const bitcoin = require('bitcoinjs-lib');
const bip32 = require('bip32');
const bip39 = require('bip39');

function getSatoshiTimeData(t) {
  let mnemonic = Array.from({ length: 23 }).map((x) => 'satoshi');
  mnemonic.push('birth');
  const seed = bip39.mnemonicToSeedSync(mnemonic.join(' '));
  const root = bip32.fromSeed(seed);
  var keyPair = bitcoin.ECPair.fromWIF(root.derivePath(`m/84'/0'/0'/0/${t}`).toWIF());
  const config = { pubkey: keyPair.publicKey };
  const { address } = bitcoin.payments.p2wpkh(config);
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    sst: address
  };
}

module.exports = {
  getSatoshiTimeData: getSatoshiTimeData
};
