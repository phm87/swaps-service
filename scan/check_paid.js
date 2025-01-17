const asyncEachSeries = require('async/eachSeries');
const {broadcastChainTransaction} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {getPayment} = require('ln-service');
const {shuffle} = require('lodash');

const {claimTransaction} = require('./../swaps');
const {getChainFeeRate} = require('ln-service');
const {getInvoices} = require('./../lightning');
const getSwapStatus = require('./../service/get_swap_status');
const {getTransaction} = require('./../blocks');
const {getUtxo} = require('./../chain');
const {lightningDaemon} = require('./../lightning');
const {serverSwapKeyPair} = require('./../service');
const {swapParameters} = require('./../service');
const {swapScriptDetails} = require('./../swaps');
const {swapScriptInTransaction} = require('./../swaps');
const swapsFromOutputs = require('./../scan/swaps_from_outputs');

const {ceil} = Math;
const confTarget = 30;
const format = 'p2wpkh';
const maxTimeoutMs = 1000 * 60 * 60 * 24 * 30;
const {now} = Date;
const {parse} = JSON;

/** Check payments for outstanding swaps

  {
    cache: <Cache Name String>
    network: <Network Name String>
  }

  @returns via cbk
*/
module.exports = async ({cache, network}, cbk) => {
  if (!network) {
    return cbk([400, 'ExpectedNetworkToCheckPaidRequests']);
  }

  const after = new Date(now() - maxTimeoutMs).toISOString();
  const invoices = [];

  try {
    const lnd = lightningDaemon({network});

    const {invoices} = await getInvoices({after, lnd});

    await asyncEachSeries(shuffle(invoices), async invoice => {
      // Invoice description must be set
      if (!invoice.description) {
        return;
      }

      // Invoice description must be JSON
      try { parse(invoice.description); } catch (err) {
        return;
      }

      const swap = parse(invoice.description);

      // There must be a chain lnd to check paid via lnd methods
      try { lightningDaemon({network: swap.network}) } catch (err) {
        return;
      }

      const chainLnd = lightningDaemon({network: swap.network});
      const {id} = swap;
      const {script} = swap;

      // Swap details must be set
      if (!id || !swap.network || swap.vout === undefined) {
        return;
      }

      const {utxo} = await getUtxo({
        id,
        network: swap.network,
        vout: swap.vout,
      });

      const fundConfs = swapParameters({network: swap.network}).funding_confs;

      // The funding outpoint must be sufficiently confirmed
      if (!utxo || !utxo.conf_count || utxo.conf_count < fundConfs) {
        return;
      }

      const {swaps} = await swapsFromOutputs({
        cache,
        id,
        network: swap.network,
        outputs: [{
          script: Buffer.from(utxo.output_script, 'hex'),
          value: utxo.tokens,
        }],
      });

      await Promise.all(swaps.filter(n => n.type === 'funding').map(found => {
        return getSwapStatus({
          cache,
          id,
          block: utxo.block,
          invoice: found.invoice,
          network: swap.network,
          script: found.script,
        });
      }));

      let payment;

      try {
        payment = (await getPayment({lnd, id: invoice.secret})).payment;
      } catch (err) {
        return;
      }

      // There must have been a successful payment
      if (!payment || !payment.secret) {
        return;
      }

      const preimage = payment.secret;

      const swapKeyPair = serverSwapKeyPair({
        index: swap.index,
        network: swap.network,
      });

      const details = swapScriptDetails({script, network: swap.network});

      const {address} = await createChainAddress({
        format,
        is_unused: true,
        lnd: chainLnd,
      });

      const {transaction} = await getTransaction({id, network: swap.network});

      const fundingUtxos = swapScriptInTransaction({
        transaction,
        redeem_script: script,
      });

      const feeRate = await getChainFeeRate({
        confirmation_target: confTarget,
        lnd: chainLnd,
      });

      const claim = claimTransaction({
        preimage,
        current_block_height: swap.height,
        destination: address,
        fee_tokens_per_vbyte: feeRate.tokens_per_vbyte,
        network: swap.network,
        private_key: swapKeyPair.private_key,
        utxos: fundingUtxos.matching_outputs,
      });

      try {
        await broadcastChainTransaction({
          lnd: chainLnd,
          transaction: claim.transaction,
        });
      } catch (err) {
        return;
      }

      return;
    });

    return cbk();
  } catch (err) {
    return cbk([500, 'FailedToExecuteCheckPayment', {err}]);
  }
};
