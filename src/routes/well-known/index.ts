import { lightningApi } from '../../shared/lnd/api';
import logger from '../../shared/logger';
import { Router } from 'express';
import crypto from 'crypto';
import bip32 from 'bip32';
import bip39 from 'bip39';
const wordList = require('./wordList');
const hexToBinary = require('hex-to-binary');

let hexArray = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f'
];
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
    try {
      logger.debug('Generating LND Invoice');
      logger.debug(preimage.toString('base64'));
      const invoice = await lightningApi.lightningAddInvoice({
        value_msat: msat as string,
        r_preimage: preimage.toString('base64')
      });
      logger.debug('LND Invoice', invoice);

      // lightningApi.sendWebhookNotification(invoice);
      hexArray.map((h) => {
        let mnemonic = hexToBinary(`${preimage.toString('hex')}${h}`)
          .split(/(.{11})/)
          .filter((O: any) => O)
          .map((a: string) => parseInt(a, 2).toString())
          .map((n: any) => wordList[Number(n)])
          .join(' ');
        if (bip39.validateMnemonic(mnemonic)) {
          console.log(mnemonic);
          logger.debug('mnemonic', mnemonic);
          return res.status(200).json({
            status: 'OK',
            successAction: { tag: 'halo', address: mnemonic },
            routes: [],
            pr: invoice.payment_request,
            disposable: false
          });
        }
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
