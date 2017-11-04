import ScriptBuilder from './sc/scriptBuilder.js'
import { getAccountFromWIFKey } from './wallet'
import { getBalance, queryRPC, doInvokeScript, parseVMStack } from './api'
import { fixed82num } from './utils'
import * as tx from './transactions/index.js'

export const Constants = {
  MAIN_NET: 'MainNet',
  TEST_NET: 'TestNet',
  // HubContract commit 795d88a98f01953e0d2c969f049e59b8b514d05d (hub-0.2)
  HUB_SCRIPT_HASH: '571608ac8b5fbf410bd0911039c35508b5e42706'
}

// WalletContract commit 1f61baf8c56db685a60a7af892c3392d716ba73f (wallet-0.2)
export const generateWalletScript = (publicKeyHex) => `
  0112c56b6a51527ac46a51c34c097369676e61747572656175754c21
  ${publicKeyHex}
  6a52527ac44c20e72d286979ee6cb103e65dfddfb2e384100b8d148e7758de42e4168b71792c606a53
  527ac46a51c36a52c361617c6515026161f16161682953797374656d2e457865637574696f6e456e67
  696e652e476574536372697074436f6e7461696e65726a54527ac46161682d53797374656d2e457865
  637574696f6e456e67696e652e476574457865637574696e67536372697074486173686a55527ac46a
  54c36161681a4e656f2e5472616e73616374696f6e2e4765744f7574707574736a56527ac4006a6052
  7ac4006a57527ac46a56c36a58527ac4006a59527ac4006a5a527ac46a5ac36a58c3c0a263ad006a58
  c36a5ac3c36a5b527ac46a59c3616a59c351936a59527ac46a5bc36a5c527ac46a5d527ac46a5cc361
  6168184e656f2e4f75747075742e476574536372697074486173686a55c3876352006a5cc361616815
  4e656f2e4f75747075742e476574417373657449646a53c38791632e006a60c36a5cc3616168134e65
  6f2e4f75747075742e47657456616c7565936a60527ac46a5dc36a57527ac4616a5ac351936a5a527a
  c4624eff616a60c300948d00a1639e006a56c36a57c3c3616168184e656f2e4f75747075742e476574
  536372697074486173686a58527ac44c1377616c6c65745f7265717565737454784f757454c576006a
  55c3764c13657865637574696e6753637269707448617368617575c476516a52c3c476526a58c3764c
  09726563697069656e74617575c476536a60c361c461617c67
  ${Constants.HUB_SCRIPT_HASH}
  6c7566516c75666153c56b6a00527ac46a51527ac46a00c36a51c361ac6c756661
`.replace(/[\r\n\s]/g, '')

// LOCAL INVOKES

export const getStats = async (net, wif) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'stats_getDemandsCount')
    .emitAppCall(scriptHash, 'stats_getCityUsageCount')
    .emitAppCall(scriptHash, 'stats_getReservedFundsCount')
  const res = await doInvokeScript(net, sb.str, false)
  const [demands, cities, funds] = parseVMStack(res.stack.slice(0, 3))
  return { demands, cities, funds }
}

export const getReservedGasBalance = async (net, wif) => {
  const account = getAccountFromWIFKey(wif)
  const sb = new ScriptBuilder()
  sb.emitAppCall(
    Constants.HUB_SCRIPT_HASH,
    'wallet_getReservedGasBalance',
    [account.programHash])
  const res = await doInvokeScript(net, sb.str, false)
  const val = res.stack[0].value
  let reservedBalance = 0
  if (typeof val === 'string' && val.length) {
    reservedBalance = fixed82num(res.stack[0].value)
  }
  return { reservedBalance }
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
      args: [[
        // owner: ScriptHash
        account.programHash,
        // publicKey
        account.publicKeyEncoded,
        // all the rest
        expiry, repRequired, itemSize, itemValue, infoBlob, pickUpCity, dropOffCity
      ]]
    }
    const intents = [
      // sending a non-zero value makes tx validation go through
      { assetId: tx.ASSETS['GAS'], value: 0.00000001, scriptHash: account.programHash }
    ]
    const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, intents, invoke, gasCost, { version: 1 })
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
      operation: 'travel_open',
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
