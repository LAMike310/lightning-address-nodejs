import { lightningApi } from '../../shared/lnd/api';
import logger from '../../shared/logger';
import { Router } from 'express';
import crypto from 'crypto';
const { wordList } = require('./wordList');
var hexToBinary = require('hex-to-binary');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function generateFullBinary({ entropy, bits = 128 }) {
  const { stdout, stderr } = await exec(`echo ${entropy} | shasum -0 -a 256`);

  if (bits == 256) {
    return `${entropy}${hexToBinary(stdout[0])}${hexToBinary(stdout[1])}`;
  }
  return `${entropy}${hexToBinary(stdout[0])}`;
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
    let fullBinary = await generateFullBinary({
      entropy: hexToBinary(preimage.toString('hex')),
      bits: 256
    });
    let mnemonic = fullBinary
      .split(/(.{11})/)
      .filter((O) => O)
      .map((a) => parseInt(a, 2).toString())
      .map((n) => wordList[Number(n)])
      .join(' ');
    logger.debug(mnemonic);
    try {
      logger.debug('Generating LND Invoice');
      logger.debug(preimage.toString('base64'));
      const invoice = await lightningApi.lightningAddInvoice({
        value_msat: msat as string,
        r_preimage: preimage.toString('base64')
      });
      logger.debug('LND Invoice', invoice);
      logger.debug(preimage.toString('hex'));
      // lightningApi.sendWebhookNotification(invoice);
      return res.status(200).json({
        status: 'OK',
        successAction: { tag: 'halo', address: mnemonic },
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
