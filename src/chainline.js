import ScriptBuilder from './sc/scriptBuilder.js'
import { getAccountFromWIFKey } from './wallet'
import { getBalance, queryRPC, doInvokeScript } from './api'
import { fixed82num } from './utils'
import * as tx from './transactions/index.js'

export const Constants = {
  // HubContract revision 795d88a98f01953e0d2c969f049e59b8b514d05d
  HUB_SCRIPT_HASH: 'fe8ec60d009691abe25ba4050010092e947b735e'
}

export const generateWalletScript = (publicKeyHex) => `
  5fc56b6a51527ac46a51c34c097369676e61747572656175754c21
  ${publicKeyHex}
  6a52527ac44c20e72d286979ee6cb103e65dfddfb2e384100b8d148e7758de42e4168b71792c606a53
  527ac46a51c36a52c361617c651502009e630800006c7566616168164e656f2e52756e74696d652e47
  65745472696767657261619c5186009c630800516c75666161682953797374656d2e45786563757469
  6f6e456e67696e652e476574536372697074436f6e7461696e65726a54527ac46161682d5379737465
  6d2e457865637574696f6e456e67696e652e476574457865637574696e67536372697074486173686a
  55527ac46a54c376009e630500616161681a4e656f2e5472616e73616374696f6e2e4765744f757470
  7574736a56527ac4006a5d527ac46a56c36a57527ac4006a58527ac46a58c36a57c3c0a26397006a57
  c36a58c3c36a59527ac46a59c36a5a527ac46a5ac3616168184e656f2e4f75747075742e4765745363
  72697074486173686a55c3619c009c634c006a5ac3616168154e656f2e4f75747075742e4765744173
  73657449646a53c3619c009c6326006a5dc36a5ac3616168134e656f2e4f75747075742e4765745661
  6c7565936a5d527ac4616a58c351936a58527ac46264ff616a5dc300948d00a1638b006a56c300c361
  6168184e656f2e4f75747075742e476574536372697074486173686a57527ac44c1377616c6c65745f
  7265717565737454784f757454c576006a51c3c476516a52c3c476526a57c3764c0972656369706965
  6e74617575c476536a5dc361c461617c67
  ${Constants.HUB_SCRIPT_HASH}
  6a58527ac46a58c36c7566516c75666153c56b6a00527ac46a51527ac46a00c36a51c361ac6c756661
`.replace(/[\r\n\s]/g, '')

// LOCAL INVOKES

export const getReservedGasBalance = (net, wif) => {
  const account = getAccountFromWIFKey(wif)
  const sb = new ScriptBuilder()
  sb.emitAppCall(
    Constants.HUB_SCRIPT_HASH,
    'wallet_getReservedGasBalance',
    [account.programHash])
  const script = sb.str
  return doInvokeScript(net, script, false)
    .then((res) => {
      const reservedBalance = (fixed82num(res.stack[0].value))
      return { reservedBalance }
    })
}

// BLOCKCHAIN INVOKES

export const openDemand = (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  itemSize,    // itemSize: BigInteger
  itemValue,   // itemValue: BigInteger
  infoBlob,    // infoBlob: ByteArray
  pickUpCity,  // pickUpCityHash: Hash160
  dropOffCity  // dropOffCityHash: Hash160
}) => {
  const gasCost = 0
  const account = getAccountFromWIFKey(wif)
  return getBalance(net, account.address).then((balances) => {
    const invoke = {
      scriptHash: Constants.HUB_SCRIPT_HASH,
      operation: 'demand_open',
      args: [
        // owner: ScriptHash
        account.programHash,
        // publicKey
        account.publicKeyEncoded,
        // all the rest
        expiry, repRequired, itemSize, itemValue, infoBlob, pickUpCity, dropOffCity
      ]
    }
    const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, [], invoke, gasCost, { version: 1 })
    const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
    const hexTx = tx.serializeTransaction(signedTx)
    return queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  })
}

export const openTravel = (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  itemSize,    // carrySpace: BigInteger
  pickUpCity,  // pickUpCityHash: Hash160
  dropOffCity  // dropOffCityHash: Hash160
}) => {
  const gasCost = 0
  const account = getAccountFromWIFKey(wif)
  return getBalance(net, account.address).then((balances) => {
    const invoke = {
      scriptHash: Constants.HUB_SCRIPT_HASH,
      operation: 'demand_open',
      args: [
        // owner: ScriptHash
        account.programHash,
        // publicKey
        account.publicKeyEncoded,
        // all the rest
        expiry, repRequired, itemSize, pickUpCity, dropOffCity
      ]
    }
    const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, [], invoke, gasCost, { version: 1 })
    const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
    const hexTx = tx.serializeTransaction(signedTx)
    return queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  })
}
