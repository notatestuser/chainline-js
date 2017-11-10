import CryptoJS from 'crypto-js'
import ScriptBuilder from './sc/scriptBuilder.js'
import { getAccountFromWIFKey } from './wallet'
import { getBalance, queryRPC, doInvokeScript, parseVMStack } from './api'
import { fixed82num, int2hex } from './utils'
import * as tx from './transactions/index.js'

export const Constants = {
  // Nets
  MAIN_NET: 'MainNet',
  TEST_NET: 'TestNet',
  // Fees
  FEE_DEMAND_REWARD_GAS: 3,
  FEE_TRAVEL_DEPOSIT_GAS: 1,
  // commit eca7294e4b20170a9ac068e1be956e55914e0a27 (hub-0.3)
  HUB_SCRIPT_HASH: '5cd7fe13c0762432bf151191b948c0436d3354c4'
}

/**
 * Generates the wallet script given a user's public key.
 * @param {string} publicKeyHex - The public key, hex encoded
 * @return {string} The wallet script, hex encoded
 */
export const generateWalletScript = (publicKeyHex) => (
  // commit 3540131dba100d691d74f84f78238b0a199c5e34 (wallet-0.3)
 `5fc56b6a51527ac46a51c34c097369676e61747572656175754c21
  ${publicKeyHex}
  6a52527ac44c20e72d286979ee6cb103e65dfddfb2e384100b8d148e7758de42e4168b71792c606a53
  527ac46a51c36a52c361617c65aa016161f16161682953797374656d2e457865637574696f6e456e67
  696e652e476574536372697074436f6e7461696e65726a54527ac46161682d53797374656d2e457865
  637574696f6e456e67696e652e476574457865637574696e67536372697074486173686a55527ac46a
  54c36161681a4e656f2e5472616e73616374696f6e2e4765744f7574707574736a56527ac4006a5d52
  7ac46a56c36a57527ac4006a58527ac46a58c36a57c3c0a26392006a57c36a58c3c36a59527ac46a59
  c36a5a527ac46a5ac3616168184e656f2e4f75747075742e476574536372697074486173686a55c387
  634a006a5ac3616168154e656f2e4f75747075742e476574417373657449646a53c387916326006a5d
  c36a5ac3616168134e656f2e4f75747075742e47657456616c7565936a5d527ac4616a58c351936a58
  527ac46269ff616a5dc300948d00a1635a004c1377616c6c65745f7265717565737454784f757452c5
  76006a55c3764c13657865637574696e6753637269707448617368617575c476516a52c3c461617c67
  ${Constants.HUB_SCRIPT_HASH}
  6c7566516c75666153c56b6a00527ac46a51527ac46a00c36a51c361ac6c756661
`.replace(/[\r\n\s]/g, ''))

// UTILS

/**
 * Makes a city pair hash, used by the contract for matching demands with other users.
 * @param {string} pickUpCity - The pick up city
 * @param {string} dropOffCity - The destination city
 * @return {string} The city pair hash
 */
const makeCityPairHash = (pickUpCity, dropOffCity) =>
  CryptoJS.RIPEMD160(Constants.HUB_SCRIPT_HASH + pickUpCity + dropOffCity).toString()

// LOCAL INVOKES

/**
 * Gets the unix epoch timestamp of the last synced block.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @return {number} The timestamp
 */
export const getTimestamp = async (net) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'timestamp')
  const res = await doInvokeScript(net, sb.str, false)
  const [timestamp] = parseVMStack(res.stack)
  return timestamp
}

/**
 * Gets all the contract's stats in one object.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @return {{demands: number, cities: number, funds: number}} Stats
 */
export const getStats = async (net) => {
  const scriptHash = Constants.HUB_SCRIPT_HASH
  const sb = new ScriptBuilder()
  sb.emitAppCall(scriptHash, 'stats_getDemandsCount')
    .emitAppCall(scriptHash, 'stats_getRouteUsageCount')
    .emitAppCall(scriptHash, 'stats_getReservedFundsCount')
  const res = await doInvokeScript(net, sb.str, false)
  const [demands, cities, funds] = parseVMStack(res.stack.slice(0, 3))
  return { demands, cities, funds: funds / 100000000 }
}

/**
 * Gets all the contract's stats in one object.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @return {number} Reserved GAS as a floating point
 */
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

/**
 * Opens a demand via a blockchain invocation.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @param {{expiry: number, repRequired: number, itemSize: number, itemValue: number, infoBlob: string, pickUpCity: string, dropOffCity: string}}
 * @return {{shortId: string, longId: string}|boolean} The demand's tracking IDs or false on failure
 */
export const openDemand = async (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  itemSize,    // itemSize: BigInteger
  itemValue,   // itemValue: BigInteger
  infoBlob,    // infoBlob: ByteArray
  pickUpCity,  // pickUpCityHash: Hash160, these are converted to a hashed "pair"
  dropOffCity  // dropOffCityHash: Hash160
}) => {
  const gasCost = 0
  const account = getAccountFromWIFKey(wif)
  const cityPairHash = makeCityPairHash(pickUpCity, dropOffCity)
  const balances = await getBalance(net, account.address)
  const invoke = {
    scriptHash: Constants.HUB_SCRIPT_HASH,
    operation: 'demand_open',
    args: [[
      // owner: ScriptHash
      account.programHash,
      // publicKey
      account.publicKeyEncoded,
      // all the rest
      expiry, repRequired, itemSize, itemValue, infoBlob, cityPairHash
    ]]
  }
  const intents = [
    // a non-zero value in outputs makes tx validation go through
    { assetId: tx.ASSETS['GAS'], value: 0.001, scriptHash: account.programHash }
  ]
  const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, intents, invoke, gasCost, { version: 1 })
  const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
  const hexTx = tx.serializeTransaction(signedTx)
  const { result } = await queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  if (!result) return false
  const blockTime = await getTimestamp(net)
  const shortId = int2hex(blockTime, true) + int2hex(expiry, true) + '01'
  return { shortId, longId: shortId + cityPairHash }
}

/**
 * Opens a travel via a blockchain invocation.
 * @param {string} net - 'MainNet' or 'TestNet' or custom URL
 * @param {string} wif - The wallet's WIF key
 * @param {{expiry: number, repRequired: number, carrySpace: number, pickUpCity: string, dropOffCity: string}}
 * @return {{shortId: string, longId: string}|boolean} The demand's tracking IDs or false on failure
 */
export const openTravel = async (net, wif, {
  expiry,      // expiry: BigInteger
  repRequired, // repRequired: BigInteger
  carrySpace,  // carrySpace: BigInteger
  pickUpCity,  // pickUpCityHash: Hash160
  dropOffCity  // dropOffCityHash: Hash160
}) => {
  const gasCost = 0
  const account = getAccountFromWIFKey(wif)
  const cityPairHash = makeCityPairHash(pickUpCity, dropOffCity)
  const balances = await getBalance(net, account.address)
  const invoke = {
    scriptHash: Constants.HUB_SCRIPT_HASH,
    operation: 'travel_open',
    args: [[
      // owner: ScriptHash
      account.programHash,
      // publicKey
      account.publicKeyEncoded,
      // all the rest
      expiry, repRequired, carrySpace, cityPairHash
    ]]
  }
  const intents = [
    // a non-zero value in outputs makes tx validation go through
    { assetId: tx.ASSETS['GAS'], value: 0.001, scriptHash: account.programHash }
  ]
  const unsignedTx = tx.create.invocation(account.publicKeyEncoded, balances, intents, invoke, gasCost, { version: 1 })
  const signedTx = tx.signTransaction(unsignedTx, account.privateKey)
  const hexTx = tx.serializeTransaction(signedTx)
  const { result } = await queryRPC(net, 'sendrawtransaction', [hexTx], 4)
  if (!result) return false
  const blockTime = await getTimestamp(net)
  const shortId = int2hex(blockTime, true) + int2hex(expiry, true) + '02'
  return { shortId, longId: shortId + cityPairHash }
}
