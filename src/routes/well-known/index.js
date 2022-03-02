import { lightningApi } from '../../shared/lnd/api';
import logger from '../../shared/logger';
import { Router } from 'express';
const bitcoin = require('bitcoinjs-lib');
const uniq = require('uniq');
const crypto = require('crypto');
const { wordList } = require('./wordList');
var hexToBinary = require('hex-to-binary');
const bip32 = require('bip32');
const bip39 = require('bip39');

let hexArray = '0123456789abcdef'.split('');
let hexIndex = 0;
let allPossibleEndings = [];

const findLastBits = (hash) => {
  if (hexIndex <= 16) {
    hexArray.map((h) => {
      logger.debug(`${hexArray[hexIndex]}${h}`);
      allPossibleEndings.push(`${hexArray[hexIndex]}${h}`);
    });
    hexIndex++;
    findLastBits(hash);
  }
  return uniq(allPossibleEndings).map((e) => `${hexToBinary(hash)}${hexToBinary(e)}`);
};

const splitBits = (a) =>
  a
    .split(/(.{11})/)
    .filter((O) => O)
    .map((a) => parseInt(a, 2).toString())
    .map((n) => wordList[Number(n)])
    .join(' ');

function getAddress(node) {
  const config = { pubkey: node.publicKey };
  const { address } = bitcoin.payments.p2wpkh(config);
  return address;
}

const DOMAIN = process.env.LNADDR_DOMAIN;

const router = Router();

if (!DOMAIN) {
  throw new Error('Missing LNADDR_DOMAIN env variable');
}

router.get('/lnurlp/:username', async (req, res) => {
  const username = req.params.username;

  logger.info('Lightning Address Request', req.params);

  if (!username) {
    return res.status(404).send('Username not found');
  }

  const identifier = `https://${DOMAIN}/.well-known/lnurlp/${username}`;
  const metadata = [
    ['text/identifier', identifier],
    ['text/plain', `Sats for ${username}!`]
  ];
  if (req.query.amount) {
    const msat = req.query.amount;
    const preimage = crypto.randomBytes(32);
    const preimageHex = preimage.toString('hex');
    let binarySeedArray = findLastBits(preimageHex).map((a) =>
      bip39.validateMnemonic(splitBits(a))
    );
    let getSeed = (preimage) => splitBits(findLastBits(preimage)[binarySeedArray.indexOf(true)]);
    let haloAddress = getAddress(
      bip32.fromSeed(bip39.mnemonicToSeedSync(getSeed(preimageHex))).derivePath(`m/84'/0'/0'/0/0`)
    );
    logger.debug('haloAddress', haloAddress);
    try {
      logger.debug('Generating LND Invoice');
      const invoice = await lightningApi.lightningAddInvoice({
        value_msat: msat,
        r_preimage: preimage.toString('base64')
      });
      // logger.debug('LND Invoice', invoice);
      // logger.debug(preimageHex);
      // lightningApi.sendWebhookNotification(invoice);
      return res.status(200).json({
        status: 'OK',
        successAction: { tag: 'halo', address: haloAddress },
        routes: [],
        pr: invoice.payment_request,
        disposable: false
      });
    } catch (error) {
      logger.error('Error creating Invoice', error);
      return res.status(500).json({ status: 'ERROR', reason: 'Error generating invoice' });
    }
  }

  // No amount present, send callback identifier
  return res.status(200).json({
    status: 'OK',
    callback: identifier,
    tag: 'payRequest',
    maxSendable: 250000000,
    minSendable: 1000,
    metadata: JSON.stringify(metadata),
    commentsAllowed: 0
  });
});

export { router as wellknown };